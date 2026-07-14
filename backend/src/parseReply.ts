import type { GmReply, DiceRequest } from "./types.js";

function isDiceRequest(v: unknown): v is DiceRequest {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.reason === "string" && typeof o.hint === "string";
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
  if (o.diceRequest === null || o.diceRequest === undefined) {
    return { narration: o.narration, diceRequest: null };
  }
  if (!isDiceRequest(o.diceRequest)) {
    throw new Error("GM reply had a malformed 'diceRequest'");
  }
  return { narration: o.narration, diceRequest: o.diceRequest };
}
