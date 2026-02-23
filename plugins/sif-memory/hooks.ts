/**
 * SIF Lifecycle Hooks (Phase 3)
 *
 * Wires the full bidirectional learning loop into OpenClaw's hook system:
 *
 *   before_prompt_build → Injects relevant pointer context into system prompt
 *                         (SKIPPED when memory.backend = "sif")
 *   llm_output          → Tracks accessed pointers for co-activation
 *   session_start       → Initializes session tracking + journal
 *   session_end         → **FULL EXTRACTION PIPELINE** — analyzes conversation,
 *                         extracts intelligence, writes to graph, runs Hebbian
 *   before_compaction   → Archives session transcript for cognitive archaeology
 *   after_compaction    → Post-compaction bookkeeping
 *   before_reset        → Saves state before /new or /reset clears session
 *   heartbeat           → Periodic decay pass + consolidation
 *
 * @see Amendment A35 Phase 3 — Bidirectional Learning Loop
 */

import type { OpenClawPluginApi } from "../../src/plugins/types.js";
import type { PointerGraph } from "./pointer-graph.js";
import type { HebbianEngine } from "./hebbian.js";
import type { IntelligenceExtractor, ConversationTurn } from "./extractor.js";
import type { LearningJournal } from "./learning-journal.js";
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

/** Heartbeat counter for scheduling periodic tasks */
let heartbeatCount = 0;

/** Decay pass every N heartbeats (e.g., every ~30 min if heartbeat = 5min) */
const DECAY_INTERVAL = 6;

/** Full consolidation every N heartbeats (e.g., daily if heartbeat = 5min) */
const CONSOLIDATION_INTERVAL = 288;

// ---------------------------------------------------------------------------
// Session State
// ---------------------------------------------------------------------------

/** Accumulates conversation turns for end-of-session extraction */
const sessionTurns: ConversationTurn[] = [];

/** Tracks pointer IDs accessed during this session for co-activation */
const sessionAccessedPointers: Set<string> = new Set();

// ---------------------------------------------------------------------------
// Hook Registration
// ---------------------------------------------------------------------------

export function registerSifHooks(
  api: OpenClawPluginApi,
  graph: PointerGraph,
  hebbian?: HebbianEngine,
  extractor?: IntelligenceExtractor,
  journal?: LearningJournal,
): void {
  const logger = api.logger;
  const sifIsBackend = (api.config as any)?.memory?.backend === "sif";

  // -------------------------------------------------------------------------
  // before_prompt_build — Inject SIF context (only when NOT using sif backend)
  // -------------------------------------------------------------------------
  if (!sifIsBackend) {
    api.on("before_prompt_build", (event, ctx) => {
      const prompt = event.prompt;
      if (!prompt || graph.size() === 0) return;

      const relevant = graph.search(prompt, MAX_CONTEXT_POINTERS);
      const eligible = relevant.filter((p) => p.weight >= MIN_CONTEXT_WEIGHT);
      if (eligible.length === 0) return;

      // Track accessed pointers for co-activation
      for (const p of eligible) {
        sessionAccessedPointers.add(p.id);
      }

      // Reinforce accessed pointers via Hebbian engine
      if (hebbian) {
        hebbian.reinforceAccessed(graph, eligible.map((p) => p.id));
      }

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

      return { prependContext: sifContext };
    }, { priority: 50 });
  } else {
    logger.info(
      "SIF: memory.backend = 'sif' — skipping before_prompt_build hook"
    );
  }

  // -------------------------------------------------------------------------
  // llm_output — Track conversation turns for extraction
  // -------------------------------------------------------------------------
  api.on("llm_output", (event, ctx) => {
    const texts = event.assistantTexts;
    if (!texts || texts.length === 0) return;

    const fullOutput = texts.join("\n");
    if (fullOutput.length < 50) return;

    // Accumulate turns for end-of-session extraction
    sessionTurns.push({
      role: "assistant",
      content: fullOutput,
      timestamp: new Date().toISOString(),
    });
  });

  // -------------------------------------------------------------------------
  // user_input — Track user messages for extraction
  // -------------------------------------------------------------------------
  api.on("user_input", (event, ctx) => {
    const text = event.userText;
    if (!text || text.length < 10) return;

    sessionTurns.push({
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    });
  });

  // -------------------------------------------------------------------------
  // session_start — Initialize tracking
  // -------------------------------------------------------------------------
  api.on("session_start", (event, ctx) => {
    // Clear session state
    sessionTurns.length = 0;
    sessionAccessedPointers.clear();

    // Set journal session
    if (journal) {
      journal.setSession(ctx.sessionId ?? ctx.sessionKey ?? "unknown");
    }

    logger.debug?.(
      `SIF: session started — ${ctx.sessionId}, graph has ${graph.size()} pointers`
    );
  });

  // -------------------------------------------------------------------------
  // session_end — **FULL EXTRACTION PIPELINE**
  // -------------------------------------------------------------------------
  api.on("session_end", async (event, ctx) => {
    const sessionKey = ctx.sessionId ?? ctx.sessionKey ?? "unknown";

    // 1. Run intelligence extraction if we have enough turns
    if (extractor && sessionTurns.length >= 3) {
      journal?.logExtractionStart(sessionKey, sessionTurns.length);

      try {
        // Build LLM call function from the API if available
        const llmCall = buildLlmCallFn(api);

        const result = await extractor.extract(
          [...sessionTurns], // Copy to avoid mutation
          graph,
          llmCall,
          sessionKey,
        );

        journal?.logExtractionEnd(sessionKey, {
          added: result.added,
          reinforced: result.reinforced,
          totalExtractions: result.extractions.length,
        });

        logger.info(
          `SIF: session extraction complete — ` +
          `${result.added} new, ${result.reinforced} reinforced ` +
          `from ${result.extractions.length} extractions`
        );
      } catch (err) {
        logger.warn(`SIF: extraction failed for session ${sessionKey}: ${err}`);
      }
    }

    // 2. Reinforce all pointers accessed during this session
    if (hebbian && sessionAccessedPointers.size > 0) {
      const reinforced = hebbian.reinforceAccessed(
        graph,
        [...sessionAccessedPointers],
      );
      logger.debug?.(
        `SIF: reinforced ${reinforced} pointers accessed during session`
      );
    }

    // 3. Save graph
    if (graph.isDirty()) {
      logger.info(
        `SIF: saving ${graph.size()} pointers at session end (${sessionKey})`
      );
      await graph.save();
    }

    // 4. Clear session state
    sessionTurns.length = 0;
    sessionAccessedPointers.clear();
    journal?.clearSession();
  });

  // -------------------------------------------------------------------------
  // heartbeat — Periodic learning maintenance
  // -------------------------------------------------------------------------
  api.on("heartbeat", async (event, ctx) => {
    heartbeatCount++;

    // Decay pass (every ~30 min)
    if (hebbian && heartbeatCount % DECAY_INTERVAL === 0) {
      const decayResult = hebbian.decayPass(graph);
      if (decayResult.decayed > 0 || decayResult.pruned > 0) {
        journal?.logDecayPass(decayResult);
        logger.debug?.(
          `SIF heartbeat: decayed ${decayResult.decayed}, ` +
          `pruned ${decayResult.pruned} pointers`
        );
      }
    }

    // Consolidation (daily)
    if (hebbian && heartbeatCount % CONSOLIDATION_INTERVAL === 0) {
      const consolidateResult = hebbian.consolidate(graph);
      journal?.logConsolidation(consolidateResult);
      logger.info(
        `SIF heartbeat: consolidated — ` +
        `merged ${consolidateResult.merged}, ` +
        `co-activated ${consolidateResult.coActivated}, ` +
        `pruned ${consolidateResult.pruned}`
      );
    }

    // Save if dirty
    if (graph.isDirty()) {
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
    // Run extraction before losing session data
    if (extractor && sessionTurns.length >= 3) {
      try {
        const llmCall = buildLlmCallFn(api);
        await extractor.extract(
          [...sessionTurns],
          graph,
          llmCall,
          ctx.sessionKey ?? "pre-reset",
        );
        logger.info("SIF: ran pre-reset extraction");
      } catch (err) {
        logger.warn(`SIF: pre-reset extraction failed: ${err}`);
      }
    }

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

    // Clear session state
    sessionTurns.length = 0;
    sessionAccessedPointers.clear();
  });
}

// ---------------------------------------------------------------------------
// LLM Call Builder
// ---------------------------------------------------------------------------

/**
 * Attempts to build an LLM call function from the plugin API.
 * Returns undefined if the API doesn't expose an LLM call interface.
 */
function buildLlmCallFn(
  api: OpenClawPluginApi,
): ((params: { systemPrompt: string; userPrompt: string; maxTokens?: number }) => Promise<string>) | undefined {
  // OpenClaw exposes api.llm.complete() or similar — adapt as needed
  const llm = (api as any).llm;
  if (!llm || typeof llm.complete !== "function") {
    return undefined;
  }

  return async (params) => {
    const response = await llm.complete({
      messages: [
        { role: "system", content: params.systemPrompt },
        { role: "user", content: params.userPrompt },
      ],
      maxTokens: params.maxTokens ?? 2000,
      temperature: 0.3, // Low temperature for structured extraction
    });
    return response.text ?? response.content ?? "";
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveArchiveDir(graph: PointerGraph): string {
  const status = graph.status();
  return join(dirname(status.graphPath), ARCHIVE_SUBDIR);
}
