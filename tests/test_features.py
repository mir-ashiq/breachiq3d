"""Feature-layer tests: taxonomy order, hard counts, evidence, operator,
pacing, counter-briefs, filter rail, and the PDF export."""
from breachiq import features
from breachiq.export import build_tactical_pdf


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


def _tactical_inputs():
    """One map's worth of aggregates: a critical lineup + critical utility
    focus, a warning-grade Operator habit and a fast A-site tempo."""
    atlas = {"rounds": 100, "abilities": [
        {"ability": "toxic-screen", "class": "smoke",
         "zones": {"a": 40, "b": 10}, "hard_count": "45/100 rounds",
         "evidence": {}}]}
    operator = {"players": [
        {"player": "OXY", "agent": "raze", "operator_buys": 25,
         "buy_rate": "25/100 rounds", "hold_timing": {},
         "hold_positions": []}]}
    lineups = [{"map": "lotus", "ability": "toxic-screen",
                "repeats": 34, "avg_confidence": 1.0,
                "aim_azimuth_deg": 82.0}]
    pacing = {"sites": {"a": {"rounds": 30, "median_utility_to_plant_s": 52.3},
                        "b": {"rounds": 20, "median_utility_to_plant_s": 71.0}}}
    return atlas, operator, lineups, pacing


class TestTacticalBrief:
    """features.tactical_brief: the severity-ranked, evidence-carrying
    anti-strat core. One builder feeds GET /api/brief and /api/brief.pdf,
    so the dashboard panel and the printed one-pager cannot drift."""

    def test_insights_ranked_and_evidence_carrying(self):
        b = features.tactical_brief(*_tactical_inputs(), "lotus")
        rank = features._SEVERITY_ORDER
        sev = [rank[i["severity"]] for i in b["insights"]]
        assert sev == sorted(sev), "severity order is a claim: top-down"
        for i in b["insights"]:
            for k in ("severity", "kind", "title", "detail", "action",
                      "evidence", "score"):
                assert k in i, f"insight missing {k}"
            ev = i["evidence"]
            assert ev["source"] in ("lineups", "operator", "pacing",
                                    "atlas", "method")
            assert isinstance(ev["rounds_seen"], int)
            assert isinstance(ev["sample_rounds"], int)
        # the headline is the top insight - the what-to-do-first line
        assert b["headline"].startswith(b["insights"][0]["title"])

    def test_lineup_evidence_traces_to_input(self):
        b = features.tactical_brief(*_tactical_inputs(), "lotus")
        lu = next(i for i in b["insights"] if i["kind"] == "lineup")
        assert lu["evidence"]["rounds_seen"] == 34
        assert lu["evidence"]["confidence"] == 1.0
        # 34 repeats at full confidence is a critical exploit target
        assert lu["severity"] == "critical"

    def test_empty_inputs_leave_only_the_method_note(self):
        b = features.tactical_brief({"rounds": 0, "abilities": []},
                                    {"players": []}, [], {"sites": {}},
                                    "lotus")
        assert [i["kind"] for i in b["insights"]] == ["method"]
        assert b["headline"], "even the empty view says something honest"


class TestEvidenceMath:
    """wilson_interval + lineup_effectiveness: the statistical honesty
    layer. Rival tools quote raw shares; a 100% rate on 3 rounds is not
    knowledge, and the interval says so."""

    def test_wilson_pinned_values(self):
        assert features.wilson_interval(1, 1) == {"low": 0.207, "high": 1.0}
        assert features.wilson_interval(0, 10) == {"low": 0.0, "high": 0.278}
        w = features.wilson_interval(400, 1000)
        assert w == {"low": 0.37, "high": 0.431}  # hugs the 40% share
        # degenerate inputs are None, never a fabricated range
        assert features.wilson_interval(0, 0) is None
        assert features.wilson_interval(5, -2) is None

    def test_lineup_effectiveness_lift(self):
        eff = features.lineup_effectiveness([True] * 7 + [False] * 3,
                                            [True] * 5 + [False] * 5)
        assert eff["rounds_won"] == 7 and eff["sample_rounds"] == 10
        assert eff["win_rate_when_cast"] == 0.7
        assert eff["baseline_win_rate"] == 0.5
        assert eff["lift_pp"] == 20.0
        lo, hi = eff["wilson_95"]["low"], eff["wilson_95"]["high"]
        assert lo == 0.397 and hi == 0.892
        assert "association" in eff["note"]

    def test_lineup_effectiveness_honest_nulls(self):
        # no comparison rounds -> baseline null, never guessed
        eff = features.lineup_effectiveness([True, False], None)
        assert eff["baseline_win_rate"] is None and eff["lift_pp"] is None
        assert eff["win_rate_when_cast"] == 0.5
        # no rounds at all -> everything null, still a valid dict
        eff2 = features.lineup_effectiveness([], [])
        assert eff2["win_rate_when_cast"] is None
        assert eff2["wilson_95"] is None and eff2["rounds_won"] == 0


class TestBriefEffectiveness:
    """The brief must let the lineup's own win rate change the coaching
    call: a repeated lineup that does not convert is bait, not a threat."""

    def _eff(self, won, n, wr, base, lift):
        return {"rounds_won": won, "sample_rounds": n,
                "win_rate_when_cast": wr,
                "wilson_95": {"low": round(wr - 0.1, 3),
                              "high": round(wr + 0.1, 3)},
                "baseline_win_rate": base, "baseline_sample_rounds": 180,
                "lift_pp": lift, "note": "observational"}

    def test_negative_lift_flips_the_call(self):
        atlas, op, lus, pac = _tactical_inputs()
        lus[0]["effectiveness"] = self._eff(2, 34, 0.059, 0.5, -44.1)
        b = features.tactical_brief(atlas, op, lus, pac, "lotus")
        lu = next(i for i in b["insights"] if i["kind"] == "lineup")
        assert "does NOT convert" in lu["detail"]
        assert "Let them have this lineup" in lu["action"]
        assert lu["severity"] == "warning"   # downgraded from critical
        assert lu["effectiveness"]["lift_pp"] == -44.1

    def test_positive_lift_escalates_the_deny(self):
        atlas, op, lus, pac = _tactical_inputs()
        lus[0]["effectiveness"] = self._eff(24, 34, 0.706, 0.5, 20.6)
        b = features.tactical_brief(atlas, op, lus, pac, "lotus")
        lu = next(i for i in b["insights"] if i["kind"] == "lineup")
        assert "It converts" in lu["detail"] and "+21pp" in lu["detail"]
        assert lu["severity"] == "critical"  # a winning pattern: deny it

    def test_no_effectiveness_stays_verbal(self):
        # a snapshot that predates the effectiveness fields must still
        # produce the plain pre-aim cue, never a crash or a guess
        atlas, op, lus, pac = _tactical_inputs()
        b = features.tactical_brief(atlas, op, lus, pac, "lotus")
        lu = next(i for i in b["insights"] if i["kind"] == "lineup")
        assert "Pre-aim" in lu["action"]
        assert lu["effectiveness"] is None and "convert" not in lu["detail"]


class TestTacticalPDF:
    def test_pdf_renders_structured_brief(self):
        b = features.tactical_brief(*_tactical_inputs(), "lotus")
        pdf = build_tactical_pdf(b)
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
                          "quality", "confidence", "is_estimate", "patch",
                          "won"}
        assert p["agent"] == "cypher"    # roster filter + tooltip field
        assert p["won"] is None          # unknown outcome, never fabricated
        assert self._point(won=True)["won"] is True

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
