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

  it("parses JSON wrapped in a markdown ```json fence", () => {
    const raw = '```json\n{"narration":"Ihr geht hinein.","diceRequest":null}\n```';
    const r = parseGmReply(raw);
    expect(r.narration).toBe("Ihr geht hinein.");
    expect(r.diceRequest).toBeNull();
  });

  it("parses JSON with a sentence of prose before and after it", () => {
    const raw =
      'Gerne! Hier ist die Antwort:\n{"narration":"Der Goblin faucht.","diceRequest":{"reason":"Angriff","hint":"W20 + STR"}}\nViel Erfolg!';
    const r = parseGmReply(raw);
    expect(r.narration).toBe("Der Goblin faucht.");
    expect(r.diceRequest).toEqual({ reason: "Angriff", hint: "W20 + STR" });
  });

  it("still throws when there is no JSON object at all", () => {
    expect(() => parseGmReply("Ich kann das leider nicht.")).toThrow();
  });
});
