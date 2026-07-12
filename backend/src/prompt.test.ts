import { describe, it, expect } from "vitest";
import { buildSystemPrompt, historyToMessages } from "./prompt.js";

describe("buildSystemPrompt", () => {
  it("instructs the GM never to roll dice itself", () => {
    const p = buildSystemPrompt().toLowerCase();
    expect(p).toContain("würfl"); // matches würfle/würfeln/würflst stem
    expect(p).toContain("dicerequest");
  });
  it("includes the scene brief", () => {
    expect(buildSystemPrompt()).toContain("Höhle");
  });
});

describe("historyToMessages", () => {
  it("maps interior gm turns to assistant and player turns to user", () => {
    const msgs = historyToMessages([
      { role: "gm", text: "Ihr steht vor der Höhle." },
      { role: "player", text: "Ich schleiche hinein." },
      { role: "gm", text: "Es ist dunkel." },
    ]);
    // Leading opening (gm) is dropped; interior gm stays assistant.
    expect(msgs).toEqual([
      { role: "user", content: "Ich schleiche hinein." },
      { role: "assistant", content: "Es ist dunkel." },
    ]);
  });

  it("returns an array beginning with a user message when history starts with a gm (opening) turn", () => {
    const result = historyToMessages([
      { role: "gm", text: "Ihr steht vor der Höhle." },
      { role: "player", text: "Ich schleiche hinein." },
    ]);
    expect(result[0].role).toBe("user");
  });

  it("drops leading opening, preserves interior gm and order for a multi-turn history", () => {
    const result = historyToMessages([
      { role: "gm", text: "opening" },
      { role: "player", text: "a" },
      { role: "gm", text: "b" },
      { role: "player", text: "c" },
    ]);
    expect(result).toEqual([
      { role: "user", content: "a" },
      { role: "assistant", content: "b" },
      { role: "user", content: "c" },
    ]);
  });
});
