/**
 * Thin adapter bridging the SIF PointerGraph extension to the core MemorySearchManager interface.
 * Lives in core (same pattern as qmd-manager.ts) and dynamically imports the extension.
 *
 * The extension import uses a runtime-resolved path to avoid pulling extension files
 * into the core rootDir during plugin-sdk DTS compilation.
 */
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ResolvedSifConfig } from "./backend-config.js";
import type {
  MemoryEmbeddingProbeResult,
  MemoryProviderStatus,
  MemorySearchManager,
  MemorySearchResult,
} from "./types.js";

// Structural type for the PointerGraph — avoids compile-time dependency on the extension
type SifPointerGraph = {
  load(): Promise<void>;
  save(): Promise<void>;
  search(
    query: string,
    maxResults?: number,
  ): Array<{
    pointer: { id: string; type: string; content: string; tags: string[]; weight: number };
    score: number;
  }>;
  getById(
    id: string,
  ): { type: string; content: string; tags: string[]; weight: number } | undefined;
  status(): { totalPointers: number; byType: Record<string, number>; averageWeight: number };
  isDirty(): boolean;
  size(): number;
};

export class SifMemoryManager implements MemorySearchManager {
  private graph: SifPointerGraph | null = null;

  private constructor(private readonly config: ResolvedSifConfig) {}

  static async create(config: ResolvedSifConfig): Promise<SifMemoryManager | null> {
    const manager = new SifMemoryManager(config);
    await manager.initialize();
    return manager;
  }

  private async initialize(): Promise<void> {
    const graphPath =
      this.config.graphPath ??
      process.env.SIF_GRAPH_PATH ??
      path.join(os.homedir(), ".openclaw", "sif", "pointer-graph.json");

    // Resolve the extension path at runtime to avoid rootDir issues in DTS compilation.
    // Walk up from src/memory/ to find the repo root, then into extensions/sif-memory/.
    const thisDir = path.dirname(fileURLToPath(import.meta.url));
    const extensionPath = path.resolve(
      thisDir,
      "..",
      "..",
      "extensions",
      "sif-memory",
      "pointer-graph.js",
    );

    let mod: { PointerGraph: new (filePath: string, decayHalfLifeDays: number) => SifPointerGraph };
    try {
      // Use createRequire for runtime resolution (avoids TypeScript tracing the import)
      const require = createRequire(import.meta.url);
      mod = require(extensionPath);
    } catch {
      // Fallback: try dynamic import with file:// URL
      mod = await import(/* @vite-ignore */ `file://${extensionPath}`);
    }

    this.graph = new mod.PointerGraph(graphPath, this.config.decayHalfLifeDays);
    await this.graph.load();
  }

  async search(
    query: string,
    opts?: { maxResults?: number; minScore?: number },
  ): Promise<MemorySearchResult[]> {
    if (!this.graph) {
      return [];
    }

    const maxResults = opts?.maxResults ?? this.config.maxContextPointers;
    const minScore = opts?.minScore ?? 0;
    const results = this.graph.search(query, maxResults);

    return results
      .filter((r) => r.score >= minScore)
      .map((r) => ({
        path: `sif://${r.pointer.id}`,
        startLine: 0,
        endLine: 0,
        score: r.score,
        snippet: `[${r.pointer.type}] ${r.pointer.content}`,
        source: "memory" as const,
      }));
  }

  async readFile(params: { relPath: string }): Promise<{ text: string; path: string }> {
    if (!this.graph) {
      return { text: "", path: params.relPath };
    }

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
    const graphStatus = this.graph?.status();
    return {
      backend: "sif",
      provider: "sif-pointer-graph",
      files: graphStatus?.totalPointers ?? 0,
      custom: graphStatus
        ? {
            byType: graphStatus.byType,
            averageWeight: graphStatus.averageWeight,
          }
        : undefined,
    };
  }

  async sync(): Promise<void> {
    if (this.graph?.isDirty()) {
      await this.graph.save();
    }
  }

  async probeEmbeddingAvailability(): Promise<MemoryEmbeddingProbeResult> {
    return { ok: true };
  }

  async probeVectorAvailability(): Promise<boolean> {
    return false;
  }

  async close(): Promise<void> {
    if (this.graph?.isDirty()) {
      await this.graph.save();
    }
  }
}
