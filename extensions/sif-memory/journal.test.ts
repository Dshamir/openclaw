import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LearningJournal } from "./journal.js";
import type { JournalEntry } from "./journal.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sif-journal-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("LearningJournal.append", () => {
  it("creates directory and writes entry", async () => {
    const journalDir = path.join(tmpDir, "nested", "journal");
    const journal = new LearningJournal(journalDir);

    const entry: JournalEntry = {
      timestamp: Date.now(),
      event: "add",
      pointerId: "ptr-1",
      data: { type: "knowledge" },
    };
    await journal.append(entry);

    const files = await fs.readdir(journalDir);
    expect(files.length).toBe(1);
    expect(files[0]).toMatch(/^journal-\d{4}-\d{2}-\d{2}\.jsonl$/);

    const content = await fs.readFile(path.join(journalDir, files[0]), "utf-8");
    const parsed = JSON.parse(content.trim()) as JournalEntry;
    expect(parsed.event).toBe("add");
    expect(parsed.pointerId).toBe("ptr-1");
  });

  it("appends multiple entries to the same file", async () => {
    const journal = new LearningJournal(tmpDir);

    await journal.append({ timestamp: 1000, event: "add", pointerId: "p1" });
    await journal.append({ timestamp: 2000, event: "reinforce", pointerId: "p2" });
    await journal.append({ timestamp: 3000, event: "remove", pointerId: "p3" });

    const entries = await journal.read();
    expect(entries).toHaveLength(3);
    expect(entries[0].event).toBe("add");
    expect(entries[2].event).toBe("remove");
  });
});

describe("LearningJournal.read", () => {
  it("returns empty array for empty journal", async () => {
    const journal = new LearningJournal(tmpDir);
    const entries = await journal.read();
    expect(entries).toEqual([]);
  });

  it("filters by since timestamp", async () => {
    const journal = new LearningJournal(tmpDir);

    await journal.append({ timestamp: 1000, event: "old" });
    await journal.append({ timestamp: 5000, event: "new" });
    await journal.append({ timestamp: 9000, event: "newest" });

    const recent = await journal.read({ since: 5000 });
    expect(recent).toHaveLength(2);
    expect(recent[0].event).toBe("new");
    expect(recent[1].event).toBe("newest");
  });

  it("respects limit", async () => {
    const journal = new LearningJournal(tmpDir);

    for (let i = 0; i < 10; i++) {
      await journal.append({ timestamp: i * 1000, event: `evt-${i}` });
    }

    const limited = await journal.read({ limit: 3 });
    expect(limited).toHaveLength(3);
  });

  it("returns empty for nonexistent directory", async () => {
    const journal = new LearningJournal(path.join(tmpDir, "does-not-exist"));
    const entries = await journal.read();
    expect(entries).toEqual([]);
  });
});
