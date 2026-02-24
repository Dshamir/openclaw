import type { SessionSendPolicyConfig } from "./types.base.js";

export type MemoryBackend = "builtin" | "qmd" | "sif";
export type MemoryCitationsMode = "auto" | "on" | "off";
export type MemoryQmdSearchMode = "query" | "search" | "vsearch";

export type MemorySifConfig = {
  graphPath?: string;
  maxContextPointers?: number;
  minContextWeight?: number;
  decayHalfLifeDays?: number;
};

export type MemoryConfig = {
  backend?: MemoryBackend;
  citations?: MemoryCitationsMode;
  qmd?: MemoryQmdConfig;
  sif?: MemorySifConfig;
};

export type MemoryQmdConfig = {
  command?: string;
  mcporter?: MemoryQmdMcporterConfig;
  searchMode?: MemoryQmdSearchMode;
  includeDefaultMemory?: boolean;
  paths?: MemoryQmdIndexPath[];
  sessions?: MemoryQmdSessionConfig;
  update?: MemoryQmdUpdateConfig;
  limits?: MemoryQmdLimitsConfig;
  scope?: SessionSendPolicyConfig;
};

export type MemoryQmdMcporterConfig = {
  /**
   * Route QMD searches through mcporter (MCP runtime) instead of spawning `qmd` per query.
   * Requires:
   * - `mcporter` installed and on PATH
   * - A configured mcporter server that runs `qmd mcp` with `lifecycle: keep-alive`
   */
  enabled?: boolean;
  /** mcporter server name (defaults to "qmd") */
  serverName?: string;
  /** Start the mcporter daemon automatically (defaults to true when enabled). */
  startDaemon?: boolean;
};

export type MemoryQmdIndexPath = {
  path: string;
  name?: string;
  pattern?: string;
};

export type MemoryQmdSessionConfig = {
  enabled?: boolean;
  exportDir?: string;
  retentionDays?: number;
};

export type MemoryQmdUpdateConfig = {
  interval?: string;
  debounceMs?: number;
  onBoot?: boolean;
  waitForBootSync?: boolean;
  embedInterval?: string;
  commandTimeoutMs?: number;
  updateTimeoutMs?: number;
  embedTimeoutMs?: number;
};

export type MemoryQmdLimitsConfig = {
  maxResults?: number;
  maxSnippetChars?: number;
  maxInjectedChars?: number;
  timeoutMs?: number;
};

/**
 * SIF (Sovereign Intelligence Framework) memory backend configuration.
 *
 * When memory.backend = "sif", OpenClaw uses a composite memory manager
 * that searches both the SIF pointer graph and the builtin file/embedding
 * index, merging results with configurable weighting.
 *
 * @see Amendment A35 Phase 2 — Deep Memory Integration
 */
export type MemorySifConfig = {
  /** Path to the SIF pointer graph file (default: ~/.sif/pointer-graph.yaml) */
  graphPath?: string;
  /**
   * Weight multiplier for SIF pointer results when merging with builtin results.
   * Higher values prioritize SIF intelligence over file-based search.
   * Range: 0.0–2.0. Default: 1.2
   */
  sifWeight?: number;
  /**
   * Weight multiplier for builtin (file/embedding) results.
   * Range: 0.0–2.0. Default: 1.0
   */
  builtinWeight?: number;
  /** Maximum SIF results per search query (default: 5) */
  maxResults?: number;
  /** Minimum pointer weight to include in results (default: 0.15) */
  minPointerWeight?: number;
  /**
   * Whether to include the builtin memory backend alongside SIF.
   * When false, only SIF pointer graph results are returned.
   * Default: true
   */
  includeBuiltin?: boolean;
};
