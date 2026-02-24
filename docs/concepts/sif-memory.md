---
title: "SIF Memory"
summary: "Beginner guide to SIF — persistent, learnable memory for OpenClaw agents"
read_when:
  - You want to enable SIF memory for your agent
  - You want to understand how SIF pointers, decay, and reinforcement work
  - You want to configure SIF memory settings
---

# SIF Memory

SIF (Sovereign Intelligence Framework) gives your OpenClaw agent **persistent,
learnable memory**. It builds a Pointer Graph — a weighted network of knowledge
nodes that strengthen through use and fade when neglected, similar to how human
memory works.

SIF is an alternative to the default Markdown-based memory. Where default memory
stores plain text files, SIF stores structured **pointers** with types, tags,
weights, and automatic reinforcement.

## Quick start

### 1. Enable SIF as your memory backend

```bash
openclaw config set memory.backend sif
```

That's it. SIF creates its graph file automatically on first run.

### 2. Verify it's working

```bash
openclaw sif status
```

You should see:

```
Pointers: 0
Avg weight: 0.000
```

An empty graph, ready to learn.

### 3. Start chatting

Send a message to your agent through any channel (WhatsApp, Telegram, Discord,
the web UI, CLI — any of them). SIF works automatically in the background:

- **Before each prompt**, SIF searches the graph for knowledge related to your
  message and injects it as context
- **After each response**, SIF scans the agent's output for learning signals and
  stores them as new pointers

No special commands needed. Over time, SIF builds a knowledge base that makes
your agent more aware of your preferences, past decisions, and accumulated
insights.

## How it works

### The pointer graph

Everything SIF knows lives in a single JSON file (default:
`~/.openclaw/sif/pointer-graph.json`). The file contains **pointers** — each one
a piece of knowledge with metadata:

| Field       | What it is                                      |
| ----------- | ----------------------------------------------- |
| `type`      | Category of knowledge (see pointer types below) |
| `content`   | The actual knowledge text                       |
| `tags`      | Keywords for search (lowercased)                |
| `weight`    | Strength, 0 to 1 (higher = more important)      |
| `createdAt` | When the pointer was first stored               |

### Pointer types

SIF organizes knowledge into five types, each with a different lifespan:

| Type           | Half-life | What it stores                          | Example                                                         |
| -------------- | --------- | --------------------------------------- | --------------------------------------------------------------- |
| `knowledge`    | 30 days   | Facts, information, lessons             | "The production database runs on PostgreSQL 16"                 |
| `skill`        | 45 days   | Techniques, patterns, best practices    | "Use useCallback to prevent unnecessary React re-renders"       |
| `archetype`    | 60 days   | User preferences, personality, style    | "The user prefers concise answers with code examples"           |
| `breakthrough` | 90 days   | Key insights, pivotal realizations      | "Avoiding premature optimization saved 2 weeks on the refactor" |
| `context`      | 14 days   | Session-specific notes, temporary facts | "Currently working on the authentication module"                |

**Half-life** means how long it takes for an unused pointer to lose half its
weight. A `context` pointer fades quickly (14 days) because it's temporary. A
`breakthrough` pointer fades slowly (90 days) because insights are hard-won.

### Weight and decay

Every pointer has a **weight** between 0 and 1. Weight determines two things:

1. **Search ranking** — heavier pointers appear first in search results
2. **Context threshold** — only pointers above `minContextWeight` (default 0.2)
   get injected into the agent's prompt

Weight changes over time:

- **Decays** when unused — exponential decay based on the pointer's type
- **Increases** when accessed — each recall adds +0.02 (Hebbian reinforcement)
- **Increases** when explicitly reinforced — up to +0.15 per event
- **Gets a floor** after 10 accesses — consolidated pointers never drop below
  0.15, no matter how long they go unused

Think of it like muscle memory: knowledge you use regularly stays strong;
knowledge you never revisit gradually fades.

### Automatic context injection

Before your agent sees each message, SIF runs automatically:

1. Searches the graph using your message as the query
2. Picks the top matches (default: up to 8 pointers)
3. Filters out anything below `minContextWeight` (default: 0.2)
4. Injects matching pointers as background context

The agent sees something like:

```
<sif-context>
Relevant knowledge from your pointer graph:
- [archetype] User prefers TypeScript with strict mode (typescript, preferences)
- [skill] Use early returns to reduce nesting (clean-code, readability)
- [breakthrough] Database indexes on foreign keys cut query time by 80% (postgres, performance)
</sif-context>
```

This happens silently. The agent treats it as background knowledge, not as
instructions.

### Automatic learning

After the agent responds, SIF scans the response for **learning signals** —
phrases that indicate something worth remembering:

| Pattern in agent output  | Stored as      |
| ------------------------ | -------------- |
| "key insight: ..."       | `breakthrough` |
| "the user prefers ..."   | `archetype`    |
| "best practice is ..."   | `skill`        |
| "I learned that ..."     | `knowledge`    |
| "important context: ..." | `context`      |

Auto-extracted pointers start with a conservative weight of 0.4. They strengthen
if the agent recalls and uses them in later sessions.

**Deduplication**: SIF checks for existing pointers with similar content before
creating new ones. If something similar already exists, SIF reinforces the
existing pointer instead of creating a duplicate.

## Agent tools

Your agent has four SIF-specific tools it can use during conversations. You
don't need to call these yourself — the agent decides when to use them — but
it helps to know what they do.

### sif_recall

Searches the pointer graph. The agent uses this when it needs to remember
something specific.

```
sif_recall(query="React hooks", maxResults=5, type="skill")
```

Returns matching pointers ranked by relevance and weight. Each accessed pointer
gets a small reinforcement boost.

### sif_learn

Explicitly stores new knowledge. The agent uses this when it encounters
something clearly worth remembering.

```
sif_learn(type="archetype", content="User prefers dark mode and minimal UI", tags=["preferences", "ui"])
```

If a very similar pointer already exists, SIF reinforces it instead of creating
a duplicate.

### sif_reinforce

Strengthens an existing pointer. The agent uses this when a recalled pointer
proved especially useful.

```
sif_reinforce(id="pointer-uuid", boost=0.1)
```

### sif_status

Shows graph health — total pointers, average weight, distribution by type. The
agent uses this when you ask about your memory or when it wants to understand the
current state of your knowledge base.

## CLI commands

SIF adds two commands to the OpenClaw CLI:

### Check status

```bash
openclaw sif status
```

```
Pointers: 47
Avg weight: 0.412
  knowledge: 15
  skill: 12
  archetype: 8
  breakthrough: 5
  context: 7
```

### Search from the terminal

```bash
openclaw sif search "typescript generics" --limit 5
```

```
[skill] w=0.78 Use TypeScript generics to create reusable, type-safe data structures
[knowledge] w=0.62 TypeScript 5.4 added NoInfer utility type for better generic inference
[context] w=0.31 Currently refactoring the API layer to use generic request handlers
```

## Configuration

All settings are optional. SIF works with sensible defaults out of the box.

### Settings reference

| Setting                         | Default                              | What it does                                        |
| ------------------------------- | ------------------------------------ | --------------------------------------------------- |
| `memory.backend`                | `"builtin"`                          | Set to `"sif"` to enable SIF                        |
| `memory.sif.graphPath`          | `~/.openclaw/sif/pointer-graph.json` | Where the graph file is stored                      |
| `memory.sif.maxContextPointers` | `8`                                  | Max pointers injected per prompt                    |
| `memory.sif.minContextWeight`   | `0.2`                                | Minimum weight for context injection                |
| `memory.sif.decayHalfLifeDays`  | `30`                                 | Base decay rate (overridden by type-specific rates) |

### Set via CLI

```bash
openclaw config set memory.backend sif
openclaw config set memory.sif.maxContextPointers 12
openclaw config set memory.sif.minContextWeight 0.15
```

### Set via environment variable

```bash
export SIF_GRAPH_PATH=/path/to/my/pointer-graph.json
```

The environment variable overrides the config file setting for the graph path.

## Storage and privacy

All SIF data lives on your machine. Nothing is sent to the cloud.

```
~/.openclaw/sif/
  pointer-graph.json           # Your pointer graph (the main file)
  archives/
    1708700000000.jsonl         # Snapshots saved before /new or /reset
  journal/
    journal-2026-02-24.jsonl    # Audit log of graph changes
```

### Backups

SIF automatically archives the current graph state before you run `/new` or
`/reset` in a conversation. Archives are saved to `~/.openclaw/sif/archives/`
as JSONL files with a timestamp name.

The graph file itself uses **atomic writes** — SIF writes to a temporary file
first, then renames it into place. This prevents corruption if the process is
interrupted during a save.

## SIF vs default memory

| Feature               | Default (Markdown)                    | SIF (Pointer Graph)                                |
| --------------------- | ------------------------------------- | -------------------------------------------------- |
| **Storage format**    | Plain Markdown files                  | Structured JSON with typed pointers                |
| **How it learns**     | Agent writes to daily log / MEMORY.md | Automatic extraction + explicit tools              |
| **How it recalls**    | Vector search over text               | Tag + keyword search with weight ranking           |
| **Decay**             | None (files persist forever)          | Exponential decay by type (14-90 day half-lives)   |
| **Reinforcement**     | None                                  | Hebbian: +0.02 on access, consolidation at 10 uses |
| **Requires API key**  | Optional (for embeddings)             | No (keyword-based search)                          |
| **Context injection** | Manual (agent reads files)            | Automatic (before each prompt)                     |
| **Deduplication**     | None                                  | Jaccard similarity check on add                    |

**When to use SIF**: You want your agent to automatically build and maintain a
knowledge base that evolves over time — strengthening useful knowledge and
letting irrelevant knowledge fade.

**When to use default**: You want simple, human-readable Markdown files that you
can edit directly and that never expire.

You can switch between them at any time. They don't share state, so switching
back to SIF later will restore your pointer graph where you left off.

## Tips for getting the most out of SIF

**Let it learn naturally.** SIF works best when you have normal conversations.
The automatic extraction picks up insights, preferences, and patterns from the
agent's responses over time.

**Use consistent language.** When you tell your agent about preferences, use
clear phrases like "I prefer...", "I always...", or "remember that...". These
match SIF's extraction patterns.

**Check status periodically.** Run `openclaw sif status` every few weeks to see
how your graph is growing. A healthy graph typically has a mix of types with
average weight between 0.3 and 0.6.

**Don't worry about cleanup.** Outdated knowledge fades on its own through
temporal decay. You don't need to manually delete old pointers — they'll
naturally lose weight if you stop using them.

**Tags improve recall.** When the agent explicitly stores knowledge with
`sif_learn`, good tags make future searches more accurate. The agent handles
this automatically, but you can ask it to tag things specifically.

## Troubleshooting

### "No pointers" after several conversations

Check that SIF is enabled:

```bash
openclaw config get memory.backend
```

It should return `sif`. If it returns `builtin`, run:

```bash
openclaw config set memory.backend sif
```

### Pointers aren't being injected

Check `minContextWeight`. If it's too high, pointers might be below the
threshold. Try lowering it:

```bash
openclaw config set memory.sif.minContextWeight 0.1
```

### Graph file in wrong location

Check the current path:

```bash
openclaw config get memory.sif.graphPath
```

Or check for the environment variable:

```bash
echo $SIF_GRAPH_PATH
```

### Want to start fresh

Delete the graph file and SIF will create a new empty one:

```bash
rm ~/.openclaw/sif/pointer-graph.json
```

Your archives in `~/.openclaw/sif/archives/` are preserved.
