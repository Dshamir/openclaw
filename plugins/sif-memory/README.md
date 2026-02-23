# SIF Memory Plugin for OpenClaw

**Version:** 0.3.0 (Phase 3 — Bidirectional Learning Loop)  
**Amendment:** A35 — SIF-OpenClaw Native Integration  
**Author:** Daniel Shamir, Nexless Healthcare LP

## Overview

The SIF Memory plugin integrates the Sovereign Intelligence Framework into OpenClaw as a full cognitive layer. It replaces flat Markdown memory with a weighted pointer graph that actually *learns* from conversations.

**The LLM is the CPU. The Pointer Graph is the Soul.**

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    BIDIRECTIONAL LOOP                         │
│                                                               │
│  ┌──────────┐    READ     ┌───────────┐    INJECT    ┌─────┐│
│  │  Pointer  │──────────►│  Search +   │──────────►│ LLM  ││
│  │  Graph    │           │  Hebbian    │           │      ││
│  │  (Soul)   │◄──────────│  Reinforce  │◄──────────│      ││
│  └──────────┘    WRITE   └───────────┘   EXTRACT  └─────┘│
│       │                                                      │
│       ▼                                                      │
│  ┌──────────┐  ┌──────────────┐  ┌────────────────────┐    │
│  │ Learning  │  │   Hebbian    │  │   Intelligence     │    │
│  │ Journal   │  │   Engine     │  │   Extractor        │    │
│  │ (Audit)   │  │  (Weights)   │  │  (PIK Taxonomy)    │    │
│  └──────────┘  └──────────────┘  └────────────────────┘    │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

## Phases

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 1 | ✅ Complete | Beachhead — Plugin + tools + prompt injection |
| Phase 2 | ✅ Complete | Deep Integration — SIF as MemorySearchManager backend |
| Phase 3 | ✅ Complete | **Bidirectional Learning Loop** — Extract + Hebbian + Journal |
| Phase 4 | 🔮 Planned | SIFGIT Commander skill + SIFQL parser |
| Phase 5 | 🔮 Planned | Sovereignty — Export/import + ClawHub publication |

## Components

### Pointer Graph (`pointer-graph.ts`)
Core data structure. Stores typed pointers (skill, knowledge, archetype, breakthrough, context) with weighted edges, temporal decay, and Hebbian reinforcement.

### Hebbian Engine (`hebbian.ts`)
Learning mechanics. Four operations:
- **Reinforce** — Boost weight when a pointer is accessed/used
- **Decay** — Per-category temporal decay (Abitbol factor)
- **Co-activate** — Strengthen edges between frequently co-accessed pointers
- **Consolidate** — Merge similar pointers, prune dead weight

### Intelligence Extractor (`extractor.ts`)
Conversation analysis pipeline. Two modes:
- **LLM-powered** (primary) — Structured extraction prompt with JSON output
- **Heuristic fallback** — Regex patterns for high-confidence signals

Extracts using PIK taxonomy with per-category confidence thresholds.

### Learning Journal (`learning-journal.ts`)
Append-only JSONL audit log. Records every graph mutation with session context for cognitive archaeology and debugging.

### SIF Memory Manager (`sif-memory-manager.ts`)
Composite `MemorySearchManager` that merges pointer graph results with OpenClaw's builtin file/embedding search.

### Lifecycle Hooks (`hooks.ts`)
- `before_prompt_build` → Context injection (plugin mode only)
- `user_input` / `llm_output` → Conversation turn accumulation
- `session_end` → **Full extraction pipeline**
- `heartbeat` → Periodic decay + consolidation
- `before_compaction` / `before_reset` → Archive + pre-extraction

## Configuration

```yaml
memory:
  backend: sif
  sif:
    graphPath: ~/.sif/pointer-graph.yaml
    sifWeight: 1.2
    builtinWeight: 1.0
    maxResults: 5
    includeBuiltin: true
    hebbian:
      reinforceBoost: 0.12     # Max weight boost per access
      baseDecayRate: 0.02      # Daily decay rate
      coActivationBoost: 0.06  # Co-fire bonus
      pruneThreshold: 0.05     # Below this = candidate for pruning
      mergeThreshold: 0.75     # Jaccard similarity for merging
    extraction:
      useLlmExtraction: true   # Use LLM for extraction (recommended)
      minConfidence: 0.5       # Global minimum confidence
      maxExtractions: 10       # Cap per conversation
      minTurns: 3              # Minimum turns before extracting
```

### Abitbol Decay Multipliers

Per-category decay rates based on Victor Abitbol's 1995 decay theory:

| Category | Multiplier | Half-life | Rationale |
|----------|------------|-----------|----------|
| Archetype | 0.1× | ~300 days | Near-permanent identity patterns |
| Breakthrough | 0.2× | ~150 days | Hard-won insights persist |
| Skill | 0.4× | ~75 days | Practiced abilities |
| Knowledge | 0.6× | ~50 days | Factual information |
| Context | 2.0× | ~15 days | Ephemeral session state |

## File Structure

```
plugins/sif-memory/
├── index.ts              # Plugin entry (v0.3.0)
├── pointer-graph.ts      # Core graph data structure
├── hebbian.ts            # Hebbian learning engine
├── extractor.ts          # Intelligence extraction pipeline
├── learning-journal.ts   # Append-only audit log
├── sif-memory-manager.ts # MemorySearchManager backend
├── hooks.ts              # Lifecycle hooks (Phase 3)
├── tools.ts              # Agent-facing tools
├── package.json
├── tsconfig.json
└── README.md
```

## Data Flow (Phase 3)

```
1. User message arrives
2. before_prompt_build → search graph → inject top pointers as context
3. LLM generates response with SIF context
4. user_input + llm_output → accumulate turns in session buffer
5. session_end triggers:
   a. IntelligenceExtractor analyzes all turns
   b. Extracts skills, knowledge, patterns, archetypes, breakthroughs
   c. Deduplicates against existing graph (reinforce if similar exists)
   d. Writes new pointers with confidence-based initial weight
   e. HebbianEngine reinforces all accessed pointers
   f. LearningJournal records every mutation
   g. Graph saves to disk
6. heartbeat triggers:
   a. Decay pass (every ~30 min)
   b. Consolidation pass (daily): merge similar, co-activate, prune
```

## Sovereignty

The pointer graph is a portable file you own. Switch providers, switch agents, switch platforms — your intelligence follows. This is the escape hatch from AI memory lock-in.

---

*"The LLM is the CPU. The Pointer Graph is the Soul. OpenClaw is the Body."*
