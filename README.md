<div align="center">

# BreachIQ 3D

**Spatio-temporal utility trajectory & site-execute engine for competitive VALORANT**

Category 1 · Cloud9 × JetBrains *Sky's The Limit* Hackathon 2026

[![CI](https://github.com/mir-ashiq/breachiq3d/actions/workflows/ci.yml/badge.svg)](https://github.com/mir-ashiq/breachiq3d/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

`tests: 50 passed` · `python 3.12` · `no build step` · live demo: **https://mir-ashiq.github.io/breachiq3d/** (SYNTHETIC snapshot)

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
  round-start hold positions, opening-duel outcomes for Operator holders.
- **Repeated-lineup detection** — same ability cast from within 200 cm with
  aim within 10°, in 3+ distinct rounds: the set plays a coach can pre-aim.

Plus the brief's next-level options: a **1-click counter-brief** (anti-strat
cues), **self-scout mode**, site-execute **pacing curves**, economy collapse
zones, and a one-page **PDF brief export**. Every view carries an
**evidence bar**: rounds, matches, patch recency, coverage, and data-quality
mix — because a number without its sample size is how analytics tools lose.

## What it finds on the real corpus (Cloud9, 28 series)

Computed by `scripts/build_findings.py` from the official GRID starter data
(857 series) — every number reproducible by anyone who clones the data repo.
Full detail: [docs/FINDINGS.md](docs/FINDINGS.md).

- **1,404 rounds · 66 maps · 48,250 ability casts** analyzed for Cloud9
  (VCT Americas + Game Changers, 2025–2026); 99.7% of casts quality `ok`
- **A 99-round repeated Viper wall** on Lotus (same spot, same aim), a
  58-round second one, and a 50-round Haven wall — set plays with hard counts
- **OXY holds the Operator in 40/962 rounds** (4.2%), with all 40 round-start
  hold positions recorded; team-wide, Op holders drew first blood in 20 of
  107 Op rounds vs dying first in 10
- **Attack wins 53%, defense 50%**; 178/696 attack rounds end without a
  plant; pistol conversion 33/68
- **3 abandoned-and-replayed maps caught and dropped** by the rollback rule
  (the data README's restart caveat, handled)

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
corpus (real findings, ~15 min on a laptop):

```bash
git clone https://github.com/cloud9esports/stl-hackathon-2026-grid-starter.git ../grid-data
make findings        # scans every Cloud9 series -> docs/FINDINGS.md
```

## Architecture

```
GRID corpus (sibling dir, never committed)     SYNTHETIC fixtures (committed)
        │                                              │
        ▼                                              ▼
breachiq/ingest.py   zero-disk zstd streaming · rollback invariants ·
                    exclusion manifest · grid_event_id joins · dedup
        ▼
breachiq/corpus.py   real-feed scanning: round timelines from envelopes,
                    full-state snapshots (agents/loadouts/inventory),
                    kills/plants/wins, cast join, economy estimates
        ▼
breachiq/spatial.py  verified 3D schema math · 5 quality flags · 1 Hz
                    down-weighting · REAL map bounds (13 maps calibrated)
                    · clamped raycast landing estimates
        ▼
breachiq/features.py taxonomy · atlas · operator fingerprint (+hold
                    positions) · repeated-lineup detection · round
                    outcomes · pacing · evidence bar · counter-brief
        ▼
breachiq/api.py      FastAPI · no-auth public demo · OpenAPI contract
        ▼
web/                 canvas minimap + cast points + lineup markers ·
                    evidence bar · static GitHub-Pages demo mode
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

- [docs/FINDINGS.md](docs/FINDINGS.md) — real-corpus findings (Cloud9, 28 series, reproducible)
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
