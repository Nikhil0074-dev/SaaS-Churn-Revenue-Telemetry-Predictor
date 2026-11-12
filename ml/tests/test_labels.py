import pandas as pd

from churn_ml.labels import generate_labels
from conftest import D, change
from churn_ml.subscriptions import normalize_changes


def test_label_definition(small_changes):
    lab = generate_labels(small_changes, [1, 2, 3, 4, 5], D(30), 30).set_index("customer_id")
    assert lab.loc[1, "churned_within_horizon"] == 0            # stayed
    assert lab.loc[2, "churned_within_horizon"] == 1            # voluntary cancel day 40
    assert lab.loc[2, "churn_type"] == "voluntary"
    assert lab.loc[3, "churned_within_horizon"] == 1            # failed payment -> canceled day 45
    assert lab.loc[3, "churn_type"] == "involuntary"
    assert lab.loc[4, "churned_within_horizon"] == 0            # downgrade is not churn
    assert lab.loc[5, "churned_within_horizon"] == 0            # scheduled cancel that has not taken effect is not churn
    assert pd.isna(lab.loc[1, "churn_type"])


def test_cancel_outside_horizon_is_not_churn(small_changes):
    lab = generate_labels(small_changes, [2], D(0), 30).set_index("customer_id")
    assert lab.loc[2, "churned_within_horizon"] == 0            # cancel happens on day 40, horizon ends day 30


def test_resubscription_inside_window_cancels_churn():
    ch = normalize_changes(pd.DataFrame([
        change(1, 1, 1, "created", 0), change(2, 1, 1, "canceled", 10, status="canceled", reason="customer_request"),
        change(3, 2, 1, "created", 20)]))
    lab = generate_labels(ch, [1], D(5), 30)
    assert lab["churned_within_horizon"].iloc[0] == 0


def test_paused_is_not_label_churn():
    ch = normalize_changes(pd.DataFrame([change(1, 1, 1, "created", 0), change(2, 1, 1, "status_changed", 10, status="paused")]))
    assert generate_labels(ch, [1], D(5), 30)["churned_within_horizon"].iloc[0] == 0


def test_empty_ids():
    ch = normalize_changes(pd.DataFrame([change(1, 1, 1, "created", 0)]))
    assert generate_labels(ch, [], D(5), 30).empty
