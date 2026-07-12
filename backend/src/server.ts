import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { Session } from "./session.js";
import {
  generateGmReply,
  generateOpening,
  generateStory,
  type ClaudeCaller,
} from "./gmEngine.js";
import { createBedrockCaller } from "./bedrockCaller.js";
import { CampaignStore } from "./campaignStore.js";
import type { DiceRequest, StoredTurn } from "./types.js";

const VERHASPELT = "Der Spielleiter hat sich verhaspelt — bitte nochmal.";

function pendingFrom(turns: StoredTurn[]): DiceRequest | null {
  const last = turns[turns.length - 1];
  return last && last.role === "gm" ? last.diceRequest : null;
}

export function buildServer(call: ClaudeCaller, store: CampaignStore): FastifyInstance {
  const app = Fastify();
  app.register(cors, { origin: ["http://localhost:5173", "http://127.0.0.1:5173"] });

  function stateOf(id: string) {
    const campaign = store.getCampaign(id);
    if (!campaign) return null;
    const turns = store.getTurns(id);
    return { campaign, turns, pendingDice: pendingFrom(turns) };
  }

  // Shared handler for action + roll: never persist unless the GM reply parses.
  async function play(id: string, playerText: string, reply: import("fastify").FastifyReply) {
    const campaign = store.getCampaign(id);
    if (!campaign) return reply.code(404).send({ error: "Kampagne nicht gefunden." });
    if (campaign.status === "finished")
      return reply.code(409).send({ error: "Diese Kampagne ist abgeschlossen." });

    const session = new Session(store.getTurns(id));
    session.addPlayerTurn(playerText);
    let gm;
    try {
      gm = await generateGmReply(session.getHistory(), campaign.premise, call);
    } catch {
      return reply.code(500).send({ error: VERHASPELT });
    }
    store.appendTurns(id, [
      { role: "player", text: playerText, diceRequest: null },
      { role: "gm", text: gm.narration, diceRequest: gm.diceRequest },
    ]);
    return stateOf(id);
  }

  app.get("/api/campaigns", async () => store.listCampaigns());

  app.post<{ Body: { name: string; premise: string } }>(
    "/api/campaigns",
    async (req, reply) => {
      const name = req.body?.name?.trim();
      const premise = req.body?.premise?.trim();
      if (!name || !premise) {
        return reply.code(400).send({ error: "Name und Prämisse sind erforderlich." });
      }
      let opening;
      try {
        opening = await generateOpening(premise, call);
      } catch {
        return reply.code(500).send({ error: VERHASPELT });
      }
      const campaign = store.createCampaign(name, premise);
      store.appendTurn(campaign.id, {
        role: "gm",
        text: opening.narration,
        diceRequest: opening.diceRequest,
      });
      return stateOf(campaign.id);
    },
  );

  app.get<{ Params: { id: string } }>("/api/campaigns/:id/state", async (req, reply) => {
    const state = stateOf(req.params.id);
    if (!state) return reply.code(404).send({ error: "Kampagne nicht gefunden." });
    return state;
  });

  app.post<{ Params: { id: string }; Body: { text: string } }>(
    "/api/campaigns/:id/action",
    async (req, reply) => {
      const text = req.body?.text?.trim();
      if (!text) return reply.code(400).send({ error: "Es fehlt eine Handlung." });
      return play(req.params.id, text, reply);
    },
  );

  app.post<{ Params: { id: string }; Body: { result: string } }>(
    "/api/campaigns/:id/roll",
    async (req, reply) => {
      const result = req.body?.result?.trim();
      if (!result) return reply.code(400).send({ error: "Es fehlt ein Würfelergebnis." });
      return play(req.params.id, `[Würfelergebnis: ${result}]`, reply);
    },
  );

  app.post<{ Params: { id: string } }>("/api/campaigns/:id/finish", async (req, reply) => {
    const campaign = store.getCampaign(req.params.id);
    if (!campaign) return reply.code(404).send({ error: "Kampagne nicht gefunden." });
    store.finishCampaign(campaign.id);
    return store.getCampaign(campaign.id);
  });

  app.post<{ Params: { id: string } }>("/api/campaigns/:id/story", async (req, reply) => {
    const campaign = store.getCampaign(req.params.id);
    if (!campaign) return reply.code(404).send({ error: "Kampagne nicht gefunden." });
    if (campaign.status !== "finished")
      return reply
        .code(409)
        .send({ error: "Nur abgeschlossene Kampagnen können nacherzählt werden." });
    let markdown;
    try {
      markdown = await generateStory(store.getTurns(campaign.id), campaign, call);
    } catch {
      return reply.code(500).send({ error: VERHASPELT });
    }
    return store.saveStory(campaign.id, markdown);
  });

  app.get<{ Params: { id: string } }>("/api/campaigns/:id/story", async (req, reply) => {
    const campaign = store.getCampaign(req.params.id);
    if (!campaign) return reply.code(404).send({ error: "Kampagne nicht gefunden." });
    const story = store.getStory(campaign.id);
    if (!story) return reply.code(404).send({ error: "Noch keine Geschichte erzählt." });
    return story;
  });

  return app;
}

async function main() {
  const { config } = await import("dotenv");
  const { fileURLToPath } = await import("node:url");
  const { dirname, resolve } = await import("node:path");
  const { mkdirSync } = await import("node:fs");
  const { openDb } = await import("./db.js");
  // The .env and data/ live at the repo root; resolve relative to this file
  // (backend/src/) so they work regardless of the process working directory.
  const here = dirname(fileURLToPath(import.meta.url));
  config({ path: resolve(here, "../../.env") });
  const region = process.env.AWS_REGION;
  if (!region) throw new Error("AWS_REGION is not set — copy .env.example to .env");
  const dataDir = resolve(here, "../../data");
  mkdirSync(dataDir, { recursive: true });
  const store = new CampaignStore(openDb(resolve(dataDir, "campaigns.db")));
  const port = Number(process.env.BACKEND_PORT ?? 8787);
  const app = buildServer(createBedrockCaller(region), store);
  await app.listen({ port, host: "127.0.0.1" });
  console.log(`GM backend listening on http://127.0.0.1:${port}`);
}

// Only start the server when run directly, not when imported by tests.
if (process.argv[1] && process.argv[1].endsWith("server.ts")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
