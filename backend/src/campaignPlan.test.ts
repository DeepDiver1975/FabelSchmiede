import { describe, it, expect } from "vitest";
import { toBrief } from "./campaignPlan.js";
import type { CampaignPlan } from "./types.js";

const plan: CampaignPlan = {
  title: "Der Nebelwald",
  brief: "Ein Dorf bittet um Hilfe.",
  backstory: "GEHEIM: ein Kult beschwört einen Dämon.",
  npcs: [{ name: "Mara", role: "Wirtin", description: "nervös", secret: "GEHEIM: Kult-Spitzel" }],
  locations: [
    { name: "Gasthaus", description: "warm und laut", secret: "GEHEIM: Falltür" },
    { name: "Wald", description: "neblig", secret: "" },
  ],
  arc: { outline: "GEHEIM: Ritual", hooks: ["GEHEIM: Kinder"], branchPoints: ["GEHEIM: Fork"] },
};

describe("toBrief", () => {
  it("keeps public title, brief and location name+description", () => {
    const b = toBrief(plan);
    expect(b.title).toBe("Der Nebelwald");
    expect(b.brief).toBe("Ein Dorf bittet um Hilfe.");
    expect(b.locations).toEqual([
      { name: "Gasthaus", description: "warm und laut" },
      { name: "Wald", description: "neblig" },
    ]);
  });

  it("never leaks any secret, backstory, npc, or arc text", () => {
    const serialized = JSON.stringify(toBrief(plan));
    expect(serialized).not.toContain("GEHEIM");
    expect(serialized).not.toContain("Mara");
  });
});
