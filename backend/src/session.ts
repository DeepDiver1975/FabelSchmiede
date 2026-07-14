import type { StoredTurn, Turn, TurnKind } from "./types.js";

// A per-campaign in-memory read model, hydrated from stored turns. Used to build
// the history handed to the GM engine; the store remains the source of truth.
export class Session {
  private history: Turn[];

  constructor(turns: StoredTurn[]) {
    // Carry diceRequest and kind through: historyToMessages folds diceRequest
    // back into the JSON envelope when replaying gm turns to the model.
    this.history = turns.map((t) => ({
      role: t.role,
      text: t.text,
      diceRequest: t.diceRequest,
      kind: t.kind,
    }));
  }

  getHistory(): Turn[] {
    return this.history;
  }

  addPlayerTurn(text: string, kind: TurnKind = "story"): void {
    this.history.push({ role: "player", text, kind });
  }

  addGmTurn(text: string, kind: TurnKind = "story"): void {
    this.history.push({ role: "gm", text, kind });
  }
}
