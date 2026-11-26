PYTHON := .venv/bin/python
WEB := apps/web
export OPENBLAS_NUM_THREADS := 1
export NEXT_TELEMETRY_DISABLED := 1

.PHONY: setup data-small train evaluate api web test screenshots demo-export demo benchmark

setup:
	uv venv --allow-existing --python 3.12 --cache-dir .venv/cache
	uv pip sync requirements.txt --python $(PYTHON) --cache-dir .venv/cache
	npm --prefix $(WEB) ci

data-small:
	$(PYTHON) -m scripts.pipeline download
	$(PYTHON) -m scripts.pipeline prepare

train:
	$(PYTHON) -m scripts.pipeline train

evaluate:
	$(PYTHON) -m scripts.pipeline evaluate

api:
	$(PYTHON) -m uvicorn services.api.app:app --host 127.0.0.1 --port 8000 --no-access-log

web:
	NEXT_PUBLIC_FEEDCRAFT_API=http://127.0.0.1:8000 npm --prefix $(WEB) run dev

test:
	$(PYTHON) -m ruff check services scripts tests
	$(PYTHON) -m pytest -q
	npm --prefix $(WEB) run check
	npm --prefix $(WEB) test

screenshots:
	npm --prefix $(WEB) run build
	FEEDCRAFT_SCREENSHOTS=1 npm --prefix $(WEB) run e2e

demo-export:
	$(PYTHON) -m scripts.pipeline export

demo:
	npm --prefix $(WEB) ci
	npm --prefix $(WEB) run build
	python3 -m http.server 3000 --bind 127.0.0.1 --directory $(WEB)/out

benchmark:
	$(PYTHON) -m scripts.benchmark
