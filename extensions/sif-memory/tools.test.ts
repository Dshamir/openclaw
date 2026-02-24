import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PointerGraph } from "./pointer-graph.js";
import { createSifTools } from "./tools.js";

let tmpDir: string;
let graph: PointerGraph;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sif-tools-test-"));
  graph = new PointerGraph(path.join(tmpDir, "graph.json"), 30);
  await graph.load();
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("createSifTools", () => {
  it("creates four tools", () => {
    const tools = createSifTools(graph);
    expect(tools).toHaveLength(4);
  });

  it("has correct tool names", () => {
    const tools = createSifTools(graph);
    const names = tools.map((t) => t.name);
    expect(names).toContain("sif_recall");
    expect(names).toContain("sif_learn");
    expect(names).toContain("sif_reinforce");
    expect(names).toContain("sif_status");
  });

  it("all tools have required interface fields", () => {
    const tools = createSifTools(graph);
    for (const tool of tools) {
      expect(tool.name).toBeDefined();
      expect(tool.label).toBeDefined();
      expect(tool.description).toBeDefined();
      expect(tool.parameters).toBeDefined();
      expect(typeof tool.execute).toBe("function");
    }
  });

  it("tool schemas do not use anyOf/oneOf (no Type.Union)", () => {
    const tools = createSifTools(graph);
    for (const tool of tools) {
      const schema = JSON.stringify(tool.parameters);
      expect(schema).not.toContain('"anyOf"');
      expect(schema).not.toContain('"oneOf"');
      expect(schema).not.toContain('"allOf"');
    }
  });
});

describe("sif_learn tool", () => {
  it("creates a pointer", async () => {
    const tools = createSifTools(graph);
    const learn = tools.find((t) => t.name === "sif_learn")!;

    const result = await learn.execute("call-1", {
      type: "knowledge",
      content: "Testing is important for code quality",
      tags: ["testing"],
    });

    expect(result.content[0].text).toContain("Learned");
    expect(result.details.action).toBe("created");
    expect(graph.size()).toBe(1);
  });

  it("deduplicates similar content", async () => {
    const tools = createSifTools(graph);
    const learn = tools.find((t) => t.name === "sif_learn")!;

    await learn.execute("call-1", {
      type: "knowledge",
      content: "TypeScript generics are very powerful for type safety",
      tags: [],
    });

    const result = await learn.execute("call-2", {
      type: "knowledge",
      content: "TypeScript generics are very powerful for type safety indeed",
      tags: [],
    });

    expect(result.details.action).toBe("deduplicated");
    expect(graph.size()).toBe(1);
  });
});

describe("sif_recall tool", () => {
  it("returns empty when no matches", async () => {
    const tools = createSifTools(graph);
    const recall = tools.find((t) => t.name === "sif_recall")!;

    const result = await recall.execute("call-1", { query: "nonexistent topic" });
    expect(result.content[0].text).toContain("No matching");
    expect(result.details.count).toBe(0);
  });

  it("finds matching pointers", async () => {
    graph.add({ type: "knowledge", content: "Vitest is a fast test runner", tags: ["testing"] });

    const tools = createSifTools(graph);
    const recall = tools.find((t) => t.name === "sif_recall")!;

    const result = await recall.execute("call-1", { query: "test runner" });
    expect(result.details.count).toBeGreaterThan(0);
    expect(result.content[0].text).toContain("Vitest");
  });
});

describe("sif_reinforce tool", () => {
  it("reinforces existing pointer", async () => {
    const pointer = graph.add({
      type: "knowledge",
      content: "Reinforce target",
      tags: [],
      weight: 0.5,
    })!;

    const tools = createSifTools(graph);
    const reinforce = tools.find((t) => t.name === "sif_reinforce")!;

    const result = await reinforce.execute("call-1", { id: pointer.id, boost: 0.1 });
    expect(result.details.action).toBe("reinforced");
    expect(graph.getById(pointer.id)!.weight).toBeCloseTo(0.6, 2);
  });

  it("returns not_found for missing id", async () => {
    const tools = createSifTools(graph);
    const reinforce = tools.find((t) => t.name === "sif_reinforce")!;

    const result = await reinforce.execute("call-1", { id: "nonexistent" });
    expect(result.details.action).toBe("not_found");
  });
});

describe("sif_status tool", () => {
  it("returns status summary", async () => {
    graph.add({ type: "knowledge", content: "Info A", tags: [] });
    graph.add({ type: "skill", content: "Skill B", tags: [] });

    const tools = createSifTools(graph);
    const status = tools.find((t) => t.name === "sif_status")!;

    const result = await status.execute("call-1", {});
    expect(result.content[0].text).toContain("Total pointers: 2");
    expect(result.details).toHaveProperty("totalPointers", 2);
  });
});
