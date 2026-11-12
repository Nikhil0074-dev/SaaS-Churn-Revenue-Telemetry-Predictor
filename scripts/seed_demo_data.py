#!/usr/bin/env python
"""Create the demo workspace (synthetic data) and optionally export the sample CSV bundle.

    python scripts/seed_demo_data.py                 # uses DATABASE_URL (default sqlite:///./churn_dev.db)
    python scripts/seed_demo_data.py --export-csv ml/data/sample
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / "backend"), str(ROOT / "ml")]

from app.core.config import get_settings
from app.db import models  # noqa: F401
from app.db.session import Base, make_engine, make_session_factory


def export_csv(out: Path, n: int, days: int, seed: int) -> None:
    import pandas as pd
    from churn_ml.synthetic import generate_demo_data
    d = generate_demo_data(n, days, seed, as_of=pd.Timestamp.now("UTC").floor("D"))
    out.mkdir(parents=True, exist_ok=True)
    d["customers"].to_csv(out / "customers.csv", index=False, date_format="%Y-%m-%dT%H:%M:%SZ")
    s = d["subscriptions"].copy()
    s["recurring_amount"] = (s.pop("recurring_amount_cents") / 100).map(lambda v: f"{v:.2f}")
    s.to_csv(out / "subscriptions.csv", index=False, date_format="%Y-%m-%dT%H:%M:%SZ")
    e = d["events"][["event_id", "customer_id", "event_type", "event_timestamp", "feature"]].copy()
    e["properties"] = e.pop("feature").map(lambda f: f'{{"feature": "{f}"}}' if isinstance(f, str) else "")
    e = e.rename(columns={"event_timestamp": "timestamp"})
    e["source"] = "demo"
    e.to_csv(out / "events.csv", index=False, date_format="%Y-%m-%dT%H:%M:%SZ")
    p = d["payments"].copy()
    p["amount"] = (p.pop("amount_cents") / 100).map(lambda v: f"{v:.2f}")
    p["external_ref"] = [f"demo-pay-{i}" for i in range(len(p))]
    p.rename(columns={"subscription_id": "external_subscription_id"}).to_csv(out / "payments.csv", index=False, date_format="%Y-%m-%dT%H:%M:%SZ")
    print(f"wrote CSV bundle to {out} (SYNTHETIC demonstration data)")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--customers", type=int, default=450)
    ap.add_argument("--days", type=int, default=400)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--no-train", action="store_true")
    ap.add_argument("--export-csv", type=Path, help="write a CSV bundle for the import endpoints instead of seeding the database")
    args = ap.parse_args()
    if args.export_csv:
        export_csv(args.export_csv, args.customers, args.days, args.seed)
        return
    from app.services.seed import seed_demo
    settings = get_settings()
    engine = make_engine(settings.database_url)
    Base.metadata.create_all(engine)  # for a migrated database run `alembic upgrade head` first; this is then a no-op
    factory = make_session_factory(engine)
    with factory() as db:
        res = seed_demo(db, settings, factory, args.customers, args.days, args.seed, train=not args.no_train)
    print("Demo workspace ready (synthetic data).")
    print(f"  organization id : {res['organization_id']}")
    print(f"  loaded          : {res['loaded']}")
    print(f"  model           : {res.get('model')}")
    print(f"  predictions     : {res['predictions']['mode']}, scored={res['predictions']['scored']}")
    print(f"  sign in as      : {', '.join(res['users'])}  password: {res['password']}")


if __name__ == "__main__":
    main()
