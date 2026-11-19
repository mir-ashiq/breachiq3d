"""FastAPI application - public, no-auth, OpenAPI-first.

Judge access policy: the demo must be reachable without credentials from
submission (Nov 2026) through the end of judging (Feb 3, 2027); see
docs/COMPLIANCE.md. This API therefore mounts no authentication and adds
CORS for any origin.
"""
from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles

from . import features, fixtures, spatial
from .export import build_brief_pdf

REPO_ROOT = Path(__file__).resolve().parent.parent
FIXTURES = REPO_ROOT / "fixtures"

app = FastAPI(title="BreachIQ 3D", version="0.1.0",
              description="Spatio-temporal utility trajectory & site-execute "
                          "engine for competitive VALORANT (Sky's The Limit 2026).")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"],
                   allow_headers=["*"])


def _data() -> dict:
    if not (FIXTURES / "meta.json").is_file():
        fixtures.write_fixtures(FIXTURES)
    return fixtures.load_fixtures(FIXTURES)


def _atlas(data: dict, map_name: str) -> dict:
    atlas = features.UtilityAtlas()
    by_round: dict[int, list[dict]] = {}
    for cast in data["casts"]:
        if cast["map"] != map_name:
            continue
        state = spatial.cast_state(cast)
        if state is None:
            continue
        u, v = spatial.normalize_position(state["position"], spatial.BOUNDS[map_name])
        landing = spatial.estimate_landing(cast, features.ABILITY_CLASS.get(cast["ability"], "recon"),
                                           spatial.BOUNDS[map_name])
        by_round.setdefault(cast["round"], []).append({
            "u": landing.u if landing else u, "v": landing.v if landing else v,
            "ability": cast["ability"], "quality": state["quality"],
            "confidence": landing.confidence if landing else None,
            "is_estimate": True})
    rounds_here = [r for r in data["rounds"] if r.get("map", map_name) == map_name]
    for r in rounds_here:
        atlas.add_round(by_round.get(r["round"], []), patch=r.get("patch", ""))
    return atlas.result(matches=len(rounds_here),
                        coverage="synthetic demo corpus; official exclusions: series 2855902, "
                                 "Bind in 2855906, Split in 2877148, Abyss/Split merged in 2890334/2890361")


@app.get("/health")
def health() -> dict:
    """Uptime probe used by the monitoring check through Feb 3, 2027."""
    return {"status": "ok", "service": "breachiq3d", "data": "synthetic"}


@app.get("/api/meta")
def meta() -> dict:
    return _data()["meta"]


@app.get("/api/atlas")
def atlas(map: str = Query(..., description="map name")) -> dict:
    if map not in spatial.BOUNDS:
        raise HTTPException(404, f"unknown map: {map}")
    return _atlas(_data(), map)


@app.get("/api/operator")
def operator() -> dict:
    import numpy as np
    data = _data()
    rng = np.random.default_rng(11)
    fp = features.OperatorFingerprint()
    rounds = data["rounds"]
    for r in rounds:
        fp.add_round(player=str(rng.choice(["Alpha", "Bravo", "Charlie"])),
                     agent=str(rng.choice(["jett", "chamber", "odin-user"])),
                     bought_operator=bool(rng.random() < 0.35),
                     hold_start_s=float(rng.uniform(5, 40)))
    return fp.result()


@app.get("/api/pacing")
def pacing() -> dict:
    data = _data()
    ep = features.ExecutePacing()
    for r in data["rounds"]:
        ep.add_round(site=r["site"], first_utility_s=r["first_utility_s"],
                     plant_s=r["plant_s"], economy=r["economy"],
                     first_death_zone=r.get("first_death_zone") or None)
    return ep.result()


@app.get("/api/brief.pdf")
def brief_pdf(map: str = "split") -> Response:
    data = _data()
    atlas = _atlas(data, map)
    op = operator()
    cues = features.counter_brief(atlas, op)
    top = atlas["abilities"][0] if atlas["abilities"] else {}
    pdf = build_brief_pdf(
        title=f"{map} vs demo opponent",
        cues=cues,
        evidence=top.get("evidence", {"rounds": 0, "matches": 0, "patch": "-"}))
    return Response(pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="breachiq_{map}_brief.pdf"'})


# Dashboard (static, no build step) - judges get the UI at /app.
app.mount("/app", StaticFiles(directory=str(REPO_ROOT / "web"), html=True), name="web")
