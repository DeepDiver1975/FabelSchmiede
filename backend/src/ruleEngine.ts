import type { Ability, Character, ResourcePool } from "./types.js";

// Deterministic rule engine. This — NOT the LLM — is the authority on hard
// mechanical constraints (does the character know the ability? is their level
// high enough? is a resource slot available?). The model narrates outcomes and
// adjudicates fuzzy/narrative calls, but it never decides legality: a guardrail
// model is itself promptable and cannot be trusted to enforce rules. Keeping
// the gate in plain code also sidesteps the fact that Bedrock structured
// outputs cannot express numeric bounds (level ≥ n, slot counts) at all.

export type Verdict =
  | { ok: true; ability: Ability; pool: ResourcePool | null }
  | { ok: false; reason: string };

// A resource pool has capacity left when fewer uses are spent than available.
function hasCapacity(pool: ResourcePool): boolean {
  return pool.used < pool.available;
}

// Can this character perform the ability with the given id right now?
//
// Checks, in order: the ability is known, the character's level meets the
// ability's minimum, and — for abilities that cost a slot — a matching pool has
// capacity. `poolId` selects which resource pool pays for the ability; when
// omitted, the first pool with capacity is used. An ability whose slotCost is 0
// (an at-will/cantrip analog) never touches a pool.
export function canPerform(character: Character, abilityId: string, poolId?: string): Verdict {
  const ability = character.abilities?.find((a) => a.id === abilityId);
  if (!ability) {
    return { ok: false, reason: `${character.name} kennt die Fähigkeit "${abilityId}" nicht.` };
  }

  const level = character.level ?? 1;
  if (level < ability.minLevel) {
    return {
      ok: false,
      reason: `${ability.name} erfordert Stufe ${ability.minLevel}, ${character.name} ist Stufe ${level}.`,
    };
  }

  if (ability.slotCost <= 0) {
    return { ok: true, ability, pool: null };
  }

  const pools = character.resources ?? [];
  const pool = poolId
    ? pools.find((p) => p.id === poolId)
    : pools.find((p) => hasCapacity(p));
  if (!pool) {
    return {
      ok: false,
      reason: poolId
        ? `${character.name} hat keine Ressource "${poolId}".`
        : `${character.name} hat keine freie Ressource für ${ability.name}.`,
    };
  }
  if (!hasCapacity(pool)) {
    return { ok: false, reason: `${pool.name} ist erschöpft (${pool.used}/${pool.available}).` };
  }

  return { ok: true, ability, pool };
}

// Apply the cost of a validated action, returning a new Character with the
// chosen pool's `used` incremented. Pure — the caller persists the result. Only
// call after canPerform returns ok; passing an already-exhausted pool throws,
// since spending a slot that does not exist is a programming error, not a game
// event.
export function applyCost(character: Character, verdict: Extract<Verdict, { ok: true }>): Character {
  if (verdict.pool === null) {
    return character;
  }
  const pool = verdict.pool;
  if (!hasCapacity(pool)) {
    throw new Error(`Cannot spend from an exhausted pool: ${pool.id}`);
  }
  return {
    ...character,
    resources: (character.resources ?? []).map((p) =>
      p.id === pool.id ? { ...p, used: p.used + 1 } : p,
    ),
  };
}

// Reset all resource pools to full (a "long rest"). Returns a new Character.
export function restoreResources(character: Character): Character {
  return {
    ...character,
    resources: (character.resources ?? []).map((p) => ({ ...p, used: 0 })),
  };
}
