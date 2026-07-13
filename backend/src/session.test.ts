import { describe, it, expect } from "vitest";
import { Session } from "./session.js";
import type { StoredTurn } from "./types.js";

describe("Session", () => {
  it("hydrates history from stored turns, keeping role, text, and diceRequest", () => {
    // diceRequest must survive: historyToMessages folds it back into the JSON
    // envelope when replaying gm turns to the model.
    const turns: StoredTurn[] = [
      { role: "gm", text: "Wirf!", diceRequest: { reason: "Angriff", hint: "W20 + STR" } },
      { role: "player", text: "Ich gehe hinein.", diceRequest: null },
    ];
    const s = new Session(turns);
    expect(s.getHistory()).toEqual([
      { role: "gm", text: "Wirf!", diceRequest: { reason: "Angriff", hint: "W20 + STR" } },
      { role: "player", text: "Ich gehe hinein.", diceRequest: null },
    ]);
  });

  it("appends player and gm turns in order", () => {
    const s = new Session([{ role: "gm", text: "Start", diceRequest: null }]);
    s.addPlayerTurn("Ich schaue mich um.");
    s.addGmTurn("Du siehst Fackeln.");
    const h = s.getHistory();
    expect(h[1]).toEqual({ role: "player", text: "Ich schaue mich um." });
    expect(h[2]).toEqual({ role: "gm", text: "Du siehst Fackeln." });
  });

  it("starts empty when hydrated from no turns", () => {
    expect(new Session([]).getHistory()).toEqual([]);
  });
});
