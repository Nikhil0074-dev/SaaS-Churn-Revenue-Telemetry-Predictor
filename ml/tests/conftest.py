import sys
from pathlib import Path

import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from churn_ml.subscriptions import normalize_changes  # noqa: E402
from churn_ml.synthetic import generate_demo_data  # noqa: E402

T0 = pd.Timestamp("2026-01-01", tz="UTC")


def D(n):
    return T0 + pd.Timedelta(days=n)


def change(i, sub, cust, ctype, day, status="active", plan="growth", amount=10000, interval="month", cancel=False, reason=None, count=1, cur="usd"):
    return dict(id=i, subscription_id=sub, customer_id=cust, change_type=ctype, occurred_at=D(day), status=status, plan_id=plan,
                amount_cents=amount, interval=interval, interval_count=count, currency=cur, cancel_at_period_end=cancel, reason=reason)


@pytest.fixture(scope="session")
def demo_data():
    return generate_demo_data(300, 340, seed=3, as_of="2026-10-01")


@pytest.fixture
def small_changes():
    rows = [
        change(1, 1, 1, "created", 0),
        change(2, 2, 2, "created", 0), change(3, 2, 2, "canceled", 40, status="canceled", reason="customer_request"),
        change(4, 3, 3, "created", 0), change(5, 3, 3, "status_changed", 30, status="past_due"),
        change(6, 3, 3, "canceled", 45, status="canceled", reason="payment_failed"),
        change(7, 4, 4, "created", 0), change(8, 4, 4, "downgraded", 35, amount=5000, plan="starter"),
        change(9, 5, 5, "created", 0), change(10, 5, 5, "cancel_scheduled", 33, cancel=True),
    ]
    return normalize_changes(pd.DataFrame(rows))
