import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { resolveConfig, resolveGraphPath } from "./config.js";
import { registerSifHooks } from "./hooks.js";
import { PointerGraph } from "./pointer-graph.js";
import { createSifTools } from "./tools.js";
import type { SifConfig } from "./types.js";

const sifMemoryPlugin = {
  id: "sif-memory",
  name: "SIF Memory",
  description:
    "Sovereign Intelligence Framework — persistent pointer-graph memory with Hebbian reinforcement",
  kind: "memory" as const,

  async register(api: OpenClawPluginApi) {
    const rawConfig = (api.pluginConfig ?? {}) as Partial<SifConfig>;
    const config = resolveConfig(rawConfig);
    const graphPath = resolveGraphPath(config.graphPath);

    const graph = new PointerGraph(graphPath, config.decayHalfLifeDays);

    try {
      await graph.load();
      api.logger.info(`sif-memory: loaded graph from ${graphPath} (${graph.size()} pointers)`);
    } catch (err) {
      api.logger.warn(`sif-memory: failed to load graph, starting fresh: ${String(err)}`);
    }

    // Register tools
    const tools = createSifTools(graph);
    for (const tool of tools) {
      api.registerTool(tool, { name: tool.name });
    }

    // Register hooks
    registerSifHooks(api, graph, config);

    // Register CLI command
    api.registerCli(
      ({ program }) => {
        const sif = program.command("sif").description("SIF pointer-graph memory commands");

        sif
          .command("status")
          .description("Show pointer graph status")
          .action(() => {
            const status = graph.status();
            console.log(`Pointers: ${status.totalPointers}`);
            console.log(`Avg weight: ${status.averageWeight.toFixed(3)}`);
            for (const [type, count] of Object.entries(status.byType)) {
              if (count > 0) {
                console.log(`  ${type}: ${count}`);
              }
            }
          });

        sif
          .command("search")
          .description("Search the pointer graph")
          .argument("<query>", "Search query")
          .option("--limit <n>", "Max results", "8")
          .action((query, opts) => {
            const results = graph.search(query, parseInt(opts.limit, 10));
            if (results.length === 0) {
              console.log("No matches.");
              return;
            }
            for (const r of results) {
              console.log(
                `[${r.pointer.type}] w=${r.pointer.weight.toFixed(2)} ${r.pointer.content}`,
              );
            }
          });
      },
      { commands: ["sif"] },
    );

    // Register service for lifecycle
    api.registerService({
      id: "sif-memory",
      start: () => {
        api.logger.info(
          `sif-memory: service started (${graph.size()} pointers, path: ${graphPath})`,
        );
      },
      stop: async () => {
        if (graph.isDirty()) {
          await graph.save();
          api.logger.info("sif-memory: saved dirty graph on stop");
        }
      },
    });
  },
};

export default sifMemoryPlugin;
