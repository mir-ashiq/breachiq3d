"""Make the repo root importable so `import breachiq` works from any cwd."""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
