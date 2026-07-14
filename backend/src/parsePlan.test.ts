import { describe, it, expect } from "vitest";
import { parsePlan } from "./parsePlan.js";

const valid = JSON.stringify({
  title: "Der Nebelwald",
  brief: "Ein Dorf am Waldrand bittet um Hilfe.",
  backstory: "Ein Kult beschwört im Wald einen Dämon.",
  npcs: [{ name: "Mara", role: "Wirtin", description: "nervös", secret: "Kult-Spitzel" }],
  locations: [{ name: "Gasthaus", description: "warm und laut", secret: "" }],
  arc: { outline: "Von Gerüchten zum Ritual.", hooks: ["Vermisste Kinder"], branchPoints: ["Kult stellen oder fliehen"] },
});

describe("parsePlan", () => {
  it("parses a valid plan", () => {
    const p = parsePlan(valid);
    expect(p.title).toBe("Der Nebelwald");
    expect(p.npcs[0].secret).toBe("Kult-Spitzel");
    expect(p.arc.hooks).toEqual(["Vermisste Kinder"]);
  });

  it("parses a plan wrapped in a markdown fence", () => {
    expect(parsePlan("```json\n" + valid + "\n```").title).toBe("Der Nebelwald");
  });

  it("throws on non-JSON", () => {
    expect(() => parsePlan("nope")).toThrow();
  });

  it("throws when a required field is missing", () => {
    const bad = JSON.parse(valid);
    delete bad.arc;
    expect(() => parsePlan(JSON.stringify(bad))).toThrow();
  });

  it("throws when npcs is not an array of well-formed objects", () => {
    const bad = JSON.parse(valid);
    bad.npcs = [{ name: "X" }];
    expect(() => parsePlan(JSON.stringify(bad))).toThrow();
  });
});
