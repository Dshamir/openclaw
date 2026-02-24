import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type {
  GraphStatus,
  Pointer,
  PointerGraphData,
  PointerLineage,
  PointerType,
  ScoredPointer,
} from "./types.js";
import { POINTER_TYPES } from "./types.js";

const GRAPH_VERSION = 1;
const DEDUP_JACCARD_THRESHOLD = 0.6;
const MAX_REINFORCE_BOOST = 0.15;
const RECENCY_BONUS_DAYS = 7;

export class PointerGraph {
  private pointers: Map<string, Pointer> = new Map();
  private dirty = false;
  private lastDecayAt = 0;

  constructor(
    private readonly filePath: string,
    private readonly decayHalfLifeDays: number,
  ) {}

  async load(): Promise<void> {
    let raw: string;
    try {
      raw = await fs.readFile(this.filePath, "utf-8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        this.pointers = new Map();
        this.lastDecayAt = Date.now();
        return;
      }
      throw err;
    }

    let data: PointerGraphData;
    try {
      data = JSON.parse(raw) as PointerGraphData;
    } catch {
      // Corrupt JSON — start fresh, log would be handled by caller
      this.pointers = new Map();
      this.lastDecayAt = Date.now();
      this.dirty = true;
      return;
    }

    this.lastDecayAt = data.lastDecayAt ?? Date.now();
    this.pointers = new Map();
    for (const p of data.pointers ?? []) {
      this.pointers.set(p.id, p);
    }

    this.applyTemporalDecay(this.decayHalfLifeDays);
  }

  async save(): Promise<void> {
    if (!this.dirty) {
      return;
    }
    const data: PointerGraphData = {
      version: GRAPH_VERSION,
      pointers: [...this.pointers.values()],
      lastDecayAt: this.lastDecayAt,
    };
    const json = JSON.stringify(data, null, 2);
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
    const tmpPath = `${this.filePath}.tmp.${process.pid}`;
    await fs.writeFile(tmpPath, json, "utf-8");
    await fs.rename(tmpPath, this.filePath);
    this.dirty = false;
  }

  search(query: string, maxResults = 8): ScoredPointer[] {
    const queryTerms = tokenize(query);
    const queryTags = queryTerms.filter((t) => t.length > 2);
    if (queryTerms.length === 0) {
      return [];
    }

    const now = Date.now();
    const scored: ScoredPointer[] = [];

    for (const pointer of this.pointers.values()) {
      const contentTerms = tokenize(pointer.content);
      const tagMatches = pointer.tags.filter((t) => queryTags.includes(t.toLowerCase())).length;
      const termOverlap = queryTerms.filter((t) => contentTerms.includes(t)).length;

      if (tagMatches === 0 && termOverlap === 0) {
        continue;
      }

      // Base relevance score from term/tag overlap
      const tagScore = queryTags.length > 0 ? tagMatches / queryTags.length : 0;
      const termScore = queryTerms.length > 0 ? termOverlap / queryTerms.length : 0;
      let score = tagScore * 0.4 + termScore * 0.6;

      // Weight adjustment
      score *= pointer.weight;

      // Recency bonus: pointers accessed within RECENCY_BONUS_DAYS get a boost
      const daysSinceAccess = (now - pointer.lastAccessedAt) / (1000 * 60 * 60 * 24);
      if (daysSinceAccess < RECENCY_BONUS_DAYS) {
        score *= 1 + 0.2 * (1 - daysSinceAccess / RECENCY_BONUS_DAYS);
      }

      scored.push({ pointer, score });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, maxResults);
  }

  add(params: {
    type: PointerType;
    content: string;
    tags?: string[];
    weight?: number;
    lineage?: PointerLineage;
  }): Pointer | null {
    const { type, content, tags = [], weight = 0.5 } = params;

    // Dedup: check for similar existing pointer of same type
    const similar = this.findSimilar(content, type, DEDUP_JACCARD_THRESHOLD);
    if (similar) {
      // Reinforce existing instead of adding duplicate
      this.reinforce(similar.id, 0.05);
      return null;
    }

    const now = Date.now();
    const pointer: Pointer = {
      id: randomUUID(),
      type,
      content,
      tags: tags.map((t) => t.toLowerCase()),
      weight: Math.max(0, Math.min(1, weight)),
      accessCount: 0,
      createdAt: now,
      lastAccessedAt: now,
      lineage: params.lineage,
    };

    this.pointers.set(pointer.id, pointer);
    this.dirty = true;
    return pointer;
  }

  reinforce(id: string, boost: number): boolean {
    const pointer = this.pointers.get(id);
    if (!pointer) {
      return false;
    }
    const cappedBoost = Math.min(Math.abs(boost), MAX_REINFORCE_BOOST);
    pointer.weight = Math.min(1, pointer.weight + cappedBoost);
    pointer.accessCount += 1;
    pointer.lastAccessedAt = Date.now();
    this.dirty = true;
    return true;
  }

  remove(id: string): boolean {
    const existed = this.pointers.delete(id);
    if (existed) {
      this.dirty = true;
    }
    return existed;
  }

  getById(id: string): Pointer | undefined {
    return this.pointers.get(id);
  }

  getByType(type: PointerType): Pointer[] {
    return [...this.pointers.values()].filter((p) => p.type === type);
  }

  status(): GraphStatus {
    const pointers = [...this.pointers.values()];
    const byType = {} as Record<PointerType, number>;
    for (const t of POINTER_TYPES) {
      byType[t] = 0;
    }
    let weightSum = 0;
    let oldest: number | null = null;
    let newest: number | null = null;

    for (const p of pointers) {
      byType[p.type] = (byType[p.type] ?? 0) + 1;
      weightSum += p.weight;
      if (oldest === null || p.createdAt < oldest) {
        oldest = p.createdAt;
      }
      if (newest === null || p.createdAt > newest) {
        newest = p.createdAt;
      }
    }

    return {
      totalPointers: pointers.length,
      byType,
      averageWeight: pointers.length > 0 ? weightSum / pointers.length : 0,
      oldestPointer: oldest,
      newestPointer: newest,
    };
  }

  isDirty(): boolean {
    return this.dirty;
  }

  size(): number {
    return this.pointers.size;
  }

  allPointers(): Pointer[] {
    return [...this.pointers.values()];
  }

  private applyTemporalDecay(halfLifeDays: number): void {
    const now = Date.now();
    const elapsed = now - this.lastDecayAt;
    if (elapsed < 1000 * 60 * 60) {
      // Skip decay if less than 1 hour has passed
      return;
    }

    const halfLifeMs = halfLifeDays * 24 * 60 * 60 * 1000;
    for (const pointer of this.pointers.values()) {
      const age = now - pointer.lastAccessedAt;
      // Exponential decay: w * 0.5^(age/halfLife)
      const decayFactor = Math.pow(0.5, age / halfLifeMs);
      const newWeight = pointer.weight * decayFactor;
      // Floor at 0.01 to avoid zero-weight ghosts
      pointer.weight = Math.max(0.01, newWeight);
    }

    this.lastDecayAt = now;
    this.dirty = true;
  }

  private findSimilar(content: string, type: PointerType, threshold: number): Pointer | null {
    const newTokens = new Set(tokenize(content));
    if (newTokens.size === 0) {
      return null;
    }

    for (const pointer of this.pointers.values()) {
      if (pointer.type !== type) {
        continue;
      }
      const existingTokens = new Set(tokenize(pointer.content));
      const intersection = [...newTokens].filter((t) => existingTokens.has(t)).length;
      const union = new Set([...newTokens, ...existingTokens]).size;
      if (union > 0 && intersection / union >= threshold) {
        return pointer;
      }
    }

    return null;
  }
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}
