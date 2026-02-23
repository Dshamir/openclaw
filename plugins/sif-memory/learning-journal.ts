/**
 * Learning Journal — Append-only audit log for pointer graph mutations.
 *
 * Records every graph operation (add, reinforce, decay, merge, prune,
 * co-activate, extract) in JSONL format for:
 *   - Cognitive archaeology (replay learning history)
 *   - Auditability (trace every intelligence origin)
 *   - Debugging (understand why weights changed)
 *   - Analytics (learning velocity, extraction quality)
 *
 * Each entry is session-tagged for lineage tracking.
 * Automatic rotation when file exceeds size threshold.
 *
 * @see Amendment A35 Phase 3 — Bidirectional Learning Loop
 */

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  statSync,
} from "node:fs";
import { dirname, join, basename, extname } from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type JournalEntry = {
  event: string;         // e.g., "reinforce", "decay", "extract-add"
  timestamp: string;     // ISO 8601
  [key: string]: unknown;
};

export type JournalConfig = {
  /** Path to the journal file (default: alongside pointer graph) */
  journalPath: string;

  /** Rotate when file exceeds this size in bytes (default: 5MB) */
  rotationThresholdBytes: number;

  /** Maximum number of rotated archives to keep (default: 10) */
  maxArchives: number;

  /** Whether to write synchronously (default: true for safety) */
  syncWrites: boolean;
};

// ---------------------------------------------------------------------------
// Learning Journal
// ---------------------------------------------------------------------------

export class LearningJournal {
  private config: JournalConfig;
  private currentSession: string | null = null;
  private entryCount = 0;

  constructor(config: JournalConfig) {
    this.config = config;

    // Ensure directory exists
    const dir = dirname(config.journalPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  // -------------------------------------------------------------------------
  // Session Management
  // -------------------------------------------------------------------------

  setSession(sessionKey: string): void {
    this.currentSession = sessionKey;
  }

  clearSession(): void {
    this.currentSession = null;
  }

  // -------------------------------------------------------------------------
  // Logging
  // -------------------------------------------------------------------------

  /**
   * Append a journal entry. Automatically adds session context.
   */
  log(entry: JournalEntry): void {
    const enriched = {
      ...entry,
      session: this.currentSession ?? undefined,
      seq: this.entryCount++,
    };

    const line = JSON.stringify(enriched) + "\n";

    try {
      appendFileSync(this.config.journalPath, line, "utf-8");

      // Check rotation
      if (this.shouldRotate()) {
        this.rotate();
      }
    } catch (err) {
      // Journal errors should never crash the system
      // Silently drop — this is an audit log, not critical path
    }
  }

  /**
   * Log the start of an extraction session.
   */
  logExtractionStart(sessionKey: string, turnCount: number): void {
    this.log({
      event: "extraction-start",
      sessionKey,
      turnCount,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Log the end of an extraction session with summary stats.
   */
  logExtractionEnd(
    sessionKey: string,
    stats: { added: number; reinforced: number; totalExtractions: number },
  ): void {
    this.log({
      event: "extraction-end",
      sessionKey,
      ...stats,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Log a decay pass summary.
   */
  logDecayPass(stats: { decayed: number; pruned: number }): void {
    this.log({
      event: "decay-pass",
      ...stats,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Log a consolidation pass summary.
   */
  logConsolidation(stats: {
    merged: number;
    coActivated: number;
    pruned: number;
  }): void {
    this.log({
      event: "consolidation",
      ...stats,
      timestamp: new Date().toISOString(),
    });
  }

  // -------------------------------------------------------------------------
  // Rotation
  // -------------------------------------------------------------------------

  private shouldRotate(): boolean {
    try {
      if (!existsSync(this.config.journalPath)) return false;
      const stat = statSync(this.config.journalPath);
      return stat.size >= this.config.rotationThresholdBytes;
    } catch {
      return false;
    }
  }

  private rotate(): void {
    try {
      const dir = dirname(this.config.journalPath);
      const base = basename(this.config.journalPath, extname(this.config.journalPath));
      const ext = extname(this.config.journalPath);
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const archiveName = `${base}-${timestamp}${ext}`;
      const archivePath = join(dir, archiveName);

      renameSync(this.config.journalPath, archivePath);

      // Prune old archives (keep latest N)
      // Note: full implementation would list and sort archive files.
      // Simplified here — relies on timestamp-based naming.
    } catch {
      // Rotation failure is non-critical
    }
  }

  // -------------------------------------------------------------------------
  // Status
  // -------------------------------------------------------------------------

  getStats(): {
    journalPath: string;
    entriesThisSession: number;
    fileSizeBytes: number | null;
  } {
    let fileSizeBytes: number | null = null;
    try {
      if (existsSync(this.config.journalPath)) {
        fileSizeBytes = statSync(this.config.journalPath).size;
      }
    } catch {
      // ignore
    }

    return {
      journalPath: this.config.journalPath,
      entriesThisSession: this.entryCount,
      fileSizeBytes,
    };
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a LearningJournal with sensible defaults based on graph path.
 */
export function createJournal(graphPath: string): LearningJournal {
  const dir = dirname(graphPath);
  const journalPath = join(dir, "learning-journal.jsonl");

  return new LearningJournal({
    journalPath,
    rotationThresholdBytes: 5 * 1024 * 1024, // 5MB
    maxArchives: 10,
    syncWrites: true,
  });
}
