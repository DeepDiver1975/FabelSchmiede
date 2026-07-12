import { describe, it, expect } from "vitest";
import { buildServer } from "./server.js";
import type { ClaudeCaller } from "./gmEngine.js";

// A fake caller: no dice unless the player says "angriff", then one dice request,
// then resolves.
const fakeCall: ClaudeCaller = async ({ messages }) => {
  const last = messages[messages.length - 1];
  if (last?.role === "user" && last.content.toLowerCase().includes("angriff")) {
    return '{"narration":"Der Goblin faucht. Wirf zum Angriff!","diceRequest":{"reason":"Angriff","hint":"W20 + STR"}}';
  }
  return '{"narration":"Es geschieht etwas.","diceRequest":null}';
};

describe("server", () => {
  it("GET /api/state returns the opening history and no pending dice", async () => {
    const app = buildServer(fakeCall);
    const res = await app.inject({ method: "GET", url: "/api/state" });
    const body = res.json();
    expect(body.history).toHaveLength(1);
    expect(body.history[0].role).toBe("gm");
    expect(body.pendingDice).toBeNull();
    await app.close();
  });

  it("POST /api/action appends player + gm turns", async () => {
    const app = buildServer(fakeCall);
    const res = await app.inject({
      method: "POST",
      url: "/api/action",
      payload: { text: "Ich schaue mich um." },
    });
    const body = res.json();
    // opening gm + player + new gm = 3
    expect(body.history).toHaveLength(3);
    expect(body.pendingDice).toBeNull();
    await app.close();
  });

  it("POST /api/action can surface a pending dice request", async () => {
    const app = buildServer(fakeCall);
    const res = await app.inject({
      method: "POST",
      url: "/api/action",
      payload: { text: "Ich starte einen Angriff." },
    });
    const body = res.json();
    expect(body.pendingDice).toEqual({ reason: "Angriff", hint: "W20 + STR" });
    await app.close();
  });

  it("POST /api/roll clears the pending dice and continues", async () => {
    const app = buildServer(fakeCall);
    await app.inject({ method: "POST", url: "/api/action", payload: { text: "Angriff!" } });
    const res = await app.inject({ method: "POST", url: "/api/roll", payload: { result: "17" } });
    const body = res.json();
    expect(body.pendingDice).toBeNull();
    await app.close();
  });

  it("POST /api/reset returns to the opening", async () => {
    const app = buildServer(fakeCall);
    await app.inject({ method: "POST", url: "/api/action", payload: { text: "x" } });
    const res = await app.inject({ method: "POST", url: "/api/reset" });
    expect(res.json().history).toHaveLength(1);
    await app.close();
  });

  it("returns 500 with a German error when the caller keeps failing", async () => {
    const app = buildServer(async () => "garbage");
    const res = await app.inject({ method: "POST", url: "/api/action", payload: { text: "x" } });
    expect(res.statusCode).toBe(500);
    expect(res.json().error).toContain("Spielleiter");
    await app.close();
  });
});
