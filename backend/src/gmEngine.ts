import { buildSystemPrompt, historyToMessages } from "./prompt.js";
import { parseGmReply } from "./parseReply.js";
import { GM_REPLY_SCHEMA } from "./types.js";
import type { GmReply, Turn } from "./types.js";

export type ClaudeCaller = (args: {
  system: string;
  messages: { role: "user" | "assistant"; content: string }[];
  schema: object;
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
