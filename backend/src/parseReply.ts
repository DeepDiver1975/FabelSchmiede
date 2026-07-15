import type { GmReply, DiceRequest, CombatEvent } from "./types.js";

function isDiceRequest(v: unknown): v is DiceRequest {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.reason === "string" && typeof o.hint === "string";
}

// The wire form is a flat object (event enum + nullable target/amount/enemies).
// Reconstruct the discriminated CombatEvent, validating the fields each event
// actually needs. Returns null for an absent block; throws on a malformed one so
// the caller's retry-once contract kicks in.
function parseCombatEvent(v: unknown): CombatEvent | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== "object") throw new Error("GM reply had a malformed 'combat' block");
  const o = v as Record<string, unknown>;
  switch (o.event) {
    case "start": {
      if (!Array.isArray(o.enemies)) throw new Error("combat 'start' requires enemies[]");
      const enemies = o.enemies.map((e) => {
        const g = e as Record<string, unknown>;
        if (typeof g.name !== "string" || typeof g.count !== "number" || typeof g.hp !== "number") {
          throw new Error("combat 'start' has a malformed enemy");
        }
        return { name: g.name, count: g.count, hp: g.hp };
      });
      return { event: "start", enemies };
    }
    case "damage":
    case "heal": {
      if (typeof o.target !== "string" || typeof o.amount !== "number") {
        throw new Error(`combat '${o.event}' requires target and amount`);
      }
      return { event: o.event, target: o.target, amount: o.amount };
    }
    case "defeat": {
      if (typeof o.target !== "string") throw new Error("combat 'defeat' requires target");
      return { event: "defeat", target: o.target };
    }
    case "end":
      return { event: "end" };
    default:
      throw new Error("GM reply had an unknown combat 'event'");
  }
}

// The model is asked for pure JSON, but without a hard structured-output
// constraint it occasionally wraps the object in a markdown ```json fence or
// adds a sentence of prose before/after it. Rather than reject those outright
// (which strands the player on "der Spielleiter hat sich verhaspelt"), extract
// the first {...} object from the text and parse that. Genuinely unparseable
// output still throws, preserving the retry-once contract.
export function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim();
  // Fast path: already clean JSON.
  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through to extraction
  }
  // Slow path: grab the substring from the first "{" to the last "}".
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("GM reply contained no JSON object");
  }
  return JSON.parse(trimmed.slice(start, end + 1));
}

export function parseGmReply(raw: string): GmReply {
  let data: unknown;
  try {
    data = extractJsonObject(raw);
  } catch {
    throw new Error("GM reply was not valid JSON");
  }
  if (typeof data !== "object" || data === null) {
    throw new Error("GM reply was not an object");
  }
  const o = data as Record<string, unknown>;
  if (typeof o.narration !== "string") {
    throw new Error("GM reply missing 'narration' string");
  }
  const combat = parseCombatEvent(o.combat);
  if (o.diceRequest === null || o.diceRequest === undefined) {
    return { narration: o.narration, diceRequest: null, combat };
  }
  if (!isDiceRequest(o.diceRequest)) {
    throw new Error("GM reply had a malformed 'diceRequest'");
  }
  return { narration: o.narration, diceRequest: o.diceRequest, combat };
}
