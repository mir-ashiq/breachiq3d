# Devpost submission draft (fill, then rehearse, then submit 48h early)

The submission form must be complete and rehearsed before the Jan 12,
2027, 11:00 am PT deadline — never typed live at the deadline.

## Required fields (from the official submission specifics)

- **Project name**: BreachIQ 3D
- **One-liner**: Spatio-temporal utility trajectory & site-execute engine
  for competitive VALORANT — both official Category 1 blueprints.
- **Video**: public YouTube link, under 3 minutes (see VIDEO_STORYBOARD.md)
- **Repository**: public GitHub, MIT license visible in the About section
- **Bonus**: Best AI-Powered Workflow Story — link the published case study

## Write-up sections

### Inspiration
Cloud9 coaches get 15 minutes between map vetoes and a corpus of 160 GB.
The first edition's winners showed design and usability decide outcomes;
we built the tool we would want on the analyst desk: prescriptive, visual,
and honest about its evidence.

### What it does
- Utility Placement & Ability Analysis Engine: placeable-first taxonomy,
  zone heatmaps with hard counts, 3D raycast landing estimates (labeled
  estimates — GRID provides no landing data).
- Operator Tendency & Sniper Profiler: buy rates by player/agent, hold
  timing histograms (0–20s vs 20–40s), rotation detection.
- Site-execute pacing curves, economy collapse zones, 1-click counter-brief,
  self-scout mode, PDF export, evidence bar on every view.

### How we built it (methodology)
Zero-disk Zstandard streaming over the full corpus; supplement joins on
`grid_event_id`; the five quality flags handled per the verified README;
1 Hz VCT Americas series down-weighted; rollback and exclusion invariants;
FastAPI backend, canvas dashboard, no build step.

### Built with (tooling — the criterion wants specifics)
PyCharm Professional for the ingest/spatial engine, WebStorm for the
dashboard, **JetBrains Air** orchestrating sessions, and **Junie** for
schema pinning tests, projection-math tests, and refactor passes — with
per-feature attribution in AI_SHOWCASE.md and the committed `.idea`,
`.junie`, and `.air` folders as evidence.

### Challenges / Accomplishments / What we learned / What's next
(filled in week 7 from the validation log and build notes)

## Rehearsal checklist (week 7)

- [ ] Form rehearsal: fill a copy of this document end to end
- [ ] Every link opened in an incognito session
- [ ] Video duration check passed (`scripts/check_video.py`)
- [ ] Bonus story URL entered (the bonus prize needs its own entry)
- [ ] Submitted by Jan 10 (48h buffer)
