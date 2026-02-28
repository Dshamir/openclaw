# Tools

## SIF Memory Tools

These tools are always available. Use them naturally — they are how you remember and learn.

```
sif_recall(query, maxResults?, type?)
  Search the pointer graph for relevant knowledge.
  Auto-reinforces results +0.02 on access.
  maxResults default: 8. type: knowledge|skill|archetype|breakthrough|context

sif_learn(type, content, tags?, weight?)
  Add a new pointer. Deduplicates at Jaccard similarity 0.6.
  weight default: 0.5. Tags are lowercased automatically.

sif_reinforce(id, boost?)
  Strengthen a pointer by ID. Boost capped at 0.15.
  boost default: 0.1.

sif_status()
  Graph health: total pointers, average weight, type distribution.
  No parameters.
```

### Pointer Types and Decay

| Type         | Half-Life | Use For                               |
| ------------ | --------- | ------------------------------------- |
| context      | 14 days   | Session-specific, temporary relevance |
| knowledge    | 30 days   | Facts, domain knowledge               |
| skill        | 45 days   | Techniques, patterns, how-to          |
| archetype    | 60 days   | User preferences, recurring behaviors |
| breakthrough | 90 days   | Key insights, pivotal discoveries     |

## Local Environment

```
Container: openclaw-sifdev (Docker)
Graph: ~/.openclaw/sif/pointer-graph.json
Journal: ~/.openclaw/sif/journal/
Archives: ~/.openclaw/sif/archives/
```

## Platform Notes

- No markdown tables on WhatsApp or Discord — use plain lists instead.
- Wrap multiple Discord URLs in `<>` angle brackets.
- Keep responses concise on mobile channels.
