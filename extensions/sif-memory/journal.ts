import fs from "node:fs/promises";
import path from "node:path";

export type JournalEntry = {
  timestamp: number;
  event: string;
  pointerId?: string;
  data?: Record<string, unknown>;
};

/** Maximum journal file size before rotation (5 MB). */
const MAX_FILE_SIZE = 5 * 1024 * 1024;

/**
 * Append-only JSONL audit log for SIF Memory graph mutations.
 *
 * Every graph operation (add, reinforce, remove, decay) should generate
 * an entry via this journal for auditability and replay.
 */
export class LearningJournal {
  private readonly journalDir: string;
  private initialized = false;

  constructor(journalDir: string) {
    this.journalDir = journalDir;
  }

  /**
   * Append an entry to the current journal file.
   * Auto-rotates when the file exceeds MAX_FILE_SIZE.
   */
  async append(entry: JournalEntry): Promise<void> {
    await this.ensureDir();
    const filePath = await this.currentFilePath();
    const line = JSON.stringify(entry) + "\n";
    await fs.appendFile(filePath, line, "utf-8");
  }

  /**
   * Read journal entries, optionally filtered by timestamp and limited.
   */
  async read(opts?: { since?: number; limit?: number }): Promise<JournalEntry[]> {
    await this.ensureDir();

    const files = await this.journalFiles();
    if (files.length === 0) {
      return [];
    }

    const entries: JournalEntry[] = [];
    const since = opts?.since ?? 0;
    const limit = opts?.limit ?? Number.MAX_SAFE_INTEGER;

    // Read files in chronological order (oldest first by name)
    for (const file of files) {
      if (entries.length >= limit) {
        break;
      }

      const content = await fs.readFile(path.join(this.journalDir, file), "utf-8");
      const lines = content.split("\n").filter((l) => l.trim().length > 0);

      for (const line of lines) {
        if (entries.length >= limit) {
          break;
        }

        try {
          const entry = JSON.parse(line) as JournalEntry;
          if (entry.timestamp >= since) {
            entries.push(entry);
          }
        } catch {
          // Skip malformed lines
        }
      }
    }

    return entries;
  }

  /**
   * Get the path to the current journal file, rotating if needed.
   */
  private async currentFilePath(): Promise<string> {
    const fileName = this.fileNameForDate(new Date());
    const filePath = path.join(this.journalDir, fileName);

    try {
      const stat = await fs.stat(filePath);
      if (stat.size >= MAX_FILE_SIZE) {
        // Rotation: append a sequence suffix to avoid collision
        const seq = Date.now();
        return path.join(this.journalDir, `journal-${this.dateStamp(new Date())}-${seq}.jsonl`);
      }
    } catch {
      // File doesn't exist yet — that's fine, we'll create it
    }

    return filePath;
  }

  private fileNameForDate(date: Date): string {
    return `journal-${this.dateStamp(date)}.jsonl`;
  }

  private dateStamp(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  /**
   * List all journal files sorted alphabetically (chronological by name).
   */
  private async journalFiles(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.journalDir);
      return entries.filter((f) => f.startsWith("journal-") && f.endsWith(".jsonl")).sort();
    } catch {
      return [];
    }
  }

  private async ensureDir(): Promise<void> {
    if (!this.initialized) {
      await fs.mkdir(this.journalDir, { recursive: true });
      this.initialized = true;
    }
  }
}
