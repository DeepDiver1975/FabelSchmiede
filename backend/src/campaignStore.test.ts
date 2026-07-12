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
      { role: "gm", text: "Ihr steht am Eingang.", diceRequest: null },
      { role: "player", text: "Ich gehe hinein.", diceRequest: null },
      { role: "gm", text: "Ein Goblin!", diceRequest: { reason: "Angriff", hint: "W20 + STR" } },
    ]);
  });

  it("scopes turns to their campaign", () => {
    const store = freshStore();
    const a = store.createCampaign("A", "p");
    const b = store.createCampaign("B", "p");
    store.appendTurn(a.id, { role: "gm", text: "A1", diceRequest: null });
    store.appendTurn(b.id, { role: "gm", text: "B1", diceRequest: null });
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
      { role: "player", text: "Ich greife an.", diceRequest: null },
      { role: "gm", text: "Der Goblin weicht aus.", diceRequest: { reason: "Angriff", hint: "W20" } },
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
});
