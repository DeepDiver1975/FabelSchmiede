import type { Combatant, CombatEvent, CombatState, PcSeed } from "./types.js";

// Deterministic combat state. Like ruleEngine.ts, this — NOT the LLM — is the
// authority on mechanical state: HP totals, who is defeated, initiative order,
// whose turn it is. The model narrates and emits events; code keeps the ledger.

function slug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

// Expand one enemy group into individually addressable combatants. A group of 1
// keeps its bare name ("Hobgoblin"); a group of N is numbered ("Goblin 1"..N)
// so later events can target exactly one.
function expandEnemies(enemies: { name: string; count: number; hp: number }[]): Combatant[] {
  const out: Combatant[] = [];
  for (const e of enemies) {
    const count = Math.max(1, e.count);
    for (let i = 1; i <= count; i++) {
      const numbered = count > 1;
      const name = numbered ? `${e.name} ${i}` : e.name;
      const id = numbered ? `${slug(e.name)}-${i}` : slug(e.name);
      out.push({ id, name, side: "enemy", maxHp: e.hp, hp: e.hp, initiative: null, defeated: false });
    }
  }
  return out;
}

function pcCombatant(pc: PcSeed): Combatant {
  return { id: pc.id, name: pc.name, side: "pc", maxHp: pc.maxHp, hp: pc.maxHp, initiative: null, defeated: false };
}

// Apply one combat event to the current state, returning a new state (or null
// when combat ends / no combat exists). Pure — the caller persists the result.
export function applyCombatEvent(
  state: CombatState | null,
  event: CombatEvent,
  pcs: PcSeed[],
): CombatState | null {
  if (event.event === "start") {
    if (state?.active) return state; // one combat at a time — ignore a second start
    return {
      active: true,
      phase: "rolling-initiative",
      combatants: [...pcs.map(pcCombatant), ...expandEnemies(event.enemies)],
      turnIndex: 0,
    };
  }
  if (event.event === "end") return null;
  if (!state) return null;

  const combatants = state.combatants.map((c) => {
    if (c.name !== event.target) return c;
    if (event.event === "damage") {
      const hp = Math.max(0, c.hp - event.amount);
      return { ...c, hp, defeated: c.defeated || hp === 0 };
    }
    if (event.event === "heal") {
      return { ...c, hp: Math.min(c.maxHp, c.hp + event.amount) };
    }
    // defeat
    return { ...c, defeated: true };
  });
  return { ...state, combatants };
}
