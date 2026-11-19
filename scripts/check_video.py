#!/usr/bin/env python3
"""Demo video duration guard: the rules cap the video at 3 minutes.

Usage: python scripts/check_video.py path/to/demo.mp4
Target 165s, hard cutoff 175s (rule limit 180s - we keep a 5s margin).
"""
import subprocess
import sys


def duration_seconds(path: str) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", path],
        capture_output=True, text=True)
    if out.returncode != 0:
        raise SystemExit(f"ffprobe failed: {out.stderr.strip()}")
    return float(out.stdout.strip())


def main() -> int:
    if len(sys.argv) != 2:
        raise SystemExit("usage: check_video.py <video-file>")
    path = sys.argv[1]
    secs = duration_seconds(path)
    print(f"video duration: {secs:.1f}s (rule: <180s; target: 165s; cutoff: 175s)")
    if secs >= 180:
        print("FAIL: over the 3-minute rule limit - disqualification risk")
        return 1
    if secs > 175:
        print("WARN: over the internal 175s cutoff - trim before upload")
        return 1
    print("OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
