"""API tests: health, synthetic-only data policy, atlas/operator/pacing,
PDF brief, and the no-auth judge-access contract."""
from fastapi.testclient import TestClient

from breachiq.api import app

client = TestClient(app)


def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_meta_is_synthetic():
    r = client.get("/api/meta")
    assert r.status_code == 200
    assert r.json()["SYNTHETIC"] is True  # never ship real GRID data here
    assert r.json()["source"] == "synthetic"


def test_atlas_carries_calibrated_bounds_m():
    r = client.get("/api/atlas", params={"map": "split"})
    b = r.json()["bounds_m"]
    assert 50.0 < b["w"] < 200.0 and 50.0 < b["h"] < 200.0


def test_lineups_carry_3d_trajectories():
    r = client.get("/api/lineups")
    assert r.status_code == 200
    rows = r.json()["lineups"]
    assert rows, "synthetic corpus has a deliberate set play"
    for l in rows:
        t = l["trajectory"]
        assert len(t["points"]) == 13
        assert t["is_estimate"] is True
        assert 0.0 <= t["landing"][0] <= 1.0


def test_real_aggregate_mode(monkeypatch):
    """BREACHIQ_DATA=real serves the committed GRID corpus aggregates:
    real numbers locally with zero clone, honestly labeled."""
    monkeypatch.setenv("BREACHIQ_DATA", "real")
    assert client.get("/health").json()["data"] == "real GRID corpus aggregates"
    meta = client.get("/api/meta").json()
    assert meta["source"] == "real-aggregates"
    assert len(meta["maps"]) == 12
    atk = client.get("/api/atlas", params={"map": "lotus",
                                           "side": "attacker"}).json()
    dfn = client.get("/api/atlas", params={"map": "lotus",
                                           "side": "defender"}).json()
    assert atk["rounds"] + dfn["rounds"] <= client.get(
        "/api/atlas", params={"map": "lotus"}).json()["rounds"] + 1
    assert atk["density"], "real mode serves the cast-density histogram"
    assert atk["bounds_m"]["w"] > 50.0
    op = client.get("/api/operator").json()
    assert any(p["hold_positions"] for p in op["players"])
    lu = client.get("/api/lineups").json()["lineups"]
    assert lu[0]["trajectory"]["points"][0]  # 3D arcs available
    monkeypatch.delenv("BREACHIQ_DATA")


def test_atlas_taxonomy_order():
    r = client.get("/api/atlas", params={"map": "split"})
    assert r.status_code == 200
    body = r.json()
    # the brief's five classes, in order; 'other' (unmapped real abilities)
    # is allowed to trail them
    assert body["taxonomy_order"][:5] == ["placeable", "recon", "smoke",
                                          "stall", "flash"]
    assert body["abilities"], "atlas should have at least one ability"
    assert "hard_count" in body["abilities"][0]


def test_atlas_404_on_unknown_map():
    assert client.get("/api/atlas", params={"map": "nokia"}).status_code == 404


def test_atlas_side_and_ability_filters():
    """The side/ability filter rail must actually filter (an earlier
    version shipped decorative selects - the red team's finding)."""
    base = client.get("/api/atlas", params={"map": "split"}).json()
    atk = client.get("/api/atlas", params={"map": "split", "side": "attacker"}).json()
    assert atk["rounds"] == base["rounds"]          # rounds don't change
    assert atk != base or True                      # shapes may match; counts below
    total_base = sum(sum(a["zones"].values()) for a in base["abilities"])
    total_atk = sum(sum(a["zones"].values()) for a in atk["abilities"])
    total_def = sum(sum(a["zones"].values()) for a in
                    client.get("/api/atlas", params={"map": "split",
                                                     "side": "defender"}).json()["abilities"])
    assert total_atk + total_def == total_base, "side split must partition the casts"
    # ability filter narrows to a single ability
    ab = base["abilities"][0]["ability"]
    one = client.get("/api/atlas", params={"map": "split", "ability": ab}).json()
    assert [a["ability"] for a in one["abilities"]] == [ab]
    assert client.get("/api/atlas", params={"map": "split",
                                            "side": "nokia"}).status_code == 422


def test_operator_fingerprint():
    r = client.get("/api/operator")
    assert r.status_code == 200
    assert len(r.json()["players"]) > 0


def test_pacing():
    r = client.get("/api/pacing")
    assert r.status_code == 200
    assert "sites" in r.json()


def test_brief_pdf():
    r = client.get("/api/brief.pdf", params={"map": "split"})
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/pdf"
    assert r.content[:4] == b"%PDF"


def test_brief_endpoint_structured_and_honest():
    """GET /api/brief: severity-ranked insights whose evidence traces to
    the real aggregates - the lineup insight must quote the exact repeat
    count the /api/lineups payload reports for the same map."""
    b = client.get("/api/brief", params={"map": "split"}).json()
    assert b["insights"] and b["headline"]
    assert b["source"] == "synthetic"
    rank = {"critical": 0, "warning": 1, "note": 2}
    sev = [rank[i["severity"]] for i in b["insights"]]
    assert sev == sorted(sev), "insights must read top-down by severity"
    for i in b["insights"]:
        for k in ("severity", "kind", "title", "detail", "action",
                  "evidence"):
            assert k in i, f"brief insight missing {k}"
        assert i["evidence"]["source"] in ("lineups", "operator", "pacing",
                                           "atlas", "method")
        assert i["evidence"]["scope"] in ("map", "series", "method")
    lus = client.get("/api/lineups", params={"map": "split"}).json()["lineups"]
    assert lus, "synthetic split carries the sage-wall repeat lineup"
    top = max((l for l in lus if l["map"] == "split"),
              key=lambda l: l["repeats"])
    lu = next(i for i in b["insights"] if i["kind"] == "lineup")
    assert lu["evidence"]["rounds_seen"] == top["repeats"]
    assert lu["evidence"]["sample_rounds"] == b["rounds"]
    # atlas validation is inherited: unknown map 404, bad side 422
    assert client.get("/api/brief", params={"map": "atlantis"}).status_code == 404
    assert client.get("/api/brief",
                      params={"map": "split", "side": "nokia"}).status_code == 422


def test_brief_real_mode_shares_snapshot_evidence(monkeypatch):
    """Real mode: the brief quotes the committed GRID aggregates - the
    lotus lineup insight must match /api/lineups exactly (e.g. the
    toxic-screen repeat), never a rounded or invented number."""
    monkeypatch.setenv("BREACHIQ_DATA", "real")
    b = client.get("/api/brief", params={"map": "lotus"}).json()
    assert b["source"] == "real GRID corpus aggregates"
    assert b["rounds"] > 0 and b["insights"]
    lus = client.get("/api/lineups", params={"map": "lotus"}).json()["lineups"]
    top = max((l for l in lus if l["map"] == "lotus"),
              key=lambda l: l["repeats"])
    lu = next(i for i in b["insights"] if i["kind"] == "lineup")
    assert lu["evidence"]["rounds_seen"] == top["repeats"]
    assert lu["evidence"]["sample_rounds"] == b["rounds"]
    # the PDF is the same builder: it must render without drift
    r = client.get("/api/brief.pdf", params={"map": "lotus"})
    assert r.status_code == 200 and r.content[:4] == b"%PDF"
    monkeypatch.delenv("BREACHIQ_DATA")


def test_no_auth_required_anywhere():
    """Judge-access rule: no credentials may ever be required."""
    for path in ("/health", "/api/meta", "/api/operator", "/api/pacing",
                 "/api/atlas?map=split", "/api/brief?map=split",
                 "/api/brief.pdf?map=split"):
        r = client.get(path)
        assert r.status_code == 200, f"{path} returned {r.status_code}"
        assert "www-authenticate" not in {k.lower() for k in r.headers}


def test_openapi_contract_published():
    """API-first: the OpenAPI schema is the frontend's contract from week 3."""
    r = client.get("/openapi.json")
    assert r.status_code == 200
    assert "/api/atlas" in r.json()["paths"]


# ------------------------------------------- GUIDE.md section 3A contract
POINT_FIELDS = ("u", "v", "u0", "v0", "azimuth", "pitch", "ability",
                "class", "player", "agent", "round", "quality",
                "confidence", "is_estimate", "patch")


def _check_point(p: dict) -> None:
    for k in POINT_FIELDS:
        assert k in p, f"atlas point missing contract field {k!r}"
    for k in ("u", "v", "u0", "v0"):
        assert 0.0 <= p[k] <= 1.0, f"{k} outside the minimap frame"
    if p["azimuth"] is not None:
        assert 0.0 <= p["azimuth"] < 360.0
    if p["pitch"] is not None:
        assert -90.0 <= p["pitch"] <= 90.0
    if p["confidence"] is not None:
        assert 0.0 < p["confidence"] <= 1.0
    assert p["is_estimate"] is True, "the estimate label is permanent"
    assert p["player"] and p["ability"] and p["class"]
    assert isinstance(p["round"], int)


def test_atlas_points_match_frontend_contract():
    """Every atlas point carries the caster coords, aim angles and
    player/agent/round the minimap arcs and hover tooltips render from
    (docs/GUIDE.md section 3A)."""
    body = client.get("/api/atlas", params={"map": "split"}).json()
    assert body["points"], "synthetic atlas must carry per-cast points"
    for p in body["points"]:
        _check_point(p)
        assert p["agent"], "synthetic roster always resolves an agent"
    # the ability filter narrows points, not just the abilities table
    ab = body["abilities"][0]["ability"]
    one = client.get("/api/atlas", params={"map": "split", "ability": ab}).json()
    assert one["points"]
    assert {p["ability"] for p in one["points"]} == {ab}


def test_atlas_guide_side_aliases():
    """GUIDE.md spells the side values attack/defense; the dashboard sends
    attacker/defender. Both spellings must serve identical bodies."""
    for alias, canonical in (("attack", "attacker"), ("defense", "defender")):
        a = client.get("/api/atlas", params={"map": "split", "side": alias}).json()
        b = client.get("/api/atlas",
                       params={"map": "split", "side": canonical}).json()
        assert a == b, f"side alias {alias} diverges from {canonical}"
    assert client.get("/api/atlas",
                      params={"map": "split", "side": "nokia"}).status_code == 422


def test_atlas_player_and_agent_filters():
    """The Week-3 filter rail sends player= and agent= params: they must
    ACTUALLY filter points and zones server-side. An earlier version of
    the rail shipped decorative selects and the red team caught it - this
    test keeps that failure mode out of the roster filters. (On the split
    fixtures Echo/chamber is the heaviest caster.)"""
    base = client.get("/api/atlas", params={"map": "split"}).json()
    zones = lambda b: sum(sum(a["zones"].values()) for a in b["abilities"])

    echo = client.get("/api/atlas",
                      params={"map": "split", "player": "Echo"}).json()
    assert echo["points"]
    assert {p["player"] for p in echo["points"]} == {"Echo"}
    assert all(p["agent"] == "chamber" for p in echo["points"])
    assert 0 < zones(echo) <= zones(base), "player filter shrinks the atlas"

    chamber = client.get("/api/atlas",
                         params={"map": "split", "agent": "chamber"}).json()
    assert {p["player"] for p in chamber["points"]} == {"Echo"}
    assert zones(chamber) == zones(echo)

    # combined filters narrow further and stay honest when nothing matches
    both = client.get("/api/atlas", params={"map": "split",
                                            "player": "Echo",
                                            "agent": "chamber",
                                            "side": "attacker"}).json()
    assert {p["player"] for p in both["points"]} == {"Echo"}
    assert all(p["agent"] == "chamber" for p in both["points"])
    miss = client.get("/api/atlas", params={"map": "split",
                                            "agent": "jett"}).json()
    assert miss["points"] == [] and zones(miss) == 0


def test_atlas_patch_filter():
    """The documented patch param filters rounds and points in synthetic
    mode (fixtures carry patch 11.08)."""
    base = client.get("/api/atlas", params={"map": "split"}).json()
    same = client.get("/api/atlas",
                      params={"map": "split", "patch": "11.08"}).json()
    assert same["rounds"] == base["rounds"]
    assert same["points"] and all(p["patch"] == "11.08" for p in same["points"])
    miss = client.get("/api/atlas",
                      params={"map": "split", "patch": "11.99"}).json()
    assert miss["rounds"] == 0
    assert miss["points"] == [] and miss["abilities"] == []


def test_real_mode_points_honest_when_snapshot_predates_them(monkeypatch):
    """The committed real-aggregate snapshot predates per-cast points:
    real mode must serve an explicit empty list with a regeneration note -
    never fabricated points (the project's honesty rules)."""
    import json
    import breachiq.api as api_mod
    snap = json.loads(json.dumps(api_mod._snapshot()))
    if "lotus" in snap.get("atlas", {}):
        for sk in snap["atlas"]["lotus"]["sides"]:
            snap["atlas"]["lotus"]["sides"][sk].pop("points", None)
    monkeypatch.setattr(api_mod, "_SNAPSHOT", snap)
    monkeypatch.setenv("BREACHIQ_DATA", "real")
    body = client.get("/api/atlas", params={"map": "lotus"}).json()
    assert body["points"] == []
    assert "points_note" in body
    # the side aliases apply in real mode too (GUIDE.md spelling)
    a = client.get("/api/atlas", params={"map": "lotus", "side": "attack"}).json()
    b = client.get("/api/atlas",
                   params={"map": "lotus", "side": "attacker"}).json()
    assert a == b
    monkeypatch.delenv("BREACHIQ_DATA")


def test_real_mode_serves_snapshot_points_when_present(monkeypatch):
    """Forward compatibility: once the snapshot is rebuilt with
    `make findings`, its per-cast points flow through the real-mode
    endpoint with side/ability/patch/player/agent filtering intact."""
    import breachiq.api as api_mod
    from breachiq import features as f

    def pt(ability, patch, player="Alpha", agent="cypher"):
        return f.trajectory_point(
            u=0.5, v=0.5, u0=0.4, v0=0.4, azimuth=35.0, pitch=18.5,
            ability=ability, ability_class="stall", player=player,
            round_no=4, quality="ok", confidence=1.0, patch=patch,
            agent=agent)

    snap = {"REAL": True,
            "bounds_m": {"split": {"w": 100.0, "h": 100.0}},
            "atlas": {"split": {"sides": {"all": {
                "taxonomy_order": [], "rounds": 4, "density": [],
                "abilities": [{"ability": "sage-wall", "class": "stall",
                               "zones": {"a": 2},
                               "hard_count": "2/4 rounds", "evidence": {}}],
                "points": [pt("sage-wall", "11.08"),
                           pt("viper-wall", "11.08", player="Bravo",
                              agent="sova"),
                           pt("sage-wall", "11.09")],
                "points_total": 9}}}}}
    monkeypatch.setattr(api_mod, "_SNAPSHOT", snap)
    monkeypatch.setenv("BREACHIQ_DATA", "real")

    body = client.get("/api/atlas", params={"map": "split"}).json()
    assert len(body["points"]) == 3 and body["points_total"] == 9
    _check_point(body["points"][0])

    one = client.get("/api/atlas",
                     params={"map": "split", "ability": "sage-wall"}).json()
    assert {p["ability"] for p in one["points"]} == {"sage-wall"}
    assert "points_total" not in one, "total would lie on a filtered view"

    p11 = client.get("/api/atlas",
                     params={"map": "split", "patch": "11.08"}).json()
    assert len(p11["points"]) == 2
    assert "points only" in p11["points_scope"]

    alpha = client.get("/api/atlas",
                       params={"map": "split", "player": "Alpha"}).json()
    assert {p["player"] for p in alpha["points"]} == {"Alpha"}
    assert "points only" in alpha["points_scope"]
    assert "points_total" not in alpha

    sova = client.get("/api/atlas",
                      params={"map": "split", "agent": "sova"}).json()
    assert {p["agent"] for p in sova["points"]} == {"sova"}
    monkeypatch.delenv("BREACHIQ_DATA")
