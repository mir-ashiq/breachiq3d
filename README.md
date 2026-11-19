<div align="center">

# BreachIQ 3D

**Spatio-temporal utility trajectory & site-execute engine for competitive VALORANT**

Category 1 · Cloud9 × JetBrains *Sky's The Limit* Hackathon 2026

[![CI](https://github.com/mir-ashiq/breachiq3d/actions/workflows/ci.yml/badge.svg)](https://github.com/mir-ashiq/breachiq3d/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

`tests: 41 passed` · `python 3.12` · `no build step` · `SYNTHETIC demo data`

</div>

---

BreachIQ 3D implements **both official Category 1 blueprints** on top of the
GRID corpus and its 3D ability supplements:

- **Utility Placement & Ability Analysis Engine** — placeable-first taxonomy
  (trapwires → alarm bots → walls → trips, then recon/smokes/stalls/flashes),
  zone heatmaps with **hard counts** ("38/60 rounds"), and **labeled raycast
  landing estimates** from the verified 3D schema (position x/y/z, aim
  vector, velocity — GRID provides no landing data, so we never pretend it
  does).
- **Operator Tendency & Sniper Profiler** — buy rates by player and agent,
  defensive hold timing histograms (0–20 s vs 20–40 s), rotation detection.

Plus the brief's next-level options: a **1-click counter-brief** (anti-strat
cues), **self-scout mode**, site-execute **pacing curves**, economy collapse
zones, and a one-page **PDF brief export**. Every view carries an
**evidence bar**: rounds, matches, patch recency, coverage, and data-quality
mix — because a number without its sample size is how analytics tools lose.

## Quickstart

```bash
make setup          # venv + pinned deps + pre-push data guard
make demo           # http://127.0.0.1:8000/app  (dark tactical dashboard)
make test           # pytest suite (41 tests)
make verify         # benchmark + coverage + render smoke check
make audit          # data-leak audit (CI runs the same check)
```

The demo boots on **SYNTHETIC fixtures** — no GRID data is redistributed in
this repo, ever (see `docs/COMPLIANCE.md`). To run against the official
corpus, place it in a sibling directory *outside* this repo and point the
pipeline at it.

## Architecture

```
GRID corpus (sibling dir, never committed)     SYNTHETIC fixtures (committed)
        │                                              │
        ▼                                              ▼
breachiq/ingest.py   zero-disk zstd streaming · rollback invariants ·
                    exclusion manifest · grid_event_id joins · dedup
        ▼
breachiq/spatial.py  verified 3D schema math · 5 quality flags · 1 Hz
                    down-weighting · clamped raycast landing estimates
        ▼
breachiq/features.py taxonomy · atlas · operator fingerprint · pacing ·
                    evidence bar · counter-brief · 9-filter rail
        ▼
breachiq/api.py      FastAPI · no-auth public demo · OpenAPI contract
        ▼
web/                 canvas minimap · evidence bar · shortcuts · polling
```

## Data honesty (verified against the supplement README)

| Rule | Implementation |
|---|---|
| 5 quality values (`ok`, `gap_exceeded`, `missing_*`) | `spatial.cast_state`, README-exact rules |
| 1 Hz VCT Americas series | detected + confidence down-weighted |
| Series 2855902 / excluded maps | `ingest.EXCLUSION_MANIFEST`, shown in coverage |
| No landing data anywhere | every landing zone labeled **estimate** + method + confidence |
| ~160 GB corpus | zero-disk generators, nothing materialized |

## AI workflow (JetBrains + Junie)

Built with PyCharm (engine), WebStorm (dashboard), JetBrains Air (agent
orchestration), and Junie sessions — evidence committed from day 1 in
`.idea/`, `.junie/`, `.air/`, with per-feature attribution in
[AI_SHOWCASE.md](AI_SHOWCASE.md).

## Docs

- [docs/STRATEGY.md](docs/STRATEGY.md) — positioning, moat stack, differentiation
- [docs/DATA_QUALITY.md](docs/DATA_QUALITY.md) — schema contract, quality rules
- [docs/ROADMAP.md](docs/ROADMAP.md) — verified dates, feature freeze, capacity gate
- [docs/COMPLIANCE.md](docs/COMPLIANCE.md) — data license, judge access, eligibility
- [docs/DATA_USAGE.md](docs/DATA_USAGE.md) — accounting of how every provided resource is used
- [docs/COMPETITOR_DOSSIER_RESPONSE.md](docs/COMPETITOR_DOSSIER_RESPONSE.md) — response to the 2026-11-19 rival-recon dossier (2 live Cat-1 rivals, gap validation)
- [docs/100_REASONS.md](docs/100_REASONS.md) — the red-team audit and its fixes
- [docs/VIDEO_STORYBOARD.md](docs/VIDEO_STORYBOARD.md) — 165 s demo video plan
- [docs/DEVPOST_SUBMISSION.md](docs/DEVPOST_SUBMISSION.md) — submission draft + rehearsal

## License

MIT — see [LICENSE](LICENSE).
