import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { Session } from "./session.js";
import {
  generateGmReply,
  generateAsideReply,
  generateOpening,
  generateStory,
  type LlmCaller,
} from "./gmEngine.js";
import { createBedrockCaller } from "./bedrockCaller.js";
import { createAnthropicCaller } from "./anthropicCaller.js";
import { createNimCaller } from "./nimCaller.js";
import { CampaignStore } from "./campaignStore.js";
import type { Character, CharacterInput, DiceRequest, StoredTurn, TurnKind } from "./types.js";

const VERHASPELT = "Der Spielleiter hat sich verhaspelt — bitte nochmal.";

function pendingFrom(turns: StoredTurn[]): DiceRequest | null {
  const last = turns[turns.length - 1];
  return last && last.role === "gm" ? last.diceRequest : null;
}

export function buildServer(call: LlmCaller, store: CampaignStore): FastifyInstance {
  // Enable Pino request logging outside tests; under vitest (NODE_ENV=test) the
  // request logs are just noise. Even when the logger is off, Fastify supplies a
  // no-op `app.log`, so the explicit error logging below still works.
  const app = Fastify({ logger: process.env.NODE_ENV !== "test" });
  app.register(cors, { origin: ["http://localhost:5173", "http://127.0.0.1:5173"] });

  function stateOf(id: string) {
    const campaign = store.getCampaign(id);
    if (!campaign) return null;
    const turns = store.getTurns(id);
    const characters = store.listCharacters(id);
    return { campaign, turns, pendingDice: pendingFrom(turns), characters };
  }

  // Shared handler for action + roll + aside: never persist unless the GM
  // reply parses. Asides never carry a diceRequest — force-nulled below even
  // though the aside prompt already instructs the model to leave it null.
  async function play(
    id: string,
    playerText: string,
    kind: TurnKind,
    reply: import("fastify").FastifyReply,
  ) {
    const campaign = store.getCampaign(id);
    if (!campaign) return reply.code(404).send({ error: "Kampagne nicht gefunden." });
    if (campaign.status === "finished")
      return reply.code(409).send({ error: "Diese Kampagne ist abgeschlossen." });

    const characters = store.listCharacters(id);
    const session = new Session(store.getTurns(id));
    session.addPlayerTurn(playerText, kind);
    let gm;
    try {
      gm =
        kind === "aside"
          ? await generateAsideReply(session.getHistory(), campaign.premise, call, characters)
          : await generateGmReply(session.getHistory(), campaign.premise, call, characters);
    } catch (err) {
      reply.log.error({ err, campaignId: id, playerText }, "GM reply failed (verhaspelt)");
      return reply.code(500).send({ error: VERHASPELT });
    }
    store.appendTurns(id, [
      { role: "player", text: playerText, diceRequest: null, kind },
      {
        role: "gm",
        text: gm.narration,
        diceRequest: kind === "aside" ? null : gm.diceRequest,
        kind,
      },
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
      } catch (err) {
        reply.log.error({ err, premise }, "opening generation failed (verhaspelt)");
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

  app.get<{ Params: { id: string } }>("/api/campaigns/:id/characters", async (req, reply) => {
    const campaign = store.getCampaign(req.params.id);
    if (!campaign) return reply.code(404).send({ error: "Kampagne nicht gefunden." });
    return store.listCharacters(req.params.id);
  });

  app.post<{ Params: { id: string }; Body: CharacterInput }>(
    "/api/campaigns/:id/characters",
    async (req, reply) => {
      const campaign = store.getCampaign(req.params.id);
      if (!campaign) return reply.code(404).send({ error: "Kampagne nicht gefunden." });
      if (campaign.status === "finished")
        return reply.code(409).send({ error: "Diese Kampagne ist abgeschlossen." });
      const name = req.body?.name?.trim();
      const concept = req.body?.concept?.trim();
      if (!name || !concept)
        return reply.code(400).send({ error: "Name und Konzept sind erforderlich." });
      const character = store.createCharacter(req.params.id, { ...req.body, name, concept });
      return reply.code(201).send(character);
    },
  );

  app.patch<{ Params: { id: string; cid: string }; Body: Partial<CharacterInput> }>(
    "/api/campaigns/:id/characters/:cid",
    async (req, reply) => {
      const campaign = store.getCampaign(req.params.id);
      if (!campaign) return reply.code(404).send({ error: "Kampagne nicht gefunden." });
      const character = store.getCharacter(req.params.cid);
      if (!character || character.campaign_id !== req.params.id)
        return reply.code(404).send({ error: "Charakter nicht gefunden." });
      if (campaign.status === "finished")
        return reply.code(409).send({ error: "Diese Kampagne ist abgeschlossen." });
      const body = req.body ?? {};
      const name = body.name !== undefined ? body.name.trim() : character.name;
      const concept = body.concept !== undefined ? body.concept.trim() : character.concept;
      if (!name || !concept)
        return reply.code(400).send({ error: "Name und Konzept sind erforderlich." });
      const updated: Character = {
        ...character,
        name,
        concept,
        ...(body.level !== undefined ? { level: body.level } : {}),
        ...(body.narrative !== undefined ? { narrative: body.narrative } : {}),
        ...(body.abilities !== undefined ? { abilities: body.abilities } : {}),
        ...(body.resources !== undefined ? { resources: body.resources } : {}),
      };
      store.updateCharacter(updated);
      return updated;
    },
  );

  app.delete<{ Params: { id: string; cid: string } }>(
    "/api/campaigns/:id/characters/:cid",
    async (req, reply) => {
      const campaign = store.getCampaign(req.params.id);
      if (!campaign) return reply.code(404).send({ error: "Kampagne nicht gefunden." });
      const character = store.getCharacter(req.params.cid);
      if (!character || character.campaign_id !== req.params.id)
        return reply.code(404).send({ error: "Charakter nicht gefunden." });
      if (campaign.status === "finished")
        return reply.code(409).send({ error: "Diese Kampagne ist abgeschlossen." });
      store.deleteCharacter(req.params.cid);
      return reply.code(204).send();
    },
  );

  app.post<{ Params: { id: string }; Body: { text: string; kind?: TurnKind } }>(
    "/api/campaigns/:id/action",
    async (req, reply) => {
      const text = req.body?.text?.trim();
      if (!text) return reply.code(400).send({ error: "Es fehlt eine Handlung." });
      const kind: TurnKind = req.body?.kind === "aside" ? "aside" : "story";
      return play(req.params.id, text, kind, reply);
    },
  );

  app.post<{ Params: { id: string }; Body: { result: string } }>(
    "/api/campaigns/:id/roll",
    async (req, reply) => {
      const result = req.body?.result?.trim();
      if (!result) return reply.code(400).send({ error: "Es fehlt ein Würfelergebnis." });
      return play(req.params.id, `[Würfelergebnis: ${result}]`, "story", reply);
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
      const characters = store.listCharacters(campaign.id);
      markdown = await generateStory(store.getTurns(campaign.id), campaign, call, characters);
    } catch (err) {
      reply.log.error({ err, campaignId: campaign.id }, "story generation failed (verhaspelt)");
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

function selectCaller(): LlmCaller {
  const provider = process.env.LLM_PROVIDER;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const region = process.env.AWS_REGION;
  const nimApiKey = process.env.NVIDIA_API_KEY;
  const nimModel = process.env.NIM_MODEL ?? "meta/llama-3.3-70b-instruct";

  if (provider === "nim") {
    if (!nimApiKey) throw new Error("LLM_PROVIDER=nim requires NVIDIA_API_KEY to be set");
    return createNimCaller(nimApiKey, nimModel);
  }
  if (provider === "anthropic") {
    if (!apiKey) throw new Error("LLM_PROVIDER=anthropic requires ANTHROPIC_API_KEY to be set");
    return createAnthropicCaller(apiKey);
  }
  if (provider === "bedrock") {
    if (!region) throw new Error("LLM_PROVIDER=bedrock requires AWS_REGION to be set");
    return createBedrockCaller(region);
  }
  // No explicit LLM_PROVIDER — preserve the original auto-detect behavior:
  // ANTHROPIC_API_KEY takes precedence, Bedrock is the fallback.
  if (apiKey) return createAnthropicCaller(apiKey);
  if (region) return createBedrockCaller(region);
  throw new Error(
    "Set ANTHROPIC_API_KEY, AWS_REGION, or LLM_PROVIDER=nim with NVIDIA_API_KEY — copy .env.example to .env",
  );
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
  const call = selectCaller();
  const dataDir = resolve(here, "../../data");
  mkdirSync(dataDir, { recursive: true });
  const store = new CampaignStore(openDb(resolve(dataDir, "campaigns.db")));
  const port = Number(process.env.BACKEND_PORT ?? 8787);
  const app = buildServer(call, store);
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
