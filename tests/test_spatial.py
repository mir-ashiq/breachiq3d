"""Spatial math tests - pin the VERIFIED supplement schema contract.

If the upstream schema changes, these tests fail loudly instead of letting
the engine silently produce wrong coordinates.
"""
import math

import pytest

from breachiq import spatial


def _frame(offset_ms, pos=(10.0, 20.0, 30.0), view=(1.0, 0.0, 0.0)):
    return {"offset_ms": offset_ms,
            "position": {"x": pos[0], "y": pos[1], "z": pos[2]},
            "view": {"x": view[0], "y": view[1], "z": view[2]},
            "velocity": {"x": 0.0, "y": 0.0, "z": 0.0}}


class TestSchemaContract:
    """The verified schema: 3D position/view/velocity + frames + quality."""

    def test_quality_values_complete(self):
        # All five documented quality flags must be understood.
        assert spatial.ALL_QUALITIES == ("ok", "gap_exceeded", "missing_after",
                                         "missing_before", "missing_both")

    def test_ok_event_interpolates(self):
        ev = {"frame_before": _frame(-100), "frame_after": _frame(100)}
        state = spatial.cast_state(ev)
        assert state["quality"] == "ok"
        assert state["position"]["x"] == pytest.approx(10.0)

    def test_missing_both_returns_none(self):
        assert spatial.cast_state({"frame_before": None, "frame_after": None}) is None

    def test_gap_exceeded_uses_closer_frame(self):
        # README rule: on gap_exceeded use the closer frame, NOT interpolated.
        ev = {"frame_before": _frame(-1600, pos=(0.0, 0.0, 0.0)),
              "frame_after": _frame(200, pos=(400.0, 0.0, 0.0))}
        state = spatial.cast_state(ev)
        assert state["quality"] == "gap_exceeded"
        assert state["position"]["x"] == pytest.approx(400.0)


class TestInterpolation:
    def test_interpolate_midpoint(self):
        before = _frame(-100, pos=(0.0, 0.0, 0.0), view=(1.0, 0.0, 0.0))
        after = _frame(100, pos=(200.0, 0.0, 0.0), view=(0.0, 1.0, 0.0))
        out = spatial.interpolate(before, after, 0.5)
        assert out["position"]["x"] == pytest.approx(100.0)
        # view re-normalized to unit length
        n = math.sqrt(sum(v * v for v in out["view"].values()))
        assert n == pytest.approx(1.0)

    def test_sample_weight_formula(self):
        # weight = (t_cast - t_before) / (t_after - t_before), t_cast = 0
        assert spatial.sample_weight(0.0, -100.0, 300.0) == pytest.approx(0.25)
        assert spatial.sample_weight(0.0, 0.0, 0.0) is None


class TestLowRate:
    def test_low_rate_detection(self):
        # ~1000 ms gaps mark 1 Hz (VCT Americas 2025) series.
        ev = {"frame_before": _frame(-1000), "frame_after": _frame(1000)}
        assert spatial.is_low_rate(ev["frame_before"], ev["frame_after"])
        ev2 = {"frame_before": _frame(-200), "frame_after": _frame(200)}
        assert not spatial.is_low_rate(ev2["frame_before"], ev2["frame_after"])

    def test_low_rate_gap_gets_loose_tolerance(self):
        ev = {"frame_before": _frame(-1000), "frame_after": _frame(1000)}
        # 1000 ms frames exceed the 500 ms normal tolerance but pass at 1200 ms
        assert spatial.classify_quality(ev) == "ok"


class TestBounds:
    def test_normalize_inside_unit_square(self):
        b = spatial.MapBounds(-4000, 4000, -4000, 4000)
        for x in (-4000, 0, 4000):
            for y in (-4000, 0, 4000):
                u, v = spatial.normalize_position({"x": x, "y": y, "z": 0}, b)
                assert 0.0 <= u <= 1.0 and 0.0 <= v <= 1.0

    def test_bounds_registered_for_competitive_maps(self):
        for m in ("ascent", "split", "bind", "haven", "pearl", "lotus"):
            assert m in spatial.BOUNDS


class TestLandingEstimate:
    def test_landing_is_labeled_estimate(self):
        ev = {"frame_before": _frame(-100), "frame_after": _frame(100)}
        est = spatial.estimate_landing(ev, "recon", spatial.BOUNDS["split"])
        assert est.is_estimate is True
        assert 0.0 <= est.u <= 1.0 and 0.0 <= est.v <= 1.0

    def test_confidence_degrades_with_quality(self):
        ok = spatial.estimate_landing(
            {"frame_before": _frame(-100), "frame_after": _frame(100)},
            "recon", spatial.BOUNDS["split"])
        bad = spatial.estimate_landing(
            {"frame_before": _frame(-1600), "frame_after": _frame(100)},
            "recon", spatial.BOUNDS["split"])
        assert bad.confidence < ok.confidence


class TestLineupTrajectory:
    """The 3D viewer's arc: cast point -> parabola -> landing estimate."""

    def _traj(self, az=80.0, pit=20.0, z=300.0):
        pos = {"x": 5000.0, "y": 3000.0, "z": z}
        return spatial.lineup_trajectory(
            position=pos, aim_azimuth_deg=az, aim_pitch_deg=pit,
            ability_class="smoke", bounds=spatial.BOUNDS["lotus"],
            confidence=0.9)

    def test_polyline_shape_and_estimate_label(self):
        t = self._traj()
        assert len(t["points"]) == 13
        assert t["is_estimate"] is True
        assert t["confidence"] == 0.9
        assert t["landing"] == t["points"][-1][:2] + [0.0]
        # every point inside normalized bounds
        for u, v, h in t["points"]:
            assert 0.0 <= u <= 1.0 and 0.0 <= v <= 1.0
            assert h >= 0.0

    def test_arc_rises_above_the_cast_height(self):
        t = self._traj()
        z0 = t["points"][0][2]           # ~3 m (300 cm)
        apex = max(p[2] for p in t["points"])
        assert apex >= z0 + 0.8

    def test_honesty_note_about_missing_telemetry(self):
        t = self._traj()
        assert any("no projectile telemetry" in n for n in t["notes"])

    def test_landing_clamped_to_playable_bounds(self):
        # aim far off the map from near the edge: ray must clamp, never
        # render outside
        t = spatial.lineup_trajectory(
            position={"x": 10200.0, "y": 3000.0, "z": 0.0},
            aim_azimuth_deg=0.0, aim_pitch_deg=0.0,
            ability_class="smoke", bounds=spatial.BOUNDS["lotus"],
            confidence=1.0)
        assert 0.0 <= t["landing"][0] <= 1.0 and 0.0 <= t["landing"][1] <= 1.0
        assert any("clamped" in n for n in t["notes"])

    def test_offbounds_cast_start_is_clamped_and_labeled(self):
        # a few real casts sit outside recorded playable bounds: the start
        # is clamped for display and the note says so
        t = spatial.lineup_trajectory(
            position={"x": 5000.0, "y": 20000.0, "z": 0.0},   # far outside
            aim_azimuth_deg=90.0, aim_pitch_deg=10.0,
            ability_class="smoke", bounds=spatial.BOUNDS["lotus"],
            confidence=1.0)
        assert 0.0 <= t["points"][0][0] <= 1.0
        assert 0.0 <= t["points"][0][1] <= 1.0
        assert any("cast position clamped" in n for n in t["notes"])
