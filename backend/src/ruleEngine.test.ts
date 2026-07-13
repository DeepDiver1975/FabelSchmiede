import { describe, it, expect } from "vitest";
import { canPerform, applyCost, restoreResources } from "./ruleEngine.js";
import type { Character } from "./types.js";

// A level-1 mage who knows a cantrip and a level-3 spell, with two spell slots.
function mage(overrides: Partial<Character> = {}): Character {
  return {
    id: "c1",
    campaign_id: "camp1",
    name: "Lyra",
    concept: "Magierin",
    level: 1,
    abilities: [
      { id: "spark", name: "Funke", minLevel: 1, slotCost: 0 },
      { id: "firewall", name: "Feuerwall", minLevel: 3, slotCost: 1 },
      { id: "shield", name: "Schild", minLevel: 1, slotCost: 1 },
    ],
    resources: [{ id: "slots1", name: "Zauberplätze Stufe 1", used: 0, available: 2 }],
    created_at: "2026-07-13T00:00:00.000Z",
    ...overrides,
  };
}

describe("canPerform", () => {
  it("rejects an unknown ability", () => {
    const v = canPerform(mage(), "fireball");
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toMatch(/kennt die Fähigkeit/);
  });

  it("rejects a known ability when the character's level is too low", () => {
    // The headline case: a level-1 character cannot cast firewall (minLevel 3).
    const v = canPerform(mage(), "firewall");
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toMatch(/erfordert Stufe 3/);
  });

  it("allows firewall once the character reaches the required level", () => {
    const v = canPerform(mage({ level: 3 }), "firewall");
    expect(v.ok).toBe(true);
  });

  it("allows an at-will ability (slotCost 0) with no resource pool", () => {
    const v = canPerform(mage(), "spark");
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.pool).toBeNull();
  });

  it("allows a slot-costing ability while a pool has capacity", () => {
    const v = canPerform(mage(), "shield");
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.pool?.id).toBe("slots1");
  });

  it("rejects a slot-costing ability when all pools are exhausted", () => {
    const c = mage({ resources: [{ id: "slots1", name: "Zauberplätze Stufe 1", used: 2, available: 2 }] });
    const v = canPerform(c, "shield");
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toMatch(/keine freie Ressource/);
  });

  it("rejects when the explicitly requested pool does not exist", () => {
    const v = canPerform(mage(), "shield", "slots9");
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toMatch(/keine Ressource/);
  });

  it("defaults level to 1 when unset", () => {
    const c = mage({ level: undefined });
    expect(canPerform(c, "spark").ok).toBe(true);
    expect(canPerform(c, "firewall").ok).toBe(false);
  });
});

describe("applyCost", () => {
  it("increments the spent pool and leaves the character otherwise unchanged", () => {
    const c = mage();
    const v = canPerform(c, "shield");
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    const after = applyCost(c, v);
    expect(after.resources![0].used).toBe(1);
    // Original is untouched (pure).
    expect(c.resources![0].used).toBe(0);
  });

  it("is a no-op for at-will abilities", () => {
    const c = mage();
    const v = canPerform(c, "spark");
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(applyCost(c, v)).toEqual(c);
  });

  it("exhausts a pool after repeated casts, then canPerform rejects", () => {
    let c = mage();
    for (let i = 0; i < 2; i++) {
      const v = canPerform(c, "shield");
      expect(v.ok).toBe(true);
      if (v.ok) c = applyCost(c, v);
    }
    expect(c.resources![0].used).toBe(2);
    expect(canPerform(c, "shield").ok).toBe(false);
  });
});

describe("restoreResources", () => {
  it("resets all pools to full", () => {
    const c = mage({ resources: [{ id: "slots1", name: "Zauberplätze Stufe 1", used: 2, available: 2 }] });
    const rested = restoreResources(c);
    expect(rested.resources![0].used).toBe(0);
    expect(canPerform(rested, "shield").ok).toBe(true);
  });
});
