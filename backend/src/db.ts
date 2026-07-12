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
      dice_hint TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_turns_campaign_seq ON turns(campaign_id, seq);

    CREATE TABLE IF NOT EXISTS stories (
      campaign_id TEXT PRIMARY KEY REFERENCES campaigns(id),
      markdown TEXT NOT NULL,
      generated_at TEXT NOT NULL
    );
  `);
}

export function openDb(path: string): Database.Database {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}
