import { describe, it, expect } from "vitest";
import { parseGmReply } from "./parseReply.js";

describe("parseGmReply", () => {
  it("parses a valid reply with no dice request", () => {
    const r = parseGmReply('{"narration":"Ihr geht hinein.","diceRequest":null}');
    expect(r.narration).toBe("Ihr geht hinein.");
    expect(r.diceRequest).toBeNull();
  });

  it("parses a valid reply with a dice request", () => {
    const r = parseGmReply(
      '{"narration":"Der Goblin greift an!","diceRequest":{"reason":"Ausweichen","hint":"W20 + GE"}}',
    );
    expect(r.diceRequest).toEqual({ reason: "Ausweichen", hint: "W20 + GE" });
  });

  it("throws on non-JSON", () => {
    expect(() => parseGmReply("nope")).toThrow();
  });

  it("throws when narration is missing", () => {
    expect(() => parseGmReply('{"diceRequest":null}')).toThrow();
  });

  it("throws when diceRequest object is malformed", () => {
    expect(() => parseGmReply('{"narration":"x","diceRequest":{"reason":"y"}}')).toThrow();
  });
});
