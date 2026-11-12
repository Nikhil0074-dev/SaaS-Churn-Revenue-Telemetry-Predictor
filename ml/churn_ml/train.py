"""Training + evaluation of the Logistic Regression churn model, with baselines and ablation."""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

from . import evaluate as ev
from .config import (
    ALL_FEATURES,
    CATEGORICAL_FEATURES,
    FEATURE_GROUPS,
    MEANINGFUL_IMPROVEMENT_PR_AUC,
    NUMERIC_FEATURES,
)
from .dataset import chronological_split, dataset_version

MODEL_NAME = "logistic_regression"


class InsufficientDataError(ValueError):
    """Raised when history is too small/imbalanced to train a trustworthy model."""


@dataclass
class TrainConfig:
    horizon_days: int = 30
    C: float = 1.0
    class_weight: str | None = None  # None keeps probabilities closer to calibrated; "balanced" boosts recall
    seed: int = 42
    n_test_snapshots: int | None = None
    n_val_snapshots: int = 2
    capacity_high: float = 0.08      # share of customers the team can work as "high"
    capacity_medium: float = 0.20    # share flagged medium-or-above
    min_train_rows: int = 200
    min_train_positives: int = 20
    min_test_positives: int = 5
    n_bootstrap: int = 300
    run_ablation: bool = True


@dataclass
class TrainResult:
    pipeline: Pipeline
    metrics: dict
    thresholds: dict
    dataset_version: str
    warnings: list = field(default_factory=list)


def make_pipeline(groups=("engagement", "subscription", "payment"), C=1.0, class_weight=None, seed=42) -> Pipeline:
    cols = [c for g in groups for c in FEATURE_GROUPS[g]]
    num = [c for c in NUMERIC_FEATURES if c in cols]
    cat = [c for c in CATEGORICAL_FEATURES if c in cols]
    transformers = []
    if num:
        transformers.append(("num", Pipeline([("imp", SimpleImputer(strategy="median")), ("sc", StandardScaler())]), num))
    if cat:
        transformers.append(("cat", Pipeline([("imp", SimpleImputer(strategy="most_frequent")),
                                              ("oh", OneHotEncoder(handle_unknown="ignore", sparse_output=False))]), cat))
    prep = ColumnTransformer(transformers, remainder="drop", verbose_feature_names_out=True)
    clf = LogisticRegression(C=C, max_iter=2000, class_weight=class_weight, random_state=seed)
    return Pipeline([("prep", prep), ("clf", clf)])


def _fit(df: pd.DataFrame, cfg: TrainConfig, groups=("engagement", "subscription", "payment")) -> Pipeline:
    pipe = make_pipeline(groups, cfg.C, cfg.class_weight, cfg.seed)
    pipe.fit(df[ALL_FEATURES], df["churned_within_horizon"].astype(int))
    return pipe


def _proba(pipe, df):
    return pipe.predict_proba(df[ALL_FEATURES])[:, 1]


def train_and_evaluate(dataset: pd.DataFrame, cfg: TrainConfig | None = None) -> TrainResult:
    cfg = cfg or TrainConfig()
    if dataset is None or dataset.empty:
        raise InsufficientDataError("no labeled snapshots could be built from the available history")
    try:
        split = chronological_split(dataset, cfg.horizon_days, cfg.n_test_snapshots, cfg.n_val_snapshots)
    except ValueError as exc:
        raise InsufficientDataError(str(exc)) from exc
    pool, core, val, test = split["train_pool"], split["train_core"], split["validation"], split["test"]
    ypool = pool["churned_within_horizon"].astype(int)
    if len(pool) < cfg.min_train_rows or ypool.sum() < cfg.min_train_positives or ypool.nunique() < 2:
        raise InsufficientDataError(
            f"training data too small: {len(pool)} rows / {int(ypool.sum())} churn examples "
            f"(need >= {cfg.min_train_rows} rows and >= {cfg.min_train_positives} churn examples)")
    if test["churned_within_horizon"].sum() < cfg.min_test_positives:
        raise InsufficientDataError(f"held-out period has fewer than {cfg.min_test_positives} churn examples")

    warnings = []
    # 1) thresholds from a model fit on train_core and scored on validation (never on test)
    val_pipe = _fit(core, cfg)
    pv = _proba(val_pipe, val)
    t_med = float(np.quantile(pv, 1 - cfg.capacity_medium))
    t_high = float(np.quantile(pv, 1 - cfg.capacity_high))
    if t_high <= t_med:
        t_high = t_med + 1e-6
    thresholds = {"medium": t_med, "high": t_high,
                  "basis": f"validation-set quantiles for team capacity (high={cfg.capacity_high:.0%}, medium+={cfg.capacity_medium:.0%})"}

    # 2) final model fit on the full pre-test pool; evaluated once on the held-out test period
    pipe = _fit(pool, cfg)
    y = test["churned_within_horizon"].astype(int).values
    p = _proba(pipe, test)
    test_metrics = ev.evaluate_scores(y, p, t_high)
    medium_plus = ev.confusion_at(y, p, t_med)

    # baselines evaluated on the same test period
    prior = float(ypool.mean())
    base_prior = ev.evaluate_scores(y, np.full(len(y), prior), 1.0)
    dsl = test["days_since_last_activity"].values.astype(float)
    base_dsl_score = dsl / max(dsl.max(), 1.0)
    base_dsl = {"roc_auc": ev.safe_auc(y, base_dsl_score), "pr_auc": ev.safe_ap(y, base_dsl_score),
                "description": "ranks customers by days since last activity (no model)"}
    best_name, best_scores = max([("days_since_last_activity", base_dsl_score), ("prior", np.full(len(y), prior))],
                                 key=lambda kv: ev.safe_ap(y, kv[1]) or 0)
    best_pr = ev.safe_ap(y, best_scores)
    boot = ev.bootstrap_pr_auc_diff(y, p, best_scores + np.random.default_rng(cfg.seed).normal(0, 1e-9, len(y)),
                                    test["customer_id"].values, cfg.n_bootstrap, cfg.seed)
    diff = (test_metrics["pr_auc"] or 0) - (best_pr or 0)
    met = bool(diff >= MEANINGFUL_IMPROVEMENT_PR_AUC and boot["ci_low"] is not None and boot["ci_low"] > 0)
    comparison = {
        "best_baseline": best_name, "pr_auc_model": test_metrics["pr_auc"], "pr_auc_best_baseline": best_pr,
        "pr_auc_difference": float(diff), "bootstrap": boot, "required_margin": MEANINGFUL_IMPROVEMENT_PR_AUC,
        "h1_criterion_met": met,
        "statement": ("H1 criterion met on this held-out period: " if met else "H1 criterion NOT met on this held-out period: ")
        + f"PR-AUC {test_metrics['pr_auc']:.3f} vs best baseline ({best_name}) {best_pr:.3f}, difference {diff:+.3f} "
        f"(95% CI {boot['ci_low'] if boot['ci_low'] is None else round(boot['ci_low'], 3)} to "
        f"{boot['ci_high'] if boot['ci_high'] is None else round(boot['ci_high'], 3)}; required >= +{MEANINGFUL_IMPROVEMENT_PR_AUC}).",
    }

    ablation = []
    if cfg.run_ablation:
        sets = {"engagement only": ("engagement",), "subscription only": ("subscription",), "payment only": ("payment",),
                "engagement + subscription": ("engagement", "subscription"), "all feature groups": tuple(FEATURE_GROUPS)}
        for name, groups in sets.items():
            pp = _fit(pool, cfg, groups)
            pr = _proba(pp, test)
            ablation.append({"feature_set": name, "roc_auc": ev.safe_auc(y, pr), "pr_auc": ev.safe_ap(y, pr),
                             "brier": ev._f(float(np.mean((pr - y) ** 2)))})

    names = list(pipe.named_steps["prep"].get_feature_names_out())
    coefs = sorted(({"feature": n, "coefficient": float(c)} for n, c in zip(names, pipe.named_steps["clf"].coef_[0], strict=True)),
                   key=lambda d: abs(d["coefficient"]), reverse=True)

    prevalence = float(dataset["churned_within_horizon"].mean())
    if prevalence < 0.05:
        warnings.append(f"Class imbalance: only {prevalence:.1%} of snapshots churn; rely on PR-AUC/recall, not accuracy.")
    if test_metrics["positives"] < 30:
        warnings.append(f"Only {test_metrics['positives']} churn examples in the test period; metrics are noisy.")
    if len(dataset["customer_id"].unique()) < 200:
        warnings.append("Fewer than 200 distinct customers; segment-level results are unreliable.")
    warnings.append("Snapshots 14 days apart share customers and overlapping label windows; effective sample size is smaller than the row count.")

    metrics = {
        "model_name": MODEL_NAME, "horizon_days": cfg.horizon_days,
        "config": {"C": cfg.C, "class_weight": cfg.class_weight, "seed": cfg.seed},
        "dataset": {"version": dataset_version(dataset), "rows": len(dataset),
                    "customers": int(dataset["customer_id"].nunique()), "positive_rate": prevalence,
                    "first_cutoff": pd.Timestamp(dataset["cutoff"].min()).isoformat(),
                    "last_cutoff": pd.Timestamp(dataset["cutoff"].max()).isoformat(),
                    "churn_types": dataset.loc[dataset["churned_within_horizon"] == 1, "churn_type"].value_counts().to_dict()},
        "split": split["info"],
        "test": test_metrics, "test_at_medium_threshold": medium_plus,
        "baselines": {"prior": {k: base_prior[k] for k in ("roc_auc", "pr_auc", "brier")}, "days_since_last_activity": base_dsl},
        "comparison": comparison,
        "calibration": ev.calibration_table(y, p),
        "threshold_table": ev.threshold_table(y, p),
        "by_plan": ev.segment_metrics(test, p, "plan_id", t_high),
        "over_time": ev.over_time(test, p),
        "ablation": ablation, "coefficients": coefs[:20],
        "thresholds": thresholds, "warnings": warnings,
    }
    return TrainResult(pipe, metrics, thresholds, metrics["dataset"]["version"], warnings)
