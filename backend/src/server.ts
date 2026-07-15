import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { Session } from "./session.js";
import {
  generateGmReply,
  generateAsideReply,
  generateOpening,
  generateStory,
  generatePlan,
  type LlmCaller,
} from "./gmEngine.js";
import { applyCombatEvent } from "./combat.js";
import { toBrief } from "./campaignPlan.js";
import { createBedrockCaller } from "./bedrockCaller.js";
import { createAnthropicCaller } from "./anthropicCaller.js";
import { createNimCaller } from "./nimCaller.js";
import { createNimTtsSynthesizer } from "./nimTtsSynthesizer.js";
import type { TtsSynthesizer } from "./tts.js";
import { CampaignStore } from "./campaignStore.js";
import type { Character, CharacterInput, DiceRequest, StoredTurn, TurnKind } from "./types.js";

const VERHASPELT = "Der Spielleiter hat sich verhaspelt — bitte nochmal.";

function pendingFrom(turns: StoredTurn[]): DiceRequest | null {
  const last = turns[turns.length - 1];
  return last && last.role === "gm" ? last.diceRequest : null;
}

export function buildServer(
  call: LlmCaller,
  store: CampaignStore,
  synth: TtsSynthesizer | null = null,
): FastifyInstance {
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
    const stored = store.getPlan(id);
    const brief = stored ? toBrief(stored.plan) : null;
    return { campaign, turns, pendingDice: pendingFrom(turns), characters, brief, combat: store.getCombat(id), ttsEnabled: synth !== null };
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
    const plan = store.getPlan(id)?.plan;
    const session = new Session(store.getTurns(id));
    session.addPlayerTurn(playerText, kind);
    let gm;
    try {
      gm =
        kind === "aside"
          ? await generateAsideReply(session.getHistory(), campaign.premise, call, characters, plan)
          : await generateGmReply(
              session.getHistory(),
              campaign.premise,
              call,
              characters,
              plan,
              store.getCombat(id) ?? undefined,
            );
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
    if (kind !== "aside" && gm.combat) {
      const pcs = characters.map((c) => ({ id: c.id, name: c.name, maxHp: c.maxHp ?? 0 }));
      const next = applyCombatEvent(store.getCombat(id), gm.combat, pcs);
      if (next) store.saveCombat(id, next);
      else store.clearCombat(id);
    }
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
      let plan, opening;
      try {
        plan = await generatePlan(name, premise, call);
        opening = await generateOpening(premise, call, [], plan);
      } catch (err) {
        reply.log.error({ err, premise }, "campaign generation failed (verhaspelt)");
        return reply.code(500).send({ error: VERHASPELT });
      }
      const campaign = store.createCampaign(name, premise);
      store.savePlan(campaign.id, plan);
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
      const plan = store.getPlan(campaign.id)?.plan;
      markdown = await generateStory(store.getTurns(campaign.id), campaign, call, characters, plan);
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

  // Lazy, cached per-turn TTS. Synthesizing here — never during a play turn —
  // keeps TTS latency and failures out of the game loop: the worst case is "no
  // audio", the transcript is untouched. Only gm narration is voiced.
  app.get<{ Params: { id: string; seq: string } }>(
    "/api/campaigns/:id/turns/:seq/audio",
    async (req, reply) => {
      const campaign = store.getCampaign(req.params.id);
      if (!campaign) return reply.code(404).send({ error: "Kampagne nicht gefunden." });
      const seq = Number(req.params.seq);
      const turn = Number.isInteger(seq)
        ? store.getTurns(req.params.id).find((t) => t.seq === seq)
        : undefined;
      if (!turn || turn.role !== "gm")
        return reply.code(404).send({ error: "Keine Erzählung für diese Runde." });

      const cached = store.getTurnAudio(req.params.id, seq);
      if (cached) return reply.type(cached.contentType).send(cached.audio);
      if (!synth) return reply.code(404).send({ error: "Sprachausgabe ist nicht aktiviert." });

      let result;
      try {
        result = await synth(turn.text);
      } catch (err) {
        reply.log.error({ err, campaignId: req.params.id, seq }, "TTS synthesis failed");
        return reply.code(502).send({ error: VERHASPELT });
      }
      store.saveTurnAudio(req.params.id, seq, result.audio, result.contentType, result.charCount);
      return reply.type(result.contentType).send(result.audio);
    },
  );

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

// TTS is opt-in and independent of the LLM provider: setting NVIDIA_API_KEY for
// the NIM *LLM* must not silently switch the voice on. Returns null (feature
// off) unless TTS_PROVIDER=nim is set explicitly.
function selectSynthesizer(): TtsSynthesizer | null {
  if (process.env.TTS_PROVIDER !== "nim") return null;
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) throw new Error("TTS_PROVIDER=nim requires NVIDIA_API_KEY to be set");
  return createNimTtsSynthesizer(apiKey, {
    voice: process.env.NIM_TTS_VOICE ?? "Magpie-Multilingual.DE-DE.Pascal",
    languageCode: process.env.NIM_TTS_LANGUAGE ?? "de-DE",
    functionId: process.env.NIM_TTS_FUNCTION_ID ?? "877104f7-e885-42b9-8de8-f6e4c6303969",
    sampleRate: Number(process.env.NIM_TTS_SAMPLE_RATE ?? 44100),
  });
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
  const synth = selectSynthesizer();
  const dataDir = resolve(here, "../../data");
  mkdirSync(dataDir, { recursive: true });
  const store = new CampaignStore(openDb(resolve(dataDir, "campaigns.db")));
  const port = Number(process.env.BACKEND_PORT ?? 8787);
  const app = buildServer(call, store, synth);
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
