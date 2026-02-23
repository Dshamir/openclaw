/**
 * PointerGraph — Core SIF Data Structure
 *
 * A portable, provider-agnostic intelligence graph that stores typed pointers
 * representing accumulated knowledge, skills, archetypes, and breakthroughs.
 *
 * The graph supports:
 *   - Hebbian reinforcement (use strengthens, neglect weakens)
 *   - Temporal decay (configurable half-life)
 *   - Semantic search via tag matching + content similarity
 *   - Full lineage tracking for auditability
 *   - YAML serialization for human readability
 *
 * Storage format: YAML file at user-controlled path.
 * This is the "soul" that persists across providers and sessions.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PointerType =
  | "knowledge"
  | "skill"
  | "archetype"
  | "breakthrough"
  | "context";

export type PointerLineage = {
  source: string;          // e.g., "session:abc123", "archaeology:chatgpt"
  createdBy: string;       // e.g., "sif-memory@0.1.0"
  timestamp: string;       // ISO 8601
  parentId?: string;       // For derived pointers
};

export type Pointer = {
  id: string;
  type: PointerType;
  content: string;
  weight: number;          // 0.0 – 1.0 (Hebbian strength)
  tags: string[];
  lineage: PointerLineage;
  lastAccessed?: string;   // ISO 8601
  accessCount: number;
  metadata?: Record<string, unknown>;
};

export type PointerGraphData = {
  version: string;
  owner?: string;
  pointers: Pointer[];
  meta?: {
    lastSync?: string;
    sessionCount?: number;
    provider?: string;
  };
};

type Logger = {
  info: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
  debug?: (msg: string) => void;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GRAPH_VERSION = "1.0.0";
const DECAY_HALF_LIFE_DAYS = 30;
const MIN_WEIGHT = 0.05;
const MAX_WEIGHT = 1.0;
const REINFORCE_CAP = 0.15;   // Max boost per reinforcement
const DEFAULT_WEIGHT = 0.5;

// ---------------------------------------------------------------------------
// PointerGraph
// ---------------------------------------------------------------------------

export class PointerGraph {
  private data: PointerGraphData;
  private filePath: string;
  private logger: Logger;
  private dirty = false;

  constructor(filePath: string, logger: Logger) {
    this.filePath = filePath;
    this.logger = logger;
    this.data = {
      version: GRAPH_VERSION,
      pointers: [],
      meta: {},
    };
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  async load(): Promise<void> {
    if (!existsSync(this.filePath)) {
      this.logger.info(`No existing pointer graph at ${this.filePath} — starting fresh`);
      await this.save();
      return;
    }

    try {
      const raw = readFileSync(this.filePath, "utf-8");
      const parsed = this.parseGraph(raw);
      this.data = parsed;
      this.applyTemporalDecay();
    } catch (err) {
      this.logger.error(`Failed to load pointer graph: ${err}`);
      this.logger.warn("Starting with empty graph");
    }
  }

  async save(): Promise<void> {
    try {
      const dir = dirname(this.filePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      this.data.meta = {
        ...this.data.meta,
        lastSync: new Date().toISOString(),
      };
      const serialized = this.serializeGraph(this.data);
      writeFileSync(this.filePath, serialized, "utf-8");
      this.dirty = false;
    } catch (err) {
      this.logger.error(`Failed to save pointer graph: ${err}`);
    }
  }

  // -------------------------------------------------------------------------
  // Query Operations
  // -------------------------------------------------------------------------

  search(query: string, maxResults = 5): Pointer[] {
    const queryTerms = query.toLowerCase().split(/\s+/).filter(Boolean);

    const scored = this.data.pointers.map((ptr) => {
      let score = 0;
      const contentLower = ptr.content.toLowerCase();
      const tagsLower = ptr.tags.map((t) => t.toLowerCase());

      // Tag match (highest signal)
      for (const term of queryTerms) {
        if (tagsLower.some((t) => t.includes(term))) score += 3;
        if (contentLower.includes(term)) score += 1;
      }

      // Weight-adjusted score (Hebbian factor)
      score *= ptr.weight;

      // Recency boost
      if (ptr.lastAccessed) {
        const daysSince = daysBetween(new Date(ptr.lastAccessed), new Date());
        if (daysSince < 7) score *= 1.3;
        else if (daysSince < 30) score *= 1.1;
      }

      return { ptr, score };
    });

    return scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults)
      .map((s) => {
        // Mark as accessed (Hebbian reinforcement through use)
        s.ptr.lastAccessed = new Date().toISOString();
        s.ptr.accessCount += 1;
        this.dirty = true;
        return s.ptr;
      });
  }

  // -------------------------------------------------------------------------
  // Write Operations
  // -------------------------------------------------------------------------

  add(params: {
    type: PointerType;
    content: string;
    tags?: string[];
    weight?: number;
    source?: string;
    metadata?: Record<string, unknown>;
  }): Pointer {
    const pointer: Pointer = {
      id: generatePointerId(),
      type: params.type,
      content: params.content,
      weight: clamp(params.weight ?? DEFAULT_WEIGHT, MIN_WEIGHT, MAX_WEIGHT),
      tags: params.tags ?? [],
      lineage: {
        source: params.source ?? "session:unknown",
        createdBy: `sif-memory@${GRAPH_VERSION}`,
        timestamp: new Date().toISOString(),
      },
      accessCount: 0,
      metadata: params.metadata,
    };

    // Deduplicate: if very similar content exists, reinforce instead
    const existing = this.findSimilar(params.content, params.type);
    if (existing) {
      this.reinforce(existing.id, 0.1);
      this.logger.debug?.(
        `SIF: reinforced existing pointer ${existing.id} instead of creating duplicate`
      );
      return existing;
    }

    this.data.pointers.push(pointer);
    this.dirty = true;

    this.logger.info(
      `SIF: added ${params.type} pointer ${pointer.id} — "${truncate(params.content, 60)}"`
    );

    return pointer;
  }

  reinforce(pointerId: string, boost: number): boolean {
    const ptr = this.data.pointers.find((p) => p.id === pointerId);
    if (!ptr) return false;

    const cappedBoost = Math.min(Math.abs(boost), REINFORCE_CAP);
    ptr.weight = clamp(ptr.weight + cappedBoost, MIN_WEIGHT, MAX_WEIGHT);
    ptr.lastAccessed = new Date().toISOString();
    ptr.accessCount += 1;
    this.dirty = true;

    this.logger.debug?.(
      `SIF: reinforced ${ptr.id} → weight ${ptr.weight.toFixed(3)}`
    );

    return true;
  }

  // -------------------------------------------------------------------------
  // Status / Introspection
  // -------------------------------------------------------------------------

  size(): number {
    return this.data.pointers.length;
  }

  typeCount(type: PointerType): number {
    return this.data.pointers.filter((p) => p.type === type).length;
  }

  status() {
    const pointers = this.data.pointers;
    const weights = pointers.map((p) => p.weight);
    const avgWeight = weights.length > 0
      ? weights.reduce((a, b) => a + b, 0) / weights.length
      : 0;

    const decayedCount = pointers.filter((p) => p.weight < 0.3).length;
    const strongCount = pointers.filter((p) => p.weight > 0.7).length;

    // Health: ratio of strong to total, with bonus for diversity
    const typeSet = new Set(pointers.map((p) => p.type));
    const diversityBonus = Math.min(typeSet.size / 5, 1) * 0.2;
    const strengthRatio = pointers.length > 0 ? strongCount / pointers.length : 0;
    const healthScore = clamp(strengthRatio + diversityBonus, 0, 1);

    return {
      totalPointers: pointers.length,
      skills: this.typeCount("skill"),
      knowledge: this.typeCount("knowledge"),
      archetypes: this.typeCount("archetype"),
      breakthroughs: this.typeCount("breakthrough"),
      context: this.typeCount("context"),
      avgWeight,
      decayedCount,
      strongCount,
      healthScore,
      lastSync: this.data.meta?.lastSync ?? null,
      graphPath: this.filePath,
      dirty: this.dirty,
    };
  }

  isDirty(): boolean {
    return this.dirty;
  }

  getPointers(): readonly Pointer[] {
    return this.data.pointers;
  }

  // -------------------------------------------------------------------------
  // Temporal Decay
  // -------------------------------------------------------------------------

  private applyTemporalDecay(): void {
    const now = new Date();
    let decayed = 0;

    for (const ptr of this.data.pointers) {
      if (!ptr.lastAccessed) continue;

      const lastAccess = new Date(ptr.lastAccessed);
      const days = daysBetween(lastAccess, now);

      if (days > 1) {
        // Exponential decay with half-life
        const decayFactor = Math.pow(0.5, days / DECAY_HALF_LIFE_DAYS);
        const newWeight = ptr.weight * decayFactor;
        if (Math.abs(newWeight - ptr.weight) > 0.001) {
          ptr.weight = clamp(newWeight, MIN_WEIGHT, MAX_WEIGHT);
          decayed++;
        }
      }
    }

    if (decayed > 0) {
      this.dirty = true;
      this.logger.debug?.(`SIF: applied temporal decay to ${decayed} pointers`);
    }
  }

  // -------------------------------------------------------------------------
  // Similarity Detection (simple content overlap)
  // -------------------------------------------------------------------------

  private findSimilar(content: string, type: PointerType): Pointer | null {
    const contentWords = new Set(content.toLowerCase().split(/\s+/));
    const threshold = 0.6; // 60% word overlap

    for (const ptr of this.data.pointers) {
      if (ptr.type !== type) continue;

      const ptrWords = new Set(ptr.content.toLowerCase().split(/\s+/));
      const intersection = [...contentWords].filter((w) => ptrWords.has(w));
      const union = new Set([...contentWords, ...ptrWords]);
      const jaccard = intersection.length / union.size;

      if (jaccard >= threshold) return ptr;
    }

    return null;
  }

  // -------------------------------------------------------------------------
  // Serialization (JSON-based, YAML in future with proper parser)
  // -------------------------------------------------------------------------

  private parseGraph(raw: string): PointerGraphData {
    try {
      return JSON.parse(raw) as PointerGraphData;
    } catch {
      this.logger.warn("Falling back to fresh graph — parse error");
      return { version: GRAPH_VERSION, pointers: [], meta: {} };
    }
  }

  private serializeGraph(data: PointerGraphData): string {
    return JSON.stringify(data, null, 2);
  }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function generatePointerId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "ptr_";
  for (let i = 0; i < 12; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function daysBetween(a: Date, b: Date): number {
  return Math.abs(b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24);
}

function truncate(s: string, len: number): string {
  return s.length > len ? s.slice(0, len) + "…" : s;
}
