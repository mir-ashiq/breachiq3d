#!/usr/bin/env python3
"""Build docs/FINDINGS.md from the REAL GRID corpus: all Cloud9 series.

Runs the full feature stack (atlas, lineups, operator, outcomes, pacing)
over every Cloud9 series in val/series.csv and writes aggregate findings
(license-safe: aggregate results only, no raw data leaves this machine).

Usage:
    python scripts/build_findings.py [--limit N] [--team Cloud9]
"""
from __future__ import annotations

import argparse
import collections
import json
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from breachiq import features, spatial
from breachiq.corpus import (Corpus, SeriesScanner, ability_class,
                             economy_class)

REPO = Path(__file__).resolve().parent.parent

# static-file budget for per-cast points (GUIDE.md section 3A); an even
# stride over scan order keeps the sample spread across series and rounds,
# and points_total carries the true count for the evidence bar
MAX_SIDE_POINTS = 160


def _side_points(pts: list[dict]) -> dict:
    """Sampled per-cast points for one (map, side) of the demo snapshot."""
    if len(pts) > MAX_SIDE_POINTS:
        step = len(pts) / MAX_SIDE_POINTS
        return {"points": [pts[int(i * step)] for i in range(MAX_SIDE_POINTS)],
                "points_total": len(pts)}
    return {"points": pts, "points_total": len(pts)}


def parse_ts(iso: str) -> float:
    return datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--team", default="Cloud9")
    ap.add_argument("--limit", type=int, default=0, help="only first N series")
    ap.add_argument("--out", default=str(REPO / "docs" / "FINDINGS.md"))
    ap.add_argument("--demo-out", default=str(REPO / "web" / "demo-data.json"),
                    help="also write the real-aggregate demo snapshot "
                         "(license-safe: aggregate results only)")
    args = ap.parse_args()

    corpus = Corpus()
    rows = corpus.team_series(args.team)
    if args.limit:
        rows = rows[: args.limit]
    print(f"scanning {len(rows)} series for teams matching '{args.team}' ...")

    # aggregation state
    bounds_by_map: dict[str, dict] = {}
    atlas = features.UtilityAtlas(class_resolver=ability_class)
    # per-map, per-side atlases + cast-density bins for the live demo
    def _side_dict():
        return {s: features.UtilityAtlas(class_resolver=ability_class)
                for s in ("all", "attacker", "defender")}
    atlas_by_map_side: dict[str, dict] = collections.defaultdict(_side_dict)
    DENSITY_BINS = 40
    density: dict[str, dict[str, dict[tuple[int, int], int]]] = \
        collections.defaultdict(lambda: {"all": {}, "attacker": {}, "defender": {}})
    rounds_by_map: collections.Counter = collections.Counter()
    lineups = features.LineupDetector()
    op_fp = features.OperatorFingerprint()
    outcomes = features.RoundOutcomes()
    pacing = features.ExecutePacing()

    quality_mix: collections.Counter = collections.Counter()
    class_mix: collections.Counter = collections.Counter()
    patches: collections.Counter = collections.Counter()
    maps_played: collections.Counter = collections.Counter()
    games_count = 0
    op_rounds = 0
    op_first_kills = 0
    op_holder_died_first = 0
    matches_by_series: dict[str, int] = {}
    exclusion_hits: list[str] = []
    no_supp = 0

    # game id -> patch (meta/games.csv), for per-cast patch tagging
    patch_by_game: dict[str, str] = {}
    for g in corpus.games():
        gid = str(g.get("game_id") or g.get("id") or "")
        patch_by_game[gid] = g.get("patch", "") or ""

    # per-cast trajectory points (docs/GUIDE.md section 3A), per map+side;
    # "all" mirrors the density convention: attacker+defender casts only
    points: dict[str, dict[str, list[dict]]] = collections.defaultdict(
        lambda: {"all": [], "attacker": [], "defender": []})

    for i, row in enumerate(rows, 1):
        sid = row["series_id"]
        scan = SeriesScanner(corpus).scan(sid)
        if not scan["rounds"]:
            no_supp += 1
            continue
        players = scan["players"]
        # the focus team name as recorded in this series' game states
        focus_names = {p["team"] for p in players.values()
                       if p["team"] and args.team.lower() in p["team"].lower()}
        if not focus_names:
            focus_names = {args.team}
        matches_by_series[sid] = len({g["map"] for g in scan["games"].values()
                                      if not g["rolled_back"]})
        games_count += matches_by_series[sid]
        for g in scan["games"].values():
            if g["bounds"] and not g["rolled_back"]:
                b = g["bounds"]
                bounds_by_map.setdefault(g["map"], b)
            if g["rolled_back"]:
                exclusion_hits.append(f"{sid}: {g['map']} (rolled back/merged)")

        # real bounds for this series' maps (fallback: synthetic)
        def map_bounds(m: str) -> spatial.MapBounds:
            b = bounds_by_map.get(m)
            if b:
                return spatial.MapBounds(b["min"]["x"], b["max"]["x"],
                                         b["min"]["y"], b["max"]["y"])
            return spatial.BOUNDS.get(m, spatial.MapBounds(-4000, 4000,
                                                           -4000, 4000))

        casts_by_round: dict[tuple, list[dict]] = collections.defaultdict(list)
        for c in scan["casts"]:
            quality_mix[c["quality"]] += 1
            cls = c["ability_class"]
            class_mix[cls] += 1
            pname = players.get(c["player_id"], {}).get("name", c["player_id"])
            pteam = players.get(c["player_id"], {}).get("team", "") or ""
            if pteam not in focus_names and args.team.lower() not in pteam.lower():
                continue
            if not c["position"] or c["round_no"] is None:
                continue
            u, v = spatial.normalize_position(c["position"], map_bounds(c["map"]))
            try:
                cast_t = parse_ts(c["occurred_at"]) if c["occurred_at"] else None
            except ValueError:
                cast_t = None
            casts_by_round[(c["game_id"], c["round_no"])].append({
                "u": u, "v": v, "ability": c["ability"], "quality": c["quality"],
                "t": cast_t, "side": c["side"],
            })
            # density bins (aggregate 2D histogram of cast positions)
            if c["side"] in ("attacker", "defender"):
                bin_uv = (min(int(u * DENSITY_BINS), DENSITY_BINS - 1),
                          min(int(v * DENSITY_BINS), DENSITY_BINS - 1))
                d = density[c["map"]]
                for k in ("all", c["side"]):
                    d[k][bin_uv] = d[k].get(bin_uv, 0) + 1
            if c["view"]:
                lineups.add(ability=c["ability"], map=c["map"],
                            position=c["position"], view=c["view"],
                            round_key=f"{sid}:{c['game_id'][:8]}:{c['round_no']}",
                            confidence=0.6 if c["quality"] != "ok" else 1.0)
                # per-cast trajectory point: caster position, aim angles,
                # landing ESTIMATE - the frontend contract (GUIDE.md 3A)
                mb = map_bounds(c["map"])
                u0, v0 = spatial.normalize_position(c["position"], mb)
                landing = spatial.project_landing(
                    c["position"], c["view"], c["ability_class"], mb,
                    quality=c["quality"])
                pt = features.trajectory_point(
                    u=landing.u, v=landing.v, u0=u0, v0=v0,
                    azimuth=spatial.azimuth_deg(c["view"]),
                    pitch=spatial.pitch_deg(c["view"]),
                    ability=c["ability"], ability_class=c["ability_class"],
                    player=pname, round_no=c["round_no"],
                    quality=c["quality"], confidence=landing.confidence,
                    patch=patch_by_game.get(str(c["game_id"]), ""))
                if c["side"] in ("attacker", "defender"):
                    side_pts = points[c["map"]]
                    side_pts["all"].append(pt)
                    side_pts[c["side"]].append(pt)

        for r in scan["rounds"]:
            if str(r["game_id"]) in scan.get("rolled_back_games", []):
                continue
            maps_played[r["map"]] += 1
            casts = casts_by_round.get((r["game_id"], r["round_no"]), [])
            atlas.add_round(casts, patch="")
            # round context for focus team
            side = None
            for fn in focus_names:
                side = r["sides_by_team"].get(fn) or side
            rounds_by_map[r["map"]] += 1
            m_sides = atlas_by_map_side[r["map"]]
            m_sides["all"].add_round(casts, patch="")
            if side in ("attacker", "defender"):
                m_sides[side].add_round(casts, patch="")
            won = any(r["winner_team"] == fn for fn in focus_names)
            outcomes.add_round(round_no=r["round_no"], side=side or "unknown",
                               won=bool(won), win_type=r["win_type"],
                               planted=r["plant_iso"] is not None,
                               economy=economy_class(r["round_no"],
                                       r["loadouts"].get(side)))
            # holders whose team is a focus team
            holders = [h for h in r["operator_holders"]
                       if next((p["team"] for p in players.values()
                                if p["name"] == h), "") in focus_names]
            focus_players = {p["name"]: p for p in players.values()
                             if p["team"] in focus_names}
            for pname, p in focus_players.items():
                bought = pname in r["operator_holders"]
                pos = r["operator_positions"].get(pname)
                hold_uv = None
                if bought and pos:
                    mb = map_bounds(r["map"])
                    hold_uv = spatial.normalize_position(
                        {"x": pos["x"], "y": pos["y"]}, mb)
                op_fp.add_round(player=pname, agent=p["agent"] or "unknown",
                                bought_operator=bought,
                                hold_position=hold_uv, hold_map=r["map"])
            if holders:
                op_rounds += 1
                fk = r.get("first_kill") or {}
                if fk.get("killer") in holders:
                    op_first_kills += 1
                if fk.get("victim") in holders:
                    op_holder_died_first += 1
            # pacing: first in-grid utility -> plant on attack (live-round
            # casts only; buy-phase signature casts are excluded upstream)
            if side == "attacker" and r["plant_iso"]:
                round_casts = casts_by_round.get((r["game_id"], r["round_no"]), [])
                cast_ts = [c["t"] for c in round_casts if c["t"] is not None]
                if cast_ts:
                    try:
                        start_t = parse_ts(r["start_iso"])
                        pacing.add_round(
                            site=r["map"],
                            first_utility_s=min(cast_ts) - start_t,
                            plant_s=parse_ts(r["plant_iso"]) - start_t,
                            economy=economy_class(r["round_no"],
                                                  r["loadouts"].get(side)),
                            first_death_zone=None)
                    except ValueError:
                        pass
        print(f"  [{i}/{len(rows)}] series {sid}: {len(scan['rounds'])} rounds, "
              f"{len(scan['casts'])} casts")

    # patches from meta/games.csv for the focus team
    for g in corpus.games():
        if args.team.lower() in (g.get("team1_name", "") +
                                 g.get("team2_name", "")).lower():
            patches[g.get("patch", "?")] += 1

    atlas_result = atlas.result(matches=games_count,
                                coverage="real GRID corpus (Cloud9 series)")
    lineup_result = lineups.result()
    outcomes_result = outcomes.result()
    pacing_result = pacing.result()
    op_result = op_fp.result()

    # ---------------- write FINDINGS.md
    total_rounds = outcomes_result["rounds"]
    total_casts = sum(quality_mix.values())
    ok_share = quality_mix.get("ok", 0) / max(1, total_casts)
    top_abilities = atlas_result["abilities"][:6]
    top_lineups = lineup_result[:8]

    lines = []
    A = lines.append
    A("# Real-data findings: Cloud9 (VCT Americas + Game Changers, 2025–2026)")
    A("")
    A(f"Computed with `scripts/build_findings.py` from the official GRID "
      f"starter corpus on {datetime.now().date().isoformat()}. "
      "All numbers below are aggregates over the real event feeds — "
      "reproducible by anyone who clones the data repo (see README).")
    A("")
    A("## Coverage & data quality")
    A("")
    A(f"- **Series scanned:** {len(matches_by_series)} · **games (maps):** "
      f"{games_count} · **rounds:** {total_rounds} · **ability casts "
      f"(focus team):** {total_casts}")
    A(f"- **Quality mix:** {quality_mix.get('ok', 0)}/{total_casts} casts "
      f"`ok` ({ok_share:.1%}); degraded casts are down-weighted, never "
      "silently dropped (see docs/DATA_QUALITY.md)")
    A(f"- **Official exclusions honored:** series 2855902 (invalidated), "
      "Bind in 2855906, Split in 2877148, merged Abyss/Split in "
      "2890334/2890361"
      + (f" — affected in this scan: {exclusion_hits}" if exclusion_hits
         else " — none of these affect the scanned series"))
    A(f"- **Patches:** {', '.join(f'{p} ×{n}' for p, n in patches.most_common(6))}")
    A("")
    A("## Utility atlas (what they cast, where)")
    A("")
    A("Zones are coarse quadrant estimates of the cast position (GRID "
      "records cast positions, not landing spots). Full taxonomy in the "
      "brief's order.")
    A("")
    A("| Ability | Class | Zones (casts) | Hard count |")
    A("|---|---|---|---|")
    for a in top_abilities:
        zones = ", ".join(f"{z}×{c}" for z, c in
                          sorted(a["zones"].items(), key=lambda kv: -kv[1]))
        A(f"| {a['ability']} | {a['class']} | {zones} | {a['hard_count']} |")
    A("")
    A(f"Class mix across all focus-team casts: "
      + ", ".join(f"{c} {n}" for c, n in class_mix.most_common()))
    A("")
    A("## Repeated lineups (same spot, same aim, across rounds)")
    A("")
    A("A repeated cast cluster = the same ability cast from within 200 cm "
      "with aim within 10°, in 3+ distinct rounds. These are the set "
      "plays a coach can pre-aim.")
    A("")
    if top_lineups:
        A("| Ability | Map | Repeats | Cast pos (cm) | Aim azimuth | Avg confidence |")
        A("|---|---|---|---|---|---|")
        for l in top_lineups:
            A(f"| {l['ability']} | {l['map']} | {l['repeats']} rounds "
              f"({l['total_casts']} casts) | ({l['position']['x']}, "
              f"{l['position']['y']}) | {l['aim_azimuth_deg']}° | "
              f"{l['avg_confidence']} |")
    else:
        A("_No lineup reached the 3-round repeat threshold._")
    A("")
    A("## Operator profile")
    A("")
    for p in op_result["players"]:
        if p["operator_buys"] == 0 and p["hold_positions"] == []:
            continue
        pos_note = (f", {len(p['hold_positions'])} hold positions recorded"
                    if p["hold_positions"] else "")
        A(f"- **{p['player']}** ({p['agent']}): Operator in "
          f"{p['buy_rate']}{pos_note}")
    A(f"- Rounds with an Operator on the focus team: {op_rounds}; "
      f"Operator holder drew first blood in {op_first_kills} of them, "
      f"died first in {op_holder_died_first}.")
    A("")
    A("## Round outcomes")
    A("")
    for side, s in outcomes_result["sides"].items():
        A(f"- **{side}**: won {s['win_rate']} ({int(s['won']) / max(1, s['rounds']):.0%}) "
          f"— win types: {s['win_types']}"
          + (f"; attack rounds without a plant: {s['attack_no_plant']}"
             if s["attack_no_plant"] else ""))
    if outcomes_result["pistol_conversion"]:
        A(f"- **Pistol conversion:** won the round after a won pistol "
          f"{outcomes_result['pistol_conversion']}")
    A("")
    A("## Site-execute pacing (attack, utility → plant)")
    A("")
    A("| Map | Rounds | Median utility→plant (s) |")
    A("|---|---|---|")
    for site, s in sorted(pacing_result["sites"].items()):
        A(f"| {site} | {s['rounds']} | {s['median_utility_to_plant_s']} |")
    A("")
    A("## Method & honesty notes")
    A("")
    A("- Round attribution by event timestamps; rolled-back games dropped "
      "(restart rule from the data README).")
    A("- Economy classes (pistol/eco/force/full) are ESTIMATES from team "
      "loadout-value snapshots with documented thresholds; pistol = rounds "
      "1 and 13 by rule.")
    A("- Zones/lineup positions are cast positions in GRID's cm frame; "
      "map bounds calibrated from each game's `map.bounds`.")
    A("- Landing locations are never claimed: GRID provides none, and "
      "every landing view in the app is a labeled ESTIMATE.")
    A("- The demo snapshot carries per-cast trajectory points (caster "
      "position, aim, landing estimate; sampled to "
      f"{MAX_SIDE_POINTS} per map-side with the true count in "
      "`points_total`) for the minimap arcs and hover tooltips.")
    A("")

    out = Path(args.out)
    out.write_text("\n".join(lines), encoding="utf-8")
    print(f"\nwrote {out} ({len(lines)} lines)")
    print("bounds calibration:")
    for m, b in sorted(bounds_by_map.items()):
        print(f"  {m}: x [{b['min']['x']}, {b['max']['x']}], "
              f"y [{b['min']['y']}, {b['max']['y']}]")

    # ---------------- write the real-aggregate demo snapshot
    if args.demo_out:
        def with_uv(l: dict) -> dict:
            b = bounds_by_map.get(l["map"])
            if b and "position" in l:
                mb = spatial.MapBounds(b["min"]["x"], b["max"]["x"],
                                       b["min"]["y"], b["max"]["y"])
                u, v = spatial.normalize_position(l["position"], mb)
                l = {**l, "u": round(u, 4), "v": round(v, 4)}
                traj = spatial.lineup_trajectory(
                    position={**l["position"], "z": l.get("position_z", 0.0)},
                    aim_azimuth_deg=l["aim_azimuth_deg"],
                    aim_pitch_deg=l.get("aim_pitch_deg", 0.0),
                    ability_class=ability_class(l["ability"]),
                    bounds=mb, confidence=l["avg_confidence"])
                if traj:
                    l = {**l, "trajectory": traj}
            return l

        demo_atlas: dict[str, dict] = {}
        for m, sides in atlas_by_map_side.items():
            demo_atlas[m] = {
                "rounds": rounds_by_map.get(m, 0),
                "sides": {
                    sk: {
                        **sr.result(matches=games_count,
                                    coverage=f"real GRID corpus, {args.team} "
                                             f"series ({sk})"),
                        **_side_points(points.get(m, {}).get(sk, [])),
                        "density": [
                            [round((bx + 0.5) / DENSITY_BINS, 4),
                             round((by + 0.5) / DENSITY_BINS, 4), n]
                            for (bx, by), n in
                            sorted(density.get(m, {}).get(sk, {}).items(),
                                   key=lambda kv: -kv[1]) if n >= 2],
                    } for sk, sr in sides.items()
                },
            }
        demo = {
            "REAL": True,
            "SYNTHETIC": False,
            "team": args.team,
            "source": ("aggregates from the official GRID starter corpus "
                       f"({len(matches_by_series)} {args.team} series, "
                       "VCT Americas + Game Changers 2025-26); reproducible "
                       "via `make findings`; aggregate results only - no raw "
                       "data is redistributed (license)"),
            "meta": {"maps": sorted(maps_played), "SYNTHETIC": False},
            "coverage": {
                "series": len(matches_by_series), "games": games_count,
                "rounds": total_rounds, "casts": total_casts,
                "ok_rate": round(ok_share, 4),
                "quality_mix": dict(quality_mix),
                "patches": [p for p, _ in patches.most_common()],
                "rolled_back_games": len(exclusion_hits),
                "exclusions_note": ("series 2855902 invalidated; Bind 2855906; "
                                    "Split 2877148; merged Abyss/Split "
                                    "2890334/2890361 (officially excluded)"),
            },
            "atlas": demo_atlas,
            "bounds_m": {
                m: {"w": round((b["max"]["x"] - b["min"]["x"]) / 100.0, 1),
                    "h": round((b["max"]["y"] - b["min"]["y"]) / 100.0, 1)}
                for m, b in sorted(bounds_by_map.items())},
            "lineups": {"lineups": [with_uv(l) for l in lineup_result[:20]],
                        "data": "real GRID corpus aggregates"},
            "operator": {**op_result,
                         "op_rounds": op_rounds,
                         "op_first_kills": op_first_kills,
                         "op_holder_died_first": op_holder_died_first},
            "pacing": pacing_result,
            "outcomes": outcomes_result,
        }
        demo_path = Path(args.demo_out)
        demo_path.write_text(json.dumps(demo))
        total_pts = sum(len(s["points"]) for m in demo_atlas.values()
                        for s in m["sides"].values())
        total_pts_all = sum(s.get("points_total", 0) for m in demo_atlas.values()
                            for s in m["sides"].values())
        print(f"wrote {demo_path} ({demo_path.stat().st_size} bytes, "
              f"{len(demo_atlas)} maps, "
              f"{len(demo['lineups']['lineups'])} lineups, "
              f"{total_pts} points sampled of {total_pts_all} casts)")


if __name__ == "__main__":
    main()
