import { buildSystemPrompt, historyToMessages } from "./prompt.js";
import { buildStorySystemPrompt, renderTranscript } from "./storyPrompt.js";
import { parseGmReply } from "./parseReply.js";
import { GM_REPLY_SCHEMA } from "./types.js";
import type { GmReply, StoredTurn, Turn } from "./types.js";

export type ClaudeCaller = (args: {
  system: string;
  messages: { role: "user" | "assistant"; content: string }[];
  schema?: object;
}) => Promise<string>;

export async function generateGmReply(
  history: Turn[],
  call: ClaudeCaller,
): Promise<GmReply> {
  const args = {
    system: buildSystemPrompt(),
    messages: historyToMessages(history),
    schema: GM_REPLY_SCHEMA,
  };
  try {
    return parseGmReply(await call(args));
  } catch {
    // Retry exactly once — structured output can occasionally slip.
    return parseGmReply(await call(args));
  }
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
