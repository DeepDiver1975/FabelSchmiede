import { describe, it, expect, vi } from "vitest";
import { buildServer } from "./server.js";
import { CampaignStore } from "./campaignStore.js";
import { openDb } from "./db.js";
import type { LlmCaller } from "./gmEngine.js";
import type { TtsSynthesizer } from "./tts.js";

const fakePlanJson = JSON.stringify({
  title: "Die Höhle",
  brief: "Ein Dorf am Nebelwald bittet um Hilfe.",
  backstory: "GEHEIM_BS: ein Kult im Wald.",
  npcs: [{ name: "Mara", role: "Wirtin", description: "nervös", secret: "GEHEIM_NPC" }],
  locations: [{ name: "Gasthaus", description: "warm und laut", secret: "" }],
  arc: { outline: "GEHEIM_ARC", hooks: ["Aufhänger"], branchPoints: ["Weiche"] },
});

// Fake caller:
//  - plan requests (system contains "Abenteuer-Architekt") → plan JSON
//  - story requests (system contains "Kurzgeschichte") → markdown
//  - a player message containing "angriff" → one dice request
//  - everything else (incl. openings) → plain narration
const fakeCall: LlmCaller = async ({ system, messages }) => {
  if (system.includes("Abenteuer-Architekt")) return fakePlanJson;
  if (system.includes("Kurzgeschichte")) return "# Die Geschichte\n\nEs war einmal…";
  const last = messages[messages.length - 1];
  if (last?.role === "user" && last.content.toLowerCase().includes("angriff")) {
    return '{"narration":"Der Goblin faucht!","diceRequest":{"reason":"Angriff","hint":"W20 + STR"}}';
  }
  return '{"narration":"Es geschieht etwas.","diceRequest":null}';
};

function setup(call: LlmCaller = fakeCall, synth: TtsSynthesizer | null = null) {
  const store = new CampaignStore(openDb(":memory:"));
  return { store, app: buildServer(call, store, synth) };
}

async function createCampaign(app: ReturnType<typeof setup>["app"]) {
  const res = await app.inject({
    method: "POST",
    url: "/api/campaigns",
    payload: { name: "Die Höhle", premise: "Goblins im Nebelwald" },
  });
  return res.json();
}

describe("server", () => {
  it("POST /api/campaigns creates a campaign with a single opening gm turn", async () => {
    const { app } = setup();
    const body = await createCampaign(app);
    expect(body.campaign.name).toBe("Die Höhle");
    expect(body.campaign.status).toBe("active");
    expect(body.turns).toHaveLength(1);
    expect(body.turns[0].role).toBe("gm");
    expect(body.pendingDice).toBeNull();
    await app.close();
  });

  it("POST /api/campaigns persists a plan and exposes a spoiler-free brief", async () => {
    const { app, store } = setup();
    const body = await createCampaign(app);
    // brief is public and leaks no secrets
    expect(body.brief.title).toBe("Die Höhle");
    expect(body.brief.locations[0].name).toBe("Gasthaus");
    const serialized = JSON.stringify(body.brief);
    expect(serialized).not.toContain("GEHEIM");
    expect(serialized).not.toContain("Mara");
    // the raw plan is persisted with its secrets
    const stored = store.getPlan(body.campaign.id);
    expect(stored?.plan.backstory).toContain("GEHEIM_BS");
    await app.close();
  });

  it("feeds the plan (incl. secrets) into GM turns", async () => {
    const seen: string[] = [];
    const spy: LlmCaller = async (args) => {
      seen.push(args.system);
      return fakeCall(args);
    };
    const { app } = setup(spy);
    const { campaign } = await createCampaign(app);
    await app.inject({ method: "POST", url: `/api/campaigns/${campaign.id}/action`, payload: { text: "Ich schaue mich um" } });
    // at least one non-plan system prompt carried the world bible with a secret
    expect(seen.some((s) => !s.includes("Abenteuer-Architekt") && s.includes("GEHEIM_ARC"))).toBe(true);
    await app.close();
  });

  it("creates no campaign when plan generation fails", async () => {
    const failing: LlmCaller = async ({ system }) => {
      if (system.includes("Abenteuer-Architekt")) return "totally not json";
      return '{"narration":"x","diceRequest":null}';
    };
    const { app, store } = setup(failing);
    const res = await app.inject({ method: "POST", url: "/api/campaigns", payload: { name: "X", premise: "Y" } });
    expect(res.statusCode).toBe(500);
    expect(store.listCampaigns()).toHaveLength(0);
    await app.close();
  });

  it("POST /api/campaigns rejects a missing name or premise with 400", async () => {
    const { app } = setup();
    const res = await app.inject({ method: "POST", url: "/api/campaigns", payload: { name: "", premise: "" } });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("GET /api/campaigns lists created campaigns", async () => {
    const { app } = setup();
    await createCampaign(app);
    const res = await app.inject({ method: "GET", url: "/api/campaigns" });
    expect(res.json()).toHaveLength(1);
    await app.close();
  });

  it("GET /api/campaigns/:id/state returns 404 for an unknown id", async () => {
    const { app } = setup();
    const res = await app.inject({ method: "GET", url: "/api/campaigns/nope/state" });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("POST /api/campaigns/:id/action appends player + gm turns", async () => {
    const { app } = setup();
    const { campaign } = await createCampaign(app);
    const res = await app.inject({
      method: "POST",
      url: `/api/campaigns/${campaign.id}/action`,
      payload: { text: "Ich schaue mich um." },
    });
    const body = res.json();
    expect(body.turns).toHaveLength(3); // opening + player + gm
    expect(body.pendingDice).toBeNull();
    await app.close();
  });

  it("surfaces a pending dice request", async () => {
    const { app } = setup();
    const { campaign } = await createCampaign(app);
    const res = await app.inject({
      method: "POST",
      url: `/api/campaigns/${campaign.id}/action`,
      payload: { text: "Ich starte einen Angriff." },
    });
    expect(res.json().pendingDice).toEqual({ reason: "Angriff", hint: "W20 + STR" });
    await app.close();
  });

  it("POST /api/campaigns/:id/roll clears the pending dice", async () => {
    const { app } = setup();
    const { campaign } = await createCampaign(app);
    await app.inject({ method: "POST", url: `/api/campaigns/${campaign.id}/action`, payload: { text: "Angriff!" } });
    const res = await app.inject({
      method: "POST",
      url: `/api/campaigns/${campaign.id}/roll`,
      payload: { result: "17" },
    });
    expect(res.json().pendingDice).toBeNull();
    await app.close();
  });

  it("blocks play on a finished campaign with 409", async () => {
    const { app } = setup();
    const { campaign } = await createCampaign(app);
    await app.inject({ method: "POST", url: `/api/campaigns/${campaign.id}/finish` });
    const res = await app.inject({
      method: "POST",
      url: `/api/campaigns/${campaign.id}/action`,
      payload: { text: "x" },
    });
    expect(res.statusCode).toBe(409);
    await app.close();
  });

  it("rejects a story request on an active campaign with 409", async () => {
    const { app } = setup();
    const { campaign } = await createCampaign(app);
    const res = await app.inject({ method: "POST", url: `/api/campaigns/${campaign.id}/story` });
    expect(res.statusCode).toBe(409);
    await app.close();
  });

  it("generates, caches, and regenerates a story for a finished campaign", async () => {
    const { app } = setup();
    const { campaign } = await createCampaign(app);
    await app.inject({ method: "POST", url: `/api/campaigns/${campaign.id}/finish` });

    const gen = await app.inject({ method: "POST", url: `/api/campaigns/${campaign.id}/story` });
    expect(gen.json().markdown).toContain("Die Geschichte");

    const cached = await app.inject({ method: "GET", url: `/api/campaigns/${campaign.id}/story` });
    expect(cached.statusCode).toBe(200);
    expect(cached.json().markdown).toContain("Die Geschichte");

    const regen = await app.inject({ method: "POST", url: `/api/campaigns/${campaign.id}/story` });
    expect(regen.statusCode).toBe(200);
    await app.close();
  });

  it("GET story returns 404 before any story is generated", async () => {
    const { app } = setup();
    const { campaign } = await createCampaign(app);
    await app.inject({ method: "POST", url: `/api/campaigns/${campaign.id}/finish` });
    const res = await app.inject({ method: "GET", url: `/api/campaigns/${campaign.id}/story` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("rejects an empty action with 400", async () => {
    const { app } = setup();
    const { campaign } = await createCampaign(app);
    const res = await app.inject({
      method: "POST",
      url: `/api/campaigns/${campaign.id}/action`,
      payload: { text: "   " },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("rejects an empty roll with 400", async () => {
    const { app } = setup();
    const { campaign } = await createCampaign(app);
    const res = await app.inject({
      method: "POST",
      url: `/api/campaigns/${campaign.id}/roll`,
      payload: { result: "" },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("never fabricates a turn: a failing caller returns 500 and persists nothing", async () => {
    const store = new CampaignStore(openDb(":memory:"));
    const good = buildServer(fakeCall, store);
    const { campaign } = await createCampaign(good);
    await good.close();

    const bad = buildServer(async () => "garbage", store);
    const res = await bad.inject({
      method: "POST",
      url: `/api/campaigns/${campaign.id}/action`,
      payload: { text: "x" },
    });
    expect(res.statusCode).toBe(500);
    expect(res.json().error).toContain("Spielleiter");
    await bad.close();

    // Transcript unchanged — still just the opening turn.
    const check = buildServer(fakeCall, store);
    const state = await check.inject({ method: "GET", url: `/api/campaigns/${campaign.id}/state` });
    expect(state.json().turns).toHaveLength(1);
    await check.close();
  });

  it("logs the underlying error when the GM reply fails", async () => {
    const store = new CampaignStore(openDb(":memory:"));
    const good = buildServer(fakeCall, store);
    const { campaign } = await createCampaign(good);
    await good.close();

    const bad = buildServer(async () => "garbage", store);
    const spy = vi.spyOn(bad.log, "error");
    const res = await bad.inject({
      method: "POST",
      url: `/api/campaigns/${campaign.id}/action`,
      payload: { text: "x" },
    });
    expect(res.statusCode).toBe(500);
    expect(spy).toHaveBeenCalled();
    const [firstArg] = spy.mock.calls[0];
    expect(firstArg).toHaveProperty("err");
    await bad.close();
  });

  it("GET /api/campaigns/:id/characters returns 404 for an unknown campaign", async () => {
    const { app } = setup();
    const res = await app.inject({ method: "GET", url: "/api/campaigns/nope/characters" });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("creates, lists, updates, and deletes a character", async () => {
    const { app } = setup();
    const { campaign } = await createCampaign(app);

    const created = await app.inject({
      method: "POST",
      url: `/api/campaigns/${campaign.id}/characters`,
      payload: { name: "Thorin", concept: "Zwergischer Krieger" },
    });
    expect(created.statusCode).toBe(201);
    const character = created.json();
    expect(character.name).toBe("Thorin");

    const listed = await app.inject({ method: "GET", url: `/api/campaigns/${campaign.id}/characters` });
    expect(listed.json()).toHaveLength(1);

    const updated = await app.inject({
      method: "PATCH",
      url: `/api/campaigns/${campaign.id}/characters/${character.id}`,
      payload: { name: "Thorin", concept: "Zwergischer Krieger", narrative: { ideal: "Ehre" } },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().narrative).toEqual({ ideal: "Ehre" });
    expect(updated.json().name).toBe("Thorin");

    const deleted = await app.inject({
      method: "DELETE",
      url: `/api/campaigns/${campaign.id}/characters/${character.id}`,
    });
    expect(deleted.statusCode).toBe(204);

    const afterDelete = await app.inject({ method: "GET", url: `/api/campaigns/${campaign.id}/characters` });
    expect(afterDelete.json()).toHaveLength(0);
    await app.close();
  });

  it("rejects character creation with an empty name or concept with 400", async () => {
    const { app } = setup();
    const { campaign } = await createCampaign(app);
    const res = await app.inject({
      method: "POST",
      url: `/api/campaigns/${campaign.id}/characters`,
      payload: { name: "", concept: "" },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("404s on PATCH/DELETE for an unknown character id", async () => {
    const { app } = setup();
    const { campaign } = await createCampaign(app);
    const patch = await app.inject({
      method: "PATCH",
      url: `/api/campaigns/${campaign.id}/characters/nope`,
      payload: { name: "x", concept: "y" },
    });
    expect(patch.statusCode).toBe(404);
    const del = await app.inject({
      method: "DELETE",
      url: `/api/campaigns/${campaign.id}/characters/nope`,
    });
    expect(del.statusCode).toBe(404);
    await app.close();
  });

  it("blocks character CRUD on a finished campaign with 409", async () => {
    const { app } = setup();
    const { campaign } = await createCampaign(app);
    const created = await app.inject({
      method: "POST",
      url: `/api/campaigns/${campaign.id}/characters`,
      payload: { name: "Thorin", concept: "Krieger" },
    });
    const character = created.json();
    await app.inject({ method: "POST", url: `/api/campaigns/${campaign.id}/finish` });

    const postAfter = await app.inject({
      method: "POST",
      url: `/api/campaigns/${campaign.id}/characters`,
      payload: { name: "Lyra", concept: "Magierin" },
    });
    expect(postAfter.statusCode).toBe(409);

    const patchAfter = await app.inject({
      method: "PATCH",
      url: `/api/campaigns/${campaign.id}/characters/${character.id}`,
      payload: { name: "Thorin II", concept: "Krieger" },
    });
    expect(patchAfter.statusCode).toBe(409);

    const deleteAfter = await app.inject({
      method: "DELETE",
      url: `/api/campaigns/${campaign.id}/characters/${character.id}`,
    });
    expect(deleteAfter.statusCode).toBe(409);
    await app.close();
  });

  it("/state includes the party roster", async () => {
    const { app } = setup();
    const { campaign } = await createCampaign(app);
    await app.inject({
      method: "POST",
      url: `/api/campaigns/${campaign.id}/characters`,
      payload: { name: "Thorin", concept: "Krieger" },
    });
    const res = await app.inject({ method: "GET", url: `/api/campaigns/${campaign.id}/state` });
    expect(res.json().characters).toHaveLength(1);
    expect(res.json().characters[0].name).toBe("Thorin");
    await app.close();
  });

  it("POST /action with kind 'aside' tags both turns as 'aside' and force-nulls diceRequest", async () => {
    const store = new CampaignStore(openDb(":memory:"));
    // Deliberately returns a non-null diceRequest to prove the server strips it
    // for asides even if the model doesn't obey the prompt instruction.
    const rogueCaller: LlmCaller = async ({ system }) =>
      system.includes("Abenteuer-Architekt")
        ? fakePlanJson
        : '{"narration":"Er heißt Berthold.","diceRequest":{"reason":"Sollte nie passieren","hint":"W20"}}';
    const app = buildServer(rogueCaller, store);
    const { campaign } = await createCampaign(app);
    const res = await app.inject({
      method: "POST",
      url: `/api/campaigns/${campaign.id}/action`,
      payload: { text: "Wie heißt der Wirt?", kind: "aside" },
    });
    const body = res.json();
    const [playerTurn, gmTurn] = body.turns.slice(-2);
    expect(playerTurn.kind).toBe("aside");
    expect(gmTurn.kind).toBe("aside");
    expect(gmTurn.diceRequest).toBeNull();
    expect(body.pendingDice).toBeNull();
    await app.close();
  });

  it("POST /action without a kind still defaults to 'story' (backward compat)", async () => {
    const { app } = setup();
    const { campaign } = await createCampaign(app);
    const res = await app.inject({
      method: "POST",
      url: `/api/campaigns/${campaign.id}/action`,
      payload: { text: "Ich schaue mich um." },
    });
    const [playerTurn, gmTurn] = res.json().turns.slice(-2);
    expect(playerTurn.kind).toBe("story");
    expect(gmTurn.kind).toBe("story");
    await app.close();
  });

  it("excludes an aside exchange from the generated story transcript", async () => {
    const store = new CampaignStore(openDb(":memory:"));
    const capture = vi.fn(async ({ system, messages }: { system: string; messages: { content: string }[] }) => {
      if (system.includes("Abenteuer-Architekt")) return fakePlanJson;
      if (system.includes("Kurzgeschichte")) return "# Die Geschichte\n\nEs war einmal…";
      const last = messages[messages.length - 1];
      if (last?.content.includes("Wirt")) {
        return '{"narration":"Er heißt Berthold.","diceRequest":null}';
      }
      return '{"narration":"Ihr steht am Eingang.","diceRequest":null}';
    });
    const app = buildServer(capture, store);
    const { campaign } = await createCampaign(app);
    await app.inject({
      method: "POST",
      url: `/api/campaigns/${campaign.id}/action`,
      payload: { text: "Wie heißt der Wirt?", kind: "aside" },
    });
    await app.inject({ method: "POST", url: `/api/campaigns/${campaign.id}/finish` });
    await app.inject({ method: "POST", url: `/api/campaigns/${campaign.id}/story` });

    const storyCall = capture.mock.calls.find((c) => c[0].system.includes("Kurzgeschichte"));
    expect(storyCall![0].messages[0].content).not.toContain("Berthold");
    await app.close();
  });

  it("threads a party member's name into the GM call", async () => {
    const store = new CampaignStore(openDb(":memory:"));
    const capture = vi.fn(async ({ system }: { system: string }) =>
      system.includes("Abenteuer-Architekt") ? fakePlanJson : '{"narration":"ok","diceRequest":null}',
    );
    const app = buildServer(capture, store);
    const { campaign } = await createCampaign(app);
    await app.inject({
      method: "POST",
      url: `/api/campaigns/${campaign.id}/characters`,
      payload: { name: "Thorin", concept: "Krieger" },
    });
    await app.inject({
      method: "POST",
      url: `/api/campaigns/${campaign.id}/action`,
      payload: { text: "Ich schaue mich um." },
    });
    const lastCall = capture.mock.calls[capture.mock.calls.length - 1][0];
    expect(lastCall.system).toContain("Thorin");
    await app.close();
  });

  it("applies a start event and exposes combat in state", async () => {
    const combatCall: LlmCaller = async ({ system, messages }) => {
      if (system.includes("Abenteuer-Architekt")) return fakePlanJson;
      const last = messages[messages.length - 1];
      if (last?.role === "user" && last.content.toLowerCase().includes("kampf")) {
        return '{"narration":"Goblins stürmen heran!","diceRequest":null,"combat":{"event":"start","target":null,"amount":null,"enemies":[{"name":"Goblin","count":2,"hp":7}]}}';
      }
      return '{"narration":"Es geschieht etwas.","diceRequest":null,"combat":null}';
    };
    const store = new CampaignStore(openDb(":memory:"));
    const app = buildServer(combatCall, store);
    const created = await createCampaign(app);
    const id = created.campaign.id;
    await app.inject({
      method: "POST",
      url: `/api/campaigns/${id}/characters`,
      payload: { name: "Thalia", concept: "Magierin", maxHp: 12 },
    });
    const res = await app.inject({
      method: "POST",
      url: `/api/campaigns/${id}/action`,
      payload: { text: "Wir stellen uns zum Kampf" },
    });
    const state = res.json();
    expect(state.combat).not.toBeNull();
    expect(state.combat.active).toBe(true);
    expect(state.combat.combatants.map((c: { name: string }) => c.name)).toEqual([
      "Thalia",
      "Goblin 1",
      "Goblin 2",
    ]);
    await app.close();
  });

  it("runs the initiative -> advance -> end control flow", async () => {
    const combatCall: LlmCaller = async ({ system, messages }) => {
      if (system.includes("Abenteuer-Architekt")) return fakePlanJson;
      const last = messages[messages.length - 1];
      if (last?.role === "user" && last.content.toLowerCase().includes("kampf")) {
        return '{"narration":"Kampf!","diceRequest":null,"combat":{"event":"start","target":null,"amount":null,"enemies":[{"name":"Goblin","count":1,"hp":7}]}}';
      }
      return '{"narration":"…","diceRequest":null,"combat":null}';
    };
    const store = new CampaignStore(openDb(":memory:"));
    const app = buildServer(combatCall, store);
    const created = await createCampaign(app);
    const id = created.campaign.id;
    await app.inject({ method: "POST", url: `/api/campaigns/${id}/characters`, payload: { name: "Thalia", concept: "Magierin", maxHp: 12 } });
    await app.inject({ method: "POST", url: `/api/campaigns/${id}/action`, payload: { text: "Kampf beginnt" } });
    const state0 = (await app.inject({ method: "GET", url: `/api/campaigns/${id}/state` })).json();
    const ids = state0.combat.combatants.map((c: { id: string }) => c.id); // [thalia-id, "goblin"]

    const initRes = await app.inject({
      method: "POST",
      url: `/api/campaigns/${id}/combat/initiative`,
      payload: { values: [{ id: ids[0], value: 20 }, { id: ids[1], value: 5 }] },
    });
    const s1 = initRes.json();
    expect(s1.combat.phase).toBe("in-turns");
    expect(s1.combat.combatants[0].name).toBe("Thalia");

    const advRes = await app.inject({ method: "POST", url: `/api/campaigns/${id}/combat/advance` });
    expect(advRes.json().combat.turnIndex).toBe(1);

    const endRes = await app.inject({ method: "POST", url: `/api/campaigns/${id}/combat/end` });
    expect(endRes.json().combat).toBeNull();
    await app.close();
  });

  it("rejects initiative when a PC has no maxHp set", async () => {
    const combatCall: LlmCaller = async ({ system, messages }) => {
      if (system.includes("Abenteuer-Architekt")) return fakePlanJson;
      const last = messages[messages.length - 1];
      if (last?.role === "user" && last.content.toLowerCase().includes("kampf")) {
        return '{"narration":"Kampf!","diceRequest":null,"combat":{"event":"start","target":null,"amount":null,"enemies":[{"name":"Goblin","count":1,"hp":7}]}}';
      }
      return '{"narration":"…","diceRequest":null,"combat":null}';
    };
    const store = new CampaignStore(openDb(":memory:"));
    const app = buildServer(combatCall, store);
    const created = await createCampaign(app);
    const id = created.campaign.id;
    await app.inject({ method: "POST", url: `/api/campaigns/${id}/characters`, payload: { name: "Ohne HP", concept: "Späher" } });
    await app.inject({ method: "POST", url: `/api/campaigns/${id}/action`, payload: { text: "Kampf" } });
    const state0 = (await app.inject({ method: "GET", url: `/api/campaigns/${id}/state` })).json();
    const ids = state0.combat.combatants.map((c: { id: string }) => c.id);
    const res = await app.inject({
      method: "POST",
      url: `/api/campaigns/${id}/combat/initiative`,
      payload: { values: ids.map((cid: string) => ({ id: cid, value: 10 })) },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe("turn audio endpoint", () => {
  const wav = Buffer.from([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4]);
  const fakeSynth: TtsSynthesizer = async (text) => ({
    audio: wav,
    contentType: "audio/wav",
    charCount: text.length,
  });

  it("reports ttsEnabled=false and 404s the audio when TTS is disabled", async () => {
    const { app } = setup(); // no synth
    const body = await createCampaign(app);
    expect(body.ttsEnabled).toBe(false);
    const res = await app.inject({ method: "GET", url: `/api/campaigns/${body.campaign.id}/turns/0/audio` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("synthesizes on first request, caches, and serves the same bytes thereafter", async () => {
    const synth = vi.fn(fakeSynth);
    const { app, store } = setup(fakeCall, synth);
    const body = await createCampaign(app);
    expect(body.ttsEnabled).toBe(true);

    const first = await app.inject({ method: "GET", url: `/api/campaigns/${body.campaign.id}/turns/0/audio` });
    expect(first.statusCode).toBe(200);
    expect(first.headers["content-type"]).toContain("audio/wav");
    expect(Buffer.compare(first.rawPayload, wav)).toBe(0);
    expect(synth).toHaveBeenCalledTimes(1);
    expect(store.getTurnAudio(body.campaign.id, 0)).not.toBeNull();

    const second = await app.inject({ method: "GET", url: `/api/campaigns/${body.campaign.id}/turns/0/audio` });
    expect(second.statusCode).toBe(200);
    expect(Buffer.compare(second.rawPayload, wav)).toBe(0);
    // Served from cache — the synthesizer is not called again.
    expect(synth).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it("404s a non-gm (player) turn", async () => {
    const { app } = setup(fakeCall, fakeSynth);
    const { campaign } = await createCampaign(app);
    // seq 0 = gm opening, seq 1 = player, seq 2 = gm
    await app.inject({ method: "POST", url: `/api/campaigns/${campaign.id}/action`, payload: { text: "Ich schaue mich um." } });
    const res = await app.inject({ method: "GET", url: `/api/campaigns/${campaign.id}/turns/1/audio` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("404s an unknown campaign or seq", async () => {
    const { app } = setup(fakeCall, fakeSynth);
    const { campaign } = await createCampaign(app);
    const unknownCampaign = await app.inject({ method: "GET", url: `/api/campaigns/nope/turns/0/audio` });
    expect(unknownCampaign.statusCode).toBe(404);
    const unknownSeq = await app.inject({ method: "GET", url: `/api/campaigns/${campaign.id}/turns/999/audio` });
    expect(unknownSeq.statusCode).toBe(404);
    await app.close();
  });

  it("502s when synthesis fails, without caching anything", async () => {
    const failing: TtsSynthesizer = async () => {
      throw new Error("nim down");
    };
    const { app, store } = setup(fakeCall, failing);
    const { campaign } = await createCampaign(app);
    const res = await app.inject({ method: "GET", url: `/api/campaigns/${campaign.id}/turns/0/audio` });
    expect(res.statusCode).toBe(502);
    expect(store.getTurnAudio(campaign.id, 0)).toBeNull();
    await app.close();
  });

  it("PATCH updates a character's maxHp", async () => {
    const { app } = setup();
    const created = await createCampaign(app);
    const id = created.campaign.id;
    const c = (
      await app.inject({
        method: "POST",
        url: `/api/campaigns/${id}/characters`,
        payload: { name: "Thalia", concept: "Magierin" },
      })
    ).json();
    const res = await app.inject({
      method: "PATCH",
      url: `/api/campaigns/${id}/characters/${c.id}`,
      payload: { maxHp: 15 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().maxHp).toBe(15);
    const state = (await app.inject({ method: "GET", url: `/api/campaigns/${id}/state` })).json();
    expect(state.characters.find((x: { id: string }) => x.id === c.id).maxHp).toBe(15);
    await app.close();
  });
});
