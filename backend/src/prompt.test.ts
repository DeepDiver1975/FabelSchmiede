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
  it("maps gm turns to assistant and player turns to user", () => {
    const msgs = historyToMessages([
      { role: "gm", text: "Ihr steht vor der Höhle." },
      { role: "player", text: "Ich schleiche hinein." },
    ]);
    expect(msgs).toEqual([
      { role: "assistant", content: "Ihr steht vor der Höhle." },
      { role: "user", content: "Ich schleiche hinein." },
    ]);
  });
});
