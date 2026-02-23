/**
 * Intelligence Extractor — Conversation → Pointer Graph
 *
 * Analyzes conversation turns to extract intelligence artifacts using
 * the PIK taxonomy: skills, patterns, knowledge, archetypes, breakthroughs.
 *
 * Two extraction modes:
 *   1. LLM-powered (primary) — Sends conversation to the active model with
 *      a structured extraction prompt. Parses JSON output.
 *   2. Heuristic fallback — Regex patterns for high-confidence signals
 *      when LLM extraction is unavailable or fails.
 *
 * @see Amendment A35 Phase 3 — Bidirectional Learning Loop
 */

import type { PointerGraph, PointerType } from "./pointer-graph.js";
import type { LearningJournal } from "./learning-journal.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConversationTurn = {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: string;
};

export type ExtractionResult = {
  type: PointerType;
  content: string;
  confidence: number;  // 0.0 – 1.0
  tags: string[];
  reasoning?: string;  // Why this was extracted
};

export type ExtractorConfig = {
  /** Minimum confidence to accept an extraction (default: 0.5) */
  minConfidence: number;

  /** Maximum extractions per conversation (default: 10) */
  maxExtractions: number;

  /** Minimum conversation turns before extraction triggers (default: 3) */
  minTurns: number;

  /** Minimum total characters in conversation (default: 500) */
  minCharacters: number;

  /** Per-category confidence thresholds */
  categoryThresholds: Record<PointerType, number>;

  /** Whether to use LLM extraction (default: true) */
  useLlmExtraction: boolean;
};

export const DEFAULT_EXTRACTOR_CONFIG: ExtractorConfig = {
  minConfidence: 0.5,
  maxExtractions: 10,
  minTurns: 3,
  minCharacters: 500,
  useLlmExtraction: true,
  categoryThresholds: {
    breakthrough: 0.8,   // High bar: genuine novel insights
    archetype: 0.7,      // High bar: behavioral identity patterns
    skill: 0.5,          // Moderate: demonstrated capabilities
    knowledge: 0.4,      // Lower: factual information
    context: 0.3,        // Lowest: ephemeral session context
  },
};

// ---------------------------------------------------------------------------
// LLM Extraction Prompt
// ---------------------------------------------------------------------------

const EXTRACTION_SYSTEM_PROMPT = `You are an intelligence extraction engine for the Sovereign Intelligence Framework (SIF).
Analyze the conversation and extract structured intelligence artifacts.

Categories (PIK taxonomy):
- **skill**: A demonstrated capability, technique, or approach the user or assistant used effectively.
- **knowledge**: A factual insight, domain knowledge, or learned information.
- **pattern**: A recurring behavioral or problem-solving pattern.
- **archetype**: A behavioral identity pattern — how the user thinks, communicates, or approaches problems.
- **breakthrough**: A genuinely novel insight, solution, or connection that represents a leap in understanding.

Rules:
1. Only extract what is ACTUALLY demonstrated in the conversation, not hypothetical.
2. Breakthroughs must be genuinely novel — not restating known information.
3. Skills must be demonstrated through action, not just discussed.
4. Archetypes describe HOW the user operates, not WHAT they know.
5. Prefer fewer high-quality extractions over many low-quality ones.
6. Each extraction must be self-contained — understandable without the original conversation.
7. Assign confidence 0.0-1.0 based on how clearly the artifact was demonstrated.

Respond with ONLY a JSON array. No markdown, no explanation:
[
  {
    "type": "skill|knowledge|pattern|archetype|breakthrough",
    "content": "Concise description of the extracted intelligence",
    "confidence": 0.0-1.0,
    "tags": ["relevant", "tags"],
    "reasoning": "Brief explanation of why this was extracted"
  }
]`;

function buildExtractionUserPrompt(turns: ConversationTurn[]): string {
  const formatted = turns
    .filter((t) => t.role !== "system")
    .map((t) => `[${t.role.toUpperCase()}]: ${t.content}`)
    .join("\n\n");

  // Truncate to avoid excessive token usage (keep last ~4000 chars)
  const maxChars = 4000;
  const truncated = formatted.length > maxChars
    ? "...\n" + formatted.slice(-maxChars)
    : formatted;

  return `Analyze this conversation and extract intelligence artifacts:\n\n${truncated}`;
}

// ---------------------------------------------------------------------------
// Extractor
// ---------------------------------------------------------------------------

type LlmCallFn = (params: {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
}) => Promise<string>;

type Logger = {
  info: (msg: string) => void;
  warn: (msg: string) => void;
  debug?: (msg: string) => void;
};

export class IntelligenceExtractor {
  private config: ExtractorConfig;
  private journal: LearningJournal | null;
  private logger: Logger;

  constructor(
    logger: Logger,
    config?: Partial<ExtractorConfig>,
    journal?: LearningJournal,
  ) {
    this.config = { ...DEFAULT_EXTRACTOR_CONFIG, ...config };
    this.journal = journal ?? null;
    this.logger = logger;
  }

  // -------------------------------------------------------------------------
  // Main Extraction Pipeline
  // -------------------------------------------------------------------------

  /**
   * Extract intelligence from a conversation and write to the graph.
   *
   * @param turns - Conversation turns to analyze
   * @param graph - Target pointer graph for writing
   * @param llmCall - Optional LLM call function for powered extraction
   * @param sessionKey - Session identifier for lineage tracking
   * @returns Number of new pointers added or reinforced
   */
  async extract(
    turns: ConversationTurn[],
    graph: PointerGraph,
    llmCall?: LlmCallFn,
    sessionKey?: string,
  ): Promise<{ added: number; reinforced: number; extractions: ExtractionResult[] }> {
    // Pre-flight checks
    const userTurns = turns.filter((t) => t.role === "user");
    const totalChars = turns.reduce((sum, t) => sum + t.content.length, 0);

    if (userTurns.length < this.config.minTurns) {
      this.logger.debug?.(
        `SIF extractor: skipping — only ${userTurns.length} user turns (min: ${this.config.minTurns})`
      );
      return { added: 0, reinforced: 0, extractions: [] };
    }

    if (totalChars < this.config.minCharacters) {
      this.logger.debug?.(
        `SIF extractor: skipping — only ${totalChars} chars (min: ${this.config.minCharacters})`
      );
      return { added: 0, reinforced: 0, extractions: [] };
    }

    // Extract
    let extractions: ExtractionResult[];

    if (this.config.useLlmExtraction && llmCall) {
      try {
        extractions = await this.llmExtract(turns, llmCall);
        this.logger.info(
          `SIF extractor: LLM extraction yielded ${extractions.length} candidates`
        );
      } catch (err) {
        this.logger.warn(`SIF extractor: LLM extraction failed, falling back to heuristics: ${err}`);
        extractions = this.heuristicExtract(turns);
      }
    } else {
      extractions = this.heuristicExtract(turns);
      this.logger.debug?.(
        `SIF extractor: heuristic extraction yielded ${extractions.length} candidates`
      );
    }

    // Filter by confidence thresholds
    const qualified = extractions.filter((e) => {
      const threshold = this.config.categoryThresholds[e.type]
        ?? this.config.minConfidence;
      return e.confidence >= threshold;
    });

    // Cap at max extractions
    const capped = qualified
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, this.config.maxExtractions);

    // Write to graph
    let added = 0;
    let reinforced = 0;
    const source = `session:${sessionKey ?? "unknown"}`;

    for (const extraction of capped) {
      const result = graph.add({
        type: extraction.type,
        content: extraction.content,
        tags: [...extraction.tags, "auto-extracted", `confidence:${extraction.confidence.toFixed(2)}`],
        weight: Math.max(0.3, extraction.confidence * 0.7),
        source,
        metadata: extraction.reasoning ? { reasoning: extraction.reasoning } : undefined,
      });

      // graph.add returns existing pointer if deduplicated (reinforcement)
      const isNew = result.accessCount === 0;
      if (isNew) {
        added++;
      } else {
        reinforced++;
      }

      this.journal?.log({
        event: isNew ? "extract-add" : "extract-reinforce",
        pointerId: result.id,
        pointerType: extraction.type,
        confidence: extraction.confidence,
        source,
        timestamp: new Date().toISOString(),
      });
    }

    this.logger.info(
      `SIF extractor: wrote ${added} new + ${reinforced} reinforced pointers from ${capped.length} extractions`
    );

    return { added, reinforced, extractions: capped };
  }

  // -------------------------------------------------------------------------
  // LLM-Powered Extraction
  // -------------------------------------------------------------------------

  private async llmExtract(
    turns: ConversationTurn[],
    llmCall: LlmCallFn,
  ): Promise<ExtractionResult[]> {
    const userPrompt = buildExtractionUserPrompt(turns);

    const response = await llmCall({
      systemPrompt: EXTRACTION_SYSTEM_PROMPT,
      userPrompt,
      maxTokens: 2000,
    });

    return this.parseExtractionResponse(response);
  }

  private parseExtractionResponse(raw: string): ExtractionResult[] {
    // Strip markdown code fences if present
    let cleaned = raw.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    try {
      const parsed = JSON.parse(cleaned);
      if (!Array.isArray(parsed)) {
        this.logger.warn("SIF extractor: LLM response is not an array");
        return [];
      }

      return parsed
        .filter((item: any) => {
          return (
            item &&
            typeof item.type === "string" &&
            typeof item.content === "string" &&
            typeof item.confidence === "number" &&
            isValidPointerType(item.type) &&
            item.content.length >= 10 &&
            item.confidence >= 0 &&
            item.confidence <= 1
          );
        })
        .map((item: any) => ({
          type: item.type as PointerType,
          content: item.content.trim(),
          confidence: item.confidence,
          tags: Array.isArray(item.tags)
            ? item.tags.filter((t: any) => typeof t === "string")
            : [],
          reasoning: typeof item.reasoning === "string" ? item.reasoning : undefined,
        }));
    } catch (err) {
      this.logger.warn(`SIF extractor: failed to parse LLM extraction response: ${err}`);
      return [];
    }
  }

  // -------------------------------------------------------------------------
  // Heuristic Fallback
  // -------------------------------------------------------------------------

  private heuristicExtract(turns: ConversationTurn[]): ExtractionResult[] {
    const results: ExtractionResult[] = [];
    const assistantText = turns
      .filter((t) => t.role === "assistant")
      .map((t) => t.content)
      .join("\n");

    const userText = turns
      .filter((t) => t.role === "user")
      .map((t) => t.content)
      .join("\n");

    // Pattern: Explicit insights in assistant output
    const insightPatterns = [
      /(?:key insight|important finding|notable discovery|breakthrough)[:\s]+(.{20,300})/gi,
      /(?:the (?:main|key|critical|important) (?:takeaway|lesson|insight) (?:is|was))[:\s]+(.{20,300})/gi,
    ];

    for (const pattern of insightPatterns) {
      for (const match of assistantText.matchAll(pattern)) {
        const content = cleanContent(match[1] ?? "");
        if (content.length >= 20) {
          results.push({
            type: "knowledge",
            content,
            confidence: 0.5,
            tags: ["heuristic", "insight"],
          });
        }
      }
    }

    // Pattern: Best practices / approaches
    const practicePatterns = [
      /(?:best practice|recommended approach|design pattern|effective (?:strategy|technique))[:\s]+(.{20,300})/gi,
    ];

    for (const pattern of practicePatterns) {
      for (const match of assistantText.matchAll(pattern)) {
        const content = cleanContent(match[1] ?? "");
        if (content.length >= 20) {
          results.push({
            type: "skill",
            content,
            confidence: 0.45,
            tags: ["heuristic", "practice"],
          });
        }
      }
    }

    // Pattern: User preferences / identity signals
    const identityPatterns = [
      /(?:i (?:always|usually|prefer|tend to|like to))\s+(.{15,200})/gi,
      /(?:my (?:approach|style|preference|philosophy) (?:is|involves))\s+(.{15,200})/gi,
    ];

    for (const pattern of identityPatterns) {
      for (const match of userText.matchAll(pattern)) {
        const content = cleanContent(match[1] ?? match[2] ?? "");
        if (content.length >= 15) {
          results.push({
            type: "archetype",
            content: `User tendency: ${content}`,
            confidence: 0.4,
            tags: ["heuristic", "identity"],
          });
        }
      }
    }

    // Deduplicate by content similarity
    return deduplicateExtractions(results);
  }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function isValidPointerType(type: string): type is PointerType {
  return ["knowledge", "skill", "archetype", "breakthrough", "context"].includes(type);
}

function cleanContent(raw: string): string {
  return raw
    .replace(/\*\*/g, "")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function deduplicateExtractions(results: ExtractionResult[]): ExtractionResult[] {
  const unique: ExtractionResult[] = [];

  for (const r of results) {
    const isDuplicate = unique.some((u) => {
      const wordsA = new Set(r.content.toLowerCase().split(/\s+/));
      const wordsB = new Set(u.content.toLowerCase().split(/\s+/));
      const intersection = [...wordsA].filter((w) => wordsB.has(w));
      const union = new Set([...wordsA, ...wordsB]);
      return union.size > 0 && intersection.length / union.size > 0.6;
    });

    if (!isDuplicate) unique.push(r);
  }

  return unique;
}
