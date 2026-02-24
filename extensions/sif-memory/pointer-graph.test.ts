import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PointerGraph } from "./pointer-graph.js";
import type { PointerGraphData } from "./types.js";

let tmpDir: string;
let graphPath: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sif-test-"));
  graphPath = path.join(tmpDir, "graph.json");
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("PointerGraph.load", () => {
  it("starts empty when file does not exist", async () => {
    const graph = new PointerGraph(graphPath, 30);
    await graph.load();
    expect(graph.size()).toBe(0);
    expect(graph.isDirty()).toBe(false);
  });

  it("loads valid JSON", async () => {
    const data: PointerGraphData = {
      version: 1,
      pointers: [
        {
          id: "test-1",
          type: "knowledge",
          content: "TypeScript is great",
          tags: ["typescript"],
          weight: 0.8,
          accessCount: 3,
          createdAt: Date.now(),
          lastAccessedAt: Date.now(),
        },
      ],
      lastDecayAt: Date.now(),
    };
    await fs.writeFile(graphPath, JSON.stringify(data), "utf-8");

    const graph = new PointerGraph(graphPath, 30);
    await graph.load();
    expect(graph.size()).toBe(1);
    expect(graph.getById("test-1")).toBeDefined();
    expect(graph.getById("test-1")!.content).toBe("TypeScript is great");
  });

  it("handles corrupt JSON gracefully", async () => {
    await fs.writeFile(graphPath, "not valid json{{{", "utf-8");

    const graph = new PointerGraph(graphPath, 30);
    await graph.load();
    expect(graph.size()).toBe(0);
    expect(graph.isDirty()).toBe(true);
  });
});

describe("PointerGraph.save", () => {
  it("writes atomically via temp file", async () => {
    const graph = new PointerGraph(graphPath, 30);
    await graph.load();
    graph.add({ type: "knowledge", content: "Test content", tags: ["test"] });
    await graph.save();

    const raw = await fs.readFile(graphPath, "utf-8");
    const data = JSON.parse(raw) as PointerGraphData;
    expect(data.version).toBe(1);
    expect(data.pointers).toHaveLength(1);
    expect(data.pointers[0].content).toBe("Test content");
  });

  it("skips write when not dirty", async () => {
    const graph = new PointerGraph(graphPath, 30);
    await graph.load();
    await graph.save();

    // File should not exist since there was nothing to write
    await expect(fs.access(graphPath)).rejects.toThrow();
  });

  it("clears dirty flag after save", async () => {
    const graph = new PointerGraph(graphPath, 30);
    await graph.load();
    graph.add({ type: "skill", content: "Pattern matching", tags: [] });
    expect(graph.isDirty()).toBe(true);
    await graph.save();
    expect(graph.isDirty()).toBe(false);
  });
});

describe("PointerGraph.add", () => {
  it("creates a pointer with UUID", async () => {
    const graph = new PointerGraph(graphPath, 30);
    await graph.load();
    const pointer = graph.add({
      type: "knowledge",
      content: "Testing is important",
      tags: ["testing"],
      weight: 0.7,
    });
    expect(pointer).not.toBeNull();
    expect(pointer!.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(pointer!.type).toBe("knowledge");
    expect(pointer!.weight).toBe(0.7);
    expect(pointer!.accessCount).toBe(0);
    expect(graph.size()).toBe(1);
  });

  it("deduplicates similar content of same type", async () => {
    const graph = new PointerGraph(graphPath, 30);
    await graph.load();

    const first = graph.add({
      type: "knowledge",
      content: "TypeScript is a typed superset of JavaScript",
      tags: ["typescript"],
    });
    expect(first).not.toBeNull();

    // Very similar content
    const second = graph.add({
      type: "knowledge",
      content: "TypeScript is a typed superset of JavaScript language",
      tags: ["typescript"],
    });
    expect(second).toBeNull();
    expect(graph.size()).toBe(1);
  });

  it("allows similar content of different types", async () => {
    const graph = new PointerGraph(graphPath, 30);
    await graph.load();

    graph.add({ type: "knowledge", content: "Async patterns in TypeScript", tags: [] });
    const second = graph.add({ type: "skill", content: "Async patterns in TypeScript", tags: [] });
    expect(second).not.toBeNull();
    expect(graph.size()).toBe(2);
  });

  it("clamps weight to [0, 1]", async () => {
    const graph = new PointerGraph(graphPath, 30);
    await graph.load();

    const high = graph.add({ type: "knowledge", content: "High weight", tags: [], weight: 5 });
    expect(high!.weight).toBe(1);

    const low = graph.add({ type: "knowledge", content: "Low weight", tags: [], weight: -1 });
    expect(low!.weight).toBe(0);
  });

  it("lowercases tags", async () => {
    const graph = new PointerGraph(graphPath, 30);
    await graph.load();

    const pointer = graph.add({
      type: "knowledge",
      content: "Case test",
      tags: ["TypeScript", "API"],
    });
    expect(pointer!.tags).toEqual(["typescript", "api"]);
  });
});

describe("PointerGraph.search", () => {
  it("finds by content terms", async () => {
    const graph = new PointerGraph(graphPath, 30);
    await graph.load();

    graph.add({ type: "knowledge", content: "TypeScript generics are powerful", tags: [] });
    graph.add({ type: "skill", content: "React hooks for state management", tags: [] });

    const results = graph.search("TypeScript generics");
    expect(results).toHaveLength(1);
    expect(results[0].pointer.content).toContain("TypeScript generics");
  });

  it("finds by tags", async () => {
    const graph = new PointerGraph(graphPath, 30);
    await graph.load();

    graph.add({
      type: "knowledge",
      content: "Async await patterns",
      tags: ["typescript", "async"],
    });

    const results = graph.search("typescript");
    expect(results).toHaveLength(1);
  });

  it("returns empty for no matches", async () => {
    const graph = new PointerGraph(graphPath, 30);
    await graph.load();

    graph.add({ type: "knowledge", content: "Python decorators", tags: ["python"] });

    const results = graph.search("rust borrow checker");
    expect(results).toHaveLength(0);
  });

  it("respects maxResults", async () => {
    const graph = new PointerGraph(graphPath, 30);
    await graph.load();

    // Use very distinct content to avoid dedup
    const topics = [
      "Generics enable type-safe abstractions",
      "Decorators add metadata to classes",
      "Enums represent named constants",
      "Interfaces define structural contracts",
      "Namespaces organize code modules",
      "Type guards narrow union types",
      "Mapped types transform properties",
      "Conditional types branch on constraints",
      "Template literal types build string patterns",
      "Intersection types combine multiple shapes",
    ];
    for (const topic of topics) {
      graph.add({ type: "knowledge", content: topic, tags: ["typescript"] });
    }
    expect(graph.size()).toBe(10);

    const results = graph.search("typescript", 3);
    expect(results).toHaveLength(3);
  });

  it("ranks higher-weight pointers first", async () => {
    const graph = new PointerGraph(graphPath, 30);
    await graph.load();

    graph.add({
      type: "knowledge",
      content: "Low weight details about functional programming paradigms",
      tags: ["programming"],
      weight: 0.1,
    });
    graph.add({
      type: "knowledge",
      content: "High weight details about functional programming abstractions",
      tags: ["programming"],
      weight: 0.9,
    });

    const results = graph.search("functional programming");
    expect(results).toHaveLength(2);
    expect(results[0].pointer.content).toContain("High weight");
  });
});

describe("PointerGraph.reinforce", () => {
  it("increases weight and access count", async () => {
    const graph = new PointerGraph(graphPath, 30);
    await graph.load();

    const pointer = graph.add({
      type: "knowledge",
      content: "Reinforce test",
      tags: [],
      weight: 0.5,
    })!;

    const success = graph.reinforce(pointer.id, 0.1);
    expect(success).toBe(true);

    const updated = graph.getById(pointer.id)!;
    expect(updated.weight).toBeCloseTo(0.6, 2);
    expect(updated.accessCount).toBe(1);
  });

  it("caps boost at 0.15", async () => {
    const graph = new PointerGraph(graphPath, 30);
    await graph.load();

    const pointer = graph.add({
      type: "knowledge",
      content: "Cap test",
      tags: [],
      weight: 0.5,
    })!;

    graph.reinforce(pointer.id, 0.5);
    const updated = graph.getById(pointer.id)!;
    expect(updated.weight).toBeCloseTo(0.65, 2);
  });

  it("returns false for nonexistent pointer", async () => {
    const graph = new PointerGraph(graphPath, 30);
    await graph.load();

    const success = graph.reinforce("nonexistent-id", 0.1);
    expect(success).toBe(false);
  });
});

describe("PointerGraph.remove", () => {
  it("removes existing pointer", async () => {
    const graph = new PointerGraph(graphPath, 30);
    await graph.load();

    const pointer = graph.add({ type: "knowledge", content: "To be removed", tags: [] })!;
    expect(graph.size()).toBe(1);

    const removed = graph.remove(pointer.id);
    expect(removed).toBe(true);
    expect(graph.size()).toBe(0);
    expect(graph.getById(pointer.id)).toBeUndefined();
  });

  it("returns false for nonexistent pointer", async () => {
    const graph = new PointerGraph(graphPath, 30);
    await graph.load();

    const removed = graph.remove("nonexistent");
    expect(removed).toBe(false);
  });
});

describe("PointerGraph.getByType", () => {
  it("filters by type", async () => {
    const graph = new PointerGraph(graphPath, 30);
    await graph.load();

    graph.add({
      type: "knowledge",
      content: "TypeScript generics enable type-safe abstractions",
      tags: [],
    });
    graph.add({ type: "skill", content: "Pattern matching with switch expressions", tags: [] });
    graph.add({
      type: "knowledge",
      content: "React hooks manage component lifecycle state",
      tags: [],
    });

    expect(graph.getByType("knowledge")).toHaveLength(2);
    expect(graph.getByType("skill")).toHaveLength(1);
    expect(graph.getByType("breakthrough")).toHaveLength(0);
  });
});

describe("PointerGraph.status", () => {
  it("returns correct counts and averages", async () => {
    const graph = new PointerGraph(graphPath, 30);
    await graph.load();

    graph.add({ type: "knowledge", content: "K1", tags: [], weight: 0.4 });
    graph.add({ type: "knowledge", content: "K2", tags: [], weight: 0.6 });
    graph.add({ type: "skill", content: "S1", tags: [], weight: 0.8 });

    const status = graph.status();
    expect(status.totalPointers).toBe(3);
    expect(status.byType.knowledge).toBe(2);
    expect(status.byType.skill).toBe(1);
    expect(status.byType.archetype).toBe(0);
    expect(status.averageWeight).toBeCloseTo(0.6, 2);
    expect(status.oldestPointer).toBeDefined();
    expect(status.newestPointer).toBeDefined();
  });

  it("returns zeros for empty graph", async () => {
    const graph = new PointerGraph(graphPath, 30);
    await graph.load();

    const status = graph.status();
    expect(status.totalPointers).toBe(0);
    expect(status.averageWeight).toBe(0);
    expect(status.oldestPointer).toBeNull();
    expect(status.newestPointer).toBeNull();
  });
});

describe("PointerGraph round-trip", () => {
  it("persists and reloads graph", async () => {
    const graph1 = new PointerGraph(graphPath, 30);
    await graph1.load();

    graph1.add({ type: "knowledge", content: "Persistent data", tags: ["test"] });
    graph1.add({ type: "skill", content: "Skill data", tags: ["test"], weight: 0.9 });
    await graph1.save();

    const graph2 = new PointerGraph(graphPath, 30);
    await graph2.load();
    expect(graph2.size()).toBe(2);
    expect(graph2.getByType("knowledge")).toHaveLength(1);
    expect(graph2.getByType("skill")).toHaveLength(1);
    expect(graph2.getByType("skill")[0].content).toBe("Skill data");
  });
});
