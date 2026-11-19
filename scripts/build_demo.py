#!/usr/bin/env python3
"""Build web/demo-data.json: a static snapshot of the SYNTHETIC demo corpus
for GitHub Pages (the Pages site cannot run FastAPI). Derived 100% from
breachiq.fixtures — zero GRID data, license-safe."""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from breachiq import features, fixtures, spatial

REPO = Path(__file__).resolve().parent.parent
MAPS = fixtures.MAPS


def main() -> None:
    fixtures.write_fixtures(REPO / "fixtures")  # regenerate for freshness
    data = fixtures.load_fixtures(REPO / "fixtures")

    atlas_by_map: dict[str, dict] = {}
    for m in MAPS:
        atlas = features.UtilityAtlas()
        by_round: dict[int, list[dict]] = {}
        points = []
        for cast in data["casts"]:
            if cast["map"] != m:
                continue
            state = spatial.cast_state(cast)
            if state is None:
                continue
            u0, v0 = spatial.normalize_position(state["position"], spatial.BOUNDS[m])
            landing = spatial.estimate_landing(
                cast, features.ABILITY_CLASS.get(cast["ability"], "recon"),
                spatial.BOUNDS[m])
            azimuth = spatial.azimuth_deg(state["view"]) if state.get("view") else None
            pitch = spatial.pitch_deg(state["view"]) if state.get("view") else None
            entry = {"u": landing.u if landing else u0,
                     "v": landing.v if landing else v0,
                     "u0": round(u0, 4), "v0": round(v0, 4),
                     "azimuth": round(azimuth, 1) if azimuth is not None else None,
                     "pitch": round(pitch, 1) if pitch is not None else None,
                     "ability": cast["ability"], "quality": state["quality"],
                     "player": cast.get("player_id"),
                     "round": cast.get("round"),
                     "confidence": landing.confidence if landing else None,
                     "is_estimate": True}
            by_round.setdefault(cast["round"], []).append(entry)
            points.append({**entry, "class":
                           features.ABILITY_CLASS.get(cast["ability"], "other")})
        rounds_here = [r for r in data["rounds"] if r.get("map", m) == m]
        for r in rounds_here:
            atlas.add_round(by_round.get(r["round"], []), patch=r.get("patch", ""))
        result = atlas.result(matches=len(rounds_here),
                              coverage="SYNTHETIC demo corpus")
        result["points"] = points
        atlas_by_map[m] = result

    # operator (deterministic, mirrors the API)
    from breachiq.api import PLAYERS, _operator_from_rounds
    operator = _operator_from_rounds(data, features.OperatorFingerprint())

    # pacing
    pacing = features.ExecutePacing()
    for r in data["rounds"]:
        pacing.add_round(site=r["site"], first_utility_s=r["first_utility_s"],
                         plant_s=r["plant_s"], economy=r["economy"],
                         first_death_zone=r.get("first_death_zone") or None)

    # lineups with u/v
    det = features.LineupDetector()
    for cast in data["casts"]:
        state = spatial.cast_state(cast)
        if state is None or not state.get("view"):
            continue
        det.add(ability=cast["ability"], map=cast["map"],
                position=state["position"], view=state["view"],
                round_key=f"demo:{cast['map']}:{cast['round']}",
                confidence=0.6 if state["quality"] != "ok" else 1.0)
    lineups = []
    for l in det.result():
        bounds = spatial.BOUNDS.get(l["map"])
        if bounds:
            u, v = spatial.normalize_position(l["position"], bounds)
            l["u"], l["v"] = round(u, 4), round(v, 4)
        lineups.append(l)

    snapshot = {
        "SYNTHETIC": True,
        "generated_note": "static snapshot of the SYNTHETIC demo corpus; "
                          "zero GRID data (license-safe)",
        "meta": data["meta"],
        "atlas": atlas_by_map,
        "operator": operator,
        "pacing": pacing.result(),
        "lineups": {"lineups": lineups, "data": "SYNTHETIC demo corpus"},
    }
    out = REPO / "web" / "demo-data.json"
    out.write_text(json.dumps(snapshot))
    print(f"wrote {out} ({out.stat().st_size} bytes, "
          f"{len(atlas_by_map)} maps, {len(lineups)} lineups)")


if __name__ == "__main__":
    main()
