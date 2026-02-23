/**
 * sif-memory — OpenClaw Plugin
 *
 * Sovereign Intelligence Framework beachhead plugin (A35 Phase 1).
 * Integrates SIF's portable pointer graph with OpenClaw's plugin system.
 *
 * Architecture:
 *   - before_prompt_build → injects relevant pointer context
 *   - llm_output → extracts learning signals for the pointer graph
 *   - session_start/end → lifecycle tracking
 *   - before_compaction → archives sessions for cognitive archaeology
 *   - Custom tools: sif_recall, sif_learn, sif_reinforce, sif_status
 *   - Custom command: /sif
 *
 * @see https://github.com/Dshamir/sif-knowledge-base
 */

import type {
  OpenClawPluginDefinition,
  OpenClawPluginApi,
} from "../../src/plugins/types.js";

import { PointerGraph } from "./pointer-graph.js";
import { createSifTools } from "./tools.js";
import { registerSifHooks } from "./hooks.js";

const SIF_PLUGIN_ID = "sif-memory";
const SIF_PLUGIN_VERSION = "0.1.0";

const plugin: OpenClawPluginDefinition = {
  id: SIF_PLUGIN_ID,
  name: "SIF Memory",
  description:
    "Sovereign Intelligence Framework — portable, provider-agnostic intelligence layer",
  version: SIF_PLUGIN_VERSION,
  kind: "memory",

  async register(api: OpenClawPluginApi) {
    const graphPath = resolveGraphPath(api);
    const graph = new PointerGraph(graphPath, api.logger);

    api.logger.info(`SIF Memory v${SIF_PLUGIN_VERSION} — loading pointer graph from ${graphPath}`);

    await graph.load();

    api.logger.info(
      `SIF pointer graph loaded: ${graph.size()} pointers, ` +
      `${graph.typeCount("skill")} skills, ${graph.typeCount("knowledge")} knowledge, ` +
      `${graph.typeCount("archetype")} archetypes, ${graph.typeCount("breakthrough")} breakthroughs`
    );

    // Register agent tools (sif_recall, sif_learn, sif_reinforce, sif_status)
    const tools = createSifTools(graph, api.logger);
    for (const tool of tools) {
      api.registerTool(tool, { name: tool.name });
    }

    // Register lifecycle hooks
    registerSifHooks(api, graph);

    // Register /sif command
    api.registerCommand({
      name: "sif",
      description: "Show SIF intelligence layer status",
      acceptsArgs: true,
      requireAuth: false,
      handler: (ctx) => {
        const status = graph.status();
        const subcommand = ctx.args?.trim();

        if (subcommand === "health") {
          return {
            text: formatHealthReport(status),
          };
        }

        return {
          text: formatStatusSummary(status),
        };
      },
    });
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveGraphPath(api: OpenClawPluginApi): string {
  // Priority: plugin config > env var > default
  const fromConfig = api.pluginConfig?.graphPath as string | undefined;
  if (fromConfig) return api.resolvePath(fromConfig);

  const fromEnv = process.env.SIF_GRAPH_PATH;
  if (fromEnv) return fromEnv;

  // Default: ~/.sif/pointer-graph.yaml
  const home = process.env.HOME || process.env.USERPROFILE || ".";
  return `${home}/.sif/pointer-graph.yaml`;
}

type GraphStatus = ReturnType<PointerGraph["status"]>;

function formatStatusSummary(s: GraphStatus): string {
  return [
    `🧠 **SIF Memory** v${SIF_PLUGIN_VERSION}`,
    ``,
    `📊 Pointers: ${s.totalPointers}`,
    `  Skills: ${s.skills} | Knowledge: ${s.knowledge}`,
    `  Archetypes: ${s.archetypes} | Breakthroughs: ${s.breakthroughs}`,
    `  Context: ${s.context}`,
    ``,
    `⚡ Health: ${s.healthScore >= 0.8 ? "Good" : s.healthScore >= 0.5 ? "Fair" : "Needs attention"}`,
    `📅 Last sync: ${s.lastSync || "never"}`,
    `🔒 Sovereignty: User-owned`,
  ].join("\n");
}

function formatHealthReport(s: GraphStatus): string {
  return [
    `🧠 **SIF Health Report**`,
    ``,
    `Total pointers: ${s.totalPointers}`,
    `Avg weight: ${s.avgWeight.toFixed(3)}`,
    `Health score: ${(s.healthScore * 100).toFixed(1)}%`,
    ``,
    `Type distribution:`,
    `  Skills:         ${s.skills}`,
    `  Knowledge:      ${s.knowledge}`,
    `  Archetypes:     ${s.archetypes}`,
    `  Breakthroughs:  ${s.breakthroughs}`,
    `  Context:        ${s.context}`,
    ``,
    `Decayed pointers (weight < 0.3): ${s.decayedCount}`,
    `Strong pointers (weight > 0.7): ${s.strongCount}`,
    `Graph path: ${s.graphPath}`,
  ].join("\n");
}

export default plugin;
