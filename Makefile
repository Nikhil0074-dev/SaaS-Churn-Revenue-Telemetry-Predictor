# Convenience targets for macOS/Linux. Windows users: see docs/windows-setup.md.
PY ?= python3

.PHONY: install seed api web test test-backend test-frontend e2e lint report openapi
install:
	$(PY) -m pip install -r backend/requirements-dev.txt
	cd frontend && npm ci
seed:
	$(PY) scripts/seed_demo_data.py
api:
	cd backend && $(PY) -m uvicorn app.main:app_factory --factory --reload --port 8000
web:
	cd frontend && npm run dev
test: test-backend test-frontend
test-backend:
	cd backend && $(PY) -m pytest -q --cov=app --cov=../ml/churn_ml
test-frontend:
	cd frontend && npm run typecheck && npm test
e2e:  # needs the API on :8000 (seeded) and `npm run build && npx vite preview --port 4173`
	$(PY) e2e/ui_e2e.py
lint:
	ruff check backend/app ml/churn_ml scripts e2e
report:
	$(PY) scripts/generate_evaluation_report.py --org-id 1
openapi:
	$(PY) scripts/export_openapi.py
