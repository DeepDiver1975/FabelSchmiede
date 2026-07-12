import type { StoredTurn, Turn } from "./types.js";

// A per-campaign in-memory read model, hydrated from stored turns. Used to build
// the history handed to the GM engine; the store remains the source of truth.
export class Session {
  private history: Turn[];

  constructor(turns: StoredTurn[]) {
    this.history = turns.map((t) => ({ role: t.role, text: t.text }));
  }

  getHistory(): Turn[] {
    return this.history;
  }

  addPlayerTurn(text: string): void {
    this.history.push({ role: "player", text });
  }

  addGmTurn(text: string): void {
    this.history.push({ role: "gm", text });
  }
}
