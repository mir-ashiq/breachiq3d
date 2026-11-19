"""Tests for the real-data layer: corpus scanner (on a synthetic
envelope-format series), LineupDetector, RoundOutcomes, and the ability
taxonomy/economy helpers."""
import json
import math
from pathlib import Path

import pytest
import zstandard

from breachiq import features, spatial
from breachiq.corpus import (Corpus, SeriesScanner, ability_class,
                             economy_class, find_data_dir)


# ---------------------------------------------------------------- taxonomy
def test_ability_class_brief_order_preserved():
    assert ability_class("trapwire") == "placeable"
    assert ability_class("recon-bolt") == "recon"
    assert ability_class("dark-cover") == "smoke"
    assert ability_class("nanoswarm") == "stall"
    assert ability_class("flashpoint") == "flash"
    assert ability_class("tailwind") == "other"  # movement: honestly unmapped
    assert ability_class(None) == "other"


def test_economy_classification():
    assert economy_class(1, 5000) == "pistol"      # round 1/13 by rule
    assert economy_class(13, 5000) == "pistol"
    assert economy_class(5, 9000) == "eco"
    assert economy_class(5, 18000) == "force"
    assert economy_class(5, 30000) == "full"
    assert economy_class(5, None) == "unknown"


# ---------------------------------------------------------------- lineups
def _view(az_deg):
    return {"x": math.cos(math.radians(az_deg)),
            "y": math.sin(math.radians(az_deg)), "z": 0.0}


def test_lineup_detector_finds_repeats():
    det = features.LineupDetector(min_repeats=3)
    pos = {"x": 100.0, "y": 200.0, "z": 0.0}
    for r in range(5):
        det.add(ability="toxic-screen", map="lotus", position=pos,
                view=_view(80.0), round_key=f"s1:{r}")
    res = det.result()
    assert len(res) == 1
    assert res[0]["repeats"] == 5
    assert res[0]["ability"] == "toxic-screen"
    assert res[0]["is_estimate"] is True


def test_lineup_detector_separates_spots_and_aims():
    det = features.LineupDetector(min_repeats=3)
    near = {"x": 100.0, "y": 200.0, "z": 0.0}
    far = {"x": 3000.0, "y": 400.0, "z": 0.0}
    for r in range(4):
        det.add(ability="haunt", map="ascent", position=near,
                view=_view(10.0), round_key=f"a:{r}")
        det.add(ability="haunt", map="ascent", position=far,
                view=_view(10.0), round_key=f"b:{r}")   # different spot
        det.add(ability="haunt", map="ascent", position=near,
                view=_view(90.0), round_key=f"c:{r}")   # different aim
    assert len(det.result()) == 3  # three distinct lineups


def test_lineup_detector_requires_distinct_rounds():
    det = features.LineupDetector(min_repeats=3)
    pos = {"x": 0.0, "y": 0.0, "z": 0.0}
    for _ in range(5):  # same round repeated: counts once
        det.add(ability="sky-smoke", map="split", position=pos,
                view=_view(45.0), round_key="only-round")
    assert det.result() == []


# ---------------------------------------------------------------- outcomes
def test_round_outcomes_win_rates_and_pistols():
    ro = features.RoundOutcomes()
    # pistol round 1 won, round 2 won -> conversion 1/1
    ro.add_round(round_no=1, side="attacker", won=True, win_type="bombExploded",
                 planted=True, economy="pistol")
    ro.add_round(round_no=2, side="attacker", won=True, win_type="opponentEliminated",
                 planted=True, economy="full")
    # attack round with no plant
    ro.add_round(round_no=3, side="attacker", won=False, win_type=None,
                 planted=False, economy="eco")
    res = ro.result()
    atk = res["sides"]["attacker"]
    assert atk["rounds"] == 3 and atk["won"] == 2
    assert atk["win_types"] == {"bombExploded": 1, "opponentEliminated": 1}
    assert atk["attack_no_plant"] == "1/3"
    assert res["pistol_conversion"] == "1/1"


# ---------------------------------------------------------------- corpus
class _FakeCorpus(Corpus):
    """A Corpus pointed at a tmp dir with one synthetic envelope series."""

    def __init__(self, root: Path):
        self.dir = root
        self._series = None
        self._games = None


GID = "game-uuid-1"


def _write_zst(path: Path, text: str) -> None:
    with zstandard.open(path, "wt", encoding="utf-8") as f:
        f.write(text)


def _read_zst(path: Path) -> str:
    with zstandard.open(path, "rt", encoding="utf-8") as f:
        return f.read()


def _envelope(seq, occurred_at, events):
    return {"id": f"env{seq}", "occurredAt": occurred_at, "seriesId": "9001",
            "sequenceNumber": seq, "events": events}


def _player(pid, name, side, team="Testing"):
    return {"id": pid, "name": name, "side": side,
            "character": {"name": "sova"}, "loadoutValue": 5000, "money": 2000,
            "inventory": {"items": [{"id": "classic", "name": "Classic"}]},
            "position": {"x": 1000.0, "y": 2000.0}}


def _full_state(with_op=False):
    players = [_player("p1", "alice", "attacker"), _player("p2", "bob", "defender")]
    if with_op:
        players[0]["inventory"]["items"].append({"id": "operator", "name": "Operator"})
    return {"games": [{"id": GID, "map": {"name": "lotus", "bounds": {
        "min": {"x": 0.0, "y": 0.0}, "max": {"x": 10000.0, "y": 10000.0}}},
        "teams": [{"id": "t1", "name": "Testing", "side": "attacker",
                   "players": [players[0]]},
                  {"id": "t2", "name": "Rivals", "side": "defender",
                   "players": [players[1]]}]}]}


def _write_fake_series(root: Path):
    (root / "val").mkdir(parents=True)
    (root / "val-ability-supplements").mkdir(parents=True)
    (root / "meta").mkdir(parents=True)
    envelopes = [
        _envelope(1, "2026-01-01T12:00:00Z", [
            {"id": "e-start", "type": "series-started-game", "actor": {"type": "series"},
             "target": {"type": "game", "id": GID,
                        "state": {"map": {"name": "lotus", "bounds": {
                            "min": {"x": 0.0, "y": 0.0},
                            "max": {"x": 10000.0, "y": 10000.0}}}}},
             "seriesStateDelta": {"games": [{"id": GID}]}}]),
        _envelope(2, "2026-01-01T12:00:01Z", [
            {"id": "e-r1", "type": "game-started-round", "actor": {"type": "game", "id": GID},
             "target": {"type": "round", "id": "round-1",
                        "state": {"sequenceNumber": 1}},
             "seriesState": _full_state(with_op=True)}]),
        _envelope(3, "2026-01-01T12:00:20Z", [
            {"id": "e-cast1", "type": "player-used-ability",
             "actor": {"type": "player", "id": "p1",
                       "state": {"name": "alice", "side": "attacker"}},
             "target": {"type": "ability", "id": "recon-bolt"},
             "seriesStateDelta": {"games": [{"id": GID}]}}]),
        _envelope(4, "2026-01-01T12:00:30Z", [
            {"id": "e-kill1", "type": "player-killed-player",
             "actor": {"type": "player", "id": "p1", "state": {"name": "alice", "side": "attacker"}},
             "target": {"type": "player", "id": "p2", "state": {"name": "bob"}},
             "seriesStateDelta": {"games": [{"id": GID}]}}]),
        _envelope(5, "2026-01-01T12:00:40Z", [
            {"id": "e-plant1", "type": "player-completed-plantBomb",
             "actor": {"type": "player", "id": "p1", "state": {"name": "alice"}},
             "target": {"type": "plantBomb"},
             "seriesStateDelta": {"games": [{"id": GID}]}}]),
        _envelope(6, "2026-01-01T12:00:50Z", [
            {"id": "e-win1", "type": "team-won-round",
             "actor": {"type": "team", "id": "t1", "state": {"name": "Testing"},
                       "stateDelta": {"round": {"winType": "bombExploded"}}},
             "target": {"type": "round", "id": "round-1",
                        "state": {"sequenceNumber": 1,
                                  "teams": [{"id": "t1", "won": True}]}},
             "seriesStateDelta": {"games": [{"id": GID}]}}]),
    ]
    feed = root / "val" / "events_9001_grid.jsonl.zst"
    _write_zst(feed, "\n".join(json.dumps(e) for e in envelopes))
    supp = root / "val-ability-supplements" / "9001.jsonl.zst"
    _write_zst(supp, json.dumps({
        "series_id": "9001", "game_id": GID, "grid_event_id": "e-cast1",
        "in_grid": True, "occurred_at": "2026-01-01T12:00:20Z",
        "player_id": "p1", "ability": "recon-bolt", "slot": "ABILITY_1",
        "charges_consumed": 1,
        "interpolated": {"position": {"x": 5000.0, "y": 5000.0, "z": 100.0},
                         "view": {"x": 1.0, "y": 0.0, "z": 0.0},
                         "velocity": {"x": 0.0, "y": 0.0, "z": 0.0}},
        "frame_before": {"offset_ms": -100, "position": {"x": 5000.0, "y": 5000.0, "z": 100.0},
                         "view": {"x": 1.0, "y": 0.0, "z": 0.0},
                         "velocity": {"x": 0.0, "y": 0.0, "z": 0.0}},
        "frame_after": {"offset_ms": 100, "position": {"x": 5000.0, "y": 5000.0, "z": 100.0},
                        "view": {"x": 1.0, "y": 0.0, "z": 0.0},
                        "velocity": {"x": 0.0, "y": 0.0, "z": 0.0}},
        "quality": "ok"}))
    (root / "val" / "series.csv").write_text(
        "series_id,event,stage,scheduled_start,teams,file,ability_supplement\n"
        "9001,Test Cup,Finals,2026-01-01T12:00:00Z,Testing vs Rivals,"
        "val/events_9001_grid.jsonl,val-ability-supplements/9001.jsonl\n")
    (root / "meta" / "games.csv").write_text(
        "title,series_id,game_id,map,patch\nval,9001,g1,lotus,11.00\n")
    return root


def test_series_scan_rounds_casts_context(tmp_path):
    corpus = _FakeCorpus(_write_fake_series(tmp_path))
    scan = SeriesScanner(corpus).scan("9001")
    assert len(scan["rounds"]) == 1
    r = scan["rounds"][0]
    assert r["winner_team"] == "Testing"
    assert r["win_type"] == "bombExploded"
    assert r["first_kill"]["killer"] == "alice"
    assert r["plant_iso"] is not None
    assert r["sides_by_team"] == {"Testing": "attacker", "Rivals": "defender"}
    assert r["operator_holders"] == ["alice"]
    assert "attacker" in r["loadouts"]
    assert len(scan["casts"]) == 1
    c = scan["casts"][0]
    assert c["round_no"] == 1
    assert c["ability_class"] == "recon"
    assert c["quality"] == "ok"
    assert scan["quality_mismatch"] == 0
    assert scan["games"][GID]["map"] == "lotus"


def test_series_scan_rollback_drops_game(tmp_path):
    corpus = _FakeCorpus(_write_fake_series(tmp_path))
    feed = corpus.dir / "val" / "events_9001_grid.jsonl.zst"
    rollback = _envelope(7, "2026-01-01T12:01:00Z", [
        {"id": "e-rb", "type": "series-!started-game",
         "actor": {"type": "game", "id": GID},
         "target": {"type": "game", "id": GID}}])
    _write_zst(feed, _read_zst(feed) + "\n" + json.dumps(rollback))
    scan = SeriesScanner(corpus).scan("9001")
    assert scan["rolled_back_games"] == [GID]
    assert scan["rounds"] == [] and scan["casts"] == []


@pytest.mark.skipif(find_data_dir() is None, reason="GRID starter data not present")
def test_real_corpus_smoke():
    corpus = Corpus()
    rows = corpus.team_series("Cloud9")
    assert rows, "Cloud9 series must be indexed when the corpus is present"
    scan = SeriesScanner(corpus).scan(rows[0]["series_id"])
    assert scan["rounds"], "first Cloud9 series must yield rounds"
    assert any(r["winner_team"] for r in scan["rounds"])
