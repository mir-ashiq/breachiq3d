.PHONY: setup demo test verify audit video-check clean

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

video-check:
	.venv/bin/python scripts/check_video.py "$(F)"

clean:
	rm -rf .pytest_cache dist build *.egg-info
