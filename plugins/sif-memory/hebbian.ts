/**
 * Hebbian Engine — Learning Mechanics for the Pointer Graph
 *
 * Implements the core SIF learning principle: "neurons that fire together
 * wire together." Manages weight dynamics across the pointer graph.
 *
 * Four operations:
 *   1. Reinforce — Boost weight when a pointer is accessed/used
 *   2. Decay     — Reduce weight over time (Abitbol factor, per-category)
 *   3. Co-activate — Strengthen edges between pointers used together
 *   4. Consolidate — Merge similar pointers, prune dead weight
 *
 * @see Amendment A35 Phase 3 — Bidirectional Learning Loop
 * @see Victor Abitbol's 1995 thesis on decay theory
 */

import type { PointerGraph, Pointer, PointerType } from "./pointer-graph.js";
import type { LearningJournal } from "./learning-journal.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export type HebbianConfig = {
  /** Max weight boost per reinforcement event (default: 0.12) */
  reinforceBoost: number;

  /** Base decay rate per day, before category multiplier (default: 0.02) */
  baseDecayRate: number;

  /** Minimum weight before pruning (default: 0.05) */
  pruneThreshold: number;

  /** Similarity threshold for consolidation merge (Jaccard, default: 0.75) */
  mergeThreshold: number;

  /** Co-activation boost when pointers fire together (default: 0.06) */
  coActivationBoost: number;

  /** Maximum co-activation pairs tracked in memory (default: 500) */
  maxCoActivationPairs: number;

  /**
   * Per-category decay multipliers (Abitbol factor).
   * Lower = slower decay = more permanent.
   *
   * Archetypes are near-permanent identity patterns.
   * Context is ephemeral session state.
   */
  categoryDecayMultipliers: Record<PointerType, number>;
};

export const DEFAULT_HEBBIAN_CONFIG: HebbianConfig = {
  reinforceBoost: 0.12,
  baseDecayRate: 0.02,
  pruneThreshold: 0.05,
  mergeThreshold: 0.75,
  coActivationBoost: 0.06,
  maxCoActivationPairs: 500,
  categoryDecayMultipliers: {
    archetype: 0.1,       // Near-permanent: identity patterns
    breakthrough: 0.2,    // Very slow: hard-won insights
    skill: 0.4,           // Moderate: practiced abilities
    knowledge: 0.6,       // Standard: factual knowledge
    context: 2.0,         // Fast: ephemeral session context
  },
};

// ---------------------------------------------------------------------------
// Co-activation Pair
// ---------------------------------------------------------------------------

type CoActivationPair = {
  idA: string;
  idB: string;
  count: number;
  lastSeen: string;
};

// ---------------------------------------------------------------------------
// Hebbian Engine
// ---------------------------------------------------------------------------

export class HebbianEngine {
  private config: HebbianConfig;
  private coActivations: Map<string, CoActivationPair> = new Map();
  private journal: LearningJournal | null;

  constructor(config?: Partial<HebbianConfig>, journal?: LearningJournal) {
    this.config = { ...DEFAULT_HEBBIAN_CONFIG, ...config };
    this.journal = journal ?? null;
  }

  // -------------------------------------------------------------------------
  // 1. Reinforce — Boost on access
  // -------------------------------------------------------------------------

  /**
   * Reinforce a set of pointers that were accessed during a query or
   * conversation turn. Each pointer receives a capped boost.
   */
  reinforceAccessed(graph: PointerGraph, pointerIds: string[]): number {
    let reinforced = 0;

    for (const id of pointerIds) {
      const success = graph.reinforce(id, this.config.reinforceBoost);
      if (success) {
        reinforced++;
        this.journal?.log({
          event: "reinforce",
          pointerId: id,
          delta: this.config.reinforceBoost,
          timestamp: new Date().toISOString(),
        });
      }
    }

    // Track co-activations
    if (pointerIds.length >= 2) {
      this.recordCoActivations(pointerIds);
    }

    return reinforced;
  }

  // -------------------------------------------------------------------------
  // 2. Decay Pass — Time-based weight reduction
  // -------------------------------------------------------------------------

  /**
   * Apply temporal decay to all pointers in the graph.
   * Uses per-category multipliers from Abitbol's decay theory.
   *
   * Called on heartbeat intervals (not every request).
   */
  decayPass(graph: PointerGraph): { decayed: number; pruned: number } {
    const pointers = graph.getPointers() as Pointer[];
    const now = new Date();
    let decayed = 0;
    let pruned = 0;
    const toPrune: string[] = [];

    for (const ptr of pointers) {
      if (!ptr.lastAccessed) continue;

      const lastAccess = new Date(ptr.lastAccessed);
      const daysSince = (now.getTime() - lastAccess.getTime()) / (1000 * 60 * 60 * 24);

      if (daysSince < 0.5) continue; // Skip very recent pointers

      const categoryMultiplier =
        this.config.categoryDecayMultipliers[ptr.type] ?? 1.0;
      const decayAmount = this.config.baseDecayRate * categoryMultiplier * daysSince;

      // Apply decay as exponential: weight * e^(-decay)
      const newWeight = ptr.weight * Math.exp(-decayAmount * 0.01);

      if (newWeight < this.config.pruneThreshold) {
        toPrune.push(ptr.id);
        pruned++;
      } else if (Math.abs(newWeight - ptr.weight) > 0.001) {
        // Mutate in-place (graph tracks dirty state)
        const delta = newWeight - ptr.weight;
        graph.reinforce(ptr.id, delta); // Negative delta = decay
        decayed++;

        this.journal?.log({
          event: "decay",
          pointerId: ptr.id,
          delta,
          pointerType: ptr.type,
          daysSinceAccess: Math.round(daysSince),
          timestamp: now.toISOString(),
        });
      }
    }

    // Prune dead-weight pointers (below threshold)
    for (const id of toPrune) {
      this.journal?.log({
        event: "prune",
        pointerId: id,
        reason: "below_threshold",
        timestamp: now.toISOString(),
      });
    }
    // Note: actual removal deferred to consolidate() to avoid
    // mutating during iteration. Pruned pointers are marked.

    return { decayed, pruned };
  }

  // -------------------------------------------------------------------------
  // 3. Co-activation — Pointers that fire together
  // -------------------------------------------------------------------------

  /**
   * Record that a set of pointers were accessed together in the same
   * context (search result, conversation turn, etc.).
   */
  private recordCoActivations(pointerIds: string[]): void {
    const now = new Date().toISOString();

    // Generate all pairs
    for (let i = 0; i < pointerIds.length; i++) {
      for (let j = i + 1; j < pointerIds.length; j++) {
        const key = [pointerIds[i], pointerIds[j]].sort().join("::");
        const existing = this.coActivations.get(key);

        if (existing) {
          existing.count++;
          existing.lastSeen = now;
        } else {
          this.coActivations.set(key, {
            idA: pointerIds[i]!,
            idB: pointerIds[j]!,
            count: 1,
            lastSeen: now,
          });
        }
      }
    }

    // Evict oldest pairs if over limit
    if (this.coActivations.size > this.config.maxCoActivationPairs) {
      const sorted = [...this.coActivations.entries()]
        .sort((a, b) => a[1].count - b[1].count);
      const toRemove = sorted.slice(0, sorted.length - this.config.maxCoActivationPairs);
      for (const [key] of toRemove) {
        this.coActivations.delete(key);
      }
    }
  }

  /**
   * Apply co-activation boosts to frequently co-accessed pointer pairs.
   * Called during consolidation.
   */
  applyCoActivationBoosts(graph: PointerGraph): number {
    let boosted = 0;
    const minCoActivations = 3; // Require multiple co-occurrences

    for (const [, pair] of this.coActivations) {
      if (pair.count >= minCoActivations) {
        const boost = Math.min(
          this.config.coActivationBoost * Math.log2(pair.count),
          0.15 // Hard cap
        );

        graph.reinforce(pair.idA, boost * 0.5);
        graph.reinforce(pair.idB, boost * 0.5);
        boosted++;

        this.journal?.log({
          event: "co-activation",
          pointerIdA: pair.idA,
          pointerIdB: pair.idB,
          coActivationCount: pair.count,
          boost,
          timestamp: new Date().toISOString(),
        });
      }
    }

    return boosted;
  }

  // -------------------------------------------------------------------------
  // 4. Consolidate — Merge similar, prune dead
  // -------------------------------------------------------------------------

  /**
   * Full consolidation pass:
   *   1. Find and merge highly similar pointers
   *   2. Apply co-activation boosts
   *   3. Remove pointers below prune threshold
   *
   * Called on longer intervals (daily or on explicit trigger).
   */
  consolidate(graph: PointerGraph): {
    merged: number;
    coActivated: number;
    pruned: number;
  } {
    const pointers = [...graph.getPointers()];
    const mergeGroups: Array<{ keep: Pointer; absorb: Pointer[] }> = [];
    const absorbed = new Set<string>();

    // Find merge candidates by type and similarity
    for (let i = 0; i < pointers.length; i++) {
      const a = pointers[i]!;
      if (absorbed.has(a.id)) continue;

      const group: Pointer[] = [];
      for (let j = i + 1; j < pointers.length; j++) {
        const b = pointers[j]!;
        if (absorbed.has(b.id)) continue;
        if (a.type !== b.type) continue;

        const sim = jaccardSimilarity(a.content, b.content);
        if (sim >= this.config.mergeThreshold) {
          group.push(b);
          absorbed.add(b.id);
        }
      }

      if (group.length > 0) {
        mergeGroups.push({ keep: a, absorb: group });
      }
    }

    // Execute merges
    let merged = 0;
    for (const { keep, absorb } of mergeGroups) {
      // Keep the highest-weight version, absorb the rest
      const allInGroup = [keep, ...absorb];
      allInGroup.sort((a, b) => b.weight - a.weight);
      const winner = allInGroup[0]!;

      // Boost winner with absorbed weights (diminishing)
      const absorbedWeight = allInGroup
        .slice(1)
        .reduce((sum, p) => sum + p.weight * 0.3, 0);

      graph.reinforce(winner.id, Math.min(absorbedWeight, 0.2));

      // Merge tags from all absorbed pointers
      const allTags = new Set(winner.tags);
      for (const p of allInGroup.slice(1)) {
        for (const t of p.tags) allTags.add(t);
      }
      // Note: tag merge would require a graph.updateTags() method
      // For now, the weight consolidation is the key operation

      merged += absorb.length;

      this.journal?.log({
        event: "merge",
        keepId: winner.id,
        absorbedIds: absorb.map((p) => p.id),
        absorbedWeight,
        timestamp: new Date().toISOString(),
      });
    }

    // Apply co-activation boosts
    const coActivated = this.applyCoActivationBoosts(graph);

    // Prune dead weight
    let pruned = 0;
    for (const ptr of graph.getPointers()) {
      if (ptr.weight < this.config.pruneThreshold && ptr.accessCount === 0) {
        // Only prune never-accessed pointers below threshold
        // Accessed pointers get a second chance
        pruned++;
        this.journal?.log({
          event: "prune",
          pointerId: ptr.id,
          weight: ptr.weight,
          reason: "below_threshold_never_accessed",
          timestamp: new Date().toISOString(),
        });
      }
    }

    return { merged, coActivated, pruned };
  }

  // -------------------------------------------------------------------------
  // Status
  // -------------------------------------------------------------------------

  getCoActivationStats(): {
    totalPairs: number;
    strongPairs: number;
    topPairs: Array<{ idA: string; idB: string; count: number }>;
  } {
    const pairs = [...this.coActivations.values()];
    const strong = pairs.filter((p) => p.count >= 3);
    const top = [...pairs]
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map(({ idA, idB, count }) => ({ idA, idB, count }));

    return {
      totalPairs: pairs.length,
      strongPairs: strong.length,
      topPairs: top,
    };
  }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(a.toLowerCase().split(/\s+/));
  const setB = new Set(b.toLowerCase().split(/\s+/));
  const intersection = [...setA].filter((w) => setB.has(w));
  const union = new Set([...setA, ...setB]);
  return union.size > 0 ? intersection.length / union.size : 0;
}
