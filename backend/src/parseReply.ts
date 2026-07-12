import type { GmReply, DiceRequest } from "./types.js";

function isDiceRequest(v: unknown): v is DiceRequest {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.reason === "string" && typeof o.hint === "string";
}

export function parseGmReply(raw: string): GmReply {
  let data: unknown;
  try {
    data = JSON.parse(raw);
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
