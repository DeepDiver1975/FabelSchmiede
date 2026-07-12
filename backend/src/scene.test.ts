import { describe, it, expect } from "vitest";
import { OPENING_NARRATION, SCENE_BRIEF } from "./scene.js";

describe("scene", () => {
  it("provides a non-trivial German opening narration", () => {
    expect(OPENING_NARRATION.length).toBeGreaterThan(80);
  });
  it("provides a scene brief for the system prompt", () => {
    expect(SCENE_BRIEF.length).toBeGreaterThan(80);
  });
});
