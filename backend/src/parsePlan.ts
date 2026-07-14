import { extractJsonObject } from "./parseReply.js";
import type { CampaignPlan, PlanNpc, PlanLocation, PlanArc } from "./types.js";

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
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
  const o = v as Record<string, unknown>;
  if (typeof o?.outline !== "string" || !isStringArray(o?.hooks) || !isStringArray(o?.branchPoints)) {
    throw new Error("plan arc was malformed");
  }
  return { outline: o.outline, hooks: o.hooks, branchPoints: o.branchPoints };
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
