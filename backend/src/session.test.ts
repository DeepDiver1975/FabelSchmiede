import { describe, it, expect } from "vitest";
import { Session } from "./session.js";
import { OPENING_NARRATION } from "./scene.js";

describe("Session", () => {
  it("starts with the opening narration as a gm turn", () => {
    const s = new Session();
    expect(s.getHistory()).toEqual([{ role: "gm", text: OPENING_NARRATION }]);
  });

  it("appends player and gm turns in order", () => {
    const s = new Session();
    s.addPlayerTurn("Ich schaue mich um.");
    s.addGmTurn("Du siehst Fackeln.");
    const h = s.getHistory();
    expect(h[1]).toEqual({ role: "player", text: "Ich schaue mich um." });
    expect(h[2]).toEqual({ role: "gm", text: "Du siehst Fackeln." });
  });

  it("reset returns to just the opening", () => {
    const s = new Session();
    s.addPlayerTurn("x");
    s.reset();
    expect(s.getHistory()).toHaveLength(1);
  });
});
