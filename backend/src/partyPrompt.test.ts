import { describe, it, expect } from "vitest";
import { renderParty } from "./partyPrompt.js";
import type { Character } from "./types.js";

const base = { id: "1", campaign_id: "c1", created_at: "2026-01-01T00:00:00.000Z" };

describe("renderParty", () => {
  it("returns an empty string for an empty party", () => {
    expect(renderParty([])).toBe("");
  });

  it("always includes name and concept", () => {
    const characters: Character[] = [{ ...base, name: "Thorin", concept: "Zwergischer Krieger" }];
    const out = renderParty(characters);
    expect(out).toContain("Thorin");
    expect(out).toContain("Zwergischer Krieger");
  });

  it("omits optional narrative labels when absent", () => {
    const characters: Character[] = [{ ...base, name: "Thorin", concept: "Krieger" }];
    const out = renderParty(characters);
    expect(out).not.toContain("Wesenszug");
    expect(out).not.toContain("Ideal");
    expect(out).not.toContain("Bindung");
    expect(out).not.toContain("Makel");
    expect(out).not.toContain("Aussehen");
    expect(out).not.toContain("Hintergrund");
  });

  it("renders present narrative fields", () => {
    const characters: Character[] = [
      {
        ...base,
        name: "Thorin",
        concept: "Zwergischer Krieger",
        narrative: {
          personality: "aufbrausend",
          ideal: "Ehre",
          bond: "sein Clan",
          flaw: "nachtragend",
          appearance: "vernarbt, roter Bart",
          backstory: "Verbannt aus seiner Heimatstadt.",
        },
      },
    ];
    const out = renderParty(characters);
    expect(out).toContain("aufbrausend");
    expect(out).toContain("Ehre");
    expect(out).toContain("sein Clan");
    expect(out).toContain("nachtragend");
    expect(out).toContain("vernarbt, roter Bart");
    expect(out).toContain("Verbannt aus seiner Heimatstadt.");
  });

  it("renders multiple party members and a roster heading", () => {
    const characters: Character[] = [
      { ...base, id: "1", name: "Thorin", concept: "Krieger" },
      { ...base, id: "2", name: "Lyra", concept: "Magierin" },
    ];
    const out = renderParty(characters);
    expect(out).toContain("GRUPPE");
    expect(out).toContain("Thorin");
    expect(out).toContain("Lyra");
  });
});
