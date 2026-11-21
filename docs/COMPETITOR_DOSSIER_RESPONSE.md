# Competitor dossier response (2026-11-19)

Response to the reconnaissance dossier of 33 tracked GitHub repos tagged to
the Cloud9 x JetBrains hackathon (both editions): 7 VALORANT tools, 6 LoL
tools, 14 event mini-games. This file records what it changes, what it
confirms, and what we do about it.

## The field, split by edition

- **First-edition repos** (last push Dec 2025 – May 2026): reference
  material only, not rivals.
- **Current-round repos** (pushed Nov 17–19, 2026): 12 total. Category 1
  VALORANT: **2**. LoL Cat-1/2: 2. Event mini-games: 8.

## The two rivals that matter (Category 1, VALORANT, current round)

### c9-stratlens (@fokrulanthro16-eng, pushed 2026-11-18)

- Claim: "Deterministic GRID telemetry & 3D ability vector tactical
  scouting engine."
- Read: closest to our lane, but "3D ability vector" means direction
  vectors on a flat map (the dossier itself notes competitors "only draw
  flat 2D maps" — a vector is not a trajectory).
- Our differentiation: full projectile **trajectory** estimation with
  physics (gravity, view-ray raycast), landing zones as labeled ESTIMATES
  with method + confidence + evidence bar, schema-faithful quality
  handling (5 flags, 1 Hz down-weighting, README exclusion manifest),
  verbatim interpolation, 41 passing tests in CI.

### NunyaIntel (@Bryanspirit, pushed 2026-11-18)

- Claim: "VALORANT tactical scouting, utility placement & Operator
  profiler" — the same two Category-1 blueprints we implement.
- Our differentiation: everything above plus the evidence-bar UI, the
  brief's exact placeable-first taxonomy, honest-data disclosures, and a
  no-auth live demo with uptime through the Feb 3 judge-access window.

## Dossier gap analysis → our response

1. **"True 3D spatial trajectories … offers immediate technical
   superiority."** This is our core thesis, validated by an independent
   scan. Keep pressing: the 3D canvas is week 3's centerpiece.
2. **"Native JetBrains plugin: competitors merely commit nominal `.idea/`
   files. A true IDE extension gives unfair advantage in sponsor
   scoring."** New tracked action (added to ROADMAP week 3): beyond our
   existing `.idea`/`.junie`/`.air` evidence policy and AI_SHOWCASE
   attribution, evaluate a small JetBrains integration (Junie run-book
   commands or a PyCharm/IDEA tool window opening a series' evidence
   report). Cost-boxed at 2 days; only if core milestones are green.

## Category crowding check

The event mini-game category already has 8 current-round entries
(generic 60-second reflex/clicker games). This re-validates our Category 1
choice: harder to copy, defensible via data-engineering depth.

## Defense-model impact

The defense model's prior (~42 viable rivals by deadline, from 180 × 23%,
assuming 60–70% of submissions arrive in the final two weeks) anticipated
a thin early field. Observed: 2 serious early Category-1 VALORANT rivals —
consistent. **No change to the model** (85.4% conditional on executing the
audited spec). What the dossier does change: the differentiation table now
names two live rivals, and the JetBrains-plugin item is now a tracked task.

## Update 2026-11-19 (deep rival-code scan): parity achieved, lead extended

A direct code-level scan of both live rivals (repo trees, READMEs, commit
history) confirmed NunyaIntel as the real threat and closed every gap it
had on us, same day:

| NunyaIntel advantage (observed) | Our response (shipped) |
|---|---|
| Runs on the real GRID corpus (857 series) | `breachiq/corpus.py` scans the real corpus; 28 Cloud9 series done (48,250 casts) with reproducible aggregates in FINDINGS.md |
| Real findings with hard counts in README | README + FINDINGS.md carry real numbers (99-round repeated wall, OXY 40/962 Op rounds, 53%/50% side win rates) |
| Repeated-lineup detection (their best feature) | `features.LineupDetector` — same idea, 3D aim-vector aware, tolerance-parameterized, tested |
| TypeScript web app | static GitHub-Pages demo (they have none deployed), cast-point minimap, lineup markers |
| Coach-first framing | counter-brief NLG + evidence bars on every view |

Remaining advantages they hold: a fuller React frontend (our 3D trajectory
canvas is the week-3 centerpiece and will exceed it); 22 commits of
iteration vs our continuous CI. Neither rival has CI, a license file
(NunyaIntel), or a deployed demo.

## Standing actions

- [x] Name and monitor the two live rivals (weekly re-scan, same cadence
      as red-team re-runs)
- [x] JetBrains integration stretch goal added to ROADMAP week 3
- [x] Category-1 choice re-validated against crowding
- [x] Real-data parity achieved + lineup detection shipped (Nov 19)
- [ ] Weekly dossier refresh alongside the red-team re-run

## Update 2026-11-21 (dossier refresh): the field arrived, and it is good

Fresh GitHub sweep (searches across cloud9/jetbrains/valorant/scouting
terms, pushed >= Nov 14). Category-1 VALORANT current-round rivals went
from 2 to ~9. LoL Category-2 and event mini-games stay crowded but
irrelevant to our lane.

### The three that matter

**Cirrus (zuhairhalawa/cirrus-scout, Nov 21)** - the new standard-setter.
Full corpus (856 series, 2,077 maps, 42,520 rounds, 1.44M casts, 297k
kills), hosted demo on github.io, CI + license + tests, METHODOLOGY.md.
Features: plain-language findings with sample sizes, Wilson intervals,
recurring trap/cam **setups**, **league-wide counter testing** ("select a
defensive spot, check every round where any..."), evidence rounds with
one-click 2D replay, self-scout, print brief, vector floor plans traced
from player positions. Explicitly honest: no landing points (markers are
player positions), tracking-rate caveats, "association not proof".
**Gap we hold: no trajectory physics, no landing estimation, no outcome
linkage per lineup.**

**NunyaIntel (Bryanspirit, Nov 20 push)** - 52 commits, 24 test files.
New since Nov 19: coach's brief (map veto), **round replay 2D/3D with
live win-chance**, next-round prediction, "every model tested on matches
it never saw", key findings ranked by league z-score, anti-eco/pistol
economy analysis, Docker + doctor CLI. Still no CI, no license, no
hosted demo. **Gap we hold: no 3D trajectory/landing layer; their
"3D" is a 2D replay camera.**

**Scopewatch (Divijanand, Nov 21)** - Operator-niche: DuckDB store,
versioned metric registry, Wilson ranges, typed API envelopes, evidence
round keys, second teammate onboarding doc. Deep but narrow (Operator
only); no CI.

Others: scoutscope (demo video, thin data), sentinel-sight (small),
tellwindow-valorant + agent-ValoLineup (README placeholders), c9-stratlens
(unchanged, thin), wpsyos (recruitment lane).

### What this changes

The field has caught up on the honesty layer. Wilson intervals, sample
sizes, evidence rounds and "observational not causal" disclaimers are
now table stakes among serious rivals - our evidence-first framing is no
longer unique. What remains uniquely ours: **3D trajectory physics with
landing estimation** (every rival explicitly disclaims landing data) and
**outcome-linked lineups**. Neither Cirrus nor NunyaIntel ties a detected
lineup to round outcomes - they map where utility is thrown; they cannot
say whether it works.

### Our response (shipped same day)

Lineup **effectiveness**: win rate WITH each detected lineup vs the
team's rate on the same map+side WITHOUT it, Wilson-calibrated, evidence
rounds listed per lineup, and a counter-brief that FLIPS its coaching
call when a lineup does not convert ("let them have it - it does not win
their rounds") instead of reflexively saying "deny it". Also: `won` per
per-cast point (3A contract), a fixed utility-insight bug in synthetic
briefs, and PR #18's severity/evidence engine already covers NunyaIntel's
coach's-brief counter. Real mode lights up on the next `make findings`
re-run (builder extended; snapshot schema forward-compatible).

### Updated standing actions

- [x] Weekly dossier refresh (this file, Nov 21)
- [ ] Track Cirrus's counters/setups features vs our 3D advantage in the
      next refresh; consider a league-wide counter check once corpus
      access allows (needs full-corpus scan, not the Cloud9 slice)
- [ ] NunyaIntel's predictive models: monitor for a deployed demo (none
      today; our live demo remains the only judge-clickable one with
      real data)
