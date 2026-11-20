"""FastAPI application - public, no-auth, OpenAPI-first.

Judge access policy: the demo must be reachable without credentials from
submission (Nov 2026) through the end of judging (Feb 3, 2027); see
docs/COMPLIANCE.md. This API therefore mounts no authentication and adds
CORS for any origin.

Data sources (honest, never mixed silently):
  - default: SYNTHETIC fixtures (same schema as the official feeds, no
    licensed data anywhere in this repo)
  - BREACHIQ_DATA=real: REAL aggregate findings from the official GRID
    corpus, served from the committed web/demo-data.json snapshot
    (aggregate results only - license-safe; rebuild with `make findings`).
"""
from __future__ import annotations

import json
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles

from . import features, fixtures, spatial
from .export import build_tactical_pdf

REPO_ROOT = Path(__file__).resolve().parent.parent
FIXTURES = REPO_ROOT / "fixtures"

app = FastAPI(title="BreachIQ 3D", version="0.2.0",
              description="Spatio-temporal utility trajectory & site-execute "
                          "engine for competitive VALORANT (Sky's The Limit 2026).")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"],
                   allow_headers=["*"])

_SNAPSHOT: dict | None = None


def _snapshot() -> dict:
    """The committed real-corpus aggregate snapshot (or {} if absent)."""
    global _SNAPSHOT
    if _SNAPSHOT is None:
        path = REPO_ROOT / "web" / "demo-data.json"
        _SNAPSHOT = json.loads(path.read_text()) if path.is_file() else {}
    return _SNAPSHOT


def _real(data_param: str = "") -> bool:
    """True when BREACHIQ_DATA=real OR data_param='real' AND the real snapshot is present."""
    if data_param == "real":
        return bool(_snapshot().get("REAL"))
    if data_param == "synthetic":
        return False
    return (os.environ.get("BREACHIQ_DATA", "synthetic") == "real"
            and bool(_snapshot().get("REAL")))


def _data() -> dict:
    if not (FIXTURES / "meta.json").is_file():
        fixtures.write_fixtures(FIXTURES)
    return fixtures.load_fixtures(FIXTURES)


def _atlas(data: dict, map_name: str, side: str = "all",
           ability: str = "", patch: str = "",
           player: str = "", agent: str = "") -> dict:
    atlas = features.UtilityAtlas()
    by_round: dict[int, list[dict]] = {}
    points: list[dict] = []
    bounds = spatial.BOUNDS[map_name]
    rounds_here = [r for r in data["rounds"]
                   if r.get("map", map_name) == map_name
                   and (not patch or r.get("patch", "") == patch)]
    keep_rounds = {r["round"] for r in rounds_here}
    round_patch = {r["round"]: r.get("patch", "") for r in rounds_here}
    for cast in data["casts"]:
        if cast["map"] != map_name or cast["round"] not in keep_rounds:
            continue
        if side in ("attacker", "defender") and cast.get("side") != side:
            continue
        if ability and cast.get("ability") != ability:
            continue
        if player and cast.get("player_id") != player:
            continue
        if agent and AGENT_OF.get(cast.get("player_id"), "") != agent:
            continue
        state = spatial.cast_state(cast)
        if state is None:
            continue
        u, v = spatial.normalize_position(state["position"], bounds)
        landing = spatial.estimate_landing(cast, features.ABILITY_CLASS.get(cast["ability"], "recon"),
                                           bounds)
        entry = {
            "u": landing.u if landing else u, "v": landing.v if landing else v,
            "ability": cast["ability"], "quality": state["quality"],
            "confidence": landing.confidence if landing else None,
            "is_estimate": True}
        by_round.setdefault(cast["round"], []).append(entry)
        # per-cast trajectory point in the frontend contract shape
        # (docs/GUIDE.md section 3A): caster pos, aim angles, player/round
        points.append(features.trajectory_point(
            u=entry["u"], v=entry["v"], u0=u, v0=v,
            azimuth=spatial.azimuth_deg(state["view"]) if state.get("view") else None,
            pitch=spatial.pitch_deg(state["view"]) if state.get("view") else None,
            ability=cast["ability"],
            ability_class=features.ABILITY_CLASS.get(cast["ability"], "other"),
            player=cast.get("player_id", ""),
            round_no=cast.get("round"), quality=state["quality"],
            confidence=entry["confidence"],
            patch=round_patch.get(cast["round"], ""),
            agent=AGENT_OF.get(cast.get("player_id"), "")))
    for r in rounds_here:
        atlas.add_round(by_round.get(r["round"], []), patch=r.get("patch", ""))
    result = atlas.result(matches=len(rounds_here),
                          coverage="synthetic demo corpus; official exclusions: series 2855902, "
                                   "Bind in 2855906, Split in 2877148, Abyss/Split merged in 2890334/2890361")
    result["points"] = points
    result["map_selected"] = map_name
    # real calibrated bounds (m) for the scale bar + 3D aspect ratio
    b = bounds
    result["bounds_m"] = {"w": round((b.x_max - b.x_min) / 100.0, 1),
                          "h": round((b.y_max - b.y_min) / 100.0, 1)}
    return result


def _atlas_real(map_name: str, side: str = "all", ability: str = "",
                patch: str = "", player: str = "",
                agent: str = "") -> dict:
    snap = _snapshot()
    entry = snap["atlas"].get(map_name)
    if entry is None:
        raise HTTPException(404, f"unknown map: {map_name}")
    s = entry["sides"].get(side) or entry["sides"]["all"]
    # keep the SIDE's own rounds (e.g. lotus attacker 231 / defender 205),
    # not the map total
    out = {**s, "map_selected": map_name,
           "bounds_m": snap.get("bounds_m", {}).get(map_name)}
    pts = s.get("points")
    if pts is None:
        # snapshot predates per-cast points (GUIDE.md section 3A): serve an
        # explicit empty list - never fabricate points from aggregates.
        # Rebuild against the corpus (`make findings`) to populate them.
        pts = []
        out["points_note"] = ("this snapshot predates per-cast trajectory "
                              "points; regenerate with `make findings` "
                              "against the GRID corpus")
    # patch/player/agent can only filter the per-cast points: abilities and
    # density are committed aggregates without that attribution. Say so
    # instead of pretending the whole view is filtered.
    scope_note = ("points only - abilities/density stay map-level "
                  "aggregates")
    if patch:
        pts = [p for p in pts if p.get("patch", "") == patch]
        out["points_scope"] = scope_note
    if player:
        pts = [p for p in pts if p.get("player") == player]
        out["points_scope"] = scope_note
    if agent:
        pts = [p for p in pts if p.get("agent", "") == agent]
        out["points_scope"] = scope_note
    if ability:
        out = {**out, "abilities": [a for a in s["abilities"]
                                    if a["ability"] == ability]}
        pts = [p for p in pts if p.get("ability") == ability]
    out["points"] = pts
    if patch or ability or player or agent:
        # the true cast count is only honest on an unfiltered view
        out.pop("points_total", None)
    return out


@app.get("/health")
def health(data: str = Query("", description="optional data mode override")) -> dict:
    """Uptime probe used by the monitoring check through Feb 3, 2027."""
    return {"status": "ok", "service": "breachiq3d",
            "data": "real GRID corpus aggregates" if _real(data) else "synthetic"}


@app.get("/api/meta")
def meta(data: str = Query("", description="optional data mode override")) -> dict:
    if _real(data):
        snap = _snapshot()
        return {"maps": snap["meta"]["maps"], "source": "real-aggregates",
                "team": snap.get("team", "Cloud9"), "SYNTHETIC": False,
                "coverage": snap["coverage"]}
    return {**_data()["meta"], "source": "synthetic"}


# docs/GUIDE.md section 3A spells the side values "attack/defense"; the
# dashboard and the committed snapshot use "attacker/defender". Accept both
# spellings (aliasing) so the documented contract and the UI agree.
_SIDE_ALIASES = {"attack": "attacker", "defense": "defender"}


@app.get("/api/atlas")
def atlas(map: str = Query(..., description="map name"),
          side: str = Query("all", description="all | attacker | defender "
                           "(attack/defense aliases accepted)"),
          ability: str = Query("", description="exact ability id filter"),
          patch: str = Query("", description="patch filter, e.g. 11.08 "
                             "(filters rounds in synthetic mode; points "
                             "only in real-aggregate mode)"),
          player: str = Query("", description="roster filter, e.g. Alpha "
                              "(points-scope in real-aggregate mode)"),
          agent: str = Query("", description="agent filter, e.g. cypher "
                             "(points-scope in real-aggregate mode)"),
          data: str = Query("", description="optional data mode override")
          ) -> dict:
    side = _SIDE_ALIASES.get(side, side)
    if side not in ("all", "attacker", "defender"):
        raise HTTPException(422, f"invalid side: {side}")
    if _real(data):
        return _atlas_real(map, side=side, ability=ability, patch=patch,
                           player=player, agent=agent)
    if map not in spatial.BOUNDS:
        raise HTTPException(404, f"unknown map: {map}")
    return _atlas(_data(), map, side=side, ability=ability, patch=patch,
                  player=player, agent=agent)


@app.get("/api/operator")
def operator(data: str = Query("", description="optional data mode override")) -> dict:
    """Operator fingerprint. Synthetic mode is deterministic by construction
    (seeded per-player biases; the red team caught an earlier version
    re-randomizing per request). Real mode serves the committed corpus
    aggregates.
    """
    if _real(data):
        return _snapshot()["operator"]
    return _operator_from_rounds(_data(), features.OperatorFingerprint())


PLAYERS = ["Alpha", "Bravo", "Charlie", "Delta", "Echo"]
# synthetic roster: player -> agent (the roster filter rail and the hover
# tooltip read this off every atlas point)
AGENT_OF = dict(zip(PLAYERS,
                    ["cypher", "sova", "killjoy", "brimstone", "chamber"]))


def _operator_from_rounds(data: dict, fp: features.OperatorFingerprint) -> dict:
    for r in data["rounds"]:
        buyers = set(r.get("operator_buyers", []))
        holds = r.get("operator_holds", {})
        for p in PLAYERS:
            fp.add_round(player=p, agent=AGENT_OF[p],
                         bought_operator=p in buyers,
                         hold_start_s=holds.get(p),
                         hold_map=r.get("map"))
    return fp.result()


@app.get("/api/lineups")
def lineups(map: str = Query("", description="optional map filter"),
            data: str = Query("", description="optional data mode override")) -> dict:
    """Repeated utility lineups (same detector as the real findings,
    docs/FINDINGS.md): same ability cast from within 200 cm with aim within
    10 degrees in 3+ distinct rounds. Every entry carries a 3D trajectory
    ESTIMATE (aim-ray projection; GRID provides no projectile telemetry).
    """
    if _real(data):
        rows = [l for l in _snapshot()["lineups"]["lineups"]
                if not map or l["map"] == map]
        return {"lineups": rows,
                "data": "real GRID corpus aggregates (see docs/FINDINGS.md)"}
    data_dict = _data()
    det = features.LineupDetector()
    for cast in data_dict["casts"]:
        if map and cast["map"] != map:
            continue
        state = spatial.cast_state(cast)
        if state is None or not state.get("view"):
            continue
        det.add(ability=cast["ability"], map=cast["map"],
                position=state["position"], view=state["view"],
                round_key=f"demo:{cast['map']}:{cast['round']}",
                confidence=0.6 if state["quality"] != "ok" else 1.0)
    out = []
    for l in det.result():
        bounds = spatial.BOUNDS.get(l["map"])
        if bounds and "position" in l:
            u, v = spatial.normalize_position(l["position"], bounds)
            l["u"], l["v"] = round(u, 4), round(v, 4)
            l["trajectory"] = spatial.lineup_trajectory(
                position={**l["position"], "z": l.get("position_z", 0.0)},
                aim_azimuth_deg=l["aim_azimuth_deg"],
                aim_pitch_deg=l.get("aim_pitch_deg", 0.0),
                ability_class=features.ABILITY_CLASS.get(l["ability"], "recon"),
                bounds=bounds, confidence=l["avg_confidence"])
        out.append(l)
    return {"lineups": out, "data": "SYNTHETIC demo corpus"}


@app.get("/api/pacing")
def pacing(data: str = Query("", description="optional data mode override")) -> dict:
    if _real(data):
        return _snapshot()["pacing"]
    data_dict = _data()
    ep = features.ExecutePacing()
    for r in data_dict["rounds"]:
        ep.add_round(site=r["site"], first_utility_s=r["first_utility_s"],
                     plant_s=r["plant_s"], economy=r["economy"],
                     first_death_zone=r.get("first_death_zone") or None)
    return ep.result()


@app.get("/api/brief")
def brief(map: str = Query(..., description="map name"),
          side: str = Query("all", description="all | attacker | defender "
                           "(attack/defense aliases accepted)"),
          patch: str = Query("", description="patch filter, e.g. 10.00 "
                             "(rounds in synthetic mode; points-scope "
                             "only in real-aggregate mode)"),
          data: str = Query("", description="optional data mode override")
          ) -> dict:
    """Severity-ranked counter-brief: every insight carries its evidence
    (rounds seen / sample / confidence / source endpoint). One builder
    feeds this JSON view and /api/brief.pdf, so the dashboard panel and
    the coach's printed one-pager can never drift. Synthetic fixtures and
    the real GRID aggregates both flow through unchanged."""
    side = _SIDE_ALIASES.get(side, side)
    if side not in ("all", "attacker", "defender"):
        raise HTTPException(422, f"invalid side: {side}")
    atlas_body = atlas(map=map, side=side, ability="", patch=patch, data=data)
    op = operator(data=data)
    lus = lineups(map=map, data=data)["lineups"]
    pac = pacing(data=data)
    body = features.tactical_brief(atlas_body, op, lus, pac, map, side)
    body["source"] = ("real GRID corpus aggregates" if _real(data)
                      else "synthetic")
    return body


@app.get("/api/brief.pdf")
def brief_pdf(map: str = "split",
              side: str = Query("all", description="all | attacker | defender"),
              patch: str = Query("", description="optional patch filter"),
              data: str = Query("", description="optional data mode override")) -> Response:
    # same builder as GET /api/brief - the PDF is a rendering of the
    # exact JSON the dashboard can consume, never a separate logic path
    body = brief(map=map, side=side, patch=patch, data=data)
    pdf = build_tactical_pdf(body)
    return Response(pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="breachiq_{map}_brief.pdf"'})


@app.get("/favicon.ico")
def favicon():
    ico_path = REPO_ROOT / "web" / "favicon.ico"
    if ico_path.exists():
        return Response(ico_path.read_bytes(), media_type="image/x-icon")
    return Response(b"", media_type="image/x-icon")


@app.get("/")
def root_redirect():
    from fastapi.responses import RedirectResponse
    return RedirectResponse(url="/app/index.html")


# Dashboard (static, no build step) - judges get the UI at /app.
app.mount("/app", StaticFiles(directory=str(REPO_ROOT / "web"), html=True), name="web")
