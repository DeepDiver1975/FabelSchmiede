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

  // Observed with NIM/nemotron (~1 in 3 plans): the model returns arc.outline as
  // a string ARRAY and arc.branchPoints as OBJECTS {prompt, options}. These are
  // loose narrative fields fed to the GM as prose, so coerce them to strings
  // rather than 500 the whole campaign creation.
  it("coerces an arc whose outline is a string array and branchPoints are objects", () => {
    const v = JSON.parse(valid);
    v.arc = {
      outline: ["Anfang: Der Überfall.", "Mitte: Die Höhle.", "Ende: Das Ritual."],
      hooks: ["Vermisste Kinder", "Seltsame Runen"],
      branchPoints: [
        { prompt: "Den Kult stellen oder fliehen?", options: ["stellen", "fliehen"] },
        { prompt: "Dem Boten trauen?", options: ["ja", "nein"] },
      ],
    };
    const p = parsePlan(JSON.stringify(v));
    expect(typeof p.arc.outline).toBe("string");
    expect(p.arc.outline).toContain("Anfang");
    expect(p.arc.outline).toContain("Ende");
    expect(p.arc.hooks).toEqual(["Vermisste Kinder", "Seltsame Runen"]);
    expect(p.arc.branchPoints).toHaveLength(2);
    expect(p.arc.branchPoints.every((b) => typeof b === "string")).toBe(true);
    expect(p.arc.branchPoints[0]).toContain("Den Kult stellen");
  });

  it("coerces hooks given as wrapper objects", () => {
    const v = JSON.parse(valid);
    v.arc = { outline: "X", hooks: [{ hook: "Ein Flüstern im Wald" }], branchPoints: ["A"] };
    const p = parsePlan(JSON.stringify(v));
    expect(p.arc.hooks.every((h) => typeof h === "string")).toBe(true);
    expect(p.arc.hooks[0]).toContain("Flüstern");
  });

  it("still throws when the arc has no usable outline", () => {
    const v = JSON.parse(valid);
    v.arc = { hooks: [], branchPoints: [] };
    expect(() => parsePlan(JSON.stringify(v))).toThrow();
  });
});
