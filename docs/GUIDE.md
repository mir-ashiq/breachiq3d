# BreachIQ 3D — Dual-Track Engineering & Integration Guide

Project: BreachIQ 3D / C9 SightLine
Hackathon: Sky's the Limit 2026: Cloud9 x JetBrains
Category: Category 1 (VALORANT Tactical Scouting) + Best AI Workflow Story Bonus

This guide defines the engineering contract, git workflow, API schemas, and track boundaries so backend and frontend seamlessly integrate without merge conflicts or duplicated work.

---

## 1. Team Division & Ownership

Track A: Backend, Data Streaming & 3D Math Engine
Lead: Ashiq Hussain (mir-ashiq)
Scope:
- Ingest pipeline & zero-disk .jsonl.zst streaming (breachiq/corpus.py, breachiq/ingest.py)
- Spatial math, map bounds calibration & 3D trajectory calculation (breachiq/spatial.py)
- API endpoints & aggregate findings generator (breachiq/api.py, scripts/build_findings.py)
- Unit tests & compliance audit (tests/, scripts/audit_repo.py)

Track B: Frontend Tactical Dashboard, Visualizer & JetBrains Story
Lead: Sann (steavengalang)
Scope:
- Tactical Dashboard UI & Cloud9 dark mode design system (web/index.html, web/style.css)
- 2D minimap canvas & 3D interactive trajectory visualization (web/app.js)
- Filter rail (Map, Side, Patch, Ability) & interactive tooltips
- JetBrains AI Assistant / Junie story documentation (AI_SHOWCASE.md)
- Devpost documentation & 3-minute video walkthrough (DEVPOST.md, docs/)

---

## 2. Git & Branching Rules (Mandatory)

Rule 1: Never push or force-push directly to main.
All changes must go through a feature branch and a GitHub Pull Request.

Rule 2: Branch naming convention:
- Backend: feat/backend-<feature-name> (e.g. feat/backend-streaming-v2)
- Frontend: feat/frontend-<feature-name> (e.g. feat/frontend-tactical-dashboard)
- Bugfix: fix/<bug-name>

Rule 3: Co-authorship for 50/50 contribution graph:
When working on shared contracts, add both authors in the commit trailer so GitHub registers contributions on both profiles:
Co-authored-by: mir-ashiq <imsrenpsycho@gmail.com>
Co-authored-by: steavengalang <steavengalang@gmail.com>

Rule 4: Zero proprietary data in git:
Never commit raw .zst or uncompressed GRID telemetry files. Always run:
python scripts/audit_repo.py
before pushing.

---

## 3. Backend-to-Frontend Data Contract

The frontend reads from FastAPI endpoints when running live, and falls back to web/demo-data.json in demo mode. The backend must maintain the following schemas:

### A. GET /api/atlas?map=<map_name>&side=<all|attack|defense>&patch=<patch>&player=<player>&agent=<agent>
Returns utility density, zone counts, and trajectory points for the map.
`patch`/`player`/`agent` are optional roster filters (all filter points; in
real-aggregate mode they are points-scope only, flagged via `points_scope`).

Response Schema:
{
  "map_selected": "split",
  "rounds": 40,
  "taxonomy_order": ["placeable", "recon", "smoke", "stall", "flash", "other"],
  "abilities": [
    {
      "ability": "sage-wall",
      "class": "stall",
      "zones": {"a": 2, "b": 2, "wide": 3},
      "hard_count": "7/40 rounds",
      "evidence": {
        "rounds": 40,
        "matches": 40,
        "frequency": 7,
        "patch": "11.08",
        "coverage": "real corpus aggregates",
        "quality_mix": {"ok": 22, "missing_after": 2}
      }
    }
  ],
  "points": [
    {
      "u": 0.4448,
      "v": 0.0,
      "u0": 0.4210,
      "v0": 0.1250,
      "azimuth": 35.0,
      "pitch": 18.5,
      "ability": "sage-wall",
      "class": "stall",
      "player": "Alpha",
      "round": 4,
      "quality": "ok",
      "confidence": 1.0,
      "is_estimate": true,
      "won": true
    }
  ]
}

Coordinates Contract:
- u0, v0: Normalized caster coordinates on the minimap in range [0.0, 1.0].
- u, v: Normalized landing or impact estimate on the minimap in range [0.0, 1.0].
- azimuth: Aim vector horizontal angle in degrees [0, 360).
- pitch: Aim vector vertical elevation angle in degrees [-90, +90].
- player / agent: caster roster identity for the filter rail and tooltip
  (agent empty string when the roster entry is unknown).
- won: did the caster's team win this round (true/false), or null when the
  outcome is unknown - never fabricated. Powers the win-rate-when-cast
  analysis and the replay timeline grouping.
- is_estimate: true (Required — GRID data contains no landing coordinates).

### B. GET /api/lineups?map=<map_name>
Returns repeated utility setups observed across 3 or more rounds.
Each lineup carries its **evidence rounds** and its **effectiveness**:
win rate in the rounds where it was cast, vs the team's win rate on the
same map+side in rounds without it. A lineup that does not convert is
bait, not a threat - the counter-brief flips its coaching call.

Response Schema:
{
  "lineups": [
    {
      "ability": "sage-wall",
      "map": "split",
      "repeats": 10,
      "total_casts": 10,
      "rounds": ["demo:split:0", "demo:split:4", "..."],
      "position": {"x": -1500.0, "y": -500.0, "z": 200.0},
      "aim_azimuth_deg": 35.0,
      "avg_confidence": 1.0,
      "is_estimate": true,
      "u": 0.1660,
      "v": 0.1318,
      "trajectory": [
        {"x": -1500.0, "y": -500.0, "z": 200.0},
        {"x": -1200.0, "y": -200.0, "z": 450.0},
        {"x": -900.0, "y": 100.0, "z": 150.0}
      ],
      "effectiveness": {
        "rounds_won": 10,
        "sample_rounds": 10,
        "win_rate_when_cast": 1.0,
        "wilson_95": {"low": 0.722, "high": 1.0},
        "baseline_win_rate": null,
        "baseline_sample_rounds": 0,
        "lift_pp": null,
        "note": "observational: win rate with the lineup vs without it on the same map+side; association, not cause"
      }
    }
  ],
  "data": "real corpus aggregates"
}

`baseline_win_rate`/`lift_pp` are null when no same-scope comparison
rounds exist (or until a real-snapshot rebuild adds outcome linkage) -
never guessed. `lift_pp` is percentage points: win rate when cast minus
baseline.

### C. GET /api/operator
Returns sniper weapon purchase patterns and hold timings per player.

Response Schema:
{
  "players": [
    {
      "player": "Bravo",
      "agent": "sova",
      "operator_buys": 27,
      "buy_rate": "27/40 rounds",
      "hold_timing": {"0-20s": 15, "20-40s": 12},
      "hold_positions": []
    }
  ]
}

### D. GET /api/pacing
Returns site-execute durations and economy first-death chokepoints.

Response Schema:
{
  "sites": {
    "a": {
      "rounds": 16,
      "median_utility_to_plant_s": 20.1,
      "eco_first_death_zones": {"mid-vents": 2, "b-heaven": 3}
    }
  }
}

### E. GET /api/brief?map=<map_name>&side=<all|attacker|defender>&patch=<patch>&data=<real|synthetic>
Severity-ranked counter-brief - the anti-strat core. The same builder
feeds `/api/brief.pdf`, so the dashboard panel and the printed one-pager
render identical content.

Response Schema:
{
  "map": "lotus", "side": "all", "rounds": 436,
  "headline": "Repeated lineup: toxic-screen x99 - Pre-aim ...",
  "source": "real GRID corpus aggregates",
  "insights": [
    {
      "severity": "critical",            // critical | warning | note
      "kind": "lineup",                  // lineup | operator | tempo | utility | method
      "title": "Repeated lineup: toxic-screen x99",
      "detail": "toxic-screen is cast from the same spot in 99 rounds ...",
      "action": "Pre-aim the landing spot and deny the line ...",
      "evidence": {
        "rounds_seen": 99, "sample_rounds": 436,
        "confidence": 1.0,               // detector confidence or null
        "source": "lineups",             // lineups | operator | pacing | atlas | method
        "scope": "map"                   // map | series | method
      }
    }
  ]
}

Insights are ordered top-down by severity, then coverage; every number
traces to a committed aggregate (lineups repeats, operator buy_rate,
pacing medians, atlas hard counts) - no evidence, no insight. Lineup
insights also carry an `effectiveness` object when outcome linkage
exists, and a lineup whose win rate is 8+pp BELOW its same-scope
baseline flips the coaching call: severity drops and the action becomes
"let them have it" instead of "deny it".

---

## 4. Frontend Rendering Expectations

1. 2D Minimap Canvas:
- Renders the calibrated radar map area with tactical coordinate grid.
- Draws quadratic bezier curves connecting (u0, v0) to (u, v) using ability class colors.
- Adds aim direction vector tick from caster coordinates based on azimuth angle.
- Marks repeated lineups with high-contrast target reticle and star icon.

2. Interactive Canvas Tooltips:
- On mouse hover, detects closest point within 8px radius.
- Displays caster player name, agent, ability, pitch elevation, azimuth aim, and confidence percentage.

3. Evidence Bar:
- Displays hard count, round sample size, tournament patch, and frame quality breakdown.
- Emphasizes that every landing point is a calibrated raycast estimate.

4. Offline Demo Bundle:
- Whenever the backend generates new findings (via scripts/build_findings.py), ensure web/demo-data.json matches the exact same schema so the GitHub Pages deployment runs seamlessly.

---

## 5. Development Command Reference

Run FastAPI Backend:
uvicorn breachiq.api:app --reload --port 8000

Run Standalone Frontend:
python -m http.server 3000 --directory web

Run Test Suite:
pytest tests/

Run Repository Compliance Audit:
python scripts/audit_repo.py
