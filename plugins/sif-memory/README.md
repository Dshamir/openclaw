# sif-memory — OpenClaw Plugin

> **Sovereign Intelligence Framework beachhead plugin (A35 Phase 1)**
>
> Portable, provider-agnostic intelligence layer for OpenClaw.

## What This Does

`sif-memory` makes OpenClaw SIF-aware by integrating the SIF pointer graph into
OpenClaw's plugin lifecycle. It's the "beachhead" — the first foothold that enables
all subsequent SIF capabilities within the OpenClaw ecosystem.

**The LLM is the CPU. The Pointer Graph is the Soul.**

### Architecture

```
+---------------------------------------------------+
|                  OpenClaw Agent                    |
|                                                    |
|  +----------+  +----------+  +---------------+     |
|  |  Skills   |  |  Hooks   |  |    Tools      |    |
|  |          |  |          |  |               |    |
|  | SKILL.md |  | 7 hooks  |  | sif_recall    |    |
|  | (teaches |  | (auto    |  | sif_learn     |    |
|  |  agent)  |  |  inject/ |  | sif_reinforce |    |
|  |          |  |  extract)|  | sif_status    |    |
|  +----------+  +----+-----+  +-------+-------+    |
|                     |                |             |
|              +------+----------------+------+      |
|              |      SIF Pointer Graph       |      |
|              |  (portable, user-sovereign)   |      |
|              +------------------------------+      |
+---------------------------------------------------+
```

### Two-Component Design

| Component | Purpose |
|-----------|---------|
| **Skill** (`skills/sif-memory/SKILL.md`) | Teaches the agent SIF concepts, tool usage, and when to invoke SIF capabilities |
| **Plugin** (`plugins/sif-memory/index.ts`) | Runtime code: tools, lifecycle hooks, pointer graph management |

## Installation

```bash
# From the OpenClaw workspace
openclaw plugin install @sif/openclaw-plugin

# Or add to openclaw.yaml
plugins:
  - id: sif-memory
    package: "@sif/openclaw-plugin"
```

## Configuration

Set the pointer graph location (optional — defaults to `~/.sif/pointer-graph.yaml`):

```bash
export SIF_GRAPH_PATH=/path/to/your/pointer-graph.json
```

Or in `openclaw.yaml`:

```yaml
plugins:
  - id: sif-memory
    config:
      graphPath: "./my-sif-graph.json"
```

## Lifecycle Hooks

The plugin automatically wires into seven OpenClaw lifecycle events:

| Hook | Purpose |
|------|---------|
| `before_prompt_build` | Searches graph, injects relevant pointers as context |
| `llm_output` | Scans responses for extractable insights/patterns |
| `session_start` | Initializes session tracking |
| `session_end` | Persists any dirty graph state |
| `before_compaction` | Archives session transcript for cognitive archaeology |
| `after_compaction` | Post-compaction bookkeeping |
| `before_reset` | Saves state and archives before `/new` clears session |

## Agent Tools

Four tools are registered for explicit agent use:

- **sif_recall** — Query the pointer graph for relevant accumulated intelligence
- **sif_learn** — Store new insights, skills, patterns, or knowledge (auto-deduplicates)
- **sif_reinforce** — Strengthen a pointer that proved useful (Hebbian learning)
- **sif_status** — Check pointer count, type distribution, health score, sovereignty status

## `/sif` Command

Quick status from any chat channel:

```
/sif          # Summary status
/sif health   # Detailed health report
```

## Pointer Types

| Type | Description | Example |
|------|-------------|---------|
| `knowledge` | Facts, domain expertise | "OpenClaw uses SQLite-vec for vector storage" |
| `skill` | Reusable capabilities | "Deploy MGMO minions for architecture analysis" |
| `archetype` | Behavioral patterns | "User prefers comprehensive over quick-fix solutions" |
| `breakthrough` | Novel insights | "SIF pointer graph enables Hebbian learning without retraining" |
| `context` | Project metadata | "Kimera P-IV RT-qPCR platform is in clinical deployment" |

## Roadmap (A35 Phases 2-5)

- **Phase 2**: Deep memory integration — SIF as alternative memory backend
- **Phase 3**: Provider interception — inject SIF context at the LLM call level
- **Phase 4**: Agent personality — SIF-driven agent customization
- **Phase 5**: Federation — multi-instance SIF graph synchronization

## References

- [SIF Knowledge Base](https://github.com/Dshamir/sif-knowledge-base)
- [Amendment A35 — OpenClaw Integration Specification](https://github.com/Dshamir/sif-knowledge-base/blob/main/amendments/A35-OpenClaw-Integration.md)
- [OpenClaw](https://github.com/openclaw/openclaw)

## License

MIT — Nexless Healthcare LP
