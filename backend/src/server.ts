import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { Session } from "./session.js";
import { generateGmReply, type ClaudeCaller } from "./gmEngine.js";
import { createBedrockCaller } from "./bedrockCaller.js";
import type { DiceRequest } from "./types.js";

export function buildServer(call: ClaudeCaller): FastifyInstance {
  const app = Fastify();
  app.register(cors, { origin: ["http://localhost:5173", "http://127.0.0.1:5173"] });

  const session = new Session();
  let pendingDice: DiceRequest | null = null;

  function state() {
    return { history: session.getHistory(), pendingDice };
  }

  async function advance(reply: Awaited<ReturnType<typeof generateGmReply>>) {
    session.addGmTurn(reply.narration);
    pendingDice = reply.diceRequest;
  }

  app.get("/api/state", async () => state());

  app.post<{ Body: { text: string } }>("/api/action", async (req, reply) => {
    session.addPlayerTurn(req.body.text);
    try {
      await advance(await generateGmReply(session.getHistory(), call));
    } catch {
      return reply.code(500).send({ error: "Der Spielleiter hat sich verhaspelt — bitte nochmal." });
    }
    return state();
  });

  app.post<{ Body: { result: string } }>("/api/roll", async (req, reply) => {
    session.addPlayerTurn(`[Würfelergebnis: ${req.body.result}]`);
    pendingDice = null;
    try {
      await advance(await generateGmReply(session.getHistory(), call));
    } catch {
      return reply.code(500).send({ error: "Der Spielleiter hat sich verhaspelt — bitte nochmal." });
    }
    return state();
  });

  app.post("/api/reset", async () => {
    session.reset();
    pendingDice = null;
    return state();
  });

  return app;
}

async function main() {
  const { config } = await import("dotenv");
  config();
  const region = process.env.AWS_REGION;
  if (!region) throw new Error("AWS_REGION is not set — copy .env.example to .env");
  const port = Number(process.env.BACKEND_PORT ?? 8787);
  const app = buildServer(createBedrockCaller(region));
  await app.listen({ port, host: "127.0.0.1" });
  console.log(`GM backend listening on http://127.0.0.1:${port}`);
}

// Only start the server when run directly, not when imported by tests.
if (process.argv[1] && process.argv[1].endsWith("server.ts")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
