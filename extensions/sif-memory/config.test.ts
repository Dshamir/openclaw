import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveConfig, resolveGraphPath } from "./config.js";

describe("resolveGraphPath", () => {
  const originalEnv = process.env.SIF_GRAPH_PATH;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.SIF_GRAPH_PATH;
    } else {
      process.env.SIF_GRAPH_PATH = originalEnv;
    }
  });

  it("returns config path when provided", () => {
    const result = resolveGraphPath("/custom/path/graph.json");
    expect(result).toBe("/custom/path/graph.json");
  });

  it("returns env var path when set", () => {
    process.env.SIF_GRAPH_PATH = "/env/path/graph.json";
    const result = resolveGraphPath();
    expect(result).toBe("/env/path/graph.json");
  });

  it("returns default path when nothing configured", () => {
    delete process.env.SIF_GRAPH_PATH;
    const result = resolveGraphPath();
    expect(result).toBe(path.join(os.homedir(), ".openclaw", "sif", "pointer-graph.json"));
  });

  it("config path takes priority over env var", () => {
    process.env.SIF_GRAPH_PATH = "/env/path.json";
    const result = resolveGraphPath("/config/path.json");
    expect(result).toBe("/config/path.json");
  });
});

describe("resolveConfig", () => {
  it("returns defaults when no config provided", () => {
    const config = resolveConfig();
    expect(config.maxContextPointers).toBe(8);
    expect(config.minContextWeight).toBe(0.2);
    expect(config.decayHalfLifeDays).toBe(30);
    expect(config.graphPath).toBeUndefined();
  });

  it("merges partial overrides with defaults", () => {
    const config = resolveConfig({ maxContextPointers: 12 });
    expect(config.maxContextPointers).toBe(12);
    expect(config.minContextWeight).toBe(0.2);
    expect(config.decayHalfLifeDays).toBe(30);
  });

  it("passes through graphPath", () => {
    const config = resolveConfig({ graphPath: "/my/graph.json" });
    expect(config.graphPath).toBe("/my/graph.json");
  });
});
