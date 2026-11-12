import numpy as np
import pandas as pd

from churn_ml.config import ALL_FEATURES
from churn_ml.features import build_features
from churn_ml.subscriptions import normalize_changes
from conftest import D, change


def ev(cid, typ, day, hour=0, feature=None):
    return dict(customer_id=cid, event_type=typ, event_timestamp=D(day) + pd.Timedelta(hours=hour), feature=feature)


def customers(ids, signup=0):
    return pd.DataFrame({"customer_id": ids, "signed_up_at": [D(signup)] * len(ids)})


def test_feature_values_known_case():
    ch = normalize_changes(pd.DataFrame([change(1, 1, 1, "created", 0)]))
    cut = D(100)
    events = pd.DataFrame(
        [ev(1, "session_started", 95), ev(1, "session_started", 95, 3), ev(1, "session_started", 80), ev(1, "session_started", 55),
         ev(1, "feature_used", 95, feature="reports"), ev(1, "feature_used", 80, feature="api"), ev(1, "feature_used", 80, 2, feature="api"),
         ev(1, "onboarding_completed", 3)])
    pays = pd.DataFrame([dict(customer_id=1, status="failed", occurred_at=D(90)), dict(customer_id=1, status="failed", occurred_at=D(40)),
                         dict(customer_id=1, status="succeeded", occurred_at=D(92))])
    f = build_features(customers([1]), ch, events, pays, cut).loc[1]
    assert f["sessions_30"] == 3 and f["sessions_prev_30"] == 1
    assert f["active_days_7"] == 1 and f["active_days_30"] == 2 and f["active_days_prev_30"] == 1
    assert abs(f["days_since_last_activity"] - 4.875) < 1e-9   # last event day 95 at 03:00, cutoff day 100 at 00:00
    assert f["feature_adoption_count"] == 2
    assert f["onboarding_completed"] == 1
    assert f["payment_failures_30"] == 1 and f["payment_failures_90"] == 2
    assert f["subscription_tenure_days"] == 100
    assert f["activity_change_ratio"] == (3 - 1) / (1 + 1)
    assert f["plan_id"] == "growth" and f["billing_interval"] == "month"


def test_no_target_leakage_future_data_changes_nothing():
    """Adding any event/payment/subscription change at or after the cutoff must not alter features."""
    ch = normalize_changes(pd.DataFrame([change(1, 1, 1, "created", 0)]))
    cut = D(60)
    base_ev = pd.DataFrame([ev(1, "session_started", 50), ev(1, "feature_used", 50, feature="a")])
    base_pay = pd.DataFrame([dict(customer_id=1, status="failed", occurred_at=D(55))])
    f0 = build_features(customers([1]), ch, base_ev, base_pay, cut)
    future_ev = pd.concat([base_ev, pd.DataFrame([ev(1, "session_started", 60), ev(1, "session_started", 61), ev(1, "onboarding_completed", 62),
                                                  ev(1, "feature_used", 70, feature="zzz")])])
    future_pay = pd.concat([base_pay, pd.DataFrame([dict(customer_id=1, status="failed", occurred_at=D(60)), dict(customer_id=1, status="failed", occurred_at=D(65))])])
    future_ch = normalize_changes(pd.DataFrame([change(1, 1, 1, "created", 0), change(2, 1, 1, "canceled", 61, status="canceled"),
                                                change(3, 1, 1, "downgraded", 62, amount=1, plan="x")]))
    f1 = build_features(customers([1]), future_ch, future_ev, future_pay, cut)
    pd.testing.assert_frame_equal(f0, f1)


def test_event_exactly_at_cutoff_is_excluded():
    ch = normalize_changes(pd.DataFrame([change(1, 1, 1, "created", 0)]))
    e = pd.DataFrame([ev(1, "session_started", 60)])
    assert build_features(customers([1]), ch, e, None, D(60)).loc[1, "sessions_30"] == 0


def test_all_paying_at_day_36(small_changes):
    # customer 2 cancels on day 40 and customer 3 (past_due since day 30) on day 45: both still count at day 36
    f = build_features(customers([1, 2, 3, 4, 5]), small_changes, None, None, D(36))
    assert set(f.index) == {1, 2, 3, 4, 5}
    assert f.loc[3, "past_due"] == 1 and f.loc[5, "cancel_at_period_end"] == 1
    # after both cancellations only customers 1, 4, 5 remain eligible
    assert set(build_features(customers([1, 2, 3, 4, 5]), small_changes, None, None, D(50)).index) == {1, 4, 5}


def test_eligibility_exact():
    ch = normalize_changes(pd.DataFrame([change(1, 1, 1, "created", 0), change(2, 1, 1, "canceled", 10, status="canceled"),
                                         change(3, 2, 2, "created", 0, status="trialing"), change(4, 3, 3, "created", 0, status="past_due")]))
    f = build_features(customers([1, 2, 3]), ch, None, None, D(20))
    assert list(f.index) == [3]                  # canceled and trialing excluded, past_due included
    assert f.loc[3, "past_due"] == 1


def test_columns_and_dtypes_and_inactivity_fallback():
    ch = normalize_changes(pd.DataFrame([change(1, 1, 1, "created", 0)]))
    f = build_features(customers([1]), ch, None, None, D(40))
    assert list(f.columns) == ALL_FEATURES
    assert f.loc[1, "days_since_last_activity"] == 40       # never active -> tenure
    assert not f.drop(columns=["plan_id", "billing_interval"]).isna().any().any()


def test_downgrade_and_cancel_flags():
    ch = normalize_changes(pd.DataFrame([change(1, 1, 1, "created", 0), change(2, 1, 1, "downgraded", 20, amount=5000, plan="starter"),
                                         change(3, 1, 1, "cancel_scheduled", 30, amount=5000, plan="starter", cancel=True)]))
    f = build_features(customers([1]), ch, None, None, D(40)).loc[1]
    assert f["recent_downgrade_90d"] == 1 and f["cancel_at_period_end"] == 1 and f["plan_id"] == "starter"
