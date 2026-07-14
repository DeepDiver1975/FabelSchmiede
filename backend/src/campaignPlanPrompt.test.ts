import { describe, it, expect } from "vitest";
import { buildCampaignPlanSystemPrompt } from "./campaignPlanPrompt.js";

describe("buildCampaignPlanSystemPrompt", () => {
  const p = buildCampaignPlanSystemPrompt("Der Nebelwald", "Goblins bedrohen ein Dorf");

  it("includes the name and premise", () => {
    expect(p).toContain("Der Nebelwald");
    expect(p).toContain("Goblins bedrohen ein Dorf");
  });

  it("carries the recognisable generator marker", () => {
    expect(p).toContain("Abenteuer-Architekt");
  });

  it("instructs that the brief must be spoiler-free", () => {
    expect(p.toLowerCase()).toContain("brief");
    // The spoiler rule names the secret fields it must not reveal.
    expect(p).toMatch(/backstory|Hintergrund|Geheimnis/);
  });

  it("does not mention characters/party (party-independent)", () => {
    expect(p.toLowerCase()).not.toContain("gruppe");
    expect(p.toLowerCase()).not.toContain("charakter");
  });
});
