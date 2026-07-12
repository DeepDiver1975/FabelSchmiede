export type DiceRequest = { reason: string; hint: string };
export type Turn = { role: "gm" | "player"; text: string };
export type State = { history: Turn[]; pendingDice: DiceRequest | null };

async function post(url: string, body?: unknown): Promise<State> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "Unbekannter Fehler");
  }
  return res.json();
}

export const api = {
  getState: async (): Promise<State> => (await fetch("/api/state")).json(),
  action: (text: string) => post("/api/action", { text }),
  roll: (result: string) => post("/api/roll", { result }),
  reset: () => post("/api/reset"),
};
