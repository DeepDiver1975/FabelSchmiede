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
  return async ({ system, messages, schema }) => {
    const response = await client.messages.create({
      model: "anthropic.claude-opus-4-8",
      max_tokens: 2000,
      system,
      messages,
      output_config: { format: { type: "json_schema", schema } },
    });
    return extractText(response as { content: TextBlock[] });
  };
}
