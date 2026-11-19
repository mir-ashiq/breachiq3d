# Data quality & engineering rules

How BreachIQ handles the GRID corpus honestly. Every rule here traces to the
verified supplement README or the official brief.

## Units and axes

Positions are **centimeters**, **z-up**, with x/y sharing the GRID frame.
The main feed's 2D positions on ability events can lag the true cast spot
by several metres — the supplement's `interpolated` position is preferred.

## Zero-disk, zero-materialize ingest

The VALORANT corpus alone is ~160 GB uncompressed. The pipeline is
**zero-disk** and generator-based end to end (`ingest.iter_jsonl`):
zstd streams are decompressed in memory only, and no series is ever
materialized into a list. Any PR that builds a list from a stream is
rejected in review.

## The five quality flags

Every supplement cast carries a quality value; `spatial.cast_state`
implements the README rules exactly:

| Quality | Rule |
|---|---|
| `ok` | both frames within 500 ms (1200 ms low-rate) — use `interpolated` |
| `gap_exceeded` | use the **closer frame**, not `interpolated` |
| `missing_after` | extrapolated from `frame_before` within limits |
| `missing_before` | copy `frame_after` |
| `missing_both` | unusable — skip and count |

The evidence bar surfaces the quality mix per insight, so a coach can see
when a number leans on degraded casts.

## Low-rate series (1 Hz)

VCT Americas 2025 series were sampled at **1 Hz** instead of 5 Hz (gaps near
1000 ms instead of ~200 ms). The pipeline detects them
(`spatial.is_low_rate`), applies the loose 1200 ms tolerance, and
**down-weights confidence** on their landing estimates. Precision claims
never mix 1 Hz and 5 Hz series silently.

## Rollbacks and exclusions

- Restarted maps void earlier rounds: `ingest.RollbackTracker` drops
  rolled-back game ids.
- Series **2855902** has no supplement at all; **Bind in 2855906**,
  **Split in 2877148**, and the merged **Abyss/Split** in 2890334/2890361
  are excluded. `ingest.EXCLUSION_MANIFEST` encodes this, and the evidence
  bar shows coverage so sample sizes never lie.

## Landing zones are estimates

GRID provides **no landing locations anywhere**. Every landing zone we
render is a labeled **raycast estimate** from cast position + aim vector +
velocity, with method and confidence attached. The official brief
explicitly allows estimation; false precision is what we avoid.

## `in_grid: false` casts

Casts with `in_grid: false` are mostly signature abilities used between
rounds or in the buy phase. Round analytics filter them out
(`iter_supplement_casts(in_grid_only=True)`); between-round usage views
count them separately. Mixing both silently inflates round frequencies.

## Calibration of map bounds

`spatial.BOUNDS` ships with synthetic placeholder bounds used by the
SYNTHETIC fixtures. Before connecting the official corpus, calibrate each
map's playable bounds from the GRID meta CSVs; `scripts/verify_pipeline.py`
runs a render smoke check (every estimate inside the unit square) and a
coverage report after calibration.
