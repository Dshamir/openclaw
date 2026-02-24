import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HebbianEngine } from "./hebbian.js";
import { PointerGraph } from "./pointer-graph.js";
import type { Pointer, PointerType } from "./types.js";

let tmpDir: string;
let graphPath: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sif-hebbian-"));
  graphPath = path.join(tmpDir, "graph.json");
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function makePointer(overrides: Partial<Pointer> = {}): Pointer {
  return {
    id: "test-1",
    type: "knowledge",
    content: "Test pointer content for hebbian testing",
    tags: ["test"],
    weight: 0.5,
    accessCount: 0,
    createdAt: Date.now(),
    lastAccessedAt: Date.now(),
    ...overrides,
  };
}

describe("HebbianEngine.getDecayHalfLifeDays", () => {
  const engine = new HebbianEngine();

  it("returns correct half-life for each pointer type", () => {
    const expected: Record<PointerType, number> = {
      archetype: 60,
      breakthrough: 90,
      skill: 45,
      knowledge: 30,
      context: 14,
    };

    for (const [type, days] of Object.entries(expected)) {
      expect(engine.getDecayHalfLifeDays(type as PointerType)).toBe(days);
    }
  });

  it("breakthrough decays slowest, context decays fastest", () => {
    expect(engine.getDecayHalfLifeDays("breakthrough")).toBeGreaterThan(
      engine.getDecayHalfLifeDays("archetype"),
    );
    expect(engine.getDecayHalfLifeDays("context")).toBeLessThan(
      engine.getDecayHalfLifeDays("knowledge"),
    );
  });
});

describe("HebbianEngine.applyDecay", () => {
  const engine = new HebbianEngine();
  const MS_PER_DAY = 24 * 60 * 60 * 1000;

  it("does not decay a pointer accessed right now", () => {
    const now = Date.now();
    const pointer = makePointer({ lastAccessedAt: now, weight: 0.8 });
    const result = engine.applyDecay(pointer, now);
    expect(result).toBe(0.8);
  });

  it("halves weight after one half-life for knowledge (30d)", () => {
    const now = Date.now();
    const pointer = makePointer({
      type: "knowledge",
      lastAccessedAt: now - 30 * MS_PER_DAY,
      weight: 1.0,
    });
    const result = engine.applyDecay(pointer, now);
    expect(result).toBeCloseTo(0.5, 2);
  });

  it("applies different decay rates per type", () => {
    const now = Date.now();
    const age = 30 * MS_PER_DAY;

    const knowledge = makePointer({ type: "knowledge", lastAccessedAt: now - age, weight: 1.0 });
    const breakthrough = makePointer({
      type: "breakthrough",
      lastAccessedAt: now - age,
      weight: 1.0,
    });

    engine.applyDecay(knowledge, now);
    engine.applyDecay(breakthrough, now);

    // Breakthrough should retain more weight (90d half-life vs 30d)
    expect(breakthrough.weight).toBeGreaterThan(knowledge.weight);
  });

  it("never decays below 0.01", () => {
    const now = Date.now();
    const pointer = makePointer({
      type: "context",
      lastAccessedAt: now - 365 * MS_PER_DAY,
      weight: 0.1,
    });
    const result = engine.applyDecay(pointer, now);
    expect(result).toBeGreaterThanOrEqual(0.01);
  });

  it("respects consolidation floor for high-access pointers", () => {
    const now = Date.now();
    const pointer = makePointer({
      type: "context",
      lastAccessedAt: now - 365 * MS_PER_DAY,
      weight: 0.5,
      accessCount: 15,
    });
    const result = engine.applyDecay(pointer, now);
    expect(result).toBeGreaterThanOrEqual(0.15);
  });
});

describe("HebbianEngine.processCoActivation", () => {
  const engine = new HebbianEngine();

  it("boosts co-accessed pointers", async () => {
    const graph = new PointerGraph(graphPath, 30);
    await graph.load();

    const a = graph.add({
      type: "knowledge",
      content: "Pointer alpha for coactivation test",
      tags: [],
    })!;
    const b = graph.add({
      type: "skill",
      content: "Pointer beta for coactivation test",
      tags: [],
    })!;
    const origA = a.weight;
    const origB = b.weight;

    engine.processCoActivation([a.id, b.id], graph);

    expect(graph.getById(a.id)!.weight).toBeGreaterThan(origA);
    expect(graph.getById(b.id)!.weight).toBeGreaterThan(origB);
  });

  it("does nothing for a single pointer", async () => {
    const graph = new PointerGraph(graphPath, 30);
    await graph.load();

    const a = graph.add({
      type: "knowledge",
      content: "Solo pointer for testing isolation",
      tags: [],
    })!;
    const origWeight = a.weight;

    engine.processCoActivation([a.id], graph);
    expect(graph.getById(a.id)!.weight).toBe(origWeight);
  });

  it("skips nonexistent pointer IDs", async () => {
    const graph = new PointerGraph(graphPath, 30);
    await graph.load();

    const a = graph.add({
      type: "knowledge",
      content: "Real pointer for missing ID test",
      tags: [],
    })!;
    // Should not throw
    engine.processCoActivation([a.id, "nonexistent-id"], graph);
    // Single resolved pointer — no co-activation applied
    expect(graph.getById(a.id)!.accessCount).toBe(0);
  });
});

describe("HebbianEngine.consolidate", () => {
  const engine = new HebbianEngine();

  it("applies weight floor for high-access pointers", () => {
    const pointer = makePointer({ accessCount: 15, weight: 0.05 });
    const floor = engine.consolidate(pointer);
    expect(floor).toBe(0.15);
    expect(pointer.weight).toBe(0.15);
  });

  it("does not change weight above floor", () => {
    const pointer = makePointer({ accessCount: 15, weight: 0.8 });
    const floor = engine.consolidate(pointer);
    expect(floor).toBe(0.15);
    expect(pointer.weight).toBe(0.8);
  });

  it("returns 0 for low-access pointers", () => {
    const pointer = makePointer({ accessCount: 5, weight: 0.05 });
    const floor = engine.consolidate(pointer);
    expect(floor).toBe(0);
    expect(pointer.weight).toBe(0.05);
  });
});
