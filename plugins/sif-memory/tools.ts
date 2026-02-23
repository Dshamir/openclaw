/**
 * SIF Agent Tools
 *
 * Registers four tools with OpenClaw's agent system:
 *   - sif_recall:    Query the pointer graph for relevant context
 *   - sif_learn:     Store new insights/skills/patterns
 *   - sif_reinforce: Strengthen a pointer that proved useful
 *   - sif_status:    Check SIF intelligence layer health
 *
 * These tools follow OpenClaw's AnyAgentTool interface pattern
 * (TypeBox schema + handler function).
 */

import { Type } from "@sinclair/typebox";
import type { PointerGraph, PointerType } from "./pointer-graph.js";

type Logger = {
  info: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
  debug?: (msg: string) => void;
};

// ---------------------------------------------------------------------------
// Tool Definitions
// ---------------------------------------------------------------------------

export function createSifTools(graph: PointerGraph, logger: Logger) {
  return [
    createRecallTool(graph, logger),
    createLearnTool(graph, logger),
    createReinforceTool(graph, logger),
    createStatusTool(graph, logger),
  ];
}

// ---------------------------------------------------------------------------
// sif_recall — Query the pointer graph
// ---------------------------------------------------------------------------

function createRecallTool(graph: PointerGraph, logger: Logger) {
  return {
    name: "sif_recall",
    description:
      "Search the SIF pointer graph for relevant accumulated intelligence — " +
      "skills, knowledge, archetypes, breakthroughs, and context from past sessions. " +
      "Use this when the user references past work, preferences, or project context, " +
      "or when you need historical insight to inform your response.",
    inputSchema: Type.Object({
      query: Type.String({
        description:
          "Natural language search query. Include relevant keywords, " +
          "project names, or concept terms.",
      }),
      maxResults: Type.Optional(
        Type.Number({
          description: "Maximum number of pointers to return (default: 5, max: 20)",
          minimum: 1,
          maximum: 20,
        })
      ),
      types: Type.Optional(
        Type.Array(
          Type.Union([
            Type.Literal("knowledge"),
            Type.Literal("skill"),
            Type.Literal("archetype"),
            Type.Literal("breakthrough"),
            Type.Literal("context"),
          ]),
          {
            description:
              "Filter by pointer type(s). Omit to search all types.",
          }
        )
      ),
    }),

    async handler(params: {
      query: string;
      maxResults?: number;
      types?: PointerType[];
    }) {
      const max = Math.min(params.maxResults ?? 5, 20);
      let results = graph.search(params.query, max + 5);

      if (params.types && params.types.length > 0) {
        const allowed = new Set(params.types);
        results = results.filter((p) => allowed.has(p.type));
      }

      results = results.slice(0, max);

      if (results.length === 0) {
        return {
          text: "No relevant pointers found in the SIF graph for this query.",
        };
      }

      const formatted = results.map((p, i) => {
        return [
          `[${i + 1}] **${p.type.toUpperCase()}** (weight: ${p.weight.toFixed(2)}, id: ${p.id})`,
          `    ${p.content}`,
          p.tags.length > 0 ? `    Tags: ${p.tags.join(", ")}` : null,
        ]
          .filter(Boolean)
          .join("\n");
      });

      logger.debug?.(
        `SIF recall: "${params.query}" → ${results.length} results`
      );

      return {
        text:
          `Found ${results.length} relevant pointer(s) in the SIF graph:\n\n` +
          formatted.join("\n\n"),
      };
    },
  };
}

// ---------------------------------------------------------------------------
// sif_learn — Store new intelligence
// ---------------------------------------------------------------------------

function createLearnTool(graph: PointerGraph, logger: Logger) {
  return {
    name: "sif_learn",
    description:
      "Store a new insight, skill, pattern, or piece of knowledge in the SIF pointer graph. " +
      "Use this when the conversation produces a reusable insight worth preserving across sessions. " +
      "The system automatically deduplicates — if similar content exists, it reinforces instead.",
    inputSchema: Type.Object({
      type: Type.Union(
        [
          Type.Literal("knowledge"),
          Type.Literal("skill"),
          Type.Literal("archetype"),
          Type.Literal("breakthrough"),
          Type.Literal("context"),
        ],
        {
          description:
            "Pointer type. " +
            "knowledge = facts/domain expertise, " +
            "skill = reusable capability, " +
            "archetype = behavioral pattern, " +
            "breakthrough = novel insight, " +
            "context = project metadata/preferences",
        }
      ),
      content: Type.String({
        description:
          "The intelligence to store. Be specific and self-contained — " +
          "this should make sense when read without the original conversation.",
        minLength: 10,
        maxLength: 2000,
      }),
      tags: Type.Optional(
        Type.Array(Type.String(), {
          description:
            "Semantic tags for searchability (e.g., ['typescript', 'testing', 'patterns'])",
        })
      ),
      weight: Type.Optional(
        Type.Number({
          description:
            "Initial importance weight 0.0–1.0. " +
            "Default 0.5. Use 0.8+ for critical insights, 0.3 for minor notes.",
          minimum: 0.05,
          maximum: 1.0,
        })
      ),
    }),

    async handler(params: {
      type: PointerType;
      content: string;
      tags?: string[];
      weight?: number;
    }) {
      const pointer = graph.add({
        type: params.type,
        content: params.content,
        tags: params.tags ?? [],
        weight: params.weight,
        source: "session:openclaw-agent",
      });

      await graph.save();

      return {
        text:
          `Stored ${params.type} pointer **${pointer.id}** ` +
          `(weight: ${pointer.weight.toFixed(2)}).\n` +
          `Content: "${truncate(params.content, 80)}"\n` +
          (params.tags && params.tags.length > 0
            ? `Tags: ${params.tags.join(", ")}`
            : ""),
      };
    },
  };
}

// ---------------------------------------------------------------------------
// sif_reinforce — Strengthen an existing pointer
// ---------------------------------------------------------------------------

function createReinforceTool(graph: PointerGraph, _logger: Logger) {
  return {
    name: "sif_reinforce",
    description:
      "Strengthen an existing SIF pointer that proved useful in this conversation. " +
      "This implements Hebbian learning: 'neurons that fire together wire together.' " +
      "Call this when a recalled pointer directly helped solve a problem.",
    inputSchema: Type.Object({
      pointerId: Type.String({
        description: "The pointer ID to reinforce (e.g., 'ptr_abc123def456')",
      }),
      boost: Type.Optional(
        Type.Number({
          description:
            "Weight boost amount (0.01–0.15). Default 0.1. " +
            "Higher for critical pointers, lower for minor relevance.",
          minimum: 0.01,
          maximum: 0.15,
        })
      ),
    }),

    async handler(params: { pointerId: string; boost?: number }) {
      const success = graph.reinforce(params.pointerId, params.boost ?? 0.1);

      if (!success) {
        return {
          text: `Pointer ${params.pointerId} not found in the SIF graph.`,
        };
      }

      await graph.save();

      return {
        text: `Reinforced pointer ${params.pointerId} (+${(params.boost ?? 0.1).toFixed(2)} weight).`,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// sif_status — Check SIF health
// ---------------------------------------------------------------------------

function createStatusTool(graph: PointerGraph, _logger: Logger) {
  return {
    name: "sif_status",
    description:
      "Check the current state of the SIF intelligence layer — " +
      "pointer count, type distribution, health score, and sovereignty status.",
    inputSchema: Type.Object({}),

    async handler() {
      const s = graph.status();

      return {
        text: [
          `SIF Intelligence Layer Status`,
          ``,
          `Total pointers: ${s.totalPointers}`,
          `  Skills: ${s.skills} | Knowledge: ${s.knowledge}`,
          `  Archetypes: ${s.archetypes} | Breakthroughs: ${s.breakthroughs}`,
          `  Context: ${s.context}`,
          ``,
          `Average weight: ${s.avgWeight.toFixed(3)}`,
          `Strong pointers (>0.7): ${s.strongCount}`,
          `Decayed pointers (<0.3): ${s.decayedCount}`,
          `Health score: ${(s.healthScore * 100).toFixed(1)}%`,
          ``,
          `Last sync: ${s.lastSync || "never"}`,
          `Graph path: ${s.graphPath}`,
          `Unsaved changes: ${s.dirty ? "yes" : "no"}`,
          `Sovereignty: User-owned`,
        ].join("\n"),
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function truncate(s: string, len: number): string {
  return s.length > len ? s.slice(0, len) + "..." : s;
}
