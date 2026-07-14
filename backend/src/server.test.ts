import { describe, it, expect, vi } from "vitest";
import { buildServer } from "./server.js";
import { CampaignStore } from "./campaignStore.js";
import { openDb } from "./db.js";
import type { ClaudeCaller } from "./gmEngine.js";

// Fake caller:
//  - story requests (system contains "Kurzgeschichte") → markdown
//  - a player message containing "angriff" → one dice request
//  - everything else (incl. openings) → plain narration
const fakeCall: ClaudeCaller = async ({ system, messages }) => {
  if (system.includes("Kurzgeschichte")) return "# Die Geschichte\n\nEs war einmal…";
  const last = messages[messages.length - 1];
  if (last?.role === "user" && last.content.toLowerCase().includes("angriff")) {
    return '{"narration":"Der Goblin faucht!","diceRequest":{"reason":"Angriff","hint":"W20 + STR"}}';
  }
  return '{"narration":"Es geschieht etwas.","diceRequest":null}';
};

function setup(call: ClaudeCaller = fakeCall) {
  const store = new CampaignStore(openDb(":memory:"));
  return { store, app: buildServer(call, store) };
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
    const rogueCaller: ClaudeCaller = async () =>
      '{"narration":"Er heißt Berthold.","diceRequest":{"reason":"Sollte nie passieren","hint":"W20"}}';
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
    const capture = vi.fn().mockResolvedValue('{"narration":"ok","diceRequest":null}');
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
});
