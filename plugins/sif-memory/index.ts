/**
 * SIF Memory Plugin — Entry Point (Phase 2)
 *
 * Registers the Sovereign Intelligence Framework as an OpenClaw plugin:
 *   - Tools: sif_search, sif_add, sif_status, sif_decay
 *   - Hooks: prompt injection, learning extraction, session lifecycle
 *   - Memory Backend: SifMemoryManager (when memory.backend = "sif")
 *
 * Configuration in openclaw.yaml:
 *
 *   memory:
 *     backend: sif        # Activates SIF as the memory backend
 *     sif:
 *       graphPath: ~/.sif/pointer-graph.yaml
 *       sifWeight: 1.2     # Boost SIF results in merged search
 *       builtinWeight: 1.0  # Standard weight for file-based results
 *       maxResults: 5       # Max SIF pointers per search
 *       includeBuiltin: true # Also search builtin file/embedding index
 *
 * @see Amendment A35 — SIF-OpenClaw Integration
 */

import type {
  OpenClawPluginDefinition,
  OpenClawPluginApi,
} from "../../src/plugins/types.js";
import { PointerGraph } from "./pointer-graph.js";
import { createSifTools } from "./tools.js";
import { registerSifHooks } from "./hooks.js";

// ---------------------------------------------------------------------------
// Graph Path Resolution
// ---------------------------------------------------------------------------

function resolveGraphPath(api: OpenClawPluginApi): string {
  // 1. Plugin config
  const pluginConfig = api.pluginConfig as Record<string, unknown> | undefined;
  if (pluginConfig?.graphPath && typeof pluginConfig.graphPath === "string") {
    return pluginConfig.graphPath;
  }

  // 2. SIF memory backend config
  const sifConfig = (api.config as any)?.memory?.sif;
  if (sifConfig?.graphPath && typeof sifConfig.graphPath === "string") {
    return sifConfig.graphPath;
  }

  // 3. Environment variable
  const envPath = process.env.SIF_GRAPH_PATH;
  if (envPath) return envPath;

  // 4. Default: ~/.sif/pointer-graph.yaml
  const home = process.env.HOME || process.env.USERPROFILE || ".";
  return `${home}/.sif/pointer-graph.yaml`;
}

// ---------------------------------------------------------------------------
// Plugin Definition
// ---------------------------------------------------------------------------

const sifMemoryPlugin: OpenClawPluginDefinition = {
  id: "sif-memory",
  name: "SIF Memory",
  description:
    "Sovereign Intelligence Framework — portable pointer graph memory " +
    "that persists skills, knowledge, archetypes, and breakthroughs across sessions. " +
    "Phase 2: Deep memory integration as MemorySearchManager backend.",
  version: "0.2.0",
  kind: "memory",

  async register(api: OpenClawPluginApi) {
    const logger = api.logger;
    const graphPath = resolveGraphPath(api);
    const isSifBackend = (api.config as any)?.memory?.backend === "sif";

    logger.info(
      `SIF Memory v0.2.0 initializing — ` +
      `graph: ${graphPath}, ` +
      `backend mode: ${isSifBackend ? "SIF (deep integration)" : "plugin-only (tools + hooks)"}`
    );

    // Initialize the pointer graph
    const graph = new PointerGraph(graphPath, logger);

    try {
      await graph.load();
      logger.info(
        `SIF: loaded ${graph.size()} pointers ` +
        `(${graph.status().skills}s/${graph.status().knowledge}k/` +
        `${graph.status().archetypes}a/${graph.status().breakthroughs}b)`
      );
    } catch (err) {
      logger.warn(`SIF: failed to load graph, starting fresh: ${err}`);
    }

    // Register tools (always available regardless of backend mode)
    const tools = createSifTools(graph);
    for (const tool of tools) {
      api.registerTool(tool);
    }

    // Register lifecycle hooks
    registerSifHooks(api, graph);

    // Register service for graceful shutdown
    api.registerService({
      id: "sif-memory-persistence",
      async start(ctx) {
        ctx.logger.info("SIF persistence service started");
      },
      async stop(ctx) {
        if (graph.isDirty()) {
          ctx.logger.info("SIF: saving pointer graph on shutdown");
          await graph.save();
        }
      },
    });

    if (isSifBackend) {
      logger.info(
        "SIF: running as memory backend — search results will include " +
        "pointer graph intelligence alongside file-based chunks"
      );
    }
  },
};

export default sifMemoryPlugin;
