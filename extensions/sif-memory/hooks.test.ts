import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerSifHooks } from "./hooks.js";
import { PointerGraph } from "./pointer-graph.js";
import type { SifConfig } from "./types.js";

let tmpDir: string;
let graph: PointerGraph;
let config: SifConfig;
let hooks: Map<string, Array<{ handler: (...args: unknown[]) => unknown; priority?: number }>>;

function createMockApi() {
  hooks = new Map();
  return {
    pluginConfig: {},
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    on(name: string, handler: (...args: unknown[]) => unknown, opts?: { priority?: number }) {
      if (!hooks.has(name)) {
        hooks.set(name, []);
      }
      hooks.get(name)!.push({ handler, priority: opts?.priority });
    },
    registerTool: vi.fn(),
    registerCli: vi.fn(),
    registerService: vi.fn(),
    resolvePath: (p: string) => p,
  };
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sif-hooks-test-"));
  graph = new PointerGraph(path.join(tmpDir, "graph.json"), 30);
  await graph.load();
  config = {
    maxContextPointers: 8,
    minContextWeight: 0.2,
    decayHalfLifeDays: 30,
  };
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("registerSifHooks", () => {
  it("registers hooks on the api", () => {
    const api = createMockApi();
    registerSifHooks(api as never, graph, config);
    expect(hooks.has("before_agent_start")).toBe(true);
    expect(hooks.has("agent_end")).toBe(true);
  });
});

describe("before_agent_start hook — context injection", () => {
  it("injects matching pointers as context", async () => {
    graph.add({
      type: "knowledge",
      content: "TypeScript generics provide type safety",
      tags: ["typescript"],
      weight: 0.8,
    });

    const api = createMockApi();
    registerSifHooks(api as never, graph, config);

    const beforeAgentHandlers = hooks.get("before_agent_start")!;
    // Find the one with priority 50 (context injection)
    const contextHandler = beforeAgentHandlers.find((h) => h.priority === 50);
    expect(contextHandler).toBeDefined();

    const result = await contextHandler!.handler({ prompt: "Tell me about TypeScript" });
    const typedResult = result as { prependContext?: string } | undefined;
    expect(typedResult?.prependContext).toBeDefined();
    expect(typedResult!.prependContext).toContain("<sif-context>");
    expect(typedResult!.prependContext).toContain("TypeScript generics");
  });

  it("returns nothing for short prompts", async () => {
    graph.add({
      type: "knowledge",
      content: "Some knowledge",
      tags: [],
      weight: 0.8,
    });

    const api = createMockApi();
    registerSifHooks(api as never, graph, config);

    const contextHandler = hooks.get("before_agent_start")!.find((h) => h.priority === 50)!;
    const result = await contextHandler.handler({ prompt: "hi" });
    expect(result).toBeUndefined();
  });

  it("filters out low-weight pointers", async () => {
    graph.add({
      type: "knowledge",
      content: "Very low weight TypeScript knowledge",
      tags: ["typescript"],
      weight: 0.05,
    });

    const api = createMockApi();
    registerSifHooks(api as never, graph, { ...config, minContextWeight: 0.2 });

    const contextHandler = hooks.get("before_agent_start")!.find((h) => h.priority === 50)!;
    const result = await contextHandler.handler({ prompt: "Tell me about TypeScript knowledge" });
    expect(result).toBeUndefined();
  });
});

describe("agent_end hook — learning extraction", () => {
  it("saves dirty graph at session end", async () => {
    graph.add({ type: "knowledge", content: "Existing content", tags: [] });

    const api = createMockApi();
    registerSifHooks(api as never, graph, config);

    expect(graph.isDirty()).toBe(true);

    const endHandler = hooks.get("agent_end")![0];
    await endHandler.handler({
      success: true,
      messages: [{ role: "user", content: "short" }],
    });

    // Graph should have been saved
    expect(graph.isDirty()).toBe(false);
  });

  it("skips failed sessions", async () => {
    const api = createMockApi();
    registerSifHooks(api as never, graph, config);

    const endHandler = hooks.get("agent_end")![0];
    await endHandler.handler({ success: false, messages: [] });

    // No error, no crash
    expect(graph.size()).toBe(0);
  });
});
