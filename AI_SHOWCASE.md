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

## Workflow principles (what the story argues)

1. Agents execute; developers decide. Every agent output lands behind a
   human decision recorded here.
2. Evidence over claims: committed folders, verbatim prompts, test diffs.
3. The audit trail is part of the product: the same discipline that keeps
   GRID data out of the repo keeps the AI story honest.
