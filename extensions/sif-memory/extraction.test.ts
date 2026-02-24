import { describe, expect, it } from "vitest";
import { extractLearningSignals } from "./extraction.js";

describe("extractLearningSignals", () => {
  it("extracts knowledge from 'I learned' pattern", () => {
    const results = extractLearningSignals(
      "I learned that TypeScript generics work differently with conditional types",
    );
    expect(results.length).toBeGreaterThanOrEqual(1);
    const knowledge = results.find((r) => r.type === "knowledge");
    expect(knowledge).toBeDefined();
    expect(knowledge!.content).toContain("TypeScript generics");
  });

  it("extracts knowledge from 'I discovered' pattern", () => {
    const results = extractLearningSignals(
      "I discovered that the caching layer was causing stale reads in production",
    );
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].type).toBe("knowledge");
  });

  it("extracts breakthrough from 'key insight' pattern", () => {
    const results = extractLearningSignals(
      "Key insight: immutable data structures eliminate an entire class of concurrency bugs",
    );
    expect(results.length).toBeGreaterThanOrEqual(1);
    const bt = results.find((r) => r.type === "breakthrough");
    expect(bt).toBeDefined();
    expect(bt!.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it("extracts archetype from 'the user prefers' pattern", () => {
    const results = extractLearningSignals(
      "The user prefers concise code comments over verbose documentation blocks",
    );
    expect(results.length).toBeGreaterThanOrEqual(1);
    const arch = results.find((r) => r.type === "archetype");
    expect(arch).toBeDefined();
    expect(arch!.content).toContain("concise code comments");
  });

  it("extracts skill from 'best practice' pattern", () => {
    const results = extractLearningSignals(
      "Best practice for error handling is wrapping async calls in try-catch with proper logging",
    );
    expect(results.length).toBeGreaterThanOrEqual(1);
    const skill = results.find((r) => r.type === "skill");
    expect(skill).toBeDefined();
  });

  it("extracts context from 'important context' pattern", () => {
    const results = extractLearningSignals(
      "Important context: the deploy pipeline requires approval from two reviewers",
    );
    expect(results.length).toBeGreaterThanOrEqual(1);
    const ctx = results.find((r) => r.type === "context");
    expect(ctx).toBeDefined();
  });

  it("respects minimum content length", () => {
    const results = extractLearningSignals("I learned that it works");
    // "it works" is too short (8 chars)
    const hasShort = results.some((r) => r.content.length < 15);
    expect(hasShort).toBe(false);
  });

  it("truncates content exceeding max length", () => {
    const longContent = "x".repeat(600);
    const results = extractLearningSignals(`I learned that ${longContent}`);
    for (const r of results) {
      expect(r.content.length).toBeLessThanOrEqual(500);
    }
  });

  it("returns empty array for empty input", () => {
    expect(extractLearningSignals("")).toEqual([]);
    expect(extractLearningSignals("   ")).toEqual([]);
  });

  it("returns empty for text with no patterns", () => {
    const results = extractLearningSignals(
      "The weather is nice today and I went for a walk in the park.",
    );
    expect(results).toEqual([]);
  });

  it("deduplicates similar extractions", () => {
    const text = [
      "I learned that caching improves performance significantly in production",
      "I realized that caching improves performance significantly in production environments",
    ].join(". ");

    const results = extractLearningSignals(text);
    // Should deduplicate the near-identical signals
    const cachingResults = results.filter((r) => r.content.includes("caching"));
    expect(cachingResults.length).toBeLessThanOrEqual(1);
  });

  it("extracts tags from content", () => {
    const results = extractLearningSignals(
      "I learned that TypeScript decorators provide powerful metadata capabilities",
    );
    expect(results.length).toBeGreaterThanOrEqual(1);
    const r = results[0];
    expect(r.tags.length).toBeGreaterThan(0);
    // Tags should be lowercase
    for (const tag of r.tags) {
      expect(tag).toBe(tag.toLowerCase());
    }
  });

  it("returns correct types for multiple patterns in one text", () => {
    const text = [
      "Key insight: event sourcing simplifies debugging by preserving full state history",
      "The user prefers functional programming patterns over object-oriented approaches",
      "I learned that GraphQL reduces over-fetching compared to traditional REST endpoints",
    ].join(". ");

    const results = extractLearningSignals(text);
    const types = new Set(results.map((r) => r.type));
    expect(types.size).toBeGreaterThanOrEqual(2);
  });
});
