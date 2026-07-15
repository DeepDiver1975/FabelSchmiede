import { describe, it, expect } from "vitest";
import { applyCombatEvent } from "./combat.js";
import type { CombatState, PcSeed } from "./types.js";

const pcs: PcSeed[] = [
  { id: "pc-1", name: "Thalia", maxHp: 12 },
  { id: "pc-2", name: "Bragok", maxHp: 15 },
];

function started(): CombatState {
  const s = applyCombatEvent(null, { event: "start", enemies: [{ name: "Goblin", count: 3, hp: 7 }] }, pcs);
  if (!s) throw new Error("expected state");
  return s;
}

describe("applyCombatEvent — start", () => {
  it("seeds PCs and expands enemies into individually named combatants", () => {
    const s = started();
    expect(s.active).toBe(true);
    expect(s.phase).toBe("rolling-initiative");
    const names = s.combatants.map((c) => c.name);
    expect(names).toEqual(["Thalia", "Bragok", "Goblin 1", "Goblin 2", "Goblin 3"]);
    const goblin2 = s.combatants.find((c) => c.name === "Goblin 2")!;
    expect(goblin2).toMatchObject({ id: "goblin-2", side: "enemy", maxHp: 7, hp: 7, initiative: null, defeated: false });
    const thalia = s.combatants.find((c) => c.name === "Thalia")!;
    expect(thalia).toMatchObject({ id: "pc-1", side: "pc", maxHp: 12, hp: 12 });
  });

  it("names a single enemy without a number suffix", () => {
    const s = applyCombatEvent(null, { event: "start", enemies: [{ name: "Hobgoblin", count: 1, hp: 11 }] }, pcs);
    expect(s!.combatants.some((c) => c.name === "Hobgoblin")).toBe(true);
    expect(s!.combatants.some((c) => c.name === "Hobgoblin 1")).toBe(false);
  });

  it("ignores a start while combat is already active", () => {
    const s = started();
    const again = applyCombatEvent(s, { event: "start", enemies: [{ name: "Ork", count: 1, hp: 9 }] }, pcs);
    expect(again).toBe(s);
  });
});

describe("applyCombatEvent — hp events", () => {
  it("damage reduces hp and floors at 0, setting defeated", () => {
    const s = started();
    const hurt = applyCombatEvent(s, { event: "damage", target: "Goblin 1", amount: 100 }, pcs)!;
    const g1 = hurt.combatants.find((c) => c.name === "Goblin 1")!;
    expect(g1.hp).toBe(0);
    expect(g1.defeated).toBe(true);
  });

  it("heal restores hp but never above maxHp", () => {
    const s = started();
    const hurt = applyCombatEvent(s, { event: "damage", target: "Thalia", amount: 5 }, pcs)!; // 12 -> 7
    const healed = applyCombatEvent(hurt, { event: "heal", target: "Thalia", amount: 100 }, pcs)!;
    expect(healed.combatants.find((c) => c.name === "Thalia")!.hp).toBe(12);
  });

  it("defeat marks a combatant defeated regardless of hp", () => {
    const s = started();
    const gone = applyCombatEvent(s, { event: "defeat", target: "Goblin 2" }, pcs)!;
    expect(gone.combatants.find((c) => c.name === "Goblin 2")!.defeated).toBe(true);
  });

  it("ignores an event targeting an unknown combatant", () => {
    const s = started();
    const same = applyCombatEvent(s, { event: "damage", target: "Drache", amount: 5 }, pcs)!;
    expect(same.combatants).toEqual(s.combatants);
  });

  it("end clears combat state to null", () => {
    const s = started();
    expect(applyCombatEvent(s, { event: "end" }, pcs)).toBeNull();
  });

  it("hp events on null state are a no-op returning null", () => {
    expect(applyCombatEvent(null, { event: "damage", target: "x", amount: 1 }, pcs)).toBeNull();
  });
});
