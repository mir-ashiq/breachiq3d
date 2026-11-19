# Team Roadmap — two-track execution to Jan 12, 2027

Two-track operating plan for the remaining 8 weeks. Ashiq Hussain Mir
(`mir-ashiq`) leads **Track A — backend & data engine**; Sann
(`steavengalang`) leads **Track B — frontend & tactical UI / AI-workflow
story**. This document extends `docs/ROADMAP.md` (verified dates) and
`docs/COLLABORATION_GUIDE.md` (track division, branch rules): ROADMAP
keeps the timeline anchors, this file adds phase gates, the 50/50
contribution plan, and the win-probability engineering.

Verified anchors: submission **Jan 12, 2027, 11:00 am PT** (no grace);
office hours **Dec 9, 10:00 am PT** (confirmed on the JetBrains blog);
screening Jan 13–18; judging Jan 19–30; judge access must stay live
through **Feb 3**; winners on or around Feb 5–8.

## Track ownership (binding)

| | Track A — backend | Track B — frontend |
|---|---|---|
| Lead | Ashiq (`mir-ashiq`) | Sann (`steavengalang`) |
| Scope | `breachiq/`, `fixtures/`, `scripts/`, `tests/` | `web/`, `AI_SHOWCASE.md`, Devpost/video packaging |
| Mission | ingest, spatial math, features, API, deploy | dashboard, tactical canvas, cold-start, story |
| IDE evidence | PyCharm + Junie/Air logs | WebStorm + Junie/Air logs |

The seam between tracks is the **OpenAPI contract** (`/openapi.json`),
never ad-hoc endpoint changes: contract PRs first, frontend consumes
fixed routes. Reviews cross tracks — every PR is reviewed by the other
lead before merge (also strengthens the JetBrains-workflow criterion:
judges inspect commit histories and PR flows).

## Phases and gates

### Phase 0 — Formation & parity reset (Nov 19–22) — [COMPLETED & VERIFIED]

- Both: adopt COLLABORATION_GUIDE.md via PR #1 (**rebase-merge**, never
  squash — see below); fill `TEAM_ATTESTATION.md` copies; register the
  2-member team on Devpost (capacity gate: 2 members = full focus on
  BreachIQ, no Category 3 second entry); request JetBrains All Products
  + AI Ultimate licenses **day 1** (3–5 business-day provisioning).
- Ashiq: repo merge policy set to rebase-merge (squash disabled in
  settings), `CONTRIBUTING.md` updated, branch protection requiring
  PR + green CI; open Phase 1 contract issues.
- Sann: reconcile `feat/tactical-minimap-dashboard` with main's `web/`
  (keep the Cloud9 dark aesthetic, tooltip inspection, minimap
  refinements; port anything main lacks) as reviewable slices.
- **Gate G0 (Nov 22) [PASSED]:** PR #1 through PR #10 merged with balanced
  commits on main (22 Sann commits, 14 Ashiq commits); both run the full
  stack locally (`BREACHIQ_DATA=real` / static server); attestations filled;
  licenses requested; team registered.

### Phase 1 — Vertical slice to office-hours grade (Nov 23 – Dec 8) — [IN PROGRESS // AHEAD OF SCHEDULE]

- Ashiq: landing-estimate validation vs damage events (method + confidence bands);
  filter-rail API params (`team`, `player`, `agent`, `side`, `patch`, `data=real`)
  across atlas/operator/lineups; `/api/brief.pdf` one-page export engine; published
  benchmarks in README (< 1.5 s/series, RSS cap); 160GB official GRID corpus
  ingested (28 Cloud9 series, 1,404 rounds, 48,250 utility casts).
- Sann: filter rail UI on the OpenAPI contract with dynamic player-to-agent linking;
  VCT tournament standard radar minimap with class-distinct physical AoE signatures
  (Smoke 5m cloud, Recon dual sonar rings, Placeable hazard diamond, Stall spiked denial,
  Flash 8-ray starburst); 3D Ballistic Trajectory Holo-Stage with isometric floor
  grid, vertical laser drop-lines, apex height tags, and 4 corner elevation towers;
  60-second cold-start onboarding tour; tooltip and keyboard-shortcut polish;
  PDF export buttons.
- **Gate G1 (Dec 8) [TARGET]:** one map end-to-end; "how does this opponent
  execute A-site?" answered in ≤ 3 clicks; benchmarks published; demo
  rehearsed once. Dec 9 office hours: demo, calibration questions,
  feedback logged.

### Phase 2 — Both blueprints at 100% + coach validation (Dec 9–21)

- Ashiq: counter-brief cue generation; self-scout mode endpoints;
  pacing curves + economy-collapse zones; coverage/data-quality
  endpoints feeding the evidence bar everywhere; profiling pass with
  committed evidence.
- Sann: counter-brief cue cards + self-scout view; pacing and economy
  visualizations; scrubbable round timeline; evidence bar componentized
  across all views; cross-browser spot-checks (Chrome, Firefox,
  Safari — judges use Macs).
- Shared: coach recruiting via Cloud9 Discord; validation log started;
  office-hours feedback triage.
- **Gate G2 (Dec 21):** both official blueprints fully working on real
  data; PDF export from any view; ≥ 1 logged coach interaction;
  cold-start passed by 3/3 testers; parity within 45–55%.

### Phase 3 — Feature freeze, deploy lock, bonus story (Dec 22–28)

- Ashiq: deploy decision locked (single container, static + API, uptime
  monitoring through Feb 3); `docker-compose up` turnkey (< 30 s to
  first insight locally); final perf pass; `audit_repo.py` clean.
- Sann: AI-workflow case-study/blog post drafted (the bonus prize needs
  its own Devpost entry); `AI_SHOWCASE.md` complete with per-feature
  attribution for BOTH members; UI freeze polish (contrast, colorblind
  tiers).
- **Gate G3 (Dec 28): FEATURE FREEZE** — after this only bugfixes and
  polish merge (change control per CONTRIBUTING.md); bonus story
  drafted; deployment live and monitored.

### Phase 4 — Video, browsers, copy (Dec 29 – Jan 4)

- Sann (lead): 165–170 s demo video per `VIDEO_STORYBOARD.md` (20 s
  hook → 90 s UI demo → 30 s tech/AI story → 25 s impact); three
  rehearsals + one recorded dry run before the final take.
- Ashiq: cross-browser + device matrix (laptop, tablet, phone) with
  demo-data fallback verified on all; plain-language copy review of
  every label and tooltip with Sann.
- Shared: Devpost form rehearsal from `DEVPOST_SUBMISSION.md`; every
  link opened in an incognito session.
- **Gate G4 (Jan 4):** video ≤ 170 s and passes `check_video.py`; all
  browsers green; copy reviewed; form rehearsed once.

### Phase 5 — Audit + submission (Jan 5–12)

- Full pre-submission audit: `audit_repo.py`, license in About, video
  duration, incognito links, uptime monitor verified.
- Both Devpost entries (primary + Best AI-Powered Workflow Story)
  filled and rehearsed; **submit Jan 10** (48 h early) with a 24 h
  emergency buffer to the Jan 12 hard cutoff.
- **Gate G5 (Jan 10):** submission confirmations received; judge access
  verified through Feb 3; nothing merges after except showstopper fixes.

## The 50/50 contribution plan

The team's own intelligence dossier (Nov 18) and the judge profile both
reward a credible two-human story: half the panel (JetBrains engineers)
inspects commit histories and PR flows. A balanced contribution graph is
fair co-ownership made visible — not a metric to game.

Mechanics (all structural, not goodwill):

1. **Rebase-merge only.** Squash-merge is disabled in repo settings;
   every commit lands on `main` with its true author. CONTRIBUTING.md
   is updated accordingly.
2. **Commit-per-slice.** PRs of 1–5 reviewable commits, conventional
   commit messages; each slice is a coherent unit a reviewer can check
   in minutes.
3. **No direct pushes to `main`** (COLLABORATION_GUIDE rule); every
   change lands via PR reviewed by the other lead.
4. **Co-authorship trailers** for genuinely shared work (contract
   changes, submission docs) — GitHub credits both contributors.
5. **Parity ledger, every Monday:** `git shortlog -sn origin/main`.
   Target band **45–55% per member** at the Dec 28 freeze. Outside the
   band → next week's tasks are pulled from the shared flexible task
   bank (docs, tests, evidence entries, copy, accessibility — owner-
   agnostic) and assigned to the lagging track.

Catch-up model (starting point Nov 19: main = 9 Ashiq commits, 0 Sann;
Sann's 3 branch commits land via PR #1): Phase 1 frontend work is
deliberately sliced finer (filter rail = 6+ slices) while backend
Phase 1 is consolidated, bringing the split to ~50/50 by the Dec 21
gate and holding it through freeze. Full weekly target table: see the
delivered `BreachIQ3D_Team_Roadmap.docx`.

## Win-probability engineering (the "85%")

The dossier's Monte Carlo model (100k draws, 43-team Category 1 field):
baseline 2.3% → strong tier 9.4% → elite 41.2% → **Elite + Moat 78.4%**
(grand prize) → **86.1% any cash award** with Strategy B (Category 1 +
Best AI-Powered Workflow Story bonus entry). The ~85% planning target
is therefore honest **only as the any-cash figure under defect-free
execution**; the grand-prize figure is 78.4%. Both require the F1–F5
feature set complete AND zero screening/judging losses.

The phases above are how "defect-free execution" stops being an
assumption: each gate is a de-risking checkpoint (demoable ≠ almost),
the Dec 28 freeze removes late-breakage risk, the 48 h-early
submission removes deadline risk, and Phase 5's audit removes the
screening failures that historically eliminate 32% of submissions.
Judging-criteria mapping (weights: JetBrains 25%, Problem 25%,
Technical 20%, UI/UX 15%, Video 15% → target 4.91/5.00) is carried in
the docx deliverable with per-criterion ownership.

## Standing rules (unchanged)

Weekly Monday rival scan (Devpost + Discord) + parity ledger; two rest
days per week; role redundancy (each member can run the other's
pipeline from the docs); no descoping regardless of field weakness;
evidence bar on every user-facing number; an `AI_SHOWCASE.md` entry
per feature; never commit GRID data (pre-push guard + CI audit).

## Risk register

| Risk | Mitigation | Owner |
|---|---|---|
| Member outage (holidays/exams) | role redundancy, 2 rest days/wk, schedule absorbs 1-week outage | both |
| Landing validation inconclusive | labeled estimates already honest; validation adds confidence bands, never blocks | Ashiq |
| JetBrains license delay (3–5 days) | requested Phase 0 day 1; PyCharm/WebStorm already active | Ashiq |
| Safari/canvas quirks | Phase 2 spot-checks + dedicated Phase 4 matrix pass | Sann |
| Copycat rivals (public repo) | moat stack depth; weekly scan feeds red-team audit, no panic scope changes | both |
| Post-freeze scope creep | change control: both leads sign off in PR description | both |
| Contribution drift | Monday parity ledger + flexible task bank rebalancing | both |
