import { describe, it, expect } from "vitest";
import { GM_REPLY_SCHEMA } from "./types.js";

describe("GM_REPLY_SCHEMA", () => {
  it("requires narration, diceRequest, and combat, forbids extra props", () => {
    expect(GM_REPLY_SCHEMA.type).toBe("object");
    expect(GM_REPLY_SCHEMA.additionalProperties).toBe(false);
    expect(GM_REPLY_SCHEMA.required).toEqual(["narration", "diceRequest", "combat"]);
    expect(Object.keys(GM_REPLY_SCHEMA.properties)).toEqual(
      expect.arrayContaining(["narration", "diceRequest", "combat"]),
    );
  });

  it("allows diceRequest to be an object or null", () => {
    // diceRequest is anyOf: [ {object}, {null} ]
    const dr = GM_REPLY_SCHEMA.properties.diceRequest;
    expect(dr.anyOf).toHaveLength(2);
    const types = dr.anyOf.map((s: { type: string }) => s.type);
    expect(types).toContain("object");
    expect(types).toContain("null");
  });
});
