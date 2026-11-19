.PHONY: setup demo test verify audit findings demo-snapshot video-check clean

setup:
	python3 -m venv .venv
	.venv/bin/pip install -r requirements.txt
	git config core.hooksPath .githooks
	@echo "setup complete - activate with: source .venv/bin/activate"

demo:
	@echo "dashboard: http://127.0.0.1:8000/app   api docs: http://127.0.0.1:8000/docs"
	.venv/bin/python -m uvicorn breachiq.api:app --host 127.0.0.1 --port 8000

test:
	.venv/bin/python -m pytest

verify:
	.venv/bin/python scripts/verify_pipeline.py

audit:
	.venv/bin/python scripts/audit_repo.py

findings:
	@echo "scans every Cloud9 series in the GRID starter corpus -> docs/FINDINGS.md"
	@echo "clone the data first: git clone https://github.com/cloud9esports/stl-hackathon-2026-grid-starter.git ../grid-data"
	.venv/bin/python scripts/build_findings.py

demo-snapshot:
	@echo "rebuilds web/demo-data.json (the static GitHub-Pages snapshot)"
	.venv/bin/python scripts/build_demo.py

video-check:
	.venv/bin/python scripts/check_video.py "$(F)"

clean:
	rm -rf .pytest_cache dist build *.egg-info
