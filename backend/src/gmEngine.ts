import { buildSystemPrompt, buildOpeningSystemPrompt, historyToMessages } from "./prompt.js";
import { buildStorySystemPrompt, renderTranscript } from "./storyPrompt.js";
import { parseGmReply } from "./parseReply.js";
import { GM_REPLY_SCHEMA } from "./types.js";
import type { GmReply, StoredTurn, Turn } from "./types.js";

export type ClaudeCaller = (args: {
  system: string;
  messages: { role: "user" | "assistant"; content: string }[];
  schema?: object;
}) => Promise<string>;

async function callWithRetry(
  system: string,
  messages: { role: "user" | "assistant"; content: string }[],
  call: ClaudeCaller,
): Promise<GmReply> {
  const args = { system, messages, schema: GM_REPLY_SCHEMA };
  try {
    return parseGmReply(await call(args));
  } catch {
    // Retry exactly once — JSON steering can occasionally slip.
    return parseGmReply(await call(args));
  }
}

export async function generateGmReply(
  history: Turn[],
  premise: string,
  call: ClaudeCaller,
): Promise<GmReply> {
  return callWithRetry(buildSystemPrompt(premise), historyToMessages(history), call);
}

export async function generateOpening(premise: string, call: ClaudeCaller): Promise<GmReply> {
  return callWithRetry(
    buildOpeningSystemPrompt(premise),
    [{ role: "user", content: "Beginne das Abenteuer." }],
    call,
  );
}

export async function generateStory(
  turns: StoredTurn[],
  campaign: { name: string; premise: string },
  call: ClaudeCaller,
): Promise<string> {
  const markdown = await call({
    system: buildStorySystemPrompt(campaign),
    messages: [{ role: "user", content: renderTranscript(turns) }],
  });
  if (!markdown.trim()) {
    throw new Error("Story generation returned an empty response");
  }
  return markdown;
}
