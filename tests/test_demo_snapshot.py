"""Schema tests for the committed real-aggregate demo snapshot
(web/demo-data.json). It is a LICENSE-COMPLIANT artifact: aggregate
results only (per the data README) - these tests pin that contract and
the shape the dashboard/3D viewer depend on."""
import json
from pathlib import Path

SNAP = Path(__file__).resolve().parent.parent / "web" / "demo-data.json"


def _load():
    return json.loads(SNAP.read_text())


def test_snapshot_is_real_and_labeled():
    d = _load()
    assert d["REAL"] is True
    assert d["SYNTHETIC"] is False
    assert "no raw data" in d["source"]


def test_coverage_numbers_are_the_scanned_corpus():
    d = _load()
    c = d["coverage"]
    assert c["series"] == 28
    assert c["rounds"] == 1404
    assert c["casts"] == 48250
    assert 0.99 < c["ok_rate"] <= 1.0
    assert len(c["patches"]) >= 4


def test_every_lineup_has_map_coords_and_a_3d_trajectory():
    d = _load()
    for l in d["lineups"]["lineups"]:
        # true normalized cast coords; a few real casts sit slightly outside
        # recorded playable bounds (spawn areas) - the trajectory + landing
        # are clamped and labeled instead of hidden
        assert -0.25 <= l["u"] <= 1.25 and -0.25 <= l["v"] <= 1.25
        t = l["trajectory"]
        assert len(t["points"]) == 13
        assert 0.0 <= t["points"][0][0] <= 1.0
        assert 0.0 <= t["points"][0][1] <= 1.0
        assert t["landing"] == [t["points"][-1][0], t["points"][-1][1], 0.0]
        assert t["is_estimate"] is True


def test_sides_partition_per_map():
    d = _load()
    lotus = d["atlas"]["lotus"]["sides"]
    assert lotus["attacker"]["rounds"] + lotus["defender"]["rounds"] \
        == lotus["all"]["rounds"]
    for side in lotus.values():
        assert side["density"], "density histogram present per side"


def test_bounds_are_real_meters_per_map():
    d = _load()
    assert len(d["bounds_m"]) == 12
    for m, b in d["bounds_m"].items():
        assert 50.0 < b["w"] < 200.0 and 50.0 < b["h"] < 200.0, m


def test_operator_hold_positions_are_map_tagged():
    d = _load()
    oxy = next(p for p in d["operator"]["players"] if p["player"] == "OXY")
    assert len(oxy["hold_positions"]) == 40
    assert all("map" in h for h in oxy["hold_positions"])


def test_outcomes_and_pacing_present():
    d = _load()
    assert d["outcomes"]["sides"]["attacker"]["win_rate"]
    assert len(d["pacing"]["sites"]) == 12
