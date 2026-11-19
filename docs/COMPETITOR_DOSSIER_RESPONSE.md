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

## Standing actions

- [x] Name and monitor the two live rivals (weekly re-scan, same cadence
      as red-team re-runs)
- [x] JetBrains integration stretch goal added to ROADMAP week 3
- [x] Category-1 choice re-validated against crowding
- [ ] Weekly dossier refresh alongside the red-team re-run
