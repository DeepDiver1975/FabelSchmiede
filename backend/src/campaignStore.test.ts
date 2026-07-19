import { describe, it, expect } from "vitest";
import { openDb } from "./db.js";
import { CampaignStore } from "./campaignStore.js";

function freshStore() {
  return new CampaignStore(openDb(":memory:"));
}

describe("CampaignStore", () => {
  it("creates a campaign with active status and no finished_at", () => {
    const store = freshStore();
    const c = store.createCampaign("Die Höhle", "Goblins im Nebelwald");
    expect(c.name).toBe("Die Höhle");
    expect(c.premise).toBe("Goblins im Nebelwald");
    expect(c.status).toBe("active");
    expect(c.finished_at).toBeNull();
    expect(c.id).toBeTruthy();
  });

  it("lists campaigns newest first", () => {
    const store = freshStore();
    const a = store.createCampaign("A", "p");
    const b = store.createCampaign("B", "p");
    const ids = store.listCampaigns().map((c) => c.id);
    expect(ids).toContain(a.id);
    expect(ids).toContain(b.id);
    // CampaignSummary omits premise
    expect((store.listCampaigns()[0] as Record<string, unknown>).premise).toBeUndefined();
  });

  it("getCampaign returns null for an unknown id", () => {
    expect(freshStore().getCampaign("nope")).toBeNull();
  });

  it("appends turns in insertion order and reconstructs diceRequest", () => {
    const store = freshStore();
    const c = store.createCampaign("C", "p");
    store.appendTurn(c.id, { role: "gm", text: "Ihr steht am Eingang.", diceRequest: null });
    store.appendTurn(c.id, { role: "player", text: "Ich gehe hinein.", diceRequest: null });
    store.appendTurn(c.id, {
      role: "gm",
      text: "Ein Goblin!",
      diceRequest: { reason: "Angriff", hint: "W20 + STR" },
    });
    const turns = store.getTurns(c.id);
    expect(turns).toEqual([
      { role: "gm", text: "Ihr steht am Eingang.", diceRequest: null, kind: "story", seq: 0 },
      { role: "player", text: "Ich gehe hinein.", diceRequest: null, kind: "story", seq: 1 },
      {
        role: "gm",
        text: "Ein Goblin!",
        diceRequest: { reason: "Angriff", hint: "W20 + STR" },
        kind: "story",
        seq: 2,
      },
    ]);
  });

  it("defaults kind to 'story' when omitted, and round-trips an explicit 'aside' kind", () => {
    const store = freshStore();
    const c = store.createCampaign("C", "p");
    store.appendTurn(c.id, { role: "player", text: "Wie heißt der Wirt?", diceRequest: null, kind: "aside" });
    store.appendTurn(c.id, { role: "gm", text: "Er heißt Berthold.", diceRequest: null, kind: "aside" });
    store.appendTurn(c.id, { role: "player", text: "Ich gehe hinein.", diceRequest: null });
    const turns = store.getTurns(c.id);
    expect(turns[0].kind).toBe("aside");
    expect(turns[1].kind).toBe("aside");
    expect(turns[2].kind).toBe("story");
  });

  it("scopes turns to their campaign", () => {
    const store = freshStore();
    const a = store.createCampaign("A", "p");
    const b = store.createCampaign("B", "p");
    store.appendTurn(a.id, { role: "gm", text: "A1", diceRequest: null, kind: "story" });
    store.appendTurn(b.id, { role: "gm", text: "B1", diceRequest: null, kind: "story" });
    expect(store.getTurns(a.id)).toHaveLength(1);
    expect(store.getTurns(a.id)[0].text).toBe("A1");
  });

  it("finishCampaign flips status and sets finished_at", () => {
    const store = freshStore();
    const c = store.createCampaign("C", "p");
    store.finishCampaign(c.id);
    const after = store.getCampaign(c.id)!;
    expect(after.status).toBe("finished");
    expect(after.finished_at).not.toBeNull();
  });

  it("appendTurns writes multiple turns atomically in one transaction", () => {
    const store = freshStore();
    const c = store.createCampaign("C", "p");
    store.appendTurns(c.id, [
      { role: "player", text: "Ich greife an.", diceRequest: null },
      { role: "gm", text: "Der Goblin weicht aus.", diceRequest: { reason: "Angriff", hint: "W20" } },
    ]);
    const turns = store.getTurns(c.id);
    expect(turns).toEqual([
      { role: "player", text: "Ich greife an.", diceRequest: null, kind: "story", seq: 0 },
      {
        role: "gm",
        text: "Der Goblin weicht aus.",
        diceRequest: { reason: "Angriff", hint: "W20" },
        kind: "story",
        seq: 1,
      },
    ]);
  });

  it("saveStory upserts — regenerating overwrites the row", () => {
    const store = freshStore();
    const c = store.createCampaign("C", "p");
    expect(store.getStory(c.id)).toBeNull();
    store.saveStory(c.id, "# Erste Fassung");
    const second = store.saveStory(c.id, "# Zweite Fassung");
    expect(second.markdown).toBe("# Zweite Fassung");
    expect(store.getStory(c.id)!.markdown).toBe("# Zweite Fassung");
  });

  it("creates a minimal character (core fields only) and reads it back", () => {
    const store = freshStore();
    const c = store.createCampaign("C", "p");
    const created = store.createCharacter(c.id, { name: "Lyra", concept: "Magierin" });
    expect(created.id).toBeTruthy();
    expect(created.campaign_id).toBe(c.id);
    expect(created.level).toBeUndefined();
    expect(created.abilities).toBeUndefined();
    const loaded = store.getCharacter(created.id)!;
    expect(loaded).toEqual(created);
  });

  it("round-trips a full character sheet through JSON columns", () => {
    const store = freshStore();
    const c = store.createCampaign("C", "p");
    const created = store.createCharacter(c.id, {
      name: "Lyra",
      concept: "Magierin",
      level: 3,
      narrative: { backstory: "Aus dem Nebelwald.", flaw: "Zu neugierig." },
      abilities: [{ id: "firewall", name: "Feuerwall", minLevel: 3, slotCost: 1 }],
      resources: [{ id: "slots1", name: "Zauberplätze", used: 0, available: 2 }],
    });
    const loaded = store.getCharacter(created.id)!;
    expect(loaded.level).toBe(3);
    expect(loaded.narrative).toEqual({ backstory: "Aus dem Nebelwald.", flaw: "Zu neugierig." });
    expect(loaded.abilities).toEqual([{ id: "firewall", name: "Feuerwall", minLevel: 3, slotCost: 1 }]);
    expect(loaded.resources).toEqual([{ id: "slots1", name: "Zauberplätze", used: 0, available: 2 }]);
  });

  it("scopes characters to their campaign and lists them in creation order", () => {
    const store = freshStore();
    const a = store.createCampaign("A", "p");
    const b = store.createCampaign("B", "p");
    store.createCharacter(a.id, { name: "Erste", concept: "Kriegerin" });
    store.createCharacter(a.id, { name: "Zweite", concept: "Schurke" });
    store.createCharacter(b.id, { name: "Fremde", concept: "Barde" });
    expect(store.listCharacters(a.id).map((ch) => ch.name)).toEqual(["Erste", "Zweite"]);
    expect(store.listCharacters(b.id).map((ch) => ch.name)).toEqual(["Fremde"]);
  });

  it("getCharacter returns null for an unknown id", () => {
    expect(freshStore().getCharacter("nope")).toBeNull();
  });

  it("persists a mechanical mutation (spent resource pool) via updateCharacter", () => {
    const store = freshStore();
    const c = store.createCampaign("C", "p");
    const created = store.createCharacter(c.id, {
      name: "Lyra",
      concept: "Magierin",
      resources: [{ id: "slots1", name: "Zauberplätze", used: 0, available: 2 }],
    });
    store.updateCharacter({
      ...created,
      resources: [{ id: "slots1", name: "Zauberplätze", used: 1, available: 2 }],
    });
    expect(store.getCharacter(created.id)!.resources![0].used).toBe(1);
  });

  it("deleteCharacter removes only the target and is campaign-scoped", () => {
    const store = freshStore();
    const c = store.createCampaign("C", "p");
    const a = store.createCharacter(c.id, { name: "Erste", concept: "Kriegerin" });
    const b = store.createCharacter(c.id, { name: "Zweite", concept: "Schurke" });
    store.deleteCharacter(a.id);
    expect(store.getCharacter(a.id)).toBeNull();
    expect(store.getCharacter(b.id)).not.toBeNull();
    expect(store.listCharacters(c.id).map((ch) => ch.name)).toEqual(["Zweite"]);
  });

  it("round-trips a character's maxHp", () => {
    const store = new CampaignStore(openDb(":memory:"));
    const c = store.createCampaign("K", "P");
    const created = store.createCharacter(c.id, { name: "Thalia", concept: "Magierin", maxHp: 12 });
    expect(created.maxHp).toBe(12);
    expect(store.getCharacter(created.id)!.maxHp).toBe(12);
    store.updateCharacter({ ...created, maxHp: 20 });
    expect(store.getCharacter(created.id)!.maxHp).toBe(20);
  });
});

import type { CampaignPlan } from "./types.js";

const aPlan: CampaignPlan = {
  title: "Der Nebelwald",
  brief: "Ein Dorf bittet um Hilfe.",
  backstory: "Ein Kult.",
  npcs: [{ name: "Mara", role: "Wirtin", description: "nervös", secret: "Spitzel" }],
  locations: [{ name: "Gasthaus", description: "warm", secret: "" }],
  arc: { outline: "Ritual", hooks: ["Kinder"], branchPoints: ["Fork"] },
};

describe("CampaignStore plans", () => {
  it("saves and reads back a plan", () => {
    const store = freshStore();
    const c = store.createCampaign("C", "p");
    const saved = store.savePlan(c.id, aPlan);
    expect(saved.generated_at).toBeTruthy();
    const got = store.getPlan(c.id);
    expect(got?.plan).toEqual(aPlan);
  });

  it("getPlan returns null when none stored", () => {
    const store = freshStore();
    const c = store.createCampaign("C", "p");
    expect(store.getPlan(c.id)).toBeNull();
  });

  it("savePlan overwrites an existing plan for the campaign", () => {
    const store = freshStore();
    const c = store.createCampaign("C", "p");
    store.savePlan(c.id, aPlan);
    store.savePlan(c.id, { ...aPlan, title: "Neu" });
    expect(store.getPlan(c.id)?.plan.title).toBe("Neu");
  });
});

describe("CampaignStore turn audio", () => {
  it("getTurns exposes a contiguous seq per turn", () => {
    const store = freshStore();
    const c = store.createCampaign("C", "p");
    store.appendTurn(c.id, { role: "gm", text: "Eröffnung", diceRequest: null });
    store.appendTurn(c.id, { role: "player", text: "Ich gehe hinein.", diceRequest: null });
    store.appendTurn(c.id, { role: "gm", text: "Der Gang ist dunkel.", diceRequest: null });
    expect(store.getTurns(c.id).map((t) => t.seq)).toEqual([0, 1, 2]);
  });

  it("saves and reads back a turn's audio", () => {
    const store = freshStore();
    const c = store.createCampaign("C", "p");
    const audio = Buffer.from([0x52, 0x49, 0x46, 0x46, 1, 2, 3]);
    store.saveTurnAudio(c.id, 0, audio, "audio/wav", 42);
    const got = store.getTurnAudio(c.id, 0);
    expect(got?.contentType).toBe("audio/wav");
    expect(Buffer.compare(got!.audio, audio)).toBe(0);
  });

  it("getTurnAudio returns null when none is stored", () => {
    const store = freshStore();
    const c = store.createCampaign("C", "p");
    expect(store.getTurnAudio(c.id, 0)).toBeNull();
  });

  it("saveTurnAudio overwrites existing audio for the same (campaign, seq)", () => {
    const store = freshStore();
    const c = store.createCampaign("C", "p");
    store.saveTurnAudio(c.id, 0, Buffer.from([1]), "audio/wav", 1);
    store.saveTurnAudio(c.id, 0, Buffer.from([2, 2]), "audio/wav", 2);
    const got = store.getTurnAudio(c.id, 0);
    expect(Buffer.compare(got!.audio, Buffer.from([2, 2]))).toBe(0);
  });
});

describe("CampaignStore combat", () => {
  it("saves, reads, and clears combat state", () => {
    const store = new CampaignStore(openDb(":memory:"));
    const c = store.createCampaign("K", "P");
    expect(store.getCombat(c.id)).toBeNull();
    const state = {
      active: true,
      phase: "rolling-initiative" as const,
      combatants: [
        { id: "goblin-1", name: "Goblin 1", side: "enemy" as const, maxHp: 7, hp: 7, initiative: null, defeated: false },
      ],
      turnIndex: 0,
      turnPhase: "ready" as const,
    };
    store.saveCombat(c.id, state);
    expect(store.getCombat(c.id)).toEqual(state);
    store.clearCombat(c.id);
    expect(store.getCombat(c.id)).toBeNull();
  });
});
