import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type {
  Ability,
  Campaign,
  CampaignPlan,
  CampaignSummary,
  Character,
  CharacterInput,
  CharacterNarrative,
  DiceRequest,
  ResourcePool,
  StoredPlan,
  StoredTurn,
  Story,
  TurnKind,
} from "./types.js";

type TurnInput = {
  role: "gm" | "player";
  text: string;
  diceRequest: DiceRequest | null;
  kind?: TurnKind;
};

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
        "INSERT INTO turns (campaign_id, seq, role, text, dice_reason, dice_hint, kind) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        campaignId,
        next,
        turn.role,
        turn.text,
        turn.diceRequest?.reason ?? null,
        turn.diceRequest?.hint ?? null,
        turn.kind ?? "story",
      );
  }

  appendTurns(campaignId: string, turns: TurnInput[]): void {
    const tx = this.db.transaction((items: TurnInput[]) => {
      for (const t of items) this.appendTurn(campaignId, t);
    });
    tx(turns);
  }

  getTurns(campaignId: string): StoredTurn[] {
    const rows = this.db
      .prepare(
        "SELECT role, text, dice_reason, dice_hint, kind FROM turns WHERE campaign_id = ? ORDER BY seq",
      )
      .all(campaignId) as {
      role: "gm" | "player";
      text: string;
      dice_reason: string | null;
      dice_hint: string | null;
      kind: TurnKind;
    }[];
    return rows.map((r) => ({
      role: r.role,
      text: r.text,
      diceRequest:
        r.dice_reason !== null && r.dice_hint !== null
          ? { reason: r.dice_reason, hint: r.dice_hint }
          : null,
      kind: r.kind,
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

  savePlan(campaignId: string, plan: CampaignPlan): StoredPlan {
    const generated_at = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO campaign_plans (campaign_id, plan, generated_at) VALUES (?, ?, ?)
         ON CONFLICT(campaign_id) DO UPDATE SET plan = excluded.plan, generated_at = excluded.generated_at`,
      )
      .run(campaignId, JSON.stringify(plan), generated_at);
    return { plan, generated_at };
  }

  getPlan(campaignId: string): StoredPlan | null {
    const row = this.db
      .prepare("SELECT plan, generated_at FROM campaign_plans WHERE campaign_id = ?")
      .get(campaignId) as { plan: string; generated_at: string } | undefined;
    if (!row) return null;
    return { plan: JSON.parse(row.plan) as CampaignPlan, generated_at: row.generated_at };
  }

  createCharacter(campaignId: string, input: CharacterInput): Character {
    const id = randomUUID();
    const created_at = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO characters
           (id, campaign_id, name, concept, level, narrative, abilities, resources, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        campaignId,
        input.name,
        input.concept,
        input.level ?? null,
        input.narrative ? JSON.stringify(input.narrative) : null,
        input.abilities ? JSON.stringify(input.abilities) : null,
        input.resources ? JSON.stringify(input.resources) : null,
        created_at,
      );
    return {
      id,
      campaign_id: campaignId,
      name: input.name,
      concept: input.concept,
      ...(input.level !== undefined ? { level: input.level } : {}),
      ...(input.narrative ? { narrative: input.narrative } : {}),
      ...(input.abilities ? { abilities: input.abilities } : {}),
      ...(input.resources ? { resources: input.resources } : {}),
      created_at,
    };
  }

  getCharacter(id: string): Character | null {
    const row = this.db.prepare("SELECT * FROM characters WHERE id = ?").get(id);
    return row ? rowToCharacter(row as CharacterRow) : null;
  }

  listCharacters(campaignId: string): Character[] {
    const rows = this.db
      .prepare("SELECT * FROM characters WHERE campaign_id = ? ORDER BY created_at, rowid")
      .all(campaignId) as CharacterRow[];
    return rows.map(rowToCharacter);
  }

  // Persist mechanical mutations produced by the rule engine (e.g. a spent
  // resource pool after a validated action). Only the JSON-backed columns and
  // level are updatable; identity fields are fixed at creation.
  updateCharacter(character: Character): void {
    this.db
      .prepare(
        `UPDATE characters
            SET name = ?, concept = ?, level = ?, narrative = ?, abilities = ?, resources = ?
          WHERE id = ?`,
      )
      .run(
        character.name,
        character.concept,
        character.level ?? null,
        character.narrative ? JSON.stringify(character.narrative) : null,
        character.abilities ? JSON.stringify(character.abilities) : null,
        character.resources ? JSON.stringify(character.resources) : null,
        character.id,
      );
  }

  deleteCharacter(id: string): void {
    this.db.prepare("DELETE FROM characters WHERE id = ?").run(id);
  }
}

type CharacterRow = {
  id: string;
  campaign_id: string;
  name: string;
  concept: string;
  level: number | null;
  narrative: string | null;
  abilities: string | null;
  resources: string | null;
  created_at: string;
};

function rowToCharacter(row: CharacterRow): Character {
  return {
    id: row.id,
    campaign_id: row.campaign_id,
    name: row.name,
    concept: row.concept,
    ...(row.level !== null ? { level: row.level } : {}),
    ...(row.narrative ? { narrative: JSON.parse(row.narrative) as CharacterNarrative } : {}),
    ...(row.abilities ? { abilities: JSON.parse(row.abilities) as Ability[] } : {}),
    ...(row.resources ? { resources: JSON.parse(row.resources) as ResourcePool[] } : {}),
    created_at: row.created_at,
  };
}
