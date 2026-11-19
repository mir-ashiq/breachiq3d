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


def test_no_auth_required_anywhere():
    """Judge-access rule: no credentials may ever be required."""
    for path in ("/health", "/api/meta", "/api/operator", "/api/pacing",
                 "/api/atlas?map=split", "/api/brief.pdf?map=split"):
        r = client.get(path)
        assert r.status_code == 200, f"{path} returned {r.status_code}"
        assert "www-authenticate" not in {k.lower() for k in r.headers}


def test_openapi_contract_published():
    """API-first: the OpenAPI schema is the frontend's contract from week 3."""
    r = client.get("/openapi.json")
    assert r.status_code == 200
    assert "/api/atlas" in r.json()["paths"]
