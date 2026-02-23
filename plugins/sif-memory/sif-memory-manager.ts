/**
 * SifMemoryManager — Phase 2: Deep Memory Integration
 *
 * Implements OpenClaw's MemorySearchManager interface as a composite manager:
 *   1. Delegates file/embedding searches to the builtin MemoryIndexManager
 *   2. Searches the SIF pointer graph for accumulated intelligence
 *   3. Merges both result sets with configurable weighting
 *
 * This makes SIF a first-class memory backend — pointer graph results appear
 * alongside file chunks in OpenClaw's standard memory search pipeline.
 *
 * Config: memory.backend = "sif" in openclaw.yaml
 *
 * @see Amendment A35 Phase 2 — Deep Memory Integration
 */

import type {
  MemorySearchManager,
  MemorySearchResult,
  MemoryProviderStatus,
  MemoryEmbeddingProbeResult,
  MemorySyncProgressUpdate,
} from "../../src/memory/types.js";

import type { PointerGraph, Pointer, PointerType } from "./pointer-graph.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export type SifMemoryConfig = {
  /** Path to the SIF pointer graph file */
  graphPath?: string;
  /** Weight multiplier for SIF results when merging (0.0–2.0, default 1.2) */
  sifWeight?: number;
  /** Weight multiplier for builtin results when merging (0.0–2.0, default 1.0) */
  builtinWeight?: number;
  /** Max SIF results to inject per search (default: 5) */
  maxSifResults?: number;
  /** Minimum pointer weight to include in search results (default: 0.15) */
  minPointerWeight?: number;
  /** Whether to include the builtin backend (default: true) */
  includeBuiltin?: boolean;
};

const DEFAULT_SIF_WEIGHT = 1.2;
const DEFAULT_BUILTIN_WEIGHT = 1.0;
const DEFAULT_MAX_SIF_RESULTS = 5;
const DEFAULT_MIN_POINTER_WEIGHT = 0.15;

// ---------------------------------------------------------------------------
// Pointer → MemorySearchResult mapping
// ---------------------------------------------------------------------------

/** Virtual path prefix for SIF pointers in search results */
const SIF_PATH_PREFIX = "sif://pointers/";

/**
 * Maps a SIF pointer type to a relevance score multiplier.
 * Breakthroughs and skills get a boost because they represent
 * higher-value intelligence than raw knowledge or context.
 */
const TYPE_SCORE_MULTIPLIER: Record<PointerType, number> = {
  breakthrough: 1.3,
  skill: 1.2,
  archetype: 1.1,
  knowledge: 1.0,
  context: 0.9,
};

function pointerToSearchResult(
  pointer: Pointer,
  searchScore: number,
  sifWeight: number,
): MemorySearchResult {
  const typeMultiplier = TYPE_SCORE_MULTIPLIER[pointer.type] ?? 1.0;

  // Build a rich snippet that includes pointer metadata
  const snippetLines = [
    `[SIF ${pointer.type.toUpperCase()}] ${pointer.content}`,
  ];
  if (pointer.tags.length > 0) {
    snippetLines.push(`Tags: ${pointer.tags.join(", ")}`);
  }
  snippetLines.push(
    `Weight: ${pointer.weight.toFixed(2)} | ID: ${pointer.id}`
  );

  return {
    path: `${SIF_PATH_PREFIX}${pointer.type}/${pointer.id}`,
    startLine: 1,
    endLine: snippetLines.length,
    score: searchScore * typeMultiplier * sifWeight * pointer.weight,
    snippet: snippetLines.join("\n"),
    source: "memory",  // SIF results appear as "memory" source
    citation: `SIF pointer ${pointer.id} (${pointer.type}, weight: ${pointer.weight.toFixed(2)})`,
  };
}

// ---------------------------------------------------------------------------
// SifMemoryManager
// ---------------------------------------------------------------------------

export class SifMemoryManager implements MemorySearchManager {
  private readonly graph: PointerGraph;
  private readonly builtin: MemorySearchManager | null;
  private readonly config: Required<SifMemoryConfig>;
  private readonly logger: {
    info: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
    debug?: (msg: string) => void;
  };

  constructor(params: {
    graph: PointerGraph;
    builtin: MemorySearchManager | null;
    config?: SifMemoryConfig;
    logger: {
      info: (msg: string) => void;
      warn: (msg: string) => void;
      error: (msg: string) => void;
      debug?: (msg: string) => void;
    };
  }) {
    this.graph = params.graph;
    this.builtin = params.builtin;
    this.logger = params.logger;

    this.config = {
      graphPath: params.config?.graphPath ?? "",
      sifWeight: clamp(params.config?.sifWeight ?? DEFAULT_SIF_WEIGHT, 0, 2),
      builtinWeight: clamp(params.config?.builtinWeight ?? DEFAULT_BUILTIN_WEIGHT, 0, 2),
      maxSifResults: Math.max(1, params.config?.maxSifResults ?? DEFAULT_MAX_SIF_RESULTS),
      minPointerWeight: clamp(params.config?.minPointerWeight ?? DEFAULT_MIN_POINTER_WEIGHT, 0, 1),
      includeBuiltin: params.config?.includeBuiltin ?? true,
    };
  }

  // -------------------------------------------------------------------------
  // search() — The core composite search
  // -------------------------------------------------------------------------

  async search(
    query: string,
    opts?: { maxResults?: number; minScore?: number; sessionKey?: string },
  ): Promise<MemorySearchResult[]> {
    const maxResults = opts?.maxResults ?? 10;
    const minScore = opts?.minScore ?? 0;

    // 1. Search SIF pointer graph
    const sifResults = this.searchSifGraph(query, minScore);

    // 2. Search builtin backend (if available and enabled)
    let builtinResults: MemorySearchResult[] = [];
    if (this.builtin && this.config.includeBuiltin) {
      try {
        builtinResults = await this.builtin.search(query, {
          maxResults: maxResults + 5,  // Over-fetch for better merge
          minScore,
          sessionKey: opts?.sessionKey,
        });

        // Apply builtin weight multiplier
        builtinResults = builtinResults.map((r) => ({
          ...r,
          score: r.score * this.config.builtinWeight,
        }));
      } catch (err) {
        this.logger.warn(
          `SIF: builtin memory search failed, using SIF-only: ${err}`
        );
      }
    }

    // 3. Merge: interleave by score
    const merged = [...sifResults, ...builtinResults]
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);

    this.logger.debug?.(
      `SIF search: "${truncate(query, 40)}" → ` +
      `${sifResults.length} SIF + ${builtinResults.length} builtin = ` +
      `${merged.length} merged results`
    );

    return merged;
  }

  /**
   * Searches the SIF pointer graph and converts results to MemorySearchResult format.
   */
  private searchSifGraph(
    query: string,
    minScore: number,
  ): MemorySearchResult[] {
    if (this.graph.size() === 0) return [];

    const pointers = this.graph.search(query, this.config.maxSifResults + 3);

    return pointers
      .filter((p) => p.weight >= this.config.minPointerWeight)
      .slice(0, this.config.maxSifResults)
      .map((p) => {
        // Compute a normalized score (0–1) based on weight and tag matches
        const baseScore = computePointerRelevance(p, query);
        return pointerToSearchResult(p, baseScore, this.config.sifWeight);
      })
      .filter((r) => r.score >= minScore);
  }

  // -------------------------------------------------------------------------
  // readFile() — Delegate to builtin, handle SIF virtual paths
  // -------------------------------------------------------------------------

  async readFile(params: {
    relPath: string;
    from?: number;
    lines?: number;
  }): Promise<{ text: string; path: string }> {
    const relPath = params.relPath.trim();

    // Handle SIF virtual paths: sif://pointers/{type}/{id}
    if (relPath.startsWith(SIF_PATH_PREFIX)) {
      return this.readSifPointer(relPath);
    }

    // Delegate to builtin
    if (this.builtin) {
      return this.builtin.readFile(params);
    }

    throw new Error("No memory backend available for file reading");
  }

  /**
   * Reads a SIF pointer as a virtual file.
   * Path format: sif://pointers/{type}/{id}
   */
  private readSifPointer(virtualPath: string): { text: string; path: string } {
    const suffix = virtualPath.slice(SIF_PATH_PREFIX.length);
    const parts = suffix.split("/");
    const pointerId = parts[parts.length - 1];

    if (!pointerId) {
      return { text: "Pointer not found", path: virtualPath };
    }

    const pointer = this.graph
      .getPointers()
      .find((p) => p.id === pointerId);

    if (!pointer) {
      return { text: `Pointer ${pointerId} not found in SIF graph`, path: virtualPath };
    }

    const text = [
      `# SIF Pointer: ${pointer.id}`,
      ``,
      `**Type:** ${pointer.type}`,
      `**Weight:** ${pointer.weight.toFixed(3)}`,
      `**Tags:** ${pointer.tags.join(", ") || "(none)"}`,
      `**Access Count:** ${pointer.accessCount}`,
      `**Last Accessed:** ${pointer.lastAccessed ?? "never"}`,
      `**Created:** ${pointer.lineage.timestamp}`,
      `**Source:** ${pointer.lineage.source}`,
      ``,
      `## Content`,
      ``,
      pointer.content,
    ].join("\n");

    return { text, path: virtualPath };
  }

  // -------------------------------------------------------------------------
  // status() — Composite status from both backends
  // -------------------------------------------------------------------------

  status(): MemoryProviderStatus {
    const graphStatus = this.graph.status();

    const builtinStatus = this.builtin?.status();

    return {
      backend: "builtin",  // Report as builtin for compatibility
      provider: builtinStatus?.provider ?? "sif",
      model: builtinStatus?.model,
      files: builtinStatus?.files ?? 0,
      chunks: builtinStatus?.chunks ?? 0,
      dirty: graphStatus.dirty || (builtinStatus?.dirty ?? false),
      workspaceDir: builtinStatus?.workspaceDir,
      dbPath: builtinStatus?.dbPath,
      sources: builtinStatus?.sources ?? ["memory"],
      cache: builtinStatus?.cache ?? { enabled: false },
      fts: builtinStatus?.fts ?? { enabled: false, available: false },
      vector: builtinStatus?.vector ?? { enabled: false },
      custom: {
        ...builtinStatus?.custom,
        sif: {
          enabled: true,
          version: "0.1.0",
          totalPointers: graphStatus.totalPointers,
          skills: graphStatus.skills,
          knowledge: graphStatus.knowledge,
          archetypes: graphStatus.archetypes,
          breakthroughs: graphStatus.breakthroughs,
          context: graphStatus.context,
          avgWeight: graphStatus.avgWeight,
          healthScore: graphStatus.healthScore,
          strongPointers: graphStatus.strongCount,
          decayedPointers: graphStatus.decayedCount,
          graphPath: graphStatus.graphPath,
          lastSync: graphStatus.lastSync,
          sifWeight: this.config.sifWeight,
          builtinWeight: this.config.builtinWeight,
        },
      },
    };
  }

  // -------------------------------------------------------------------------
  // sync() — Sync both SIF graph and builtin
  // -------------------------------------------------------------------------

  async sync(params?: {
    reason?: string;
    force?: boolean;
    progress?: (update: MemorySyncProgressUpdate) => void;
  }): Promise<void> {
    // Save SIF graph if dirty
    if (this.graph.isDirty()) {
      this.logger.info("SIF: syncing pointer graph");
      await this.graph.save();
    }

    // Delegate to builtin sync
    if (this.builtin?.sync) {
      await this.builtin.sync(params);
    }
  }

  // -------------------------------------------------------------------------
  // Probe methods — delegate to builtin
  // -------------------------------------------------------------------------

  async probeEmbeddingAvailability(): Promise<MemoryEmbeddingProbeResult> {
    if (this.builtin) {
      return this.builtin.probeEmbeddingAvailability();
    }
    // SIF doesn't use embeddings directly — it's tag/content search
    return {
      ok: false,
      error: "SIF memory uses pointer graph search, not embeddings",
    };
  }

  async probeVectorAvailability(): Promise<boolean> {
    if (this.builtin) {
      return this.builtin.probeVectorAvailability();
    }
    return false;
  }

  // -------------------------------------------------------------------------
  // close() — Cleanup both
  // -------------------------------------------------------------------------

  async close(): Promise<void> {
    if (this.graph.isDirty()) {
      await this.graph.save();
    }
    await this.builtin?.close?.();
  }
}

// ---------------------------------------------------------------------------
// Scoring Utilities
// ---------------------------------------------------------------------------

/**
 * Computes a base relevance score (0.0–1.0) for a pointer against a query.
 * This provides a normalized score independent of the graph's internal scoring.
 */
function computePointerRelevance(pointer: Pointer, query: string): number {
  const queryTerms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const contentLower = pointer.content.toLowerCase();
  const tagsLower = pointer.tags.map((t) => t.toLowerCase());

  let matches = 0;
  let totalTerms = queryTerms.length || 1;

  for (const term of queryTerms) {
    if (tagsLower.some((t) => t.includes(term))) {
      matches += 2;  // Tag match counts double
      totalTerms += 1;  // Adjust denominator for bonus
    }
    if (contentLower.includes(term)) {
      matches += 1;
    }
  }

  // Normalize to 0–1 range
  const rawScore = matches / (totalTerms * 2);
  return clamp(rawScore, 0, 1);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function truncate(s: string, len: number): string {
  return s.length > len ? s.slice(0, len) + "…" : s;
}
