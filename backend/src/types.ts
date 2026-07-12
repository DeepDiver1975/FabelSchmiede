export type DiceRequest = { reason: string; hint: string };

export type GmReply = {
  narration: string;
  diceRequest: DiceRequest | null;
};

export type Turn = { role: "gm" | "player"; text: string };

// JSON Schema for Bedrock structured output (output_config.format).
// Note: string minLength/maxLength are NOT supported by structured outputs — omit them.
export const GM_REPLY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["narration", "diceRequest"],
  properties: {
    narration: { type: "string" },
    diceRequest: {
      anyOf: [
        {
          type: "object",
          additionalProperties: false,
          required: ["reason", "hint"],
          properties: {
            reason: { type: "string" },
            hint: { type: "string" },
          },
        },
        { type: "null" },
      ],
    },
  },
} as const;
