import { describe, it, expect } from "vitest";
import { openDb, migrate } from "./db.js";

describe("db", () => {
  it("creates the campaigns, turns, and stories tables", () => {
    const db = openDb(":memory:");
    const names = (
      db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {
        name: string;
      }[]
    ).map((r) => r.name);
    expect(names).toEqual(
      expect.arrayContaining(["campaigns", "turns", "stories", "turn_audio"]),
    );
    db.close();
  });

  it("migration is idempotent — running it twice does not throw", () => {
    const db = openDb(":memory:");
    expect(() => migrate(db)).not.toThrow();
    const count = (
      db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table'").get() as {
        n: number;
      }
    ).n;
    // campaigns, turns, stories (sqlite_sequence may also exist due to AUTOINCREMENT)
    expect(count).toBeGreaterThanOrEqual(3);
    db.close();
  });

  it("enforces the turns unique ordering index", () => {
    const db = openDb(":memory:");
    const idx = db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all() as {
      name: string;
    }[];
    expect(idx.map((r) => r.name)).toContain("idx_turns_campaign_seq");
    db.close();
  });

  it("gives turns a kind column defaulting to 'story'", () => {
    const db = openDb(":memory:");
    const col = db
      .prepare("SELECT \"notnull\", dflt_value FROM pragma_table_info('turns') WHERE name = 'kind'")
      .get() as { notnull: number; dflt_value: string } | undefined;
    expect(col).toBeDefined();
    expect(col!.notnull).toBe(1);
    expect(col!.dflt_value).toBe("'story'");
    db.close();
  });

  it("running migrate() again on a DB that already has the kind column does not duplicate it", () => {
    const db = openDb(":memory:");
    expect(() => migrate(db)).not.toThrow();
    const count = (
      db
        .prepare("SELECT COUNT(*) AS n FROM pragma_table_info('turns') WHERE name = 'kind'")
        .get() as { n: number }
    ).n;
    expect(count).toBe(1);
    db.close();
  });

  it("gives characters a max_hp column", () => {
    const db = openDb(":memory:");
    const cols = (db.prepare("SELECT name FROM pragma_table_info('characters')").all() as { name: string }[]).map(
      (r) => r.name,
    );
    expect(cols).toContain("max_hp");
    db.close();
  });
});
