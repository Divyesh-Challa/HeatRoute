.PHONY: setup test dev api web build docker weather

setup:            ## install backend and frontend dependencies
	python3 -m venv .venv && .venv/bin/pip install -r backend/requirements-dev.txt
	cd frontend && npm install

test:             ## run all backend and simulator tests
	.venv/bin/python -m pytest -q

api:              ## API on :8000 with reload
	.venv/bin/uvicorn backend.app.main:app --reload --port 8000

web:              ## frontend dev server on :5173 (proxies /api to :8000)
	cd frontend && npm run dev

dev:              ## API + frontend together
	$(MAKE) -j2 api web

build:            ## production build of the frontend; then `make api` serves everything on :8000
	cd frontend && npm run build

docker:           ## the same image Render runs, on :8000
	docker build -t heatroute . && docker run --rm -p 8000:8000 heatroute

weather:          ## re-download the Environment Canada data into data/
	.venv/bin/python data/fetch_weather.py
