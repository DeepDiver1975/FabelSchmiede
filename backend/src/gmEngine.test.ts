import { describe, it, expect, vi } from "vitest";
import { generateGmReply, generateStory } from "./gmEngine.js";
import type { Turn, StoredTurn } from "./types.js";

const history: Turn[] = [{ role: "player", text: "Ich gehe hinein." }];

describe("generateGmReply", () => {
  it("returns a parsed reply on the first successful call", async () => {
    const call = vi.fn().mockResolvedValue('{"narration":"Du gehst hinein.","diceRequest":null}');
    const reply = await generateGmReply(history, call);
    expect(reply.narration).toBe("Du gehst hinein.");
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("retries once when the first reply is malformed, then succeeds", async () => {
    const call = vi
      .fn()
      .mockResolvedValueOnce("garbage")
      .mockResolvedValueOnce('{"narration":"Zweiter Versuch.","diceRequest":null}');
    const reply = await generateGmReply(history, call);
    expect(reply.narration).toBe("Zweiter Versuch.");
    expect(call).toHaveBeenCalledTimes(2);
  });

  it("throws after two malformed replies", async () => {
    const call = vi.fn().mockResolvedValue("still garbage");
    await expect(generateGmReply(history, call)).rejects.toThrow();
    expect(call).toHaveBeenCalledTimes(2);
  });

  it("passes the system prompt and schema to the caller", async () => {
    const call = vi.fn().mockResolvedValue('{"narration":"ok","diceRequest":null}');
    await generateGmReply(history, call);
    const arg = call.mock.calls[0][0];
    expect(arg.system).toContain("Spielleiter");
    expect(arg.schema).toBeDefined();
    expect(arg.messages).toEqual([{ role: "user", content: "Ich gehe hinein." }]);
  });
});

describe("generateStory", () => {
  const turns: StoredTurn[] = [
    { role: "gm", text: "Ihr steht am Eingang.", diceRequest: null },
    { role: "player", text: "Ich gehe hinein.", diceRequest: null },
  ];
  const campaign = { name: "Die Höhle", premise: "Goblins" };

  it("returns the model's markdown verbatim (no JSON parsing)", async () => {
    const call = vi.fn().mockResolvedValue("# Die Höhle\n\nEs war einmal…");
    const md = await generateStory(turns, campaign, call);
    expect(md).toBe("# Die Höhle\n\nEs war einmal…");
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("passes the story system prompt and the transcript as a user message", async () => {
    const call = vi.fn().mockResolvedValue("# x\n\ny");
    await generateStory(turns, campaign, call);
    const arg = call.mock.calls[0][0];
    expect(arg.system).toContain("Kurzgeschichte");
    expect(arg.messages).toEqual([
      { role: "user", content: "SPIELLEITER: Ihr steht am Eingang.\n\nSPIELER: Ich gehe hinein." },
    ]);
  });

  it("throws on an empty or whitespace-only response", async () => {
    await expect(generateStory(turns, campaign, vi.fn().mockResolvedValue("   "))).rejects.toThrow();
  });
});
