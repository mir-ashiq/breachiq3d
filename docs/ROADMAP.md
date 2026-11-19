# Roadmap — Nov 17, 2026 → Jan 12, 2027 (verified dates)

> Two-track execution (backend = Ashiq `@mir-ashiq`, frontend = Sann `@steavengalang`),
> phase gates, the 50/50 contribution plan, and win-probability engineering live in
> [TEAM_ROADMAP.md](TEAM_ROADMAP.md). This file keeps the verified timeline anchors
> and weekly theme.

Anchors (verified against the official rules + JetBrains blog):
registration opened **Nov 17, 11:00 am PT**; office hours **Dec 9, 10:00 am
PT**; submission deadline **Jan 12, 2027, 11:00 am PT**; judge access must
stay live through **Feb 3, 2027**; winners announced on or around **Feb 8**.

## Week 1 (Nov 17–23): foundation — [COMPLETED]

- [x] Repo public from day one (rules require an open-source public repo)
- [x] Package skeleton: ingest (zero-disk streaming, rollback, exclusions),
      spatial (verified schema math, quality flags), features (taxonomy,
      operator, pacing, evidence), API, dashboard, tests (84 green), CI,
      pre-push data guard
- [x] SYNTHETIC fixtures + pipeline verification (benchmark, coverage,
      render smoke check)

## Week 2 (Nov 24–30): spatial engine hardening — [PULLED FORWARD, COMPLETED Nov 19]

- [x] Calibrate real map bounds (13 maps, real `map.bounds` from the feeds)
- [x] Join real supplement files via `grid_event_id`; coverage re-run
      (28 Cloud9 series: 66 games, 1,404 rounds, 48,250 casts —
      docs/FINDINGS.md)
- [x] Landing-estimate validation vs damage events (method + confidence)

## Week 3 (Dec 1–7): tactical canvas & v0.3 UI/UX overhaul — [COMPLETED Nov 19 // AHEAD OF SCHEDULE]

- [x] Frontend consumes the OpenAPI contract (`/openapi.json`)
- [x] Phase 0 parity reset: WebStorm project configuration (.idea/) committed
      and dual-track collaboration guide merged
- [x] Filter rail expansion: player roster isolation, agent classification,
      and operator sniper hold bias toggle (`@steavengalang`)
- [x] **v0.3 Tactical UI/UX Overhaul & Synchronized Spatial Filtering (`@steavengalang`):**
  - **Single Reactive State Store:** Changing Map, Side, Player, Agent, or Ability
    simultaneously filters all 6 panels on screen (2D Radar, 3D Arena, Counter-Brief,
    Repeated Lineups, Site Execute Pacing, and Operator Leaderboard) with zero desync.
  - **Authentic Architectural Blueprint Geometry:** Replaced raw placeholder boxes
    with true-to-scale VALORANT corridor geometry, choke points, and radiant-hazard
    plant zones (`[ A SITE ]`, `[ B SITE ]`, `[ C SITE ]`) in both 2D and 3D.
  - **Spectacular Stadium 3D Perspective:** Elevated 28° hero stadium angle framing
    soaring parabolic flight curves leaping into the upper air; de-clustered lineup
    badges with elevated diagonal leader lines (0 text overlapping).
  - **Site Execute Tempo (Map-Aware):** Displays real bomb sites for the active map
    (`A SITE`, `B SITE`, `C SITE`) with execute round counts, median time-to-plant,
    and visual 3-tier timeline bar (Fast Rush <45s, Default 45–80s, Late >80s).
  - **Human-Readable Coaching Briefs:** Clean formatting (`101 CASTS across 65 ROUNDS (1.55/round)`)
    structured into 3 actionable cards (`COUNTER UTILITY`, `LINEUP ALERT`, `SNIPER THREAT`).
  - **Weapon / Operator Leaderboard:** Roster breakdown with buy rates, first blood counts,
    and active map sightline badges with click-to-highlight vision cones.
  - **Collapsible Ability Drawer:** Searchable, sortable matrix across all active utility.
  - **Export Scouting Brief & Data Audit Modals:** Markdown copy / print view and 100%
    GRID compliance audit dialog.

## Week 4 (Dec 8–14): office hours + live GRID adapter

- [ ] **Dec 9 office hours**: demo the vertical slice (one map, end to end)
- [ ] Backend Live GRID GraphQL/REST API Adapter & multi-series ingestion (`@mir-ashiq`)
- [ ] Backend Query parameter extensions (`?map=&side=&player=&agent=&ability=`) (`@mir-ashiq`)
- [ ] Round-by-Round Timeline Scrubber & Replay Playback UI prototype (`@steavengalang`)
- [ ] Coach recruiting via Cloud9 Discord (validation log starts)
- [ ] Capacity gate: 2 members = full focus on BreachIQ Category 1 + AI Workflow Story

## Week 5 (Dec 15–21): completion of the vertical slice

- [ ] Both blueprints fully working on real data; Automated PDF/Markdown Brief Export (`@steavengalang` + `@mir-ashiq`)
- [ ] Cold-start protocol: three testers, first insight < 60 s, iterate
- [ ] External testers on the live URL

## Week 6 (Dec 22–28): deploy + feature freeze

- [ ] **Feature freeze** at end of week — after this, changes are bugfixes
      and polish only (change control per CONTRIBUTING.md)
- [ ] **Deploy** decision locked: single container, static + API, uptime
      monitoring through **Feb 3** (judge access window)
- [ ] Publish the AI workflow story as a blog post (bonus entry) (`@steavengalang`)

## Week 7 (Dec 29–Jan 4): video production

- [ ] Record, voice, edit the 165 s demo video (see VIDEO_STORYBOARD.md) (`@steavengalang`)
- [ ] Three rehearsals + one recorded dry run before the final take
- [ ] Cross-browser pass: Chrome, Firefox, **Safari** (judges use Macs);
      device matrix: laptop, tablet, phone
- [ ] Plain-language copy review of the whole UI
- [ ] Devpost form rehearsal from DEVPOST_SUBMISSION.md

## Week 8 (Jan 5–12): audit + submission freeze

- [ ] Full pre-push audit: `scripts/audit_repo.py`, license in About,
      video duration check, incognito link verification
- [ ] **48h-early submission** (Jan 10) with a 24 h emergency **buffer**
- [ ] Uptime monitor verified through the judging window

## Standing rules

- **No-descoping**: the dominant-tier scope stands regardless of how weak
  the field looks; complacency is how favorites lose.
- **Weekly rival scan**: Devpost + Discord every Monday; findings feed the
  red-team audit, never panic scope changes.
- **Rest**: two scheduled rest days per week through the holidays; the
  schedule absorbs a one-week single-member outage (role redundancy: each
  member can run the other's pipeline from the docs).
- **Office hours milestone**: the Dec 9 session is a milestone review with
  judges' colleagues present — the slice must be demoable, not "almost".
