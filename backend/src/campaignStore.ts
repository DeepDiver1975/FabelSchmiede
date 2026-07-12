import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type {
  Campaign,
  CampaignSummary,
  DiceRequest,
  StoredTurn,
  Story,
} from "./types.js";

type TurnInput = { role: "gm" | "player"; text: string; diceRequest: DiceRequest | null };

export class CampaignStore {
  constructor(private db: Database.Database) {}

  createCampaign(name: string, premise: string): Campaign {
    const id = randomUUID();
    const created_at = new Date().toISOString();
    this.db
      .prepare(
        "INSERT INTO campaigns (id, name, premise, status, created_at, finished_at) VALUES (?, ?, ?, 'active', ?, NULL)",
      )
      .run(id, name, premise, created_at);
    return { id, name, premise, status: "active", created_at, finished_at: null };
  }

  listCampaigns(): CampaignSummary[] {
    return this.db
      .prepare(
        "SELECT id, name, status, created_at, finished_at FROM campaigns ORDER BY created_at DESC, rowid DESC",
      )
      .all() as CampaignSummary[];
  }

  getCampaign(id: string): Campaign | null {
    const row = this.db
      .prepare(
        "SELECT id, name, premise, status, created_at, finished_at FROM campaigns WHERE id = ?",
      )
      .get(id);
    return (row as Campaign) ?? null;
  }

  appendTurn(campaignId: string, turn: TurnInput): void {
    const { next } = this.db
      .prepare("SELECT COALESCE(MAX(seq), -1) + 1 AS next FROM turns WHERE campaign_id = ?")
      .get(campaignId) as { next: number };
    this.db
      .prepare(
        "INSERT INTO turns (campaign_id, seq, role, text, dice_reason, dice_hint) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(
        campaignId,
        next,
        turn.role,
        turn.text,
        turn.diceRequest?.reason ?? null,
        turn.diceRequest?.hint ?? null,
      );
  }

  getTurns(campaignId: string): StoredTurn[] {
    const rows = this.db
      .prepare(
        "SELECT role, text, dice_reason, dice_hint FROM turns WHERE campaign_id = ? ORDER BY seq",
      )
      .all(campaignId) as {
      role: "gm" | "player";
      text: string;
      dice_reason: string | null;
      dice_hint: string | null;
    }[];
    return rows.map((r) => ({
      role: r.role,
      text: r.text,
      diceRequest:
        r.dice_reason !== null && r.dice_hint !== null
          ? { reason: r.dice_reason, hint: r.dice_hint }
          : null,
    }));
  }

  finishCampaign(id: string): void {
    this.db
      .prepare("UPDATE campaigns SET status = 'finished', finished_at = ? WHERE id = ?")
      .run(new Date().toISOString(), id);
  }

  saveStory(campaignId: string, markdown: string): Story {
    const generated_at = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO stories (campaign_id, markdown, generated_at) VALUES (?, ?, ?)
         ON CONFLICT(campaign_id) DO UPDATE SET markdown = excluded.markdown, generated_at = excluded.generated_at`,
      )
      .run(campaignId, markdown, generated_at);
    return { markdown, generated_at };
  }

  getStory(campaignId: string): Story | null {
    const row = this.db
      .prepare("SELECT markdown, generated_at FROM stories WHERE campaign_id = ?")
      .get(campaignId);
    return (row as Story) ?? null;
  }
}
