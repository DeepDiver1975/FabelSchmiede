import { describe, it, expect, vi } from "vitest";

const create = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create };
  },
}));

const { createAnthropicCaller } = await import("./anthropicCaller.js");

describe("createAnthropicCaller", () => {
  it("calls messages.create with the bare model id and extracts text", async () => {
    create.mockResolvedValueOnce({
      content: [{ type: "text", text: '{"narration":"hi","diceRequest":null}' }],
    });

    const call = createAnthropicCaller("sk-test");
    const result = await call({
      system: "system prompt",
      messages: [{ role: "user", content: "hello" }],
    });

    expect(result).toBe('{"narration":"hi","diceRequest":null}');
    expect(create).toHaveBeenCalledWith({
      model: "claude-opus-4-8",
      max_tokens: 4000,
      system: "system prompt",
      messages: [{ role: "user", content: "hello" }],
    });
  });

  it("throws when the response has no text block", async () => {
    create.mockResolvedValueOnce({ content: [] });

    const call = createAnthropicCaller("sk-test");
    await expect(
      call({ system: "s", messages: [{ role: "user", content: "hi" }] }),
    ).rejects.toThrow();
  });
});
