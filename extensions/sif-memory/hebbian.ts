import type { PointerGraph } from "./pointer-graph.js";
import type { Pointer, PointerType } from "./types.js";

/**
 * Type-specific decay half-lives in days.
 * Breakthroughs persist longest; ephemeral context fades fastest.
 */
const DECAY_HALF_LIFE_DAYS: Record<PointerType, number> = {
  archetype: 60,
  breakthrough: 90,
  skill: 45,
  knowledge: 30,
  context: 14,
};

/** Maximum weight boost per single reinforcement event. */
const MAX_REINFORCE_PER_EVENT = 0.15;

/** Mutual boost applied to co-activated pointers. */
const CO_ACTIVATION_BOOST = 0.02;

/** Access count threshold at which a pointer earns a permanent weight floor. */
const CONSOLIDATION_ACCESS_THRESHOLD = 10;

/** Permanent weight floor for consolidated pointers. */
const CONSOLIDATION_WEIGHT_FLOOR = 0.15;

/** Minimum weight after decay — prevents zero-weight ghosts. */
const MIN_WEIGHT = 0.01;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Hebbian learning engine for SIF Memory.
 *
 * Implements type-specific exponential decay, co-activation boosting
 * for pointers accessed together within a time window, and consolidation
 * that gives a permanent weight floor to frequently-accessed pointers.
 */
export class HebbianEngine {
  /**
   * Return the decay half-life in days for a given pointer type.
   */
  getDecayHalfLifeDays(type: PointerType): number {
    return DECAY_HALF_LIFE_DAYS[type];
  }

  /**
   * Apply type-specific exponential decay to a pointer.
   *
   * Weight decays as: w * 0.5^(age / halfLife)
   * where age = now - lastAccessedAt and halfLife comes from the pointer type.
   *
   * Returns the new weight (also mutates pointer.weight in place).
   */
  applyDecay(pointer: Pointer, now: number): number {
    const halfLifeMs = DECAY_HALF_LIFE_DAYS[pointer.type] * MS_PER_DAY;
    const age = now - pointer.lastAccessedAt;

    if (age <= 0) {
      return pointer.weight;
    }

    const decayFactor = Math.pow(0.5, age / halfLifeMs);
    let newWeight = pointer.weight * decayFactor;

    // Consolidated pointers never drop below the floor
    if (pointer.accessCount >= CONSOLIDATION_ACCESS_THRESHOLD) {
      newWeight = Math.max(CONSOLIDATION_WEIGHT_FLOOR, newWeight);
    }

    newWeight = Math.max(MIN_WEIGHT, newWeight);
    pointer.weight = newWeight;
    return newWeight;
  }

  /**
   * Process co-activation: when multiple pointers are accessed together
   * (within the same retrieval window), mutually boost their weights.
   *
   * Each pair of co-accessed pointers gets a small mutual boost, capped at
   * MAX_REINFORCE_PER_EVENT total per pointer per call.
   */
  processCoActivation(accessedIds: string[], graph: PointerGraph): void {
    if (accessedIds.length < 2) {
      return;
    }

    // Resolve IDs to pointers, skip missing
    const pointers: Pointer[] = [];
    for (const id of accessedIds) {
      const p = graph.getById(id);
      if (p) {
        pointers.push(p);
      }
    }

    if (pointers.length < 2) {
      return;
    }

    // Track cumulative boost per pointer to respect the cap
    const boostAccum = new Map<string, number>();

    for (let i = 0; i < pointers.length; i++) {
      for (let j = i + 1; j < pointers.length; j++) {
        const a = pointers[i];
        const b = pointers[j];

        const accumA = boostAccum.get(a.id) ?? 0;
        const accumB = boostAccum.get(b.id) ?? 0;

        // Only boost if we haven't hit the per-event cap
        if (accumA < MAX_REINFORCE_PER_EVENT) {
          const boost = Math.min(CO_ACTIVATION_BOOST, MAX_REINFORCE_PER_EVENT - accumA);
          graph.reinforce(a.id, boost);
          boostAccum.set(a.id, accumA + boost);
        }

        if (accumB < MAX_REINFORCE_PER_EVENT) {
          const boost = Math.min(CO_ACTIVATION_BOOST, MAX_REINFORCE_PER_EVENT - accumB);
          graph.reinforce(b.id, boost);
          boostAccum.set(b.id, accumB + boost);
        }
      }
    }
  }

  /**
   * Consolidate a pointer: if it has been accessed enough times,
   * ensure its weight never drops below the consolidation floor.
   *
   * Returns the effective weight floor (0 if not consolidated).
   */
  consolidate(pointer: Pointer): number {
    if (pointer.accessCount >= CONSOLIDATION_ACCESS_THRESHOLD) {
      if (pointer.weight < CONSOLIDATION_WEIGHT_FLOOR) {
        pointer.weight = CONSOLIDATION_WEIGHT_FLOOR;
      }
      return CONSOLIDATION_WEIGHT_FLOOR;
    }
    return 0;
  }
}
