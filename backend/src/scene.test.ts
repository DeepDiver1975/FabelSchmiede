import { describe, it, expect } from "vitest";
import { SCENE_BRIEF } from "./scene.js";

describe("scene", () => {
  it("provides generic German GM guidance for the system prompt", () => {
    expect(SCENE_BRIEF.length).toBeGreaterThan(80);
    expect(SCENE_BRIEF).toContain("Deutsch");
  });

  it("emphatically enforces German-only narration (no English slips)", () => {
    // NIM/nemotron occasionally narrates in English; a strong, explicit rule
    // curbs that. Present in the shared brief so every prompt carries it.
    expect(SCENE_BRIEF).toContain("AUSSCHLIESSLICH auf Deutsch");
    expect(SCENE_BRIEF).toContain("niemals auf Englisch");
  });
});
