# Real-data findings: Cloud9 (VCT Americas + Game Changers, 2025–2026)

Computed with `scripts/build_findings.py` from the official GRID starter corpus on 2026-11-19. All numbers below are aggregates over the real event feeds — reproducible by anyone who clones the data repo (see README).

## Coverage & data quality

- **Series scanned:** 28 · **games (maps):** 66 · **rounds:** 1404 · **ability casts (focus team):** 48250
- **Quality mix:** 48082/48250 casts `ok` (99.7%); degraded casts are down-weighted, never silently dropped (see docs/DATA_QUALITY.md)
- **Official exclusions honored:** series 2855902 (invalidated), Bind in 2855906, Split in 2877148, merged Abyss/Split in 2890334/2890361 — affected in this scan: ['2775953: fracture (rolled back/merged)', '2819690: lotus (rolled back/merged)', '2972904: split (rolled back/merged)']
- **Patches:** 11.00 ×21, 13.02 ×10, 10.00 ×7, 10.07 ×7, 10.05 ×5, 10.06 ×5

## Utility atlas (what they cast, where)

Zones are coarse quadrant estimates of the cast position (GRID records cast positions, not landing spots). Full taxonomy in the brief's order.

| Ability | Class | Zones (casts) | Hard count |
|---|---|---|---|
| stars | placeable | b×402, wide×296, a×186, c×160, mid×35 | 1079/1404 rounds |
| trapwire | placeable | wide×186, c×171, a×134, b×126, mid×15 | 632/1404 rounds |
| shear | placeable | wide×163, a×150, c×126, b×81, mid×57 | 577/1404 rounds |
| cyber-cage | placeable | wide×179, c×140, b×116, a×36, mid×13 | 484/1404 rounds |
| spycam | placeable | wide×177, c×95, b×63, a×21, mid×18 | 374/1404 rounds |
| sonic-sensor | placeable | c×131, wide×125, b×35, mid×21, a×16 | 328/1404 rounds |

Class mix across all focus-team casts: other 13746, smoke 10303, placeable 7962, recon 5830, stall 5306, flash 5103

## Repeated lineups (same spot, same aim, across rounds)

A repeated cast cluster = the same ability cast from within 200 cm with aim within 10°, in 3+ distinct rounds. These are the set plays a coach can pre-aim.

| Ability | Map | Repeats | Cast pos (cm) | Aim azimuth | Avg confidence |
|---|---|---|---|---|---|
| toxic-screen | lotus | 99 rounds (99 casts) | (5784.2, -512.1) | 82.0° | 1.0 |
| toxic-screen | lotus | 58 rounds (58 casts) | (1947.2, 2521.6) | 21.2° | 1.0 |
| toxic-screen | haven | 50 rounds (50 casts) | (3866.5, -5062.5) | -110.7° | 1.0 |
| cyber-cage | haven | 47 rounds (51 casts) | (3208.9, -5099.5) | -65.3° | 1.0 |
| dark-cover | lotus | 40 rounds (41 casts) | (5296.5, -3532.9) | 152.7° | 1.0 |
| poison-cloud | lotus | 40 rounds (40 casts) | (3370.3, 2766.1) | 47.3° | 1.0 |
| toxic-screen | icebox | 40 rounds (40 casts) | (-4843.7, 2915.2) | 177.4° | 1.0 |
| haunt | lotus | 39 rounds (39 casts) | (6536.3, 672.0) | 136.1° | 1.0 |

## Operator profile

- **OXY** (raze): Operator in 40/962 rounds, 40 hold positions recorded
- **marceline** (neon): Operator in 25/442 rounds, 25 hold positions recorded
- **yunie** (yoru): Operator in 12/442 rounds, 12 hold positions recorded
- **gia** (omen): Operator in 8/442 rounds, 8 hold positions recorded
- **v1c** (brimstone): Operator in 6/962 rounds, 6 hold positions recorded
- **mitch** (tejo): Operator in 5/962 rounds, 5 hold positions recorded
- **neT** (killjoy): Operator in 5/962 rounds, 5 hold positions recorded
- **leelee** (sova): Operator in 3/442 rounds, 3 hold positions recorded
- **Xeppaa** (tejo): Operator in 2/962 rounds, 2 hold positions recorded
- **sarie** (omen): Operator in 1/442 rounds, 1 hold positions recorded
- Rounds with an Operator on the focus team: 107; Operator holder drew first blood in 20 of them, died first in 10.

## Round outcomes

- **attacker**: won 371/696 (53%) — win types: {'opponentEliminated': 281, 'bombExploded': 90}; attack rounds without a plant: 178/696
- **defender**: won 355/708 (50%) — win types: {'bombDefused': 170, 'timeExpired': 22, 'opponentEliminated': 163}
- **Pistol conversion:** won the round after a won pistol 33/68

## Site-execute pacing (attack, utility → plant)

| Map | Rounds | Median utility→plant (s) |
|---|---|---|
| abyss | 27 | 74.07 |
| ascent | 16 | 82.28 |
| bind | 7 | 98.18 |
| corrode | 22 | 84.77 |
| fracture | 26 | 89.95 |
| haven | 104 | 78.77 |
| icebox | 30 | 83.16 |
| lotus | 181 | 76.22 |
| pearl | 54 | 99.71 |
| split | 23 | 87.6 |
| summit | 21 | 69.12 |
| sunset | 7 | 82.54 |

## Method & honesty notes

- Round attribution by event timestamps; rolled-back games dropped (restart rule from the data README).
- Economy classes (pistol/eco/force/full) are ESTIMATES from team loadout-value snapshots with documented thresholds; pistol = rounds 1 and 13 by rule.
- Zones/lineup positions are cast positions in GRID's cm frame; map bounds calibrated from each game's `map.bounds`.
- Landing locations are never claimed: GRID provides none, and every landing view in the app is a labeled ESTIMATE.
