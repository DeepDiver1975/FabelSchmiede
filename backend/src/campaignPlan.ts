import type { CampaignPlan, CampaignBrief } from "./types.js";

// The ONLY public projection of a plan. Everything not copied here stays
// server-side: backstory, npcs (incl. secret), location secrets, and the arc.
export function toBrief(plan: CampaignPlan): CampaignBrief {
  return {
    title: plan.title,
    brief: plan.brief,
    locations: plan.locations.map((l) => ({ name: l.name, description: l.description })),
  };
}
