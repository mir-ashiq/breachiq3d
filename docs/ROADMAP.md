# Roadmap — Nov 17, 2026 → Jan 12, 2027 (verified dates)

Anchors (verified against the official rules + JetBrains blog):
registration opened **Nov 17, 11:00 am PT**; office hours **Dec 9, 10:00 am
PT**; submission deadline **Jan 12, 2027, 11:00 am PT**; judge access must
stay live through **Feb 3, 2027**; winners announced on or around **Feb 8**.

## Week 1 (Nov 17–23): foundation — DONE

- [x] Repo public from day one (rules require an open-source public repo)
- [x] Package skeleton: ingest (zero-disk streaming, rollback, exclusions),
      spatial (verified schema math, quality flags), features (taxonomy,
      operator, pacing, evidence), API, dashboard, tests (41 green), CI,
      pre-push data guard
- [x] SYNTHETIC fixtures + pipeline verification (benchmark, coverage,
      render smoke check)

## Week 2 (Nov 24–30): spatial engine hardening — PULLED FORWARD, DONE Nov 19

- [x] Calibrate real map bounds (13 maps, real `map.bounds` from the feeds)
- [x] Join real supplement files via `grid_event_id`; coverage re-run
      (28 Cloud9 series: 66 games, 1,404 rounds, 48,250 casts —
      docs/FINDINGS.md)
- [ ] Landing-estimate validation vs damage events (method + confidence) —
      still open, moves with the week-3 canvas

## Week 3 (Dec 1–7): tactical canvas

- [ ] Frontend consumes the OpenAPI contract (`/openapi.json`)
- [ ] Filter rail: team, map, player, agent, composition, patch, side,
      weapon, ability (the brief's full list)
- [ ] Trajectory overlays, layer toggles, keyboard shortcut polish
- [ ] Stretch (cost-boxed 2 days, only if above is green): small JetBrains
      integration — Junie run-book commands or a PyCharm/IDEA tool window
      that opens a series' evidence report (dossier gap: no rival ships a
      real IDE integration; sponsor-scoring advantage — see
      COMPETITOR_DOSSIER_RESPONSE.md)

## Week 4 (Dec 8–14): office hours + vertical slice

- [ ] **Dec 9 office hours**: demo the vertical slice (one map, end to end)
- [ ] Coach recruiting via the Cloud9 Discord (validation log starts)
- [ ] **Capacity gate**: 3+ active members ⇒ optional Category 3 second
      entry; 2 members ⇒ full focus on BreachIQ (no descoping either way)

## Week 5 (Dec 15–21): completion of the vertical slice

- [ ] Both blueprints fully working on real data; PDF export from any view
- [ ] Cold-start protocol: three testers, first insight < 60 s, iterate
- [ ] External testers on the live URL

## Week 6 (Dec 22–28): deploy + feature freeze

- [ ] **Feature freeze** at end of week — after this, changes are bugfixes
      and polish only (change control per CONTRIBUTING.md)
- [ ] **Deploy** decision locked: single container, static + API, uptime
      monitoring through **Feb 3** (judge access window)
- [ ] Publish the AI workflow story as a blog post (bonus entry)

## Week 7 (Dec 29–Jan 4): video production

- [ ] Record, voice, edit the 165 s demo video (see VIDEO_STORYBOARD.md)
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
