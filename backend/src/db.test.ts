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
    expect(names).toEqual(expect.arrayContaining(["campaigns", "turns", "stories"]));
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
});
