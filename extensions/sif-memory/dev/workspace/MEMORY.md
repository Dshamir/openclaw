# Memory — Static Seed Layer

Pre-loaded context for bootstrapping and ground truth. Each item is pointer-sized.

## Identity & Principals

- Daniel Shamir: founder of Nexless Healthcare LP and Blucap Real Estate. Master Guru. Eastern Canada timezone.
- Gabriel Shamir: Daniel's son, cybersecurity student at Concordia (CECR-2002). Trusted technical collaborator.
- Christophe: co-founder/partner at Nexless Healthcare. Investor relations.

## Nexless Healthcare LP

- Product: Kimera P-IV RT-qPCR diagnostic platform for point-of-care molecular testing
- 70 units deployed, clinical trials stage, 21 partners
- Regulatory: Health Canada track, MDSAP/FDA compliance domains
- Valuation: $15M+ pre-money, projected exit $30M-$65M within 36 months
- Founded August 2020, Mont-Royal Quebec
- International: Whitehaven Salomon Bahrain (MENAT), UAE distribution agreement

## SIF Framework

- Version: 5.2.0 (knowledge base), extension is sif-memory on feature/sif-memory-beachhead branch
- Architecture: weighted pointer graph with Hebbian reinforcement, exponential decay by type
- 29 amendments defined, Phase 1 complete (A22 SIFQL, A23 CHIMERA, A24 Genesis, A26 Diomimetic Memory)
- This deployment: openclaw-sifdev Docker container, sif-memory OpenClaw extension
- Graph stored at ~/.openclaw/sif/pointer-graph.json, journal at ~/.openclaw/sif/journal/
- Tools: sif_recall, sif_learn, sif_reinforce, sif_status
- Knowledge base repo: github.com/Dshamir/sif-knowledge-base
- 381 conversations mined, 339 documents indexed, 9 project clusters
- CHIMERA daemon: cognitive archaeology runtime (extractors, correlation, SIFQL engine)

## Blucap Real Estate

- Canadian market operations
- Data sovereignty is a hard constraint — no external sharing
- Daniel manages both Blucap and Nexless concurrently

## Consulting & Advisory

- JGH Laval surgical innovation consulting
- Warehouse automation projects
- Healthcare technology integration

## Active Projects

- NEXLESS-RVD: NaCl encryption layer, GCP+AWS hybrid infrastructure, secure data pipeline
- TicketForge: event ticketing platform
- OpenWrt networking: self-hosted network infrastructure, sovereignty-first
- LaTeX workflows: technical document generation for regulatory and academic use
- Abacus Avatars: enterprise SaaS for AI avatar pipelines (LiveKit, Pipecat, ElevenLabs)

## Technical Expertise (Expert Level)

- Medical devices, RT-qPCR diagnostics, FDA/MDSAP compliance
- AI systems architecture, pointer graphs, multi-agent orchestration
- Voice AI pipelines (SIP, LiveKit, Pipecat, ElevenLabs, Deepgram)
- Next.js/React, database architecture, vector databases
- Embedded systems, IoT, Claude Code CLI
- FastAPI, cybersecurity, healthcare integration

## Preferences & Values

- Self-hosted/sovereign infrastructure is the default — note sovereignty tradeoffs for SaaS suggestions
- Direct communication, conclusions-first, comprehensive depth over quick fixes
- Approval gates: Plan → Approval → Implementation → Verification
- Sovereignty first: intelligence is an asset you own
- Extract patterns from every session — every interaction mines new intelligence

## SIF Command Shortcuts

- "recall <query>" → sif_recall(query)
- "status" → sif_status()
- "sync" / "save" → graph auto-saves; confirm with sif_status()
- "Master Guru" → sif_recall("Daniel Shamir projects priorities overview", 12)
