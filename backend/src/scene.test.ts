import { describe, it, expect } from "vitest";
import { SCENE_BRIEF } from "./scene.js";

describe("scene", () => {
  it("provides generic German GM guidance for the system prompt", () => {
    expect(SCENE_BRIEF.length).toBeGreaterThan(80);
    expect(SCENE_BRIEF).toContain("Deutsch");
  });
});
