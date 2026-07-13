import { describe, it, expect } from "vitest";
import { buildStorySystemPrompt, renderTranscript } from "./storyPrompt.js";
import type { StoredTurn } from "./types.js";

describe("buildStorySystemPrompt", () => {
  it("asks for a German short story and names the campaign + premise", () => {
    const p = buildStorySystemPrompt({ name: "Die Höhle", premise: "Goblins im Nebelwald" });
    expect(p).toContain("Kurzgeschichte");
    expect(p).toContain("Die Höhle");
    expect(p).toContain("Goblins im Nebelwald");
  });
});

describe("buildStorySystemPrompt party injection", () => {
  const campaign = { name: "Die Höhle", premise: "Goblins im Nebelwald" };
  const character = { id: "1", campaign_id: "c", name: "Thorin", concept: "Krieger", created_at: "x" };

  it("splices in the party roster when characters are present", () => {
    const p = buildStorySystemPrompt(campaign, [character]);
    expect(p).toContain("GRUPPE");
    expect(p).toContain("Thorin");
  });

  it("is byte-for-byte unchanged when the party is empty", () => {
    expect(buildStorySystemPrompt(campaign, [])).toBe(buildStorySystemPrompt(campaign));
  });
});

describe("renderTranscript", () => {
  it("labels GM and player turns in German", () => {
    const turns: StoredTurn[] = [
      { role: "gm", text: "Ihr steht am Eingang.", diceRequest: null },
      { role: "player", text: "Ich gehe hinein.", diceRequest: null },
    ];
    const out = renderTranscript(turns);
    expect(out).toContain("SPIELLEITER: Ihr steht am Eingang.");
    expect(out).toContain("SPIELER: Ich gehe hinein.");
  });
});
