/**
 * SIF Memory Plugin — Entry Point (Phase 3)
 *
 * Registers the Sovereign Intelligence Framework as an OpenClaw plugin
 * with full bidirectional learning loop:
 *
 *   READ PATH:  Pointer graph → search → context injection → LLM
 *   WRITE PATH:  LLM response → extraction → graph mutation → Hebbian update
 *
 * Components:
 *   - Tools: sif_search, sif_add, sif_status, sif_decay
 *   - Hooks: prompt injection, conversation tracking, extraction, heartbeat
 *   - Hebbian Engine: reinforce, decay, co-activate, consolidate
 *   - Intelligence Extractor: LLM-powered PIK taxonomy extraction
 *   - Learning Journal: append-only audit log of all mutations
 *   - Memory Backend: SifMemoryManager (when memory.backend = "sif")
 *
 * Configuration in openclaw.yaml:
 *
 *   memory:
 *     backend: sif
 *     sif:
 *       graphPath: ~/.sif/pointer-graph.yaml
 *       sifWeight: 1.2
 *       builtinWeight: 1.0
 *       maxResults: 5
 *       includeBuiltin: true
 *       hebbian:
 *         reinforceBoost: 0.12
 *         baseDecayRate: 0.02
 *         coActivationBoost: 0.06
 *       extraction:
 *         useLlmExtraction: true
 *         minConfidence: 0.5
 *         maxExtractions: 10
 *
 * @see Amendment A35 — SIF-OpenClaw Integration
 */

import type {
  OpenClawPluginDefinition,
  OpenClawPluginApi,
} from "../../src/plugins/types.js";
import { PointerGraph } from "./pointer-graph.js";
import { HebbianEngine, DEFAULT_HEBBIAN_CONFIG } from "./hebbian.js";
import { IntelligenceExtractor, DEFAULT_EXTRACTOR_CONFIG } from "./extractor.js";
import { createJournal } from "./learning-journal.js";
import { createSifTools } from "./tools.js";
import { registerSifHooks } from "./hooks.js";

// ---------------------------------------------------------------------------
// Graph Path Resolution
// ---------------------------------------------------------------------------

function resolveGraphPath(api: OpenClawPluginApi): string {
  const pluginConfig = api.pluginConfig as Record<string, unknown> | undefined;
  if (pluginConfig?.graphPath && typeof pluginConfig.graphPath === "string") {
    return pluginConfig.graphPath;
  }

  const sifConfig = (api.config as any)?.memory?.sif;
  if (sifConfig?.graphPath && typeof sifConfig.graphPath === "string") {
    return sifConfig.graphPath;
  }

  const envPath = process.env.SIF_GRAPH_PATH;
  if (envPath) return envPath;

  const home = process.env.HOME || process.env.USERPROFILE || ".";
  return `${home}/.sif/pointer-graph.yaml`;
}

// ---------------------------------------------------------------------------
// Config Resolution
// ---------------------------------------------------------------------------

function resolveHebbianConfig(api: OpenClawPluginApi): typeof DEFAULT_HEBBIAN_CONFIG {
  const sifConfig = (api.config as any)?.memory?.sif?.hebbian;
  if (!sifConfig) return { ...DEFAULT_HEBBIAN_CONFIG };

  return {
    ...DEFAULT_HEBBIAN_CONFIG,
    ...(sifConfig.reinforceBoost !== undefined && {
      reinforceBoost: sifConfig.reinforceBoost,
    }),
    ...(sifConfig.baseDecayRate !== undefined && {
      baseDecayRate: sifConfig.baseDecayRate,
    }),
    ...(sifConfig.coActivationBoost !== undefined && {
      coActivationBoost: sifConfig.coActivationBoost,
    }),
    ...(sifConfig.pruneThreshold !== undefined && {
      pruneThreshold: sifConfig.pruneThreshold,
    }),
    ...(sifConfig.mergeThreshold !== undefined && {
      mergeThreshold: sifConfig.mergeThreshold,
    }),
  };
}

function resolveExtractorConfig(api: OpenClawPluginApi): typeof DEFAULT_EXTRACTOR_CONFIG {
  const sifConfig = (api.config as any)?.memory?.sif?.extraction;
  if (!sifConfig) return { ...DEFAULT_EXTRACTOR_CONFIG };

  return {
    ...DEFAULT_EXTRACTOR_CONFIG,
    ...(sifConfig.useLlmExtraction !== undefined && {
      useLlmExtraction: sifConfig.useLlmExtraction,
    }),
    ...(sifConfig.minConfidence !== undefined && {
      minConfidence: sifConfig.minConfidence,
    }),
    ...(sifConfig.maxExtractions !== undefined && {
      maxExtractions: sifConfig.maxExtractions,
    }),
    ...(sifConfig.minTurns !== undefined && {
      minTurns: sifConfig.minTurns,
    }),
  };
}

// ---------------------------------------------------------------------------
// Plugin Definition
// ---------------------------------------------------------------------------

const sifMemoryPlugin: OpenClawPluginDefinition = {
  id: "sif-memory",
  name: "SIF Memory",
  description:
    "Sovereign Intelligence Framework — portable pointer graph memory " +
    "with Hebbian learning, LLM-powered extraction, and co-activation tracking. " +
    "Phase 3: Full bidirectional learning loop.",
  version: "0.3.0",
  kind: "memory",

  async register(api: OpenClawPluginApi) {
    const logger = api.logger;
    const graphPath = resolveGraphPath(api);
    const isSifBackend = (api.config as any)?.memory?.backend === "sif";

    logger.info(
      `SIF Memory v0.3.0 initializing — ` +
      `graph: ${graphPath}, ` +
      `backend mode: ${isSifBackend ? "SIF (deep integration)" : "plugin-only"}`
    );

    // -----------------------------------------------------------------------
    // Initialize components
    // -----------------------------------------------------------------------

    // 1. Pointer Graph
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

    // 2. Learning Journal (audit log)
    const journal = createJournal(graphPath);
    logger.info(`SIF: journal initialized at ${journal.getStats().journalPath}`);

    // 3. Hebbian Engine
    const hebbianConfig = resolveHebbianConfig(api);
    const hebbian = new HebbianEngine(hebbianConfig, journal);
    logger.info(
      `SIF: Hebbian engine initialized — ` +
      `boost: ${hebbianConfig.reinforceBoost}, ` +
      `decay: ${hebbianConfig.baseDecayRate}, ` +
      `co-activation: ${hebbianConfig.coActivationBoost}`
    );

    // 4. Intelligence Extractor
    const extractorConfig = resolveExtractorConfig(api);
    const extractor = new IntelligenceExtractor(logger, extractorConfig, journal);
    logger.info(
      `SIF: extractor initialized — ` +
      `LLM: ${extractorConfig.useLlmExtraction}, ` +
      `minConfidence: ${extractorConfig.minConfidence}, ` +
      `maxExtractions: ${extractorConfig.maxExtractions}`
    );

    // -----------------------------------------------------------------------
    // Register tools (always available)
    // -----------------------------------------------------------------------
    const tools = createSifTools(graph);
    for (const tool of tools) {
      api.registerTool(tool);
    }

    // -----------------------------------------------------------------------
    // Register lifecycle hooks (Phase 3 — full pipeline)
    // -----------------------------------------------------------------------
    registerSifHooks(api, graph, hebbian, extractor, journal);

    // -----------------------------------------------------------------------
    // Register service for graceful shutdown
    // -----------------------------------------------------------------------
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

    // -----------------------------------------------------------------------
    // Log Phase 3 status
    // -----------------------------------------------------------------------
    if (isSifBackend) {
      logger.info(
        "SIF: Phase 3 active — bidirectional learning loop enabled. " +
        "Conversations will be extracted → graph → Hebbian → consolidate."
      );
    }

    logger.info(
      `SIF Memory v0.3.0 ready — ` +
      `${graph.size()} pointers, ` +
      `health: ${(graph.status().healthScore * 100).toFixed(0)}%`
    );
  },
};

export default sifMemoryPlugin;
