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

// Assign entered initiative values (by combatant id), sort highest-first, and
// begin the turn sequence at the top of the order.
export function submitInitiative(
  state: CombatState,
  values: { id: string; value: number }[],
): CombatState {
  const byId = new Map(values.map((v) => [v.id, v.value]));
  const combatants = state.combatants
    .map((c) => (byId.has(c.id) ? { ...c, initiative: byId.get(c.id)! } : c))
    .slice()
    .sort((a, b) => (b.initiative ?? 0) - (a.initiative ?? 0));
  return { ...state, combatants, phase: "in-turns", turnIndex: 0 };
}

// Advance to the next non-defeated combatant, wrapping around the order. If
// every combatant is defeated, the index simply wraps (combat should end via an
// "end" event in that case).
export function advanceTurn(state: CombatState): CombatState {
  const n = state.combatants.length;
  if (n === 0) return state;
  for (let step = 1; step <= n; step++) {
    const idx = (state.turnIndex + step) % n;
    if (!state.combatants[idx].defeated) return { ...state, turnIndex: idx };
  }
  return { ...state, turnIndex: (state.turnIndex + 1) % n };
}

// Whose turn is it? Null until initiative has been rolled (turns phase).
export function currentCombatant(state: CombatState): Combatant | null {
  if (state.phase !== "in-turns") return null;
  return state.combatants[state.turnIndex] ?? null;
}
