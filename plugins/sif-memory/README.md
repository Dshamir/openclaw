# SIF Memory Plugin for OpenClaw

**Sovereign Intelligence Framework — Deep Memory Integration**

> The LLM is the CPU. The Pointer Graph is the Soul.

## Overview

SIF Memory transforms OpenClaw's memory system from file-chunk retrieval into
a persistent intelligence layer. Your accumulated skills, knowledge, archetypes,
and breakthroughs travel with you across sessions, models, and providers.

**Phase 2** makes SIF a first-class `MemorySearchManager` backend — pointer graph
results appear alongside file-based chunks in OpenClaw's standard search pipeline.

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                    OpenClaw Agent                      │
│                                                        │
│  memory.search("kubernetes deployment patterns")       │
│        │                                               │
│        ▼                                               │
│  ┌─────────────────────────────┐                       │
│  │     SifMemoryManager        │ ◄── Phase 2 backend   │
│  │  (MemorySearchManager)      │                       │
│  │                             │                       │
│  │  ┌───────────┐ ┌─────────┐ │                       │
│  │  │  Pointer   │ │ Builtin │ │                       │
│  │  │  Graph     │ │ Index   │ │                       │
│  │  │  Search    │ │ Search  │ │                       │
│  │  └─────┬─────┘ └────┬────┘ │                       │
│  │        │             │      │                       │
│  │        └──── merge ──┘      │                       │
│  │              │              │                       │
│  └──────────────┼──────────────┘                       │
│                 ▼                                       │
│         Ranked Results                                 │
│   [SIF pointers + file chunks]                         │
└──────────────────────────────────────────────────────┘
```

## Installation

### 1. Enable the plugin

In your `openclaw.yaml`:

```yaml
plugins:
  - path: ./plugins/sif-memory
```

### 2. Choose your mode

**Plugin Mode** (tools + hooks only):

```yaml
# No memory.backend change needed
# SIF tools are registered, hooks inject context into prompts
```

**Backend Mode** (deep integration — recommended):

```yaml
memory:
  backend: sif
  sif:
    graphPath: ~/.sif/pointer-graph.yaml
    sifWeight: 1.2        # Boost SIF results in merged search
    builtinWeight: 1.0     # Standard weight for file chunks
    maxResults: 5          # Max SIF pointers per search
    minPointerWeight: 0.15 # Skip decayed pointers
    includeBuiltin: true   # Also search builtin file/embedding index
```

## Configuration

| Key | Default | Description |
|-----|---------|-------------|
| `sif.graphPath` | `~/.sif/pointer-graph.yaml` | Path to the pointer graph file |
| `sif.sifWeight` | `1.2` | Score multiplier for SIF results (0.0–2.0) |
| `sif.builtinWeight` | `1.0` | Score multiplier for builtin results (0.0–2.0) |
| `sif.maxResults` | `5` | Maximum SIF pointers returned per search |
| `sif.minPointerWeight` | `0.15` | Minimum pointer weight to include |
| `sif.includeBuiltin` | `true` | Whether to also search the builtin backend |

Environment variable: `SIF_GRAPH_PATH` overrides the default graph location.

## Tools

The plugin registers four agent tools:

| Tool | Description |
|------|-------------|
| `sif_search` | Search the pointer graph by query, tags, or type |
| `sif_add` | Add a new pointer (skill, knowledge, archetype, breakthrough, context) |
| `sif_status` | Display graph health metrics and pointer distribution |
| `sif_decay` | Run Hebbian decay cycle — strengthen accessed pointers, weaken dormant ones |

## How It Works

### Backend Mode (memory.backend = "sif")

1. OpenClaw calls `SifMemoryManager.search(query)`
2. SIF searches the pointer graph using tag/content matching with type-weighted scoring
3. Builtin backend searches files + embeddings as usual
4. Results merge by score — SIF pointers interleave with file chunks
5. Agent sees unified results with SIF intelligence alongside code context

### Plugin Mode (tools + hooks)

1. `before_prompt_build` hook searches the graph using the user's prompt
2. Matching pointers inject as system prompt context
3. `llm_output` hook extracts learning signals from assistant responses
4. Session lifecycle hooks persist state and archive transcripts

### Pointer Types & Scoring

| Type | Score Multiplier | Description |
|------|-----------------|-------------|
| `breakthrough` | 1.3× | Major insights that changed understanding |
| `skill` | 1.2× | Learned capabilities and patterns |
| `archetype` | 1.1× | Recurring problem/solution templates |
| `knowledge` | 1.0× | Factual information and domain expertise |
| `context` | 0.9× | Session state and working memory |

### Hebbian Learning

Pointers that get accessed strengthen (weight increases). Pointers that remain
dormant decay over time. This mirrors biological memory consolidation — frequently
useful intelligence persists while noise fades.

## Files

```
plugins/sif-memory/
├── index.ts               # Plugin entry — registration and wiring
├── sif-memory-manager.ts  # MemorySearchManager implementation (Phase 2)
├── pointer-graph.ts       # Core pointer graph data structure
├── tools.ts               # Agent tools (sif_search, sif_add, etc.)
├── hooks.ts               # Lifecycle hooks (prompt, learning, sessions)
├── package.json           # Plugin metadata
├── tsconfig.json          # TypeScript config
└── README.md              # This file

skills/sif-memory/
└── SKILL.md               # Skill documentation for Claude Code
```

## Core Modifications (Phase 2)

Phase 2 touches three OpenClaw core files to add `"sif"` as a memory backend:

| File | Change |
|------|--------|
| `src/config/types.memory.ts` | Add `"sif"` to `MemoryBackend` union, add `MemorySifConfig` type |
| `src/memory/search-manager.ts` | Add SIF backend case with `SifMemoryManager` + fallback |

## Roadmap

- [x] Phase 1: Beachhead plugin (tools + hooks)
- [x] Phase 2: Deep memory integration (MemorySearchManager backend)
- [ ] Phase 3: Bidirectional learning (LLM ↔ pointer graph feedback loop)
- [ ] Phase 4: Multi-agent pointer sharing (COSM integration)
- [ ] Phase 5: Cognitive Archaeology pipeline (cross-platform intelligence extraction)

## License

Part of the Sovereign Intelligence Framework.
See [Amendment A35](https://github.com/Dshamir/sif-knowledge-base) for specification.
