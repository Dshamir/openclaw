---
name: sif-memory
description: "Sovereign Intelligence Framework (SIF) memory layer: portable, provider-agnostic intelligence that persists across sessions. Use when: (1) recalling learned user patterns, preferences, or project context, (2) storing new insights, skills, or breakthroughs from conversations, (3) querying the pointer graph for accumulated knowledge, (4) checking SIF sovereignty status. NOT for: simple factual lookups (use web search), ephemeral session-only state (use working memory), or raw file storage."
metadata:
  {
    "openclaw":
      {
        "emoji": "🧠",
        "requires": { "env": ["SIF_GRAPH_PATH"] },
        "install":
          [
            {
              "id": "sif-init",
              "kind": "npm",
              "package": "@sif/openclaw-plugin",
              "bins": [],
              "label": "Initialize SIF pointer graph",
            },
          ],
      },
  }
---

# SIF Memory Skill — Sovereign Intelligence Framework

The Sovereign Intelligence Framework (SIF) is a persistent intelligence layer that
runs alongside OpenClaw's built-in memory. While OpenClaw memory handles file
embeddings and session recall, SIF captures **accumulated intelligence**: skills,
archetypes, patterns, knowledge, and breakthroughs that transcend individual sessions.

**Core Principle**: "The LLM is the CPU, the Pointer Graph is the Soul."

## When to Use

✅ **USE this skill when:**

- The user references past context, projects, or preferences
- A conversation produces a reusable insight, skill, or pattern
- The user says "recall", "remember", or references their SIF graph
- Building on previously learned knowledge across sessions
- The user asks about their accumulated intelligence or sovereignty status
- Extracting archetypes from complex problem-solving sessions

## When NOT to Use

❌ **DON'T use this skill when:**

- Simple factual questions (use web search or built-in knowledge)
- Temporary session-only state (use working memory)
- Raw file operations (use filesystem tools)
- OpenClaw's built-in memory already has the needed context

## SIF Concepts

### Pointer Graph
The persistent knowledge structure containing typed nodes:
- **Knowledge**: Facts, domain expertise, learned information
- **Skills**: Reusable capabilities extracted from problem-solving
- **Archetypes**: Behavioral patterns and approaches
- **Breakthroughs**: Novel insights worth preserving
- **Context**: Project metadata, relationships, preferences

### Pointer Types
Each pointer has: `id`, `type`, `content`, `weight` (0.0-1.0),
`tags[]`, `lineage` (origin tracking), and `timestamp`.

### Hebbian Reinforcement
Pointers strengthen through use (weight increases) and weaken through
neglect (temporal decay). This mirrors biological learning without
requiring model retraining.

### Provider Sovereignty
The pointer graph is owned by the user, not any LLM provider.
It works with any model — Claude, GPT, Gemini, Llama, etc.

## Available Tools

### `sif_recall`
Query the pointer graph for relevant context.
```
sif_recall({ query: "user's coding preferences", maxResults: 5 })
```

### `sif_learn`
Store a new insight, skill, or pattern in the pointer graph.
```
sif_learn({
  type: "skill",
  content: "User prefers TypeScript strict mode with no-any rule",
  tags: ["typescript", "preferences", "coding-style"],
  weight: 0.8
})
```

### `sif_reinforce`
Strengthen an existing pointer that proved useful.
```
sif_reinforce({ pointerId: "ptr_abc123", boost: 0.1 })
```

### `sif_status`
Check the current state of the SIF intelligence layer.
```
sif_status()
// Returns: pointer count, graph health, last sync, sovereignty status
```

## Automatic Behaviors

The SIF plugin automatically:
1. **Injects relevant context** before each prompt via pointer graph search
2. **Extracts learning signals** from LLM outputs (new insights, patterns)
3. **Archives sessions** before compaction to preserve full conversation history
4. **Applies temporal decay** to reduce noise from stale knowledge
5. **Tracks pointer lineage** for full auditability

## Integration with OpenClaw Memory

SIF and OpenClaw memory are complementary:

| Feature | OpenClaw Memory | SIF Layer |
|---------|----------------|-----------|
| Storage | SQLite + embeddings | Pointer graph (YAML/JSON) |
| Scope | File chunks, session history | Skills, patterns, breakthroughs |
| Lifecycle | Per-workspace | Cross-workspace, portable |
| Provider | Tied to embedding model | Provider-agnostic |
| Ownership | Platform-managed | User-sovereign |

## Notes

- SIF never replaces OpenClaw memory — it augments it with persistent intelligence
- Pointer graph location defaults to `~/.sif/pointer-graph.yaml`
- Override with `SIF_GRAPH_PATH` environment variable
- All learning is transparent: users can inspect, edit, or export their graph
- The `/sif` command provides quick status in any chat channel
