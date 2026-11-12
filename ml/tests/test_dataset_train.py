import numpy as np
import pandas as pd
import pytest

from churn_ml.dataset import build_dataset, chronological_split, dataset_version, snapshot_cutoffs
from churn_ml.config import ALL_FEATURES
from churn_ml.explain import explain_frame
from churn_ml.predict import ArtifactError, categorize, load_artifact, predict_proba, save_artifact
from churn_ml.train import InsufficientDataError, TrainConfig, make_pipeline, train_and_evaluate


@pytest.fixture(scope="module")
def dataset(demo_data):
    d = demo_data
    cust = d["customers"].rename(columns={"external_customer_id": "customer_id"})
    cuts = snapshot_cutoffs(d["as_of"] - pd.Timedelta(days=280), d["as_of"] - pd.Timedelta(days=30), 14)
    return build_dataset(cust, d["changes"], d["events"], d["payments"], cuts, 30)


@pytest.fixture(scope="module")
def trained(dataset):
    return train_and_evaluate(dataset, TrainConfig(n_bootstrap=60))


def test_synthetic_generator_is_deterministic():
    from churn_ml.synthetic import generate_demo_data
    a = generate_demo_data(40, 120, seed=5, as_of="2026-06-01")
    b = generate_demo_data(40, 120, seed=5, as_of="2026-06-01")
    pd.testing.assert_frame_equal(a["events"], b["events"])
    pd.testing.assert_frame_equal(a["changes"], b["changes"])


def test_dataset_shape_and_labels(dataset):
    assert {"cutoff", "customer_id", "churned_within_horizon", *ALL_FEATURES} <= set(dataset.columns)
    assert set(dataset["churned_within_horizon"].unique()) <= {0, 1}
    assert 0.01 < dataset["churned_within_horizon"].mean() < 0.3
    # labels are complete: every cutoff + horizon <= as_of
    assert dataset["cutoff"].max() + pd.Timedelta(days=30) <= pd.Timestamp("2026-10-01", tz="UTC")


def test_chronological_split_has_embargo_and_no_overlap(dataset):
    sp = chronological_split(dataset, 30)
    h = pd.Timedelta(days=30)
    assert sp["train_pool"]["cutoff"].max() + h <= sp["test"]["cutoff"].min()
    assert sp["train_core"]["cutoff"].max() + h <= sp["validation"]["cutoff"].min()
    assert sp["validation"]["cutoff"].max() < sp["test"]["cutoff"].min()
    assert not set(sp["train_pool"]["cutoff"]) & set(sp["test"]["cutoff"])


def test_split_requires_enough_history():
    df = pd.DataFrame({"cutoff": pd.to_datetime(["2026-01-01", "2026-01-15"], utc=True)})
    with pytest.raises(ValueError):
        chronological_split(df, 30)


def test_training_outputs_and_metrics(trained):
    m = trained.metrics
    assert m["model_name"] == "logistic_regression" and m["horizon_days"] == 30
    for key in ("roc_auc", "pr_auc", "brier", "precision", "recall", "f1", "tp", "fp", "tn", "fn"):
        assert key in m["test"]
    assert 0.0 <= m["test"]["roc_auc"] <= 1.0
    assert m["baselines"]["prior"]["roc_auc"] == 0.5
    assert len(m["ablation"]) == 5 and len(m["calibration"]["bins"]) >= 2
    assert 0 < trained.thresholds["medium"] < trained.thresholds["high"] <= 1
    assert m["comparison"]["required_margin"] == 0.05
    assert isinstance(m["comparison"]["h1_criterion_met"], bool)
    assert any("imbalance" in w.lower() or "overlapping" in w.lower() for w in m["warnings"])


def test_training_is_reproducible(dataset, trained):
    again = train_and_evaluate(dataset, TrainConfig(n_bootstrap=60))
    assert again.metrics["test"]["pr_auc"] == trained.metrics["test"]["pr_auc"]
    assert again.dataset_version == trained.dataset_version == dataset_version(dataset)


def test_probabilities_in_range_and_schema(trained, dataset):
    p = predict_proba(trained.pipeline, dataset.set_index("customer_id").head(50))
    assert ((p >= 0) & (p <= 1)).all() and len(p) == 50
    with pytest.raises(ValueError):
        predict_proba(trained.pipeline, dataset[["customer_id"]].head(3))


def test_handles_missing_values_and_unseen_category(trained, dataset):
    x = dataset.set_index("customer_id").head(5).copy()
    x.iloc[0, x.columns.get_loc("sessions_30")] = np.nan
    x["plan_id"] = "brand_new_plan"
    p = predict_proba(trained.pipeline, x)
    assert not np.isnan(p).any()


def test_artifact_roundtrip_and_tamper_detection(trained, tmp_path, dataset):
    path = tmp_path / "m.joblib"
    sha = save_artifact(path, trained.pipeline, {"v": 1})
    art = load_artifact(path, sha)
    x = dataset.set_index("customer_id").head(10)
    assert np.allclose(predict_proba(art["pipeline"], x), predict_proba(trained.pipeline, x))
    with pytest.raises(ArtifactError):
        load_artifact(path, "0" * 64)
    with pytest.raises(ArtifactError):
        load_artifact(tmp_path / "missing.joblib")


def test_categorize_thresholds():
    t = {"medium": 0.3, "high": 0.6}
    assert [categorize(p, t) for p in (0.0, 0.29, 0.3, 0.59, 0.6, 1.0)] == ["low", "low", "medium", "medium", "high", "high"]
    assert categorize(0.7) == "high"


def test_explanations_are_associations(trained, dataset):
    x = dataset.set_index("customer_id").head(30)
    ex = explain_frame(trained.pipeline, x)
    assert len(ex) == 30
    for e in ex.values():
        assert "do not establish why" in e["disclaimer"]
        assert all(i["contribution"] > 0 for i in e["indicators"])
        assert all(i["feature"] not in ("plan_id", "billing_interval") for i in e["indicators"])


def test_insufficient_data_is_refused(dataset):
    tiny = dataset[dataset["cutoff"].isin(sorted(dataset["cutoff"].unique())[:9])].head(60)
    with pytest.raises(InsufficientDataError):
        train_and_evaluate(tiny)
    with pytest.raises(InsufficientDataError):
        train_and_evaluate(pd.DataFrame())


def test_pipeline_fit_only_on_training_data(dataset):
    sp = chronological_split(dataset, 30)
    pipe = make_pipeline()
    pipe.fit(sp["train_pool"][ALL_FEATURES], sp["train_pool"]["churned_within_horizon"])
    scaler = pipe.named_steps["prep"].named_transformers_["num"].named_steps["sc"]
    train_mean = sp["train_pool"]["sessions_30"].mean()
    names = pipe.named_steps["prep"].transformers_[0][2]
    assert abs(scaler.mean_[names.index("sessions_30")] - train_mean) < 1e-6


def test_indicators_never_list_improving_signals_as_risk(trained, dataset):
    """A rising-activity ratio, completed onboarding, zero payment failures etc. must not appear as a risk indicator."""
    snap = dataset[dataset["cutoff"] == dataset["cutoff"].max()].set_index("customer_id")   # one row per customer
    assert snap.index.is_unique and len(snap) > 50
    ex = explain_frame(trained.pipeline, snap)
    seen = 0
    for cid, e in ex.items():
        row = snap.loc[cid]
        for ind in e["indicators"]:
            seen += 1
            if ind["feature"] == "activity_change_ratio":
                assert row["activity_change_ratio"] < 0
            if ind["feature"] == "onboarding_completed":
                assert row["onboarding_completed"] == 0
            if ind["feature"] == "payment_failures_30":
                assert row["payment_failures_30"] > 0
    assert seen > 0
