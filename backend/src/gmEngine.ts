import {
  buildSystemPrompt,
  buildOpeningSystemPrompt,
  buildAsideSystemPrompt,
  historyToMessages,
} from "./prompt.js";
import { buildStorySystemPrompt, renderTranscript } from "./storyPrompt.js";
import { buildCampaignPlanSystemPrompt } from "./campaignPlanPrompt.js";
import { parseGmReply } from "./parseReply.js";
import { parsePlan } from "./parsePlan.js";
import { GM_REPLY_SCHEMA, CAMPAIGN_PLAN_SCHEMA } from "./types.js";
import type { Character, CampaignPlan, CombatState, GmReply, StoredTurn, Turn } from "./types.js";

export type LlmCaller = (args: {
  system: string;
  messages: { role: "user" | "assistant"; content: string }[];
  schema?: object;
}) => Promise<string>;

async function callWithRetry(
  system: string,
  messages: { role: "user" | "assistant"; content: string }[],
  call: LlmCaller,
): Promise<GmReply> {
  const args = { system, messages, schema: GM_REPLY_SCHEMA };
  try {
    return parseGmReply(await call(args));
  } catch {
    // Retry exactly once — JSON steering can occasionally slip.
    return parseGmReply(await call(args));
  }
}

export async function generatePlan(
  name: string,
  premise: string,
  call: LlmCaller,
): Promise<CampaignPlan> {
  const args = {
    system: buildCampaignPlanSystemPrompt(name, premise),
    messages: [{ role: "user" as const, content: "Erschaffe die Kampagne." }],
    schema: CAMPAIGN_PLAN_SCHEMA,
  };
  try {
    return parsePlan(await call(args));
  } catch {
    return parsePlan(await call(args));
  }
}

export async function generateGmReply(
  history: Turn[],
  premise: string,
  call: LlmCaller,
  characters: Character[] = [],
  plan?: CampaignPlan,
  combat?: CombatState,
): Promise<GmReply> {
  // The opening narration (first gm turn) is dropped from the message list by
  // historyToMessages, so fold its canonical facts into the system prompt.
  const opening = history[0]?.role === "gm" ? history[0].text : undefined;
  return callWithRetry(
    buildSystemPrompt(premise, opening, characters, plan, combat),
    historyToMessages(history),
    call,
  );
}

// The opening narration is dropped from the message list by historyToMessages,
// same as generateGmReply — fold it into the system prompt so its facts are
// available when answering an aside too.
export async function generateAsideReply(
  history: Turn[],
  premise: string,
  call: LlmCaller,
  characters: Character[] = [],
  plan?: CampaignPlan,
): Promise<GmReply> {
  const opening = history[0]?.role === "gm" ? history[0].text : undefined;
  return callWithRetry(
    buildAsideSystemPrompt(premise, opening, characters, plan),
    historyToMessages(history),
    call,
  );
}

export async function generateOpening(
  premise: string,
  call: LlmCaller,
  characters: Character[] = [],
  plan?: CampaignPlan,
): Promise<GmReply> {
  return callWithRetry(
    buildOpeningSystemPrompt(premise, characters, plan),
    [{ role: "user", content: "Beginne das Abenteuer." }],
    call,
  );
}

export async function generateStory(
  turns: StoredTurn[],
  campaign: { name: string; premise: string },
  call: LlmCaller,
  characters: Character[] = [],
  plan?: CampaignPlan,
): Promise<string> {
  const markdown = await call({
    system: buildStorySystemPrompt(campaign, characters, plan),
    messages: [{ role: "user", content: renderTranscript(turns) }],
  });
  if (!markdown.trim()) {
    throw new Error("Story generation returned an empty response");
  }
  return markdown;
}
