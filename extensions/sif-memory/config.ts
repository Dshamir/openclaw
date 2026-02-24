import os from "node:os";
import path from "node:path";
import type { SifConfig } from "./types.js";

const DEFAULT_MAX_CONTEXT_POINTERS = 8;
const DEFAULT_MIN_CONTEXT_WEIGHT = 0.2;
const DEFAULT_DECAY_HALF_LIFE_DAYS = 30;

export function resolveGraphPath(configPath?: string): string {
  if (configPath) {
    return path.resolve(configPath);
  }
  const envPath = process.env.SIF_GRAPH_PATH;
  if (envPath) {
    return path.resolve(envPath);
  }
  return path.join(os.homedir(), ".openclaw", "sif", "pointer-graph.json");
}

export function resolveConfig(raw?: Partial<SifConfig>): SifConfig {
  return {
    graphPath: raw?.graphPath,
    maxContextPointers: raw?.maxContextPointers ?? DEFAULT_MAX_CONTEXT_POINTERS,
    minContextWeight: raw?.minContextWeight ?? DEFAULT_MIN_CONTEXT_WEIGHT,
    decayHalfLifeDays: raw?.decayHalfLifeDays ?? DEFAULT_DECAY_HALF_LIFE_DAYS,
  };
}
