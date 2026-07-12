import { AnthropicBedrock } from "@anthropic-ai/bedrock-sdk";
import type { ClaudeCaller } from "./gmEngine.js";

type TextBlock = { type: string; text?: string };

export function extractText(msg: { content: TextBlock[] }): string {
  const block = msg.content.find((b) => b.type === "text" && typeof b.text === "string");
  if (!block || typeof block.text !== "string") {
    throw new Error("Bedrock response had no text block");
  }
  return block.text;
}

export function createBedrockCaller(region: string): ClaudeCaller {
  const client = new AnthropicBedrock({ awsRegion: region });
  return async ({ system, messages }) => {
    const response = await client.messages.create({
      // Bedrock requires a cross-region inference-profile ID (the `us.` prefix),
      // not the bare model ID — on-demand throughput is not offered on the bare ID.
      model: "us.anthropic.claude-opus-4-8",
      // Headroom for a florid German narration plus a diceRequest — at 2000 a
      // long turn could truncate mid-JSON and fail to parse.
      max_tokens: 4000,
      // This Bedrock endpoint rejects `output_config` ("Extra inputs are not
      // permitted"), so we steer JSON via the system prompt instead and rely on
      // parseGmReply's retry-once contract to catch the rare non-JSON reply.
      system,
      messages,
    });
    return extractText(response as { content: TextBlock[] });
  };
}
