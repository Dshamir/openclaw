/**
 * SIF Lifecycle Hooks (Phase 2)
 *
 * Wires SIF into OpenClaw's plugin hook system for automatic operation:
 *
 *   before_prompt_build → Injects relevant pointer context into system prompt
 *                         (SKIPPED when memory.backend = "sif" — manager handles it)
 *   llm_output          → Extracts learning signals from assistant responses
 *   session_start       → Initializes session tracking
 *   session_end         → Persists any dirty state
 *   before_compaction   → Archives session transcript for cognitive archaeology
 *   after_compaction    → Post-compaction bookkeeping
 *   before_reset        → Saves state before /new or /reset clears session
 */

import type { OpenClawPluginApi } from "../../src/plugins/types.js";
import type { PointerGraph } from "./pointer-graph.js";
import { readFileSync, appendFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Max number of pointers to inject as context per prompt */
const MAX_CONTEXT_POINTERS = 8;

/** Minimum weight for a pointer to be eligible for context injection */
const MIN_CONTEXT_WEIGHT = 0.2;

/** Session archive directory (relative to graph path) */
const ARCHIVE_SUBDIR = "archives";

// ---------------------------------------------------------------------------
// Hook Registration
// ---------------------------------------------------------------------------

export function registerSifHooks(api: OpenClawPluginApi, graph: PointerGraph): void {
  const logger = api.logger;

  // Detect if SIF is the configured memory backend.
  // When backend = "sif", the SifMemoryManager handles search integration,
  // so the before_prompt_build hook should NOT inject context (avoids double-injection).
  const sifIsBackend = (api.config as any)?.memory?.backend === "sif";

  // -------------------------------------------------------------------------
  // before_prompt_build — Inject SIF context (only when NOT using sif backend)
  // -------------------------------------------------------------------------
  if (!sifIsBackend) {
    api.on("before_prompt_build", (event, ctx) => {
      const prompt = event.prompt;
      if (!prompt || graph.size() === 0) return;

      // Search the graph using the user's prompt as query
      const relevant = graph.search(prompt, MAX_CONTEXT_POINTERS);
      const eligible = relevant.filter((p) => p.weight >= MIN_CONTEXT_WEIGHT);

      if (eligible.length === 0) return;

      // Build context block
      const contextLines = eligible.map((p) => {
        return `[${p.type}|w:${p.weight.toFixed(2)}] ${p.content}`;
      });

      const sifContext = [
        "## SIF Intelligence Context",
        "The following accumulated knowledge is relevant to this conversation:",
        "",
        ...contextLines,
        "",
        "Use this context naturally — don't reference SIF explicitly unless the user asks.",
      ].join("\n");

      logger.debug?.(
        `SIF: injecting ${eligible.length} pointers as context for prompt`
      );

      return {
        prependContext: sifContext,
      };
    }, { priority: 50 });
  } else {
    logger.info(
      "SIF: memory.backend = 'sif' detected — skipping before_prompt_build hook " +
      "(SifMemoryManager handles search integration)"
    );
  }

  // -------------------------------------------------------------------------
  // llm_output — Extract learning signals
  // -------------------------------------------------------------------------
  api.on("llm_output", (event, ctx) => {
    const texts = event.assistantTexts;
    if (!texts || texts.length === 0) return;

    const fullOutput = texts.join("\n");
    if (fullOutput.length < 100) return;

    extractLearningSignals(fullOutput, graph, logger, ctx.sessionKey);
  });

  // -------------------------------------------------------------------------
  // session_start — Initialize tracking
  // -------------------------------------------------------------------------
  api.on("session_start", (event, ctx) => {
    logger.debug?.(
      `SIF: session started — ${ctx.sessionId}, graph has ${graph.size()} pointers`
    );
  });

  // -------------------------------------------------------------------------
  // session_end — Persist dirty state
  // -------------------------------------------------------------------------
  api.on("session_end", async (event, ctx) => {
    if (graph.isDirty()) {
      logger.info(
        `SIF: saving ${graph.size()} pointers at session end (${ctx.sessionId})`
      );
      await graph.save();
    }
  });

  // -------------------------------------------------------------------------
  // before_compaction — Archive session for cognitive archaeology
  // -------------------------------------------------------------------------
  api.on("before_compaction", async (event, ctx) => {
    if (!event.sessionFile) return;

    try {
      const archiveDir = resolveArchiveDir(graph);
      if (!existsSync(archiveDir)) {
        mkdirSync(archiveDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const sessionId = ctx.sessionKey ?? "unknown";
      const archivePath = join(
        archiveDir,
        `session-${sessionId}-${timestamp}.jsonl`
      );

      const content = readFileSync(event.sessionFile, "utf-8");
      appendFileSync(archivePath, content);

      logger.info(
        `SIF: archived session transcript (${event.messageCount} messages) to ${archivePath}`
      );
    } catch (err) {
      logger.warn(`SIF: failed to archive session: ${err}`);
    }

    if (graph.isDirty()) {
      await graph.save();
    }
  });

  // -------------------------------------------------------------------------
  // after_compaction — Post-compaction bookkeeping
  // -------------------------------------------------------------------------
  api.on("after_compaction", (event, ctx) => {
    logger.debug?.(
      `SIF: post-compaction — ${event.compactedCount} messages compacted, ` +
      `${event.messageCount} remaining`
    );
  });

  // -------------------------------------------------------------------------
  // before_reset — Save state before session clear
  // -------------------------------------------------------------------------
  api.on("before_reset", async (event, ctx) => {
    if (graph.isDirty()) {
      logger.info("SIF: saving pointer graph before session reset");
      await graph.save();
    }

    if (event.sessionFile) {
      try {
        const archiveDir = resolveArchiveDir(graph);
        if (!existsSync(archiveDir)) {
          mkdirSync(archiveDir, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const archivePath = join(archiveDir, `reset-${timestamp}.jsonl`);
        const content = readFileSync(event.sessionFile, "utf-8");
        appendFileSync(archivePath, content);

        logger.info(`SIF: archived session before reset to ${archivePath}`);
      } catch (err) {
        logger.warn(`SIF: failed to archive session before reset: ${err}`);
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Learning Signal Extraction
// ---------------------------------------------------------------------------

/**
 * Analyzes LLM output for patterns that indicate extractable intelligence.
 *
 * Conservative heuristic approach — looks for high-confidence signals.
 * False negatives preferred over false positives (noise degrades quality).
 *
 * Future: dedicated extraction prompt with lightweight model.
 */
function extractLearningSignals(
  output: string,
  graph: PointerGraph,
  logger: { info: (msg: string) => void; warn: (msg: string) => void; debug?: (msg: string) => void },
  sessionKey?: string,
): void {
  // Pattern 1: Explicit "key insight" markers
  const insightPatterns = [
    /(?:key insight|important finding|notable discovery|breakthrough)[:\s]+(.{20,200})/gi,
    /(?:the (?:main|key|critical|important) (?:takeaway|lesson|insight) (?:is|was))[:\s]+(.{20,200})/gi,
  ];

  for (const pattern of insightPatterns) {
    const matches = output.matchAll(pattern);
    for (const match of matches) {
      const content = match[1]?.trim();
      if (content && content.length >= 20) {
        graph.add({
          type: "knowledge",
          content: cleanExtractedContent(content),
          tags: ["auto-extracted", "llm-output"],
          weight: 0.4,
          source: `session:${sessionKey ?? "unknown"}`,
        });
        logger.debug?.(`SIF: auto-extracted insight from LLM output`);
      }
    }
  }

  // Pattern 2: Explicit pattern/approach descriptions
  const patternMarkers = [
    /(?:the pattern (?:here|is)|a (?:good|better|effective) approach (?:is|would be))[:\s]+(.{20,200})/gi,
    /(?:best practice|recommended approach|design pattern)[:\s]+(.{20,200})/gi,
  ];

  for (const pattern of patternMarkers) {
    const matches = output.matchAll(pattern);
    for (const match of matches) {
      const content = match[1]?.trim();
      if (content && content.length >= 20) {
        graph.add({
          type: "skill",
          content: cleanExtractedContent(content),
          tags: ["auto-extracted", "pattern", "llm-output"],
          weight: 0.35,
          source: `session:${sessionKey ?? "unknown"}`,
        });
        logger.debug?.(`SIF: auto-extracted pattern from LLM output`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveArchiveDir(graph: PointerGraph): string {
  const status = graph.status();
  return join(dirname(status.graphPath), ARCHIVE_SUBDIR);
}

function cleanExtractedContent(raw: string): string {
  return raw
    .replace(/\*\*/g, "")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
