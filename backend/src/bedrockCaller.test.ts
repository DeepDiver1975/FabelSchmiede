import { describe, it, expect } from "vitest";
import { extractText } from "./bedrockCaller.js";

describe("extractText", () => {
  it("returns the first text block's text", () => {
    const msg = { content: [{ type: "text", text: '{"narration":"hi","diceRequest":null}' }] };
    expect(extractText(msg)).toBe('{"narration":"hi","diceRequest":null}');
  });

  it("skips non-text blocks", () => {
    const msg = {
      content: [
        { type: "thinking", thinking: "" },
        { type: "text", text: "actual" },
      ],
    };
    expect(extractText(msg)).toBe("actual");
  });

  it("throws when there is no text block", () => {
    expect(() => extractText({ content: [] })).toThrow();
  });
});
