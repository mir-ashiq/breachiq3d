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

> Replace/extend the day-1 entry with real Junie/Air sessions from the
> first team work session onward; keep prompts verbatim — judges read these.

### 2026-11-19 — Tactical Minimap Canvas Visualizer & 3D Trajectory Arcs (Frontend Track)

Tool: WebStorm 2026.1 + JetBrains AI Assistant (Junie)
Prompts:
- "Implement a 2D HTML5 canvas minimap renderer that visualizes 3D parabolic trajectory arcs from caster position (u0, v0) to impact landing estimates (u, v), computing vertical pitch arcs and azimuth view cone vectors."
- "Refactor dashboard styling to Cloud9 high-contrast dark tactical aesthetic (#070a0f base, #00aeff accents, JetBrains Mono typography) with colorblind-safe luminance heatmap tiers."
- "Add interactive canvas mouse inspection with tooltips displaying ability class, caster identity, confidence score, and repeated lineup tags."
What the agent produced:
- Modernized `web/index.html` with responsive tactical grid, dynamic ability filtering, 3D trajectory and zone heat toggles, and rapid onboarding modal.
- Cloud9-branded design system tokens in `web/style.css` with glow highlights, pill filters, and accessible luminance gradients.
- Interactive 2D/3D visualizer in `web/app.js` with bezier trajectory curves, crosshair reticles for repeated lineups (3+ rounds), and hover inspection.
- Regenerated `web/demo-data.json` with caster coordinates (u0, v0) and orientation angles (azimuth, pitch).
What we changed by hand:
- Calibrated quadratic bezier arc control points against vertical pitch angle $\phi$ to ensure high-angle casts arch convincingly across the minimap.
- Clamped interactive canvas bounding box calculations to guarantee tooltips remain in-bounds during rapid cursor movement.
- Verified test suite integrity across `tests/test_api.py` and confirmed 0% proprietary data leakage via `scripts/audit_repo.py`.
Verification: `pytest` 50 passed; `scripts/audit_repo.py` clean.

## Workflow principles (what the story argues)

1. Agents execute; developers decide. Every agent output lands behind a
   human decision recorded here.
2. Evidence over claims: committed folders, verbatim prompts, test diffs.
3. The audit trail is part of the product: the same discipline that keeps
   GRID data out of the repo keeps the AI story honest.
