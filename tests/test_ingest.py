"""Ingest tests: streaming, rollback invariants, joins, dedup, defensive parsing."""
import gzip
import json

from breachiq import ingest


def _write_gz(tmp_path, records, name="events.jsonl.gz"):
    p = tmp_path / name
    with gzip.open(p, "wt") as f:
        for r in records:
            f.write(json.dumps(r) + "\n")
    return p


class TestStreaming:
    def test_gz_stream_never_materializes(self, tmp_path):
        p = _write_gz(tmp_path, [{"i": i} for i in range(50)])
        gen = ingest.iter_jsonl(p)
        assert iter(gen) is gen  # generator, not a list: zero-disk ingest

    def test_malformed_lines_are_skipped_and_counted(self, tmp_path):
        p = tmp_path / "mixed.jsonl"
        p.write_text('{"ok": 1}\nnot json at all\n{"ok": 2}\n\n{"ok": 3}\n')
        ingest.reset_stats()
        out = list(ingest.iter_jsonl(p))
        assert len(out) == 3
        assert ingest.iter_stats()["malformed"] >= 1

    def test_zst_path_is_accepted(self, tmp_path):
        import zstandard
        p = tmp_path / "events.jsonl.zst"
        with zstandard.open(p, "wt") as f:
            f.write('{"a": 1}\n')
        assert list(ingest.iter_jsonl(p)) == [{"a": 1}]


class TestRollback:
    def test_rollback_discards_voided_rounds(self):
        tr = ingest.RollbackTracker()
        tr.feed({"type": "player-used-ability", "gameId": "g1"})
        assert tr.is_valid("g1")
        # restart marker voids the earlier game
        tr.feed({"type": "series-!started-game", "gameId": "g1"})
        assert not tr.is_valid("g1")
        assert tr.stats["rolled_back_games"] == ["g1"]

    def test_unrelated_games_unaffected(self):
        tr = ingest.RollbackTracker()
        tr.feed({"type": "series-!started-game", "gameId": "g2"})
        assert tr.is_valid("g3")


class TestExclusions:
    def test_exclusion_manifest_from_verified_readme(self):
        assert ingest.series_excluded("2855902")           # no supplement at all
        assert ingest.map_excluded("2855906", "bind")       # map GRID lacks
        assert ingest.map_excluded("2890361", "split")      # merged into prior game
        assert not ingest.series_excluded("2800000")
        assert not ingest.map_excluded("2855906", "ascent")

    def test_exclusion_reason_is_recorded(self):
        assert "supplement" in ingest.EXCLUSION_MANIFEST["2855902"]["reason"]


class TestJoins:
    def test_join_key_is_grid_event_id(self):
        assert ingest.join_key({"grid_event_id": "abc"}) == "abc"
        assert ingest.join_key({"grid_event_id": None}) is None

    def test_dedup_by_grid_event_id(self, tmp_path):
        events = [
            {"grid_event_id": "e1", "in_grid": True, "frame_before": {"offset_ms": -100}},
            {"grid_event_id": "e1", "in_grid": True, "frame_before": {"offset_ms": -100}},
            {"grid_event_id": "e2", "in_grid": True, "frame_before": {"offset_ms": -100}},
        ]
        out = list(ingest.iter_supplement_casts(iter(events)))
        assert [e["grid_event_id"] for e in out] == ["e1", "e2"]  # dedup invariant

    def test_in_grid_false_excluded_by_default(self):
        events = [
            {"grid_event_id": "e1", "in_grid": True, "frame_before": {"offset_ms": -100}},
            {"grid_event_id": "e2", "in_grid": False, "frame_before": {"offset_ms": -100}},
        ]
        out = list(ingest.iter_supplement_casts(iter(events)))
        assert len(out) == 1
        # ... and can be counted separately for between-round usage views
        all_casts = list(ingest.iter_supplement_casts(iter(events), in_grid_only=False))
        assert len(all_casts) == 2


class TestTime:
    def test_to_utc_normalizes(self):
        assert ingest.to_utc("2026-11-18T12:00:00Z").endswith("+00:00")
        assert ingest.to_utc(1763467200000).endswith("+00:00")
        assert ingest.to_utc(None) is None
        assert ingest.to_utc("garbage") is None
