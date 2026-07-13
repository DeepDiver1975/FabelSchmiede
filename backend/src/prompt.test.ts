import { describe, it, expect } from "vitest";
import { buildSystemPrompt, buildOpeningSystemPrompt, historyToMessages } from "./prompt.js";

describe("buildSystemPrompt", () => {
  it("instructs the GM never to roll dice itself and to answer as JSON", () => {
    const p = buildSystemPrompt("Goblins im Nebelwald").toLowerCase();
    expect(p).toContain("würfl"); // matches würfle/würfeln
    expect(p).toContain("dicerequest");
  });
  it("embeds the campaign premise", () => {
    expect(buildSystemPrompt("Goblins im Nebelwald")).toContain("Goblins im Nebelwald");
  });

  it("instructs the GM to keep established names, places, and counts consistent", () => {
    const p = buildSystemPrompt("Goblins im Nebelwald").toLowerCase();
    expect(p).toContain("konsistent");
    // must warn against confusing a person's name with a place
    expect(p).toContain("person");
    expect(p).toContain("ort");
  });

  it("folds the opening narration into the prompt so its facts survive later turns", () => {
    const opening = "Ihr betretet das Dorf Einwindtal. Am Waldrand lauern vier Goblins.";
    const p = buildSystemPrompt("Goblins im Nebelwald", opening);
    expect(p).toContain("Einwindtal");
    expect(p).toContain("vier Goblins");
  });

  it("omits the opening section when no opening is given", () => {
    // A fresh campaign with no prior opening must not leave a dangling heading.
    expect(buildSystemPrompt("Goblins im Nebelwald")).not.toContain("BISHERIGER VERLAUF");
  });
});

describe("buildOpeningSystemPrompt", () => {
  it("asks for an opening scene and embeds the premise", () => {
    const p = buildOpeningSystemPrompt("Ein Raumhafen auf dem Mars");
    expect(p).toContain("Eröffnungsszene");
    expect(p).toContain("Ein Raumhafen auf dem Mars");
  });
});

describe("historyToMessages", () => {
  it("maps interior gm turns to assistant and player turns to user, dropping the leading gm opening", () => {
    const msgs = historyToMessages([
      { role: "gm", text: "Ihr steht vor der Höhle." },
      { role: "player", text: "Ich schleiche hinein." },
      { role: "gm", text: "Es ist dunkel." },
    ]);
    expect(msgs).toEqual([
      { role: "user", content: "Ich schleiche hinein." },
      { role: "assistant", content: "Es ist dunkel." },
    ]);
  });

  it("returns an array beginning with a user message", () => {
    const result = historyToMessages([
      { role: "gm", text: "Ihr steht vor der Höhle." },
      { role: "player", text: "Ich schleiche hinein." },
    ]);
    expect(result[0].role).toBe("user");
  });
});
