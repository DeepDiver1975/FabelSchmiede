import { extractJsonObject } from "./parseReply.js";
import type { CampaignPlan, PlanNpc, PlanLocation, PlanArc } from "./types.js";

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

// The arc fields (outline/hooks/branchPoints) are LOOSE narrative text fed to
// the GM as prose — not mechanics. Non-schema NIM models (observed with
// nemotron ~1 in 3) return them in richer shapes: outline as a string ARRAY,
// branchPoints as OBJECTS like {prompt, options}. Coerce those to text rather
// than 500 the whole campaign. See renderPlan for how they're consumed.
function toText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map(toText).filter((s) => s.trim()).join(" ");
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    // A wrapped string, e.g. {prompt: "…"} / {hook: "…"} — prefer the obvious key.
    for (const k of ["prompt", "text", "question", "hook", "description", "title", "name", "outline"]) {
      if (typeof o[k] === "string" && o[k]) return o[k] as string;
    }
    return Object.values(o).map(toText).filter((s) => s.trim()).join(" — ");
  }
  return "";
}

// Coerce a "list of narrative strings" that the model may have returned as a
// single string, or as an array of wrapper objects, into string[].
function toStringList(v: unknown): string[] {
  if (isStringArray(v)) return v;
  if (Array.isArray(v)) return v.map(toText).map((s) => s.trim()).filter(Boolean);
  const s = toText(v).trim();
  return s ? [s] : [];
}

function toNpc(v: unknown): PlanNpc {
  const o = v as Record<string, unknown>;
  if (
    typeof o?.name !== "string" ||
    typeof o?.role !== "string" ||
    typeof o?.description !== "string" ||
    typeof o?.secret !== "string"
  ) {
    throw new Error("plan npc was malformed");
  }
  return { name: o.name, role: o.role, description: o.description, secret: o.secret };
}

function toLocation(v: unknown): PlanLocation {
  const o = v as Record<string, unknown>;
  if (
    typeof o?.name !== "string" ||
    typeof o?.description !== "string" ||
    typeof o?.secret !== "string"
  ) {
    throw new Error("plan location was malformed");
  }
  return { name: o.name, description: o.description, secret: o.secret };
}

function toArc(v: unknown): PlanArc {
  const o = (v ?? {}) as Record<string, unknown>;
  const outline = toText(o.outline).trim();
  // outline is the arc's spine; an empty one means the model gave us nothing
  // usable, so still fail (and let generatePlan's retry-once try again).
  if (!outline) {
    throw new Error("plan arc was malformed");
  }
  return { outline, hooks: toStringList(o.hooks), branchPoints: toStringList(o.branchPoints) };
}

export function parsePlan(raw: string): CampaignPlan {
  let data: unknown;
  try {
    data = extractJsonObject(raw);
  } catch {
    throw new Error("plan was not valid JSON");
  }
  if (typeof data !== "object" || data === null) throw new Error("plan was not an object");
  const o = data as Record<string, unknown>;
  if (typeof o.title !== "string" || typeof o.brief !== "string" || typeof o.backstory !== "string") {
    throw new Error("plan missing title/brief/backstory string");
  }
  if (!Array.isArray(o.npcs) || !Array.isArray(o.locations)) {
    throw new Error("plan missing npcs/locations arrays");
  }
  return {
    title: o.title,
    brief: o.brief,
    backstory: o.backstory,
    npcs: o.npcs.map(toNpc),
    locations: o.locations.map(toLocation),
    arc: toArc(o.arc),
  };
}
