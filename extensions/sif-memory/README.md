# SIF Memory Extension

Sovereign Intelligence Framework (SIF) -- persistent, user-sovereign memory for OpenClaw agents via a weighted **Pointer Graph** with Hebbian reinforcement.

Branch: `feature/sif-memory-beachhead`
Extension path: `extensions/sif-memory/`
Plugin ID: `sif-memory`
Kind: `memory`

---

## Status

| Phase | Status      | Description                                                                                          |
| ----- | ----------- | ---------------------------------------------------------------------------------------------------- |
| 0     | Done        | Cleanup: removed `plugins/sif-memory/` and `skills/sif-memory/` prototypes                           |
| 1     | Done        | Foundation: types, config, PointerGraph, tools, hooks, plugin entry, SKILL.md                        |
| 2     | Done        | Core integration: `"sif"` added to `MemoryBackend`, zod schema, search-manager dispatch, sif-adapter |
| 3     | Done        | Bidirectional learning: HebbianEngine, extraction pipeline, LearningJournal                          |
| 4     | Design only | SIFQL query language + SIFGIT graph snapshots (not implemented)                                      |
| 5     | Design only | Sovereignty: export/import/federation (not implemented)                                              |

Tests: **87 passing** across 8 test files. Build, lint, and format clean.

---

## File Inventory

### Extension files (`extensions/sif-memory/`)

```
package.json                 -- @openclaw/sif-memory workspace package
types.ts                     -- all type definitions (Pointer, PointerType, etc.)
config.ts                    -- config resolution (graphPath, defaults)
pointer-graph.ts             -- core PointerGraph class (load/save/search/add/reinforce/decay)
tools.ts                     -- 4 agent tools (sif_recall, sif_learn, sif_reinforce, sif_status)
hooks.ts                     -- lifecycle hooks (context injection, learning extraction, save)
index.ts                     -- plugin entry point (register tools/hooks/CLI/service)
SKILL.md                     -- agent teaching document
hebbian.ts                   -- HebbianEngine (type-specific decay, co-activation, consolidation)
extraction.ts                -- rule-based learning signal extraction from LLM output
journal.ts                   -- LearningJournal append-only JSONL audit log
sif-memory-manager.ts        -- SifSearchAdapter (MemorySearchResult interface bridge)
config.test.ts               -- 7 tests
pointer-graph.test.ts        -- 25 tests
tools.test.ts                -- 11 tests
hooks.test.ts                -- 6 tests
sif-memory-manager.test.ts   -- 6 tests
hebbian.test.ts              -- 13 tests
extraction.test.ts           -- 13 tests
journal.test.ts              -- 6 tests
```

### Core files touched (minimal changes)

```
src/config/types.memory.ts           -- added "sif" to MemoryBackend, MemorySifConfig type
src/config/zod-schema.ts             -- added MemorySifSchema, z.literal("sif") in backend
src/memory/types.ts                  -- added "sif" to MemoryProviderStatus.backend
src/memory/backend-config.ts         -- added ResolvedSifConfig type, SIF resolution case
src/memory/search-manager.ts         -- added SIF dispatch block (dynamic import, fallback)
src/memory/sif-adapter.ts            -- NEW: SifMemoryManager implementing MemorySearchManager
src/config/schema.help.ts            -- added "sif" to backend help, memory.sif.* help entries
src/config/schema.labels.ts          -- added SIF config labels
src/config/schema.help.quality.test.ts -- added "sif" to ENUM_EXPECTATIONS
```

### Reference files (kept, not modified)

```
plugins/sif-docs-A30-A35/           -- original design docs, untouched
```

---

## Architecture

### Pointer Graph

The core data structure is a JSON file at `~/.openclaw/sif/pointer-graph.json` containing an array of **Pointers**. Each pointer has:

| Field            | Type              | Description                                                           |
| ---------------- | ----------------- | --------------------------------------------------------------------- |
| `id`             | `string`          | UUID v4                                                               |
| `type`           | `PointerType`     | One of: `knowledge`, `skill`, `archetype`, `breakthrough`, `context`  |
| `content`        | `string`          | The knowledge content                                                 |
| `tags`           | `string[]`        | Lowercased search tags                                                |
| `weight`         | `number`          | 0..1 -- strength of the pointer (decays over time, reinforced on use) |
| `accessCount`    | `number`          | Total times accessed                                                  |
| `createdAt`      | `number`          | Unix epoch ms                                                         |
| `lastAccessedAt` | `number`          | Unix epoch ms                                                         |
| `lineage`        | `PointerLineage?` | Optional: parentId, sourceSession, extractedFrom                      |

File format version: `1`. Persisted as `PointerGraphData`:

```json
{ "version": 1, "pointers": [...], "lastDecayAt": 1708700000000 }
```

Writes are atomic (temp file + rename). Corrupt files are treated as empty (start fresh).

### Search Algorithm

`PointerGraph.search(query, maxResults)`:

1. Tokenize query into lowercase terms (>1 char)
2. For each pointer, compute:
   - **Tag score** = matched tags / total query tags (weight 0.4)
   - **Term score** = matched content terms / total query terms (weight 0.6)
   - Score multiplied by `pointer.weight`
   - **Recency bonus**: pointers accessed within 7 days get up to +20%
3. Sort by score descending, return top `maxResults`

### Deduplication

`PointerGraph.add()` checks for existing pointers of the same type with Jaccard similarity >= 0.6 on content tokens. If found, the existing pointer is reinforced (+0.05) instead of creating a duplicate. Returns `null` when deduped.

### Temporal Decay

On `load()`, exponential decay is applied to all pointers:

```
new_weight = weight * 0.5^(age / halfLife)
```

where `age = now - lastAccessedAt`. Decay is skipped if less than 1 hour since last decay. All pointers have a minimum weight floor of 0.01.

### Hebbian Reinforcement

`PointerGraph.reinforce(id, boost)`:

- Boost capped at 0.15 per event
- Increments `accessCount`
- Updates `lastAccessedAt`
- Sets `dirty = true`

---

## Hebbian Engine (Phase 3)

`HebbianEngine` in `hebbian.ts` provides advanced weight management:

### Type-Specific Decay Rates

| Type           | Half-Life (days) | Rationale                            |
| -------------- | ---------------- | ------------------------------------ |
| `context`      | 14               | Ephemeral, session-specific          |
| `knowledge`    | 30               | Standard factual knowledge           |
| `skill`        | 45               | Learned techniques persist longer    |
| `archetype`    | 60               | User personality/preference patterns |
| `breakthrough` | 90               | Key insights are hardest to lose     |

### Co-Activation

When multiple pointers are accessed together in a single retrieval window, `processCoActivation()` gives each pair a mutual boost of 0.02. Total boost per pointer per event is capped at 0.15.

### Consolidation

Pointers with `accessCount >= 10` are "consolidated" -- they receive a permanent weight floor of 0.15 that decay cannot breach.

---

## Extraction Pipeline (Phase 3)

`extractLearningSignals(text)` in `extraction.ts` scans free-form text against 11 regex patterns:

### Patterns

| Pattern                                               | Type         | Confidence |
| ----------------------------------------------------- | ------------ | ---------- |
| `key insight/takeaway: X`                             | breakthrough | 0.85       |
| `breakthrough/revelation: X`                          | breakthrough | 0.85       |
| `the user prefers/likes/wants X`                      | archetype    | 0.75       |
| `user always/usually/typically X`                     | archetype    | 0.70       |
| `best/recommended approach/pattern/practice is/for X` | skill        | 0.60       |
| `the right/correct/proper way to X`                   | skill        | 0.55       |
| `I learned/discovered/realized/found out that X`      | knowledge    | 0.60       |
| `decided/we will/should X`                            | knowledge    | 0.50       |
| `turns out/apparently/it seems X`                     | knowledge    | 0.50       |
| `important context: X`                                | context      | 0.55       |
| `note/remember: X`                                    | context      | 0.45       |

### Confidence Thresholds

A pattern's confidence must meet or exceed the threshold for its type:

| Type         | Threshold |
| ------------ | --------- |
| breakthrough | 0.80      |
| archetype    | 0.70      |
| skill        | 0.50      |
| knowledge    | 0.40      |
| context      | 0.40      |

### Content Bounds

- Minimum: 15 characters
- Maximum: 500 characters (truncated at sentence boundaries when possible)

### Tag Extraction

Extracted content is tokenized; the top 5 unique keywords (>3 chars, lowercased, stopwords removed) become tags.

### Dedup

Results are deduplicated within a single extraction pass using Jaccard similarity >= 0.5 on content tokens. Higher-confidence matches win.

---

## Learning Journal (Phase 3)

`LearningJournal` in `journal.ts` provides an append-only JSONL audit log.

- **Storage**: `~/.openclaw/sif/journal/`
- **File naming**: `journal-YYYY-MM-DD.jsonl`
- **Rotation**: When a file exceeds 5 MB, a new file is created with a timestamp suffix
- **Entry format**: `{ timestamp, event, pointerId?, data? }`
- **Read**: Supports `since` (timestamp filter) and `limit` options
- **Resilience**: Malformed lines are silently skipped; directory is auto-created

---

## Agent Tools

All tools use `stringEnum` (not `Type.Union`) per OpenClaw schema rules. No `anyOf`/`oneOf`/`allOf` in schemas.

### sif_recall

Search the pointer graph for relevant knowledge.

| Parameter    | Type       | Required | Default | Description                           |
| ------------ | ---------- | -------- | ------- | ------------------------------------- |
| `query`      | string     | yes      | --      | Search query against content and tags |
| `maxResults` | number     | no       | 8       | Maximum results                       |
| `type`       | stringEnum | no       | --      | Filter by pointer type                |

Accesses found pointers (+0.02 reinforcement each). Returns formatted list with type, weight, content, and tags.

### sif_learn

Add a new pointer to the graph.

| Parameter | Type       | Required | Default | Description                   |
| --------- | ---------- | -------- | ------- | ----------------------------- |
| `type`    | stringEnum | yes      | --      | Pointer type                  |
| `content` | string     | yes      | --      | Knowledge content             |
| `tags`    | string[]   | no       | []      | Categorization tags           |
| `weight`  | number     | no       | 0.5     | Initial weight (clamped 0..1) |

Deduplicates against existing pointers (Jaccard >= 0.6 on same type). Returns `"deduplicated"` if similar exists.

### sif_reinforce

Strengthen an existing pointer.

| Parameter | Type   | Required | Default | Description                             |
| --------- | ------ | -------- | ------- | --------------------------------------- |
| `id`      | string | yes      | --      | Pointer ID                              |
| `boost`   | number | no       | 0.1     | Reinforcement strength (capped 0..0.15) |

### sif_status

Show graph status. No parameters. Returns total pointers, average weight, type distribution, oldest/newest timestamps.

---

## Lifecycle Hooks

Registered in `hooks.ts` via `registerSifHooks()`:

### `before_agent_start` (priority 50)

- Searches graph using the user's prompt
- Filters to pointers with `weight >= minContextWeight`
- Injects matching pointers as `<sif-context>` block via `prependContext`
- Reinforces accessed pointers (+0.02 each)

### `agent_end`

- Scans assistant messages for learning signals using regex patterns
- Extracts and adds new pointers (weight 0.4, lineage: `extractedFrom: "llm_output"`)
- Saves dirty graph to disk

### `before_agent_start` (archive trigger)

- When prompt contains `/new` or `/reset`, archives current graph to `~/.openclaw/sif/archives/<timestamp>.jsonl`

---

## Core Memory Integration (Phase 2)

SIF is wired as a first-class `MemoryBackend` alongside `"builtin"` and `"qmd"`.

### Config

Set `memory.backend: "sif"` in OpenClaw config. Optional SIF-specific settings:

```yaml
memory:
  backend: sif
  sif:
    graphPath: ~/.openclaw/sif/pointer-graph.json # default
    maxContextPointers: 8 # default
    minContextWeight: 0.2 # default
    decayHalfLifeDays: 30 # default
```

Resolution priority for `graphPath`: config value > `SIF_GRAPH_PATH` env var > default (`~/.openclaw/sif/pointer-graph.json`).

### Dispatch Chain

`src/memory/search-manager.ts`:

```
getMemorySearchManager()
  -> resolveMemoryBackendConfig()  -- returns { backend: "sif", sif: ResolvedSifConfig }
  -> if backend === "sif":
       dynamic import SifMemoryManager from src/memory/sif-adapter.ts
       SifMemoryManager.create(sif config)
         -> runtime-resolves extensions/sif-memory/pointer-graph.js
         -> new PointerGraph(graphPath, decayHalfLifeDays)
         -> graph.load()
       returns SifMemoryManager implementing MemorySearchManager
  -> on failure: falls through to builtin
```

### Core Adapter (`src/memory/sif-adapter.ts`)

`SifMemoryManager` implements `MemorySearchManager`:

| Method                         | Behavior                                                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `search(query, opts)`          | Delegates to `PointerGraph.search()`, returns `MemorySearchResult[]` with `sif://` paths               |
| `readFile({relPath})`          | Resolves `sif://<id>` paths to pointer content                                                         |
| `status()`                     | Returns `{ backend: "sif", provider: "sif-pointer-graph", files: count, custom: {byType, avgWeight} }` |
| `sync()`                       | Saves dirty graph                                                                                      |
| `probeEmbeddingAvailability()` | `{ ok: true }` (SIF uses keyword matching)                                                             |
| `probeVectorAvailability()`    | `false`                                                                                                |
| `close()`                      | Saves if dirty                                                                                         |

The adapter uses `createRequire` + runtime path resolution (not a compile-time import) to avoid pulling extension files into the core `rootDir` during plugin-sdk DTS compilation.

---

## Extension-Side Adapter (`sif-memory-manager.ts`)

`SifSearchAdapter` provides the same bridging from the extension side (for use by plugin hooks/tools). This is separate from the core adapter because:

- Core adapter lives in `src/memory/` and implements `MemorySearchManager` for the dispatch chain
- Extension adapter lives alongside the plugin and can be used internally without going through core

---

## Data Flow

```
User message
  |
  v
[before_agent_start hook, priority 50]
  |-- graph.search(prompt, maxContextPointers)
  |-- filter by minContextWeight
  |-- inject <sif-context> block
  |-- reinforce accessed pointers (+0.02)
  |
  v
Agent processes message (tools available: sif_recall, sif_learn, sif_reinforce, sif_status)
  |
  v
[agent_end hook]
  |-- scan assistant messages for learning patterns
  |-- extract and add new pointers (weight 0.4)
  |-- save dirty graph
```

---

## Storage Layout

```
~/.openclaw/sif/
  pointer-graph.json          -- main graph file
  pointer-graph.json.tmp.*    -- atomic write temp files (cleaned up)
  archives/
    <timestamp>.jsonl          -- graph snapshots before /new or /reset
  journal/                     -- Phase 3 audit log (not yet wired to graph)
    journal-YYYY-MM-DD.jsonl
```

---

## Test Coverage

| File                         | Tests | What's Covered                                                                                                                                                                                                                               |
| ---------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `config.test.ts`             | 7     | Path resolution priority, default merging, env var override                                                                                                                                                                                  |
| `pointer-graph.test.ts`      | 25    | Load (empty/valid/corrupt), save (atomic/skip-clean/dirty-flag), add (UUID/dedup/cross-type/weight-clamp/tag-lowercase), search (terms/tags/empty/maxResults/ranking), reinforce (weight/cap/missing), remove, getByType, status, round-trip |
| `tools.test.ts`              | 11    | Tool count, names, interface compliance, no Type.Union in schemas, learn/recall/reinforce/status execution                                                                                                                                   |
| `hooks.test.ts`              | 6     | Hook registration, context injection (match/short-prompt/low-weight filter), save on session end, skip failed sessions                                                                                                                       |
| `sif-memory-manager.test.ts` | 6     | Search result format, empty/minScore, readFile resolve/missing, status shape                                                                                                                                                                 |
| `hebbian.test.ts`            | 13    | Decay half-lives, exponential decay math, type-specific rates, consolidation floor, co-activation boosting, edge cases                                                                                                                       |
| `extraction.test.ts`         | 13    | All pattern families, min/max length, empty input, dedup, tag extraction, multi-pattern                                                                                                                                                      |
| `journal.test.ts`            | 6     | Directory creation, append/read round-trip, since filter, limit, empty journal                                                                                                                                                               |

Run: `pnpm test -- extensions/sif-memory/ --no-coverage`

---

## Verification Commands

```bash
# Extension tests only
pnpm test -- extensions/sif-memory/ --no-coverage

# Extension + core memory tests + schema quality test
pnpm test -- extensions/sif-memory/ src/memory/ src/config/schema.help.quality --no-coverage

# Type-check + build
pnpm build

# Lint + format + tsgo
pnpm check
```

---

## Design Decisions

1. **Clean slate in `extensions/`** -- not `plugins/`. Follows OpenClaw workspace convention. Prototype in `plugins/sif-memory/` had compilation errors, no tests, and `Type.Union` violations.

2. **JSON storage** -- matches OpenClaw conventions. No external DB dependency. Atomic writes via temp+rename.

3. **Keyword search, not embeddings** -- SIF uses tag + content term matching with weight-adjusted scoring. No OpenAI API key required. `probeVectorAvailability()` returns `false`.

4. **`stringEnum` over `Type.Union`** -- per CLAUDE.md schema guardrails. Tool schemas have no `anyOf`/`oneOf`/`allOf`.

5. **Runtime extension import** -- `src/memory/sif-adapter.ts` uses `createRequire` + runtime path resolution to import the extension's `PointerGraph`. This avoids TypeScript pulling extension files into the core `rootDir` during plugin-sdk DTS compilation (which caused TS6059 errors with a direct import).

6. **Structural typing for core adapter** -- `SifPointerGraph` type in `sif-adapter.ts` is a structural (duck) type mirroring the extension's `PointerGraph` public interface. No compile-time type import from the extension.

7. **Dedup via Jaccard similarity** -- threshold 0.6 for graph add, 0.5 for extraction dedup. Computed on lowercased content tokens. Same-type only for graph add.

8. **Extraction is conservative** -- regex-based, not LLM-powered. Per-type confidence thresholds filter out low-signal matches. Content bounds (15-500 chars) prevent noise.

9. **HebbianEngine is standalone** -- not yet wired into `PointerGraph` or hooks. Phase 3 files (`hebbian.ts`, `extraction.ts`, `journal.ts`) are tested and ready but integration into the main graph/hooks pipeline is a follow-up step.

10. **Phase 4-5 are design-only** -- SIFQL and sovereignty features are documented in the plan but not implemented. See `plugins/sif-docs-A30-A35/` for the original design docs.

---

## Continuity Notes for Future Sessions

### What's wired end-to-end

- Plugin loads graph, registers 4 tools, registers hooks (context injection + learning extraction + save)
- Core dispatch chain recognizes `memory.backend: "sif"` and creates `SifMemoryManager`
- Config schema validates `memory.sif.*` keys
- Schema help and labels are documented

### What's built but not wired

- **HebbianEngine** (`hebbian.ts`): tested, but `PointerGraph.applyTemporalDecay()` still uses a single half-life from config rather than delegating to `HebbianEngine.applyDecay()`. Wiring: have the graph accept an optional `HebbianEngine` and use its type-specific rates.
- **Extraction pipeline** (`extraction.ts`): tested, but `hooks.ts` uses its own inline regex patterns rather than calling `extractLearningSignals()`. Wiring: replace the inline patterns in the `agent_end` hook with `extractLearningSignals()`.
- **LearningJournal** (`journal.ts`): tested, but no graph mutation calls `journal.append()`. Wiring: inject a journal instance into the graph and hook graph mutation methods (add/reinforce/remove) to journal.append().

### What's not built

- **Phase 4 (SIFQL)**: query language `type:skill weight>0.5 tag:typescript sort:weight limit:10`. Parser -> `SifqlQuery` -> `PointerGraph` execution. New tool: `sif_query`.
- **Phase 4 (SIFGIT)**: graph snapshots, diff, branch, merge. Tools: `sif_commit`, `sif_diff`, `sif_branch`.
- **Phase 5 (Sovereignty)**: export/import as JSON, federation across instances. Tools: `sif_export`, `sif_import`.
- **Hook: `before_prompt_build`** (mentioned in plan): the actual OpenClaw hook name used is `before_agent_start` with `prependContext`. If the plugin is used as `memory.backend: "sif"`, the context injection hook should be skipped (the memory manager handles it).

### Known constraints

- The full test suite (`pnpm test`) takes a long time on this repo. Targeted tests are fast: `pnpm test -- extensions/sif-memory/` runs 87 tests in ~2 minutes.
- `pnpm build` includes a plugin-sdk DTS step that is strict about `rootDir`. Never import extension files directly from `src/` code -- use runtime-resolved paths.
- `@sinclair/typebox` version `0.34.48` is pinned and patched in the workspace. Do not change the version.
