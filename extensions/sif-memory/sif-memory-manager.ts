/**
 * SIF MemorySearchManager implementation.
 * Adapts the PointerGraph to the MemorySearchManager interface
 * for use when memory.backend = "sif".
 */
import type { PointerGraph } from "./pointer-graph.js";
import type { ScoredPointer } from "./types.js";

export type MemorySearchResult = {
  path: string;
  startLine: number;
  endLine: number;
  score: number;
  snippet: string;
  source: "memory";
  citation?: string;
};

export type MemoryProviderStatus = {
  backend: "sif";
  provider: string;
  files?: number;
  custom?: Record<string, unknown>;
};

export class SifSearchAdapter {
  constructor(
    private readonly graph: PointerGraph,
    private readonly maxContextPointers: number,
  ) {}

  search(query: string, opts?: { maxResults?: number; minScore?: number }): MemorySearchResult[] {
    const maxResults = opts?.maxResults ?? this.maxContextPointers;
    const minScore = opts?.minScore ?? 0;
    const results = this.graph.search(query, maxResults);

    return results
      .filter((r: ScoredPointer) => r.score >= minScore)
      .map((r: ScoredPointer) => ({
        path: `sif://${r.pointer.id}`,
        startLine: 0,
        endLine: 0,
        score: r.score,
        snippet: `[${r.pointer.type}] ${r.pointer.content}`,
        source: "memory" as const,
      }));
  }

  readFile(params: { relPath: string }): { text: string; path: string } {
    const id = params.relPath.replace(/^sif:\/\//, "");
    const pointer = this.graph.getById(id);
    if (!pointer) {
      return { text: `Pointer ${id} not found`, path: params.relPath };
    }
    return {
      text: `[${pointer.type}] ${pointer.content}\nTags: ${pointer.tags.join(", ") || "none"}\nWeight: ${pointer.weight.toFixed(3)}`,
      path: params.relPath,
    };
  }

  status(): MemoryProviderStatus {
    const graphStatus = this.graph.status();
    return {
      backend: "sif",
      provider: "sif-pointer-graph",
      files: graphStatus.totalPointers,
      custom: {
        byType: graphStatus.byType,
        averageWeight: graphStatus.averageWeight,
      },
    };
  }
}
