import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PointerGraph } from "./pointer-graph.js";
import { SifSearchAdapter } from "./sif-memory-manager.js";

let tmpDir: string;
let graph: PointerGraph;
let adapter: SifSearchAdapter;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sif-adapter-test-"));
  graph = new PointerGraph(path.join(tmpDir, "graph.json"), 30);
  await graph.load();
  adapter = new SifSearchAdapter(graph, 8);
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("SifSearchAdapter.search", () => {
  it("returns MemorySearchResult format", () => {
    graph.add({
      type: "knowledge",
      content: "TypeScript is strongly typed",
      tags: ["typescript"],
    });

    const results = adapter.search("typescript");
    expect(results).toHaveLength(1);
    expect(results[0].path).toMatch(/^sif:\/\//);
    expect(results[0].source).toBe("memory");
    expect(results[0].snippet).toContain("TypeScript");
    expect(results[0].score).toBeGreaterThan(0);
  });

  it("returns empty for no matches", () => {
    const results = adapter.search("nonexistent");
    expect(results).toHaveLength(0);
  });

  it("respects minScore filter", () => {
    graph.add({
      type: "knowledge",
      content: "Vaguely related programming topic",
      tags: [],
      weight: 0.1,
    });

    const results = adapter.search("programming", { minScore: 0.9 });
    expect(results).toHaveLength(0);
  });
});

describe("SifSearchAdapter.readFile", () => {
  it("resolves sif:// paths", () => {
    const pointer = graph.add({
      type: "skill",
      content: "Use async/await for cleaner code",
      tags: ["async"],
    })!;

    const result = adapter.readFile({ relPath: `sif://${pointer.id}` });
    expect(result.text).toContain("async/await");
    expect(result.text).toContain("skill");
  });

  it("handles missing pointer", () => {
    const result = adapter.readFile({ relPath: "sif://nonexistent" });
    expect(result.text).toContain("not found");
  });
});

describe("SifSearchAdapter.status", () => {
  it("returns correct status shape", () => {
    graph.add({ type: "knowledge", content: "Test data", tags: [] });

    const status = adapter.status();
    expect(status.backend).toBe("sif");
    expect(status.provider).toBe("sif-pointer-graph");
    expect(status.files).toBe(1);
    expect(status.custom).toBeDefined();
  });
});
