#!/usr/bin/env python3
"""Data-leak audit: the repo must NEVER contain GRID data or derivatives.

Checks (also run in CI on every push):
  1. No tracked files matching licensed-data patterns (*.zst, *.jsonl,
     *.parquet, *.sqlite, data/ dirs).
  2. No fixture claims to be official data (must be labeled SYNTHETIC).
Exit 1 on any violation - the pre-push hook and CI both block on this.
"""
import json
import re
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent

BLOCKED = re.compile(
    r"(^|/)(val|lol|val-ability-supplements|data)(/|$)"
    r"|\.zst$|\.jsonl$|\.parquet$|\.sqlite3?$|\.db$",
    re.IGNORECASE,
)


def tracked_files() -> list[str]:
    out = subprocess.run(["git", "ls-files"], cwd=REPO, capture_output=True, text=True)
    return [f for f in out.stdout.splitlines() if f]


def main() -> int:
    violations = []
    files = tracked_files()
    for f in files:
        if BLOCKED.search(f):
            violations.append(f"licensed-data pattern: {f}")

    meta = REPO / "fixtures" / "meta.json"
    if meta.is_file():
        try:
            if not json.loads(meta.read_text()).get("SYNTHETIC"):
                violations.append("fixtures/meta.json is not labeled SYNTHETIC")
        except json.JSONDecodeError:
            violations.append("fixtures/meta.json is not valid JSON")
    else:
        violations.append("fixtures/meta.json missing (run scripts/verify_pipeline.py)")

    if violations:
        print("DATA-LEAK AUDIT FAILED:")
        for v in violations:
            print(" -", v)
        print("The GRID license forbids committing data or derivatives.")
        return 1
    print(f"DATA-LEAK AUDIT OK ({len(files)} tracked files, no licensed data)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
