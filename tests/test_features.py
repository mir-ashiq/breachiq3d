"""Feature-layer tests: taxonomy order, hard counts, evidence, operator,
pacing, counter-briefs, filter rail, and the PDF export."""
import io

from breachiq import features
from breachiq.export import build_brief_pdf


class TestTaxonomy:
    def test_taxonomy_follows_brief_order(self):
        # The brief prioritizes placeable utility first: trapwires, alarm
        # bots, walls, trips - then recon, smokes, stalls, flashes.
        order = [cls for cls, _ in features.UTILITY_TAXONOMY]
        assert order == ["placeable", "recon", "smoke", "stall", "flash"]

    def test_filters_are_the_briefs_full_rail(self):
        assert set(features.FILTERS) == {
            "team", "map", "player", "agent", "composition", "patch",
            "side", "weapon", "ability"}


class TestUtilityAtlas:
    def test_hard_count_format(self):
        atlas = features.UtilityAtlas()
        atlas.add_round([{"u": 0.2, "v": 0.2, "ability": "cypher-trapwire", "quality": "ok"}])
        result = atlas.result(matches=1)
        assert result["abilities"][0]["hard_count"] == "1/1 rounds"

    def test_evidence_bar_carries_quality_mix(self):
        atlas = features.UtilityAtlas()
        atlas.add_round([
            {"u": 0.2, "v": 0.2, "ability": "sova-reconbolt", "quality": "ok"},
            {"u": 0.2, "v": 0.2, "ability": "sova-reconbolt", "quality": "gap_exceeded"},
        ])
        ev = atlas.result()["abilities"][0]["evidence"]
        assert ev["quality_mix"] == {"ok": 1, "gap_exceeded": 1}
        assert ev["matches"] == 0 or isinstance(ev["matches"], int)


class TestOperatorFingerprint:
    def test_buy_rate_and_timing_histogram(self):
        fp = features.OperatorFingerprint()
        for _ in range(10):
            fp.add_round(player="Alpha", agent="jett", bought_operator=True, hold_start_s=15)
        for _ in range(10):
            fp.add_round(player="Bravo", agent="chamber", bought_operator=False, hold_start_s=35)
        res = fp.result()
        alpha = next(p for p in res["players"] if p["player"] == "Alpha")
        assert alpha["operator_buys"] == 10
        assert alpha["buy_rate"] == "10/10 rounds"
        assert alpha["hold_timing"]["0-20s"] == 10
        bravo = next(p for p in res["players"] if p["player"] == "Bravo")
        assert bravo["hold_timing"]["20-40s"] == 10
        # rotation detection: which players have run which agent
        assert "Alpha" in res["rotation"]["jett"]


class TestExecutePacing:
    def test_median_utility_to_plant(self):
        ep = features.ExecutePacing()
        ep.add_round(site="a", first_utility_s=10, plant_s=30)
        ep.add_round(site="a", first_utility_s=12, plant_s=32)
        res = ep.result()["sites"]["a"]
        assert res["median_utility_to_plant_s"] == 20.0
        assert res["rounds"] == 2


class TestCounterBrief:
    def test_counter_brief_is_prescriptive(self):
        atlas = {"abilities": [{"ability": "cypher-trapwire", "class": "placeable",
                                "zones": {"a": 38}, "hard_count": "38/60 rounds"}]}
        op = {"players": [{"player": "Alpha", "agent": "chamber", "buy_rate": "9/10 rounds",
                           "hold_timing": {"0-20s": 8, "20-40s": 1}}]}
        cues = features.counter_brief(atlas, op)
        assert any("Expect cypher-trapwire" in c for c in cues)
        assert any("Operator" in c for c in cues)


class TestFilterEngine:
    def test_apply_filters(self):
        rec = {"team": "SEN", "map": "split", "agent": "cypher", "patch": "11.08"}
        assert features.apply_filters({"map": "split"}, rec)
        assert not features.apply_filters({"map": "ascent"}, rec)
        assert features.apply_filters({"map": "all"}, rec)  # 'all' = no filter
        assert features.apply_filters({"agent": ["cypher", "killjoy"]}, rec)


class TestBriefExport:
    def test_pdf_export(self):
        pdf = build_brief_pdf("split vs demo", ["Expect trapwire focus on A"],
                              {"rounds": 60, "patch": "11.08"})
        assert pdf[:4] == b"%PDF"
        assert len(pdf) > 1000


class TestTrajectoryPoint:
    """The per-cast record contract from docs/GUIDE.md section 3A. One
    builder (features.trajectory_point) feeds both the synthetic API and
    the real-corpus snapshot, so the modes cannot drift apart."""

    def _point(self, **kw):
        args = dict(u=0.444849999, v=0.0, u0=0.421049999, v0=0.125,
                    azimuth=-10.04, pitch=18.5, ability="sage-wall",
                    ability_class="stall", player="Alpha", round_no=4,
                    quality="ok", confidence=1.0, patch="11.08",
                    agent="cypher")
        args.update(kw)
        return features.trajectory_point(**args)

    def test_contract_fields_present(self):
        p = self._point()
        assert set(p) == {"u", "v", "u0", "v0", "azimuth", "pitch",
                          "ability", "class", "player", "agent", "round",
                          "quality", "confidence", "is_estimate", "patch"}
        assert p["agent"] == "cypher"    # roster filter + tooltip field

    def test_rounding_and_angle_ranges(self):
        p = self._point()
        assert p["u"] == 0.4448 and p["u0"] == 0.421
        assert p["azimuth"] == 350.0      # -10.04 deg normalized to [0, 360)
        assert p["pitch"] == 18.5         # clamped to [-90, 90]
        assert p["confidence"] == 1.0

    def test_agent_defaults_to_empty_when_unknown(self):
        # the agent kwarg is optional: an unresolved roster entry must not
        # raise, it just stays honestly empty
        p = features.trajectory_point(
            u=0.1, v=0.2, u0=0.3, v0=0.4, azimuth=0.0, pitch=0.0,
            ability="x", ability_class="other", player="?",
            round_no=1, quality="ok", confidence=1.0)
        assert p["agent"] == ""

    def test_estimate_label_is_permanent(self):
        # GRID records no landing coordinates: is_estimate can never be
        # turned off, whatever the inputs claim.
        assert self._point().get("is_estimate") is True

    def test_missing_aim_becomes_explicit_nulls(self):
        p = self._point(azimuth=None, pitch=None, confidence=None)
        assert p["azimuth"] is None and p["pitch"] is None
        assert p["confidence"] is None   # frontend skips the aim tick

    def test_pitch_clamps(self):
        assert self._point(pitch=123.4)["pitch"] == 90.0
        assert self._point(pitch=-123.4)["pitch"] == -90.0
