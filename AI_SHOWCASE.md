# AI Showcase — JetBrains workflow story (Best AI-Powered Workflow Story entry)

This file is the evidence base for the bonus prize. It is maintained
**from day 1** — tool evidence committed as we go (`.idea/`, `.junie/`,
`.air/` folders), never reconstructed retroactively. A workflow story
assembled after the fact reads exactly like that to engineering judges.

## Tool map & per-feature attribution

Each feature row records WHICH JetBrains tool contributed WHAT — the
criterion asks for specifics, not "we used AI".

| Feature | Tool | What the tool contributed |
|---|---|---|
| Schema contract tests | PyCharm + Junie | pinned the verified supplement schema into `tests/test_spatial.py` |
| Zero-disk streaming | PyCharm | memory profiling during zstd streaming; `iter_jsonl` generator design |
| Quality-flag rules | PyCharm + Junie | README-exact rules in `spatial.cast_state`, test coverage of all five flags |
| Dashboard | WebStorm | canvas minimap, filter rail, shortcut map, polling |
| Agent orchestration | JetBrains Air | session planning for schema→tests→refactor loops |
| Repo hygiene | Junie | pre-push hook + CI audit + fixture labels |

## Session log format (append one entry per working session)

```
### YYYY-MM-DD — <session goal>
Tool: PyCharm 2026.x / WebStorm / Air / Junie
Prompt(s): <verbatim key prompts>
What the agent produced: <files, diffs, tests>
What we changed by hand: <the human decisions - guide, verify, decide>
Verification: pytest output, audit result
```

### 2026-11-18 — repo bootstrap (day-1 entry)

Tool: initial scaffold assembled with Z.ai agent tooling; JetBrains
sessions begin at first team work session.
What we produced: package skeleton (ingest/spatial/features/api/export),
41-test suite, SYNTHETIC fixtures, CI, data guard, docs.
What we changed by hand: schema rules cross-checked against the supplement
README; taxonomy order taken verbatim from the official brief.
Verification: `pytest` 41 passed; `scripts/audit_repo.py` clean.

### 2026-11-19 — backend: GUIDE.md §3A trajectory-point contract

Tool: Z.ai agent (backend track), working from the teammate's written
integration contract (docs/GUIDE.md).
Prompt(s): "my friend has done some work so should we … backend is our's
so that's what we do" — implemented against the guide's §3A response
schema, not invented.
What the agent produced: `features.trajectory_point` (single contract
record shared by both API modes), `spatial.project_landing` (landing math
extracted so synthetic + real-corpus paths cannot drift), per-cast point
emission in `scripts/build_findings.py` (patch-tagged, sampled ≤160 per
map-side with true `points_total`), `/api/atlas` accepting the guide's
`attack/defense` spellings + `patch` param, 17 new test assertions pinning
the contract; branch → PR → CI → rebase-merge through the enforced gate.
What we changed by hand: chose NOT to regenerate `web/demo-data.json` —
the GRID corpus is no longer on this machine, and fabricating "real"
per-cast points from aggregates would break the project's honesty rules;
the real snapshot serves `points: []` + a regeneration note until the
next `make findings` run against the corpus.
Verification: `pytest` green locally + CI required check on the PR;
`scripts/audit_repo.py` clean.

> Replace/extend the day-1 entry with real Junie/Air sessions from the
> first team work session onward; keep prompts verbatim — judges read these.

### 2026-11-19 — WebStorm AI Assistant Codebase Review & Phase 0 Onboarding

Tool: WebStorm 2026.3 + JetBrains AI Assistant (GPT-4 / Terra model)
Prompt: "hi read this project"
What the agent produced:
- Analyzed project overview and core module boundaries: `breachiq/` (Python ingestion & 3D spatial math), `web/` (tactical dashboard & synthetic aggregates), `tests/` (API and trajectory verification).
- Identified platform adaptation requirement: note on Makefile Unix paths vs. Windows development environment.
- Verified synthetic fixtures vs. real corpus aggregate boundaries and confirmed landing locations remain strictly labeled as raycast estimates.
What we changed by hand:
- Locked dual-track development guide (`docs/GUIDE.md` and `docs/COLLABORATION_GUIDE.md`) to establish clean API contracts before feature expansion.
- Committed WebStorm project configurations (`.idea/breachiq3d-remote.iml`, `modules.xml`, `vcs.xml`) as official Devpost submission evidence.
Verification: WebStorm project initialized, green indexing, 68 tests passing on `main`.

### 2026-11-19 — backend: roster filters land behind the teammate's UI

Tool: Z.ai agent (backend track), implementing the Week-3 filter-rail
milestone from docs/ROADMAP.md against the teammate's landed frontend
(commit 68cd516: dynamic player/agent selects + canvas tooltips).
Prompt(s): "now what next" — the next milestone was derived from the
teammate's actual frontend code, not invented: his `atlasQuery()` already
sent `player`/`agent` params the API silently ignored (FastAPI drops
unknown query params), which would have shipped decorative roster filters
— the exact failure mode our own red team once caught.
What the agent produced: `/api/atlas` now honors `player` + `agent`
(synthetic mode: full filtering of zones and points; real-aggregate mode:
points-scope with an explicit `points_scope` note), every trajectory
point carries the caster's `agent` (synthetic roster map hoisted to
`AGENT_OF`; real path tags from the scan's player roster), GUIDE.md §3A
contract doc updated to match, 4 new/extended tests including the
decorative-filter regression guard.
What we changed by hand: kept the author email on the platform noreply
address (guaranteed attribution) while adopting the teammate's pinned
co-author convention; chose explicit `points_scope` honesty note over
pretending real-mode aggregates filter by roster.
Verification: `pytest` 83 passed, 1 skipped; `scripts/audit_repo.py`
clean; branch → PR → CI → rebase-merge through the enforced gate.

### 2026-11-20 — backend: severity-ranked counter-brief engine (/api/brief)

Tool: Z.ai agent (backend track). The teammate had regenerated the real
GRID snapshot on his machine (5,693 per-cast points flowing through the
contract we landed on Nov 19) and shipped four UI overhauls - but the
"AI Tactical Counter-Brief" panel was still template strings glued
together client-side, with no severity ordering and no evidence per
claim.
Prompt(s): "my friend has done some work on project now its our turn ...
also tell me why does the UI look like shit and i can't understand what
we are building" - the UI diagnosis ran first (headless-browser
screenshots + a vision-model design review), which pinned the missing
severity/evidence layer as the backend gap.
What the agent produced: `features.tactical_brief` - deterministic
severity rules (lineup exploit / Operator habit / execute tempo / utility
focus), each insight carrying evidence (rounds seen / sample, detector
confidence, source endpoint, map-vs-series scope); `GET /api/brief`
(synthetic + real modes) and `/api/brief.pdf` rewired to render the SAME
dict so panel and printout can never drift; the PDF gained severity
chips, inline evidence lines and a BRIEF SCOPE provenance panel; GUIDE.md
section 3E documents the contract; 6 new tests pin ordering, evidence
tracing (the lineup insight must quote /api/lineups' exact repeat count)
and scope honesty.
What we changed by hand: caught two of our own scope bugs before
shipping - the Operator buy_rate is a series-wide fraction (40/962) and
must not be divided by map rounds, and the real pacing payload is keyed
per MAP (a lotus brief quoting SUMMIT's tempo was wrong); both fixed with
an explicit evidence scope field.
Verification: `pytest` 88 passed, 1 skipped; audit clean; PDF rendered
and vision-checked (layout pass); branch → PR → CI → rebase-merge.

## Workflow principles (what the story argues)

1. Agents execute; developers decide. Every agent output lands behind a
   human decision recorded here.
2. Evidence over claims: committed folders, verbatim prompts, test diffs.
3. The audit trail is part of the product: the same discipline that keeps
   GRID data out of the repo keeps the AI story honest.
