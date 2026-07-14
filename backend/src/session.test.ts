import { describe, it, expect } from "vitest";
import { Session } from "./session.js";
import type { StoredTurn } from "./types.js";

describe("Session", () => {
  it("hydrates history from stored turns, keeping role, text, diceRequest, and kind", () => {
    // diceRequest must survive: historyToMessages folds it back into the JSON
    // envelope when replaying gm turns to the model.
    const turns: StoredTurn[] = [
      { role: "gm", text: "Wirf!", diceRequest: { reason: "Angriff", hint: "W20 + STR" }, kind: "story" },
      { role: "player", text: "Ich gehe hinein.", diceRequest: null, kind: "story" },
    ];
    const s = new Session(turns);
    expect(s.getHistory()).toEqual([
      { role: "gm", text: "Wirf!", diceRequest: { reason: "Angriff", hint: "W20 + STR" }, kind: "story" },
      { role: "player", text: "Ich gehe hinein.", diceRequest: null, kind: "story" },
    ]);
  });

  it("appends player and gm turns in order, defaulting kind to 'story'", () => {
    const s = new Session([{ role: "gm", text: "Start", diceRequest: null, kind: "story" }]);
    s.addPlayerTurn("Ich schaue mich um.");
    s.addGmTurn("Du siehst Fackeln.");
    const h = s.getHistory();
    expect(h[1]).toEqual({ role: "player", text: "Ich schaue mich um.", kind: "story" });
    expect(h[2]).toEqual({ role: "gm", text: "Du siehst Fackeln.", kind: "story" });
  });

  it("tags an explicit 'aside' kind on player and gm turns", () => {
    const s = new Session([{ role: "gm", text: "Start", diceRequest: null, kind: "story" }]);
    s.addPlayerTurn("Wie heißt der Wirt?", "aside");
    s.addGmTurn("Er heißt Berthold.", "aside");
    const h = s.getHistory();
    expect(h[1]).toEqual({ role: "player", text: "Wie heißt der Wirt?", kind: "aside" });
    expect(h[2]).toEqual({ role: "gm", text: "Er heißt Berthold.", kind: "aside" });
  });

  it("starts empty when hydrated from no turns", () => {
    expect(new Session([]).getHistory()).toEqual([]);
  });
});
