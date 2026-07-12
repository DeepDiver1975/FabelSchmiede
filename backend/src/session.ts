import type { Turn } from "./types.js";
import { OPENING_NARRATION } from "./scene.js";

export class Session {
  private history: Turn[];

  constructor() {
    this.history = [{ role: "gm", text: OPENING_NARRATION }];
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

  reset(): void {
    this.history = [{ role: "gm", text: OPENING_NARRATION }];
  }
}
