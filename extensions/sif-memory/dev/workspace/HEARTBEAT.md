# Heartbeat — Periodic Tasks

## SIF Memory Maintenance (every 3-4 days)

1. `sif_status()` — check graph health
2. If `averageWeight < 0.3`: review low-weight pointers, consider reinforcing still-relevant ones
3. Scan recent session output for unextracted learning signals (the extraction hook catches most, but manual review catches nuance)
4. If graph has pointers with `accessCount >= 10` that aren't consolidated, note them

## Project Check-ins

- **NEXLESS-RVD:** Any regulatory timeline updates? Infrastructure changes?
- **SIF knowledge base:** Version updates? New amendments implemented?
- **TicketForge:** Active blockers?
- **Kimera fleet:** Device count changes? Clinical trial milestones?

## Alert Conditions

Proactively alert Daniel when:

- Graph `averageWeight < 0.2` — memory decay warning, knowledge is fading
- Nexless regulatory deadline < 7 days (if known from pointers)
- Graph total pointers drops below 20 — possible data loss
- Multiple pointers about the same topic diverge — consolidation needed
