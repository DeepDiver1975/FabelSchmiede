import Anthropic from "@anthropic-ai/sdk";
import type { ClaudeCaller } from "./gmEngine.js";
import { extractText } from "./bedrockCaller.js";

export function createAnthropicCaller(apiKey: string): ClaudeCaller {
  const client = new Anthropic({ apiKey });
  return async ({ system, messages }) => {
    const response = await client.messages.create({
      // Bare model ID — unlike Bedrock, the direct Anthropic API takes no
      // cross-region-inference-profile prefix.
      model: "claude-opus-4-8",
      max_tokens: 4000,
      system,
      messages,
    });
    return extractText(response as { content: { type: string; text?: string }[] });
  };
}
