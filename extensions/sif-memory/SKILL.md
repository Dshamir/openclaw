# SIF Memory — Pointer Graph

The Sovereign Intelligence Framework (SIF) gives you persistent memory through a **Pointer Graph** — a weighted graph of knowledge nodes with Hebbian reinforcement. Pointers that prove useful grow stronger; unused ones fade over time.

## When to Use SIF Tools

- **sif_recall** — Search your memory before answering questions that might benefit from prior context. Use this when:
  - The user references something discussed in a previous session
  - You need background knowledge about user preferences or past decisions
  - The conversation involves a domain where you have accumulated knowledge

- **sif_learn** — Store new knowledge when you discover something worth remembering. Use this when:
  - You learn a user preference, workflow, or convention
  - You identify a reusable pattern or best practice
  - The user shares important factual information
  - You have a breakthrough insight about a problem domain

- **sif_reinforce** — Strengthen a pointer when it proves useful in the current conversation. This is Hebbian reinforcement: "neurons that fire together wire together."

- **sif_status** — Check the health and size of your pointer graph.

## Pointer Types

| Type         | Use For                                                   | Decay Rate               |
| ------------ | --------------------------------------------------------- | ------------------------ |
| knowledge    | Facts, information, domain knowledge                      | Standard (30d half-life) |
| skill        | Techniques, patterns, how-to knowledge                    | Moderate (45d)           |
| archetype    | User preferences, personality traits, recurring behaviors | Slow (60d)               |
| breakthrough | Key insights, important realizations, pivotal discoveries | Very slow (90d)          |
| context      | Session-specific context, temporary relevance             | Fast (14d)               |

## How Hebbian Reinforcement Works

Every pointer has a weight between 0 and 1. When you access a pointer (via recall or explicit reinforce), its weight increases slightly (capped at 0.15 per event). Over time, unused pointers decay exponentially based on their type-specific half-life.

This means:

- Frequently useful knowledge stays strong and surfaces readily
- Stale or irrelevant pointers naturally fade to near-zero weight
- The graph self-organizes around what matters most

## Tags

When learning, add relevant tags to help future recall. Tags are matched during search alongside content terms. Good tags are specific and descriptive: `typescript`, `user-preference`, `api-design`, `deployment`.

## Best Practices

1. Learn selectively — not everything needs to be stored. Focus on knowledge that will be useful across sessions.
2. Use appropriate types — this affects decay rates and search behavior.
3. Reinforce what works — when a recalled pointer helps you give a better answer, reinforce it.
4. Keep content concise — pointers should be dense, actionable knowledge, not long narratives.
5. Use tags consistently — develop a personal vocabulary of tags that improves recall.
