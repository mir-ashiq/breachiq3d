# Data & resource usage accounting

How every asset the hackathon organizers provided was used in this project.
Maintained for transparency — judges and teammates can trace every design
decision back to a provided resource.

## 1. GRID official data corpus — schema used, data NOT redistributed

The corpus itself (857 VALORANT series, ~160 GB uncompressed, plus 856
ability-supplement files) is **not committed and not yet directly
processed**: it requires GRID registration to download, and its license
forbids redistribution (see COMPLIANCE.md). What WAS used, and drives the
entire engine, is the corpus's **verified contract** from the supplement
README:

| Provided contract element | Where it is used |
|---|---|
| Position x/y/z in cm, z-up, x/y in GRID frame | `spatial.py` units & axes; `docs/DATA_QUALITY.md` |
| 3D `view` aim vector, 3D `velocity` per cast | `spatial.estimate_landing` raycast estimates |
| `frame_before`/`frame_after` with `offset_ms` | `spatial.cast_state`, `sample_weight` |
| Interpolation formulas (weight/value, view re-normalized) | `spatial.interpolate` (verbatim) + property tests |
| The five quality values (`ok`, `gap_exceeded`, `missing_after`, `missing_before`, `missing_both`) | `spatial.classify_quality`, README-exact fallback rules |
| 1 Hz VCT Americas sampling (gaps ~1000 ms) | `spatial.is_low_rate` + confidence down-weighting |
| `in_grid: false` semantics (between rounds / buy phase) | `ingest.iter_supplement_casts(in_grid_only=...)` |
| `grid_event_id` join key to main-feed events | `ingest.join_key`, join tests |
| Exclusions: series 2855902; Bind in 2855906; Split in 2877148; merged Abyss/Split in 2890334/2890361 | `ingest.EXCLUSION_MANIFEST`, coverage in evidence bar |
| "No landing locations anywhere" | every landing zone is a labeled ESTIMATE with method + confidence |

The repo therefore ships **SYNTHETIC fixtures that obey this exact schema**
(`breachiq/fixtures.py`), so the demo, tests, and CI run end-to-end with
zero licensed bytes. Connecting the real corpus is ROADMAP week 2: download
outside the repo, calibrate map bounds from the GRID meta CSVs, join real
supplements, re-run coverage/benchmark. The schema-pinning tests guarantee
integration is a calibration step, not a rewrite.

## 2. Official rules page (cloud9.devpost.com/rules)

| Provided rule | Where it is used |
|---|---|
| 5 equally-weighted criteria; two-stage selection; tiebreak order (Technological Implementation first) | Defense model weights; STRATEGY.md; README feature-to-criterion mapping |
| Eligibility exclusions (Brazil, Quebec, Russia, Crimea, Cuba, Iran, North Korea, OFAC; sponsor-affiliated) | `docs/TEAM_ATTESTATION.md`, COMPLIANCE.md |
| Public open-source repo + license displayed in About | MIT LICENSE; README; push checklist in DEVPOST_SUBMISSION.md |
| Demo video under 3 minutes on public YouTube | `scripts/check_video.py` (165s target / 175s cutoff); VIDEO_STORYBOARD.md |
| Free judge access through Feb 3, 2027 | no-auth API policy; uptime monitoring step in ROADMAP |
| W-9/W-8BEN within 10 business days | TEAM_ATTESTATION.md paperwork section |
| Multiple submissions allowed | capacity-gate decision (optional second entry), ROADMAP week 4 |

## 3. Devpost overview + Resources page

| Provided resource | Where it is used |
|---|---|
| Category definitions & Category 1 blueprints | `features.py`: both blueprints implemented; taxonomy in the brief's exact order |
| Prizes ($6,000 category / $25,000 pool) and timeline (Nov 17 open, Dec 9 office hours, Jan 12 deadline, ~Feb 8 winners) | ROADMAP.md verified anchors; defense model |
| GRID API documentation + hackathon data access links | offline-corpus decision (STRATEGY.md); COMPLIANCE.md license summary |
| JetBrains Air + Junie resources | AI_SHOWCASE.md workflow story; DEVPOST_SUBMISSION.md "Built with" |
| Cloud9 Discord link | coach recruiting + office hours, ROADMAP week 4 |

## 4. First-edition intelligence (2025 results, winners, winning repos)

| Provided intel | Where it is used |
|---|---|
| 2,293 registrants → 180 submissions (7.8% conversion) | selection math: viable-field estimate in the defense model |
| Winners C9 StratOS / Spector / Cloud9 Draft Assistant | differentiation table in STRATEGY.md |
| Junie's Arcade repo anatomy (MIT at root, committed `.idea`, live demo, 134 commits, requirement→implementation table) | repo hygiene: LICENSE, day-1 tool-evidence policy, live-demo-first design, README structure |
| Judging criterion "leverage JetBrains IDEs / Junie (encouraged)" | 30s JetBrains segment in the video storyboard; AI_SHOWCASE.md per-feature attribution |

## 5. GRID Riot Open Access terms

Free community key; data delayed; non-commercial; no betting — encoded in
COMPLIANCE.md and the decision to build on the provided offline corpus
(the brief's basis) rather than the live API.

## 6. Fearless Draft confirmation (2026 LoL season)

Evaluated for the Category 2 modular draft organizer blueprint; informed
the single-entry Category 1 focus with a capacity-gated second entry
(ROADMAP week 4).

---

**Honest status line for judges**: engine, tests, API, and dashboard run on
synthetic data obeying the verified GRID schema; real-corpus integration is
roadmapped for week 2 and is a calibration step by design, not a rewrite.
No GRID data or derivatives are committed, ever.
