import { Type } from "@sinclair/typebox";
import { stringEnum } from "openclaw/plugin-sdk";
import type { PointerGraph } from "./pointer-graph.js";
import { POINTER_TYPES } from "./types.js";
import type { PointerType } from "./types.js";

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  details: Record<string, unknown>;
};

type SifTool = {
  name: string;
  label: string;
  description: string;
  parameters: ReturnType<typeof Type.Object>;
  execute: (toolCallId: string, params: Record<string, unknown>) => Promise<ToolResult>;
};

export function createSifTools(graph: PointerGraph): SifTool[] {
  return [
    createRecallTool(graph),
    createLearnTool(graph),
    createReinforceTool(graph),
    createStatusTool(graph),
  ];
}

function createRecallTool(graph: PointerGraph): SifTool {
  return {
    name: "sif_recall",
    label: "SIF Recall",
    description:
      "Search the SIF pointer graph for relevant knowledge, skills, archetypes, breakthroughs, or context. Use when you need prior knowledge or context from past interactions.",
    parameters: Type.Object({
      query: Type.String({ description: "Search query to match against pointer content and tags" }),
      maxResults: Type.Optional(
        Type.Number({ description: "Maximum results to return (default: 8)" }),
      ),
      type: Type.Optional(stringEnum(POINTER_TYPES, { description: "Filter by pointer type" })),
    }),
    async execute(_toolCallId, params) {
      const query = params.query as string;
      const maxResults = (params.maxResults as number | undefined) ?? 8;
      const typeFilter = params.type as PointerType | undefined;

      let results = graph.search(query, maxResults * 2);
      if (typeFilter) {
        results = results.filter((r) => r.pointer.type === typeFilter);
      }
      results = results.slice(0, maxResults);

      if (results.length === 0) {
        return {
          content: [{ type: "text", text: "No matching pointers found." }],
          details: { count: 0 },
        };
      }

      // Mark accessed pointers
      for (const r of results) {
        graph.reinforce(r.pointer.id, 0.02);
      }

      const text = results
        .map(
          (r, i) =>
            `${i + 1}. [${r.pointer.type}] (w=${r.pointer.weight.toFixed(2)}) ${r.pointer.content}` +
            (r.pointer.tags.length > 0 ? ` [${r.pointer.tags.join(", ")}]` : ""),
        )
        .join("\n");

      return {
        content: [{ type: "text", text: `Found ${results.length} pointers:\n\n${text}` }],
        details: {
          count: results.length,
          pointers: results.map((r) => ({
            id: r.pointer.id,
            type: r.pointer.type,
            weight: r.pointer.weight,
            score: r.score,
          })),
        },
      };
    },
  };
}

function createLearnTool(graph: PointerGraph): SifTool {
  return {
    name: "sif_learn",
    label: "SIF Learn",
    description:
      "Add a new pointer to the SIF knowledge graph. Use when you discover important knowledge, skills, patterns, or breakthroughs worth remembering across sessions.",
    parameters: Type.Object({
      type: stringEnum(POINTER_TYPES, {
        description: "Pointer type: knowledge, skill, archetype, breakthrough, or context",
      }),
      content: Type.String({ description: "The knowledge content to store" }),
      tags: Type.Optional(
        Type.Array(Type.String(), { description: "Tags for categorization and search" }),
      ),
      weight: Type.Optional(Type.Number({ description: "Initial weight 0-1 (default: 0.5)" })),
    }),
    async execute(_toolCallId, params) {
      const type = params.type as PointerType;
      const content = params.content as string;
      const tags = (params.tags as string[] | undefined) ?? [];
      const weight = params.weight as number | undefined;

      const pointer = graph.add({ type, content, tags, weight });
      if (!pointer) {
        return {
          content: [
            {
              type: "text",
              text: "Similar pointer already exists; reinforced existing instead.",
            },
          ],
          details: { action: "deduplicated" },
        };
      }

      return {
        content: [
          {
            type: "text",
            text: `Learned [${pointer.type}]: "${pointer.content.slice(0, 100)}${pointer.content.length > 100 ? "..." : ""}"`,
          },
        ],
        details: { action: "created", id: pointer.id, type: pointer.type },
      };
    },
  };
}

function createReinforceTool(graph: PointerGraph): SifTool {
  return {
    name: "sif_reinforce",
    label: "SIF Reinforce",
    description:
      "Strengthen an existing pointer in the SIF graph via Hebbian reinforcement. Use when a pointer proves useful or relevant in the current conversation.",
    parameters: Type.Object({
      id: Type.String({ description: "The pointer ID to reinforce" }),
      boost: Type.Optional(
        Type.Number({ description: "Reinforcement strength 0-0.15 (default: 0.1)" }),
      ),
    }),
    async execute(_toolCallId, params) {
      const id = params.id as string;
      const boost = (params.boost as number | undefined) ?? 0.1;

      const success = graph.reinforce(id, boost);
      if (!success) {
        return {
          content: [{ type: "text", text: `Pointer ${id} not found.` }],
          details: { action: "not_found", id },
        };
      }

      const pointer = graph.getById(id)!;
      return {
        content: [
          {
            type: "text",
            text: `Reinforced pointer ${id.slice(0, 8)}... (new weight: ${pointer.weight.toFixed(2)})`,
          },
        ],
        details: {
          action: "reinforced",
          id,
          newWeight: pointer.weight,
          accessCount: pointer.accessCount,
        },
      };
    },
  };
}

function createStatusTool(graph: PointerGraph): SifTool {
  return {
    name: "sif_status",
    label: "SIF Status",
    description:
      "Show the current status of the SIF pointer graph including counts, weights, and type distribution.",
    parameters: Type.Object({}),
    async execute() {
      const status = graph.status();
      const lines = [
        `Total pointers: ${status.totalPointers}`,
        `Average weight: ${status.averageWeight.toFixed(3)}`,
        "",
        "By type:",
        ...Object.entries(status.byType).map(([type, count]) => `  ${type}: ${count}`),
      ];

      if (status.oldestPointer) {
        lines.push("", `Oldest: ${new Date(status.oldestPointer).toISOString()}`);
      }
      if (status.newestPointer) {
        lines.push(`Newest: ${new Date(status.newestPointer).toISOString()}`);
      }

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        details: status,
      };
    },
  };
}
