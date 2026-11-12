#!/usr/bin/env python
"""Import CSV files into an organization without going through the HTTP API.

    python scripts/import_csv.py --org-id 1 ml/data/sample        # imports customers, subscriptions, events, payments
    python scripts/import_csv.py --org-id 1 --kind customers customers.csv

Imports are idempotent (re-running adds nothing). Column formats are documented in docs/data-dictionary.md.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / "backend"), str(ROOT / "ml")]

from app.core.config import get_settings
from app.db.models import Organization
from app.db.session import make_engine, make_session_factory
from app.services.imports import KINDS, import_csv


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("path", type=Path, help="a CSV file (with --kind) or a directory containing customers/subscriptions/events/payments.csv")
    ap.add_argument("--org-id", type=int, required=True)
    ap.add_argument("--kind", choices=KINDS, help="required when path is a single file")
    args = ap.parse_args()

    if args.path.is_dir():
        jobs = [(k, args.path / f"{k}.csv") for k in KINDS if (args.path / f"{k}.csv").exists()]  # dependency order
    elif args.kind:
        jobs = [(args.kind, args.path)]
    else:
        ap.error("--kind is required when importing a single file")
    factory = make_session_factory(make_engine(get_settings().database_url))
    with factory() as db:
        org = db.get(Organization, args.org_id)
        if org is None:
            print(f"organization {args.org_id} not found", file=sys.stderr)
            return 2
        failed = False
        for kind, file in jobs:
            r = import_csv(db, org, kind, file.read_text(encoding="utf-8-sig"))
            print(f"{kind:14s} imported={r['imported']} skipped={r['skipped']} errors={r['error_count']}")
            for e in r["errors"][:5]:
                print(f"   row {e['row']}: {e['message']}")
            failed |= r["error_count"] > 0
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
