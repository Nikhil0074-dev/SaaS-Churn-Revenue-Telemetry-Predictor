# ml/

`churn_ml/` is the framework-independent ML package (no database or web imports): `labels`, `features`, `dataset`, `train`, `evaluate`, `predict`, `explain`, `synthetic`.
Methodology: [../docs/model-methodology.md](../docs/model-methodology.md). Tests: `ml/tests` (run from `backend/`: `python -m pytest ../ml/tests`).

* `data/sample/` — a small **synthetic** CSV bundle (150 customers) for trying the import endpoints. Regenerate: `python scripts/seed_demo_data.py --export-csv ml/data/sample --customers 150 --days 300`.
* `data/raw`, `data/processed` — for your own datasets; git-ignored because they may contain customer data.
* `artifacts/` — versioned model files written by training (git-ignored; each is checksum-verified on load).
* `notebooks/` — exploratory work goes here; none is required to run the platform.
