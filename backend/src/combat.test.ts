import { describe, it, expect } from "vitest";
import { applyCombatEvent, submitInitiative, advanceTurn, currentCombatant } from "./combat.js";
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

function rolled(): CombatState {
  const s = applyCombatEvent(null, { event: "start", enemies: [{ name: "Goblin", count: 2, hp: 7 }] }, pcs)!;
  // Thalia(pc-1) Bragok(pc-2) Goblin 1(goblin-1) Goblin 2(goblin-2)
  return submitInitiative(s, [
    { id: "pc-1", value: 18 },
    { id: "pc-2", value: 9 },
    { id: "goblin-1", value: 12 },
    { id: "goblin-2", value: 15 },
  ]);
}

describe("submitInitiative", () => {
  it("assigns values, sorts descending, and enters the turns phase", () => {
    const s = rolled();
    expect(s.phase).toBe("in-turns");
    expect(s.turnIndex).toBe(0);
    expect(s.combatants.map((c) => c.name)).toEqual(["Thalia", "Goblin 2", "Goblin 1", "Bragok"]);
    expect(currentCombatant(s)!.name).toBe("Thalia");
  });
});

describe("advanceTurn", () => {
  it("moves to the next combatant and wraps around", () => {
    let s = rolled(); // order: Thalia, Goblin 2, Goblin 1, Bragok
    s = advanceTurn(s);
    expect(currentCombatant(s)!.name).toBe("Goblin 2");
    s = advanceTurn(advanceTurn(s)); // -> Goblin 1 -> Bragok
    expect(currentCombatant(s)!.name).toBe("Bragok");
    s = advanceTurn(s); // wraps
    expect(currentCombatant(s)!.name).toBe("Thalia");
  });

  it("skips defeated combatants", () => {
    let s = rolled(); // Thalia, Goblin 2, Goblin 1, Bragok
    s = applyCombatEvent(s, { event: "defeat", target: "Goblin 2" }, pcs)!;
    s = advanceTurn(s); // from Thalia, skip Goblin 2 -> Goblin 1
    expect(currentCombatant(s)!.name).toBe("Goblin 1");
  });
});

describe("currentCombatant", () => {
  it("returns null while still rolling initiative", () => {
    const s = applyCombatEvent(null, { event: "start", enemies: [{ name: "Ork", count: 1, hp: 9 }] }, pcs)!;
    expect(currentCombatant(s)).toBeNull();
  });
});

describe("turnPhase", () => {
  it("start seeds turnPhase ready", () => {
    const s = applyCombatEvent(null, { event: "start", enemies: [{ name: "Goblin", count: 1, hp: 7 }] }, pcs)!;
    expect(s.turnPhase).toBe("ready");
  });
  it("submitInitiative sets turnPhase ready", () => {
    const s = applyCombatEvent(null, { event: "start", enemies: [{ name: "Goblin", count: 1, hp: 7 }] }, pcs)!;
    const r = submitInitiative(s, s.combatants.map((c) => ({ id: c.id, value: 10 })));
    expect(r.turnPhase).toBe("ready");
  });
  it("advanceTurn resets turnPhase to ready", () => {
    let s = applyCombatEvent(null, { event: "start", enemies: [{ name: "Goblin", count: 1, hp: 7 }] }, pcs)!;
    s = submitInitiative(s, s.combatants.map((c) => ({ id: c.id, value: 10 })));
    s = { ...s, turnPhase: "acted" };
    expect(advanceTurn(s).turnPhase).toBe("ready");
  });
});
