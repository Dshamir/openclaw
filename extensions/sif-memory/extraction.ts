import type { PointerType } from "./types.js";

export type ExtractionResult = {
  type: PointerType;
  content: string;
  confidence: number;
  tags: string[];
};

/** Minimum content length for an extraction to be valid. */
const MIN_CONTENT_LENGTH = 15;

/** Maximum content length — longer content is truncated. */
const MAX_CONTENT_LENGTH = 500;

/** Per-type confidence thresholds. */
const CONFIDENCE_THRESHOLDS: Record<PointerType, number> = {
  breakthrough: 0.8,
  archetype: 0.7,
  skill: 0.5,
  knowledge: 0.4,
  context: 0.4,
};

/** Jaccard similarity threshold for deduplication within a single pass. */
const DEDUP_THRESHOLD = 0.5;

type ExtractionPattern = {
  regex: RegExp;
  type: PointerType;
  confidence: number;
  /** Index of the capture group containing the extracted content. */
  captureGroup: number;
};

/**
 * Ordered list of extraction patterns. Earlier patterns take precedence
 * when deduplicating similar results.
 */
const PATTERNS: ExtractionPattern[] = [
  // Breakthrough patterns — high confidence
  {
    regex: /key\s+(?:insight|takeaway)\s*[:=]\s*(.+)/gi,
    type: "breakthrough",
    confidence: 0.85,
    captureGroup: 1,
  },
  {
    regex: /(?:breakthrough|revelation)\s*[:=]\s*(.+)/gi,
    type: "breakthrough",
    confidence: 0.85,
    captureGroup: 1,
  },

  // Archetype patterns — user preferences
  {
    regex: /the\s+user\s+(?:prefers|likes|wants|favors|enjoys)\s+(.+)/gi,
    type: "archetype",
    confidence: 0.75,
    captureGroup: 1,
  },
  {
    regex: /(?:user|they)\s+(?:always|usually|typically)\s+(.+)/gi,
    type: "archetype",
    confidence: 0.7,
    captureGroup: 1,
  },

  // Skill patterns — best practices, approaches
  {
    regex: /(?:best|recommended)\s+(?:approach|pattern|practice)\s+(?:is|for)\s+(.+)/gi,
    type: "skill",
    confidence: 0.6,
    captureGroup: 1,
  },
  {
    regex: /(?:the\s+)?(?:right|correct|proper)\s+way\s+to\s+(.+)/gi,
    type: "skill",
    confidence: 0.55,
    captureGroup: 1,
  },

  // Knowledge patterns — learning, discovery
  {
    regex: /I\s+(?:learned|discovered|realized|found\s+out)\s+that\s+(.+)/gi,
    type: "knowledge",
    confidence: 0.6,
    captureGroup: 1,
  },
  {
    regex: /(?:decided|we\s+(?:will|should|decided\s+to))\s+(.+)/gi,
    type: "knowledge",
    confidence: 0.5,
    captureGroup: 1,
  },
  {
    regex: /(?:turns?\s+out|apparently|it\s+seems)\s+(?:that\s+)?(.+)/gi,
    type: "knowledge",
    confidence: 0.5,
    captureGroup: 1,
  },

  // Context patterns
  {
    regex: /important\s+context\s*[:=]\s*(.+)/gi,
    type: "context",
    confidence: 0.55,
    captureGroup: 1,
  },
  {
    regex: /(?:note|remember)\s*[:=]\s*(.+)/gi,
    type: "context",
    confidence: 0.45,
    captureGroup: 1,
  },
];

/**
 * Extract learning signals from free-form text using pattern matching.
 * Returns deduplicated results that meet per-type confidence thresholds.
 */
export function extractLearningSignals(text: string): ExtractionResult[] {
  if (!text || text.trim().length === 0) {
    return [];
  }

  const raw: ExtractionResult[] = [];

  for (const pattern of PATTERNS) {
    // Reset lastIndex for global regex
    pattern.regex.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.regex.exec(text)) !== null) {
      let content = (match[pattern.captureGroup] ?? "").trim();

      // Truncate to max length, trying to break at a sentence boundary
      if (content.length > MAX_CONTENT_LENGTH) {
        const truncated = content.slice(0, MAX_CONTENT_LENGTH);
        const lastPeriod = truncated.lastIndexOf(".");
        content =
          lastPeriod > MAX_CONTENT_LENGTH * 0.5 ? truncated.slice(0, lastPeriod + 1) : truncated;
      }

      // Skip too-short content
      if (content.length < MIN_CONTENT_LENGTH) {
        continue;
      }

      // Check type-specific confidence threshold
      if (pattern.confidence < CONFIDENCE_THRESHOLDS[pattern.type]) {
        continue;
      }

      const tags = extractTags(content);
      raw.push({
        type: pattern.type,
        content,
        confidence: pattern.confidence,
        tags,
      });
    }
  }

  return dedup(raw);
}

/**
 * Pull keyword tags from content: words longer than 3 chars,
 * lowercased, with stopwords removed.
 */
function extractTags(content: string): string[] {
  const stopwords = new Set([
    "that",
    "this",
    "with",
    "from",
    "have",
    "been",
    "will",
    "they",
    "their",
    "them",
    "than",
    "then",
    "when",
    "what",
    "which",
    "where",
    "about",
    "into",
    "more",
    "some",
    "very",
    "just",
    "also",
    "should",
  ]);

  const words = content
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !stopwords.has(w));

  // Return unique tags, max 5
  return [...new Set(words)].slice(0, 5);
}

/**
 * Dedup results using Jaccard similarity on content tokens.
 * When two results are similar, keep the one with higher confidence.
 */
function dedup(results: ExtractionResult[]): ExtractionResult[] {
  const kept: ExtractionResult[] = [];

  for (const candidate of results) {
    const candidateTokens = tokenSet(candidate.content);
    let isDuplicate = false;

    for (const existing of kept) {
      const existingTokens = tokenSet(existing.content);
      const intersection = [...candidateTokens].filter((t) => existingTokens.has(t)).length;
      const union = new Set([...candidateTokens, ...existingTokens]).size;

      if (union > 0 && intersection / union >= DEDUP_THRESHOLD) {
        // Keep the higher-confidence version
        if (candidate.confidence > existing.confidence) {
          const idx = kept.indexOf(existing);
          kept[idx] = candidate;
        }
        isDuplicate = true;
        break;
      }
    }

    if (!isDuplicate) {
      kept.push(candidate);
    }
  }

  return kept;
}

function tokenSet(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 1),
  );
}
