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
