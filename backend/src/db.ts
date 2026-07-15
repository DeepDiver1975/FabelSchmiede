import Database from "better-sqlite3";

export function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      premise TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      finished_at TEXT
    );

    CREATE TABLE IF NOT EXISTS turns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id TEXT NOT NULL REFERENCES campaigns(id),
      seq INTEGER NOT NULL,
      role TEXT NOT NULL,
      text TEXT NOT NULL,
      dice_reason TEXT,
      dice_hint TEXT,
      kind TEXT NOT NULL DEFAULT 'story'
    );

    CREATE INDEX IF NOT EXISTS idx_turns_campaign_seq ON turns(campaign_id, seq);

    CREATE TABLE IF NOT EXISTS stories (
      campaign_id TEXT PRIMARY KEY REFERENCES campaigns(id),
      markdown TEXT NOT NULL,
      generated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS campaign_plans (
      campaign_id TEXT PRIMARY KEY REFERENCES campaigns(id),
      plan TEXT NOT NULL,
      generated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS turn_audio (
      campaign_id TEXT NOT NULL REFERENCES campaigns(id),
      seq INTEGER NOT NULL,
      audio BLOB NOT NULL,
      content_type TEXT NOT NULL,
      -- character count of the synthesized text; a hook for future cost
      -- tracking (#4). No cost logic lives here.
      char_count INTEGER NOT NULL,
      generated_at TEXT NOT NULL,
      PRIMARY KEY (campaign_id, seq)
    );

    CREATE TABLE IF NOT EXISTS characters (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL REFERENCES campaigns(id),
      name TEXT NOT NULL,
      concept TEXT NOT NULL,
      level INTEGER,
      max_hp INTEGER,
      -- Nested, variable-shape detail (narrative flavour, abilities, resource
      -- pools) is stored as JSON: it is only ever read/written whole, so a
      -- normalized schema would buy nothing here.
      narrative TEXT,
      abilities TEXT,
      resources TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_characters_campaign ON characters(campaign_id);
  `);

  // Databases created before the "kind" column existed need it backfilled;
  // CREATE TABLE IF NOT EXISTS above only covers brand-new databases.
  const hasKindColumn =
    (
      db.prepare("SELECT COUNT(*) AS n FROM pragma_table_info('turns') WHERE name = 'kind'").get() as {
        n: number;
      }
    ).n > 0;
  if (!hasKindColumn) {
    db.exec(`ALTER TABLE turns ADD COLUMN kind TEXT NOT NULL DEFAULT 'story'`);
  }

  const hasMaxHpColumn =
    (
      db.prepare("SELECT COUNT(*) AS n FROM pragma_table_info('characters') WHERE name = 'max_hp'").get() as {
        n: number;
      }
    ).n > 0;
  if (!hasMaxHpColumn) {
    db.exec(`ALTER TABLE characters ADD COLUMN max_hp INTEGER`);
  }
}

export function openDb(path: string): Database.Database {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}
