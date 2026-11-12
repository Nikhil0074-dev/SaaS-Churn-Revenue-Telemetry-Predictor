"""Evaluation metrics: class-sensitive metrics, calibration, baselines, bootstrap comparison."""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.metrics import average_precision_score, brier_score_loss, roc_auc_score


def _f(x):
    return None if x is None or (isinstance(x, float) and np.isnan(x)) else float(x)


def safe_auc(y, p):
    y = np.asarray(y)
    return _f(roc_auc_score(y, p)) if len(np.unique(y)) == 2 else None


def safe_ap(y, p):
    y = np.asarray(y)
    return _f(average_precision_score(y, p)) if y.sum() > 0 else None


def confusion_at(y, p, threshold: float) -> dict:
    y, p = np.asarray(y).astype(int), np.asarray(p)
    pred = (p >= threshold).astype(int)
    tp = int(((pred == 1) & (y == 1)).sum()); fp = int(((pred == 1) & (y == 0)).sum())
    tn = int(((pred == 0) & (y == 0)).sum()); fn = int(((pred == 0) & (y == 1)).sum())
    precision = tp / (tp + fp) if tp + fp else None
    recall = tp / (tp + fn) if tp + fn else None
    f1 = 2 * precision * recall / (precision + recall) if precision and recall else (0.0 if precision is not None and recall is not None else None)
    return {
        "threshold": float(threshold), "tp": tp, "fp": fp, "tn": tn, "fn": fn,
        "precision": _f(precision), "recall": _f(recall), "f1": _f(f1),
        "false_positive_rate": _f(fp / (fp + tn)) if fp + tn else None,
        "false_negative_rate": _f(fn / (fn + tp)) if fn + tp else None,
        "flagged_fraction": float((tp + fp) / max(len(y), 1)),
    }


def evaluate_scores(y, p, threshold: float) -> dict:
    y = np.asarray(y).astype(int)
    out = {"n": len(y), "positives": int(y.sum()), "prevalence": float(y.mean()) if len(y) else None,
           "roc_auc": safe_auc(y, p), "pr_auc": safe_ap(y, p),
           "brier": _f(brier_score_loss(y, np.clip(p, 0, 1))) if len(y) else None}
    out.update(confusion_at(y, p, threshold))
    return out


def calibration_table(y, p, bins: int = 10) -> dict:
    y, p = np.asarray(y).astype(int), np.asarray(p)
    if len(y) < bins * 2:
        bins = max(2, len(y) // 2)
    df = pd.DataFrame({"y": y, "p": p})
    df["bin"] = pd.qcut(df["p"].rank(method="first"), bins, labels=False)
    rows = [{"bin": int(b), "n": len(g), "mean_predicted": float(g.p.mean()), "observed_rate": float(g.y.mean())}
            for b, g in df.groupby("bin")]
    ece = float(sum(r["n"] * abs(r["mean_predicted"] - r["observed_rate"]) for r in rows) / len(df))
    return {"bins": rows, "ece": ece}


def threshold_table(y, p, flagged_fractions=(0.02, 0.05, 0.10, 0.20, 0.30)) -> list[dict]:
    rows = []
    for ff in flagged_fractions:
        thr = float(np.quantile(p, 1 - ff))
        c = confusion_at(y, p, thr)
        rows.append({"target_flagged_fraction": ff, **{k: c[k] for k in ("threshold", "precision", "recall", "f1", "flagged_fraction")}})
    return rows


def segment_metrics(df: pd.DataFrame, p, by: str, threshold: float) -> dict:
    out = {}
    d = df.assign(_p=np.asarray(p))
    for key, g in d.groupby(by):
        c = confusion_at(g["churned_within_horizon"], g["_p"], threshold)
        out[str(key)] = {"n": len(g), "positives": int(g["churned_within_horizon"].sum()),
                         "roc_auc": safe_auc(g["churned_within_horizon"], g["_p"]),
                         "precision": c["precision"], "recall": c["recall"]}
    return out


def over_time(df: pd.DataFrame, p) -> list[dict]:
    d = df.assign(_p=np.asarray(p))
    rows = []
    for cut, g in d.groupby("cutoff"):
        rows.append({"cutoff": pd.Timestamp(cut).isoformat(), "n": len(g),
                     "positives": int(g["churned_within_horizon"].sum()),
                     "roc_auc": safe_auc(g["churned_within_horizon"], g["_p"]),
                     "pr_auc": safe_ap(g["churned_within_horizon"], g["_p"])})
    return rows


def bootstrap_pr_auc_diff(y, p_model, p_base, groups, n_boot: int = 300, seed: int = 0) -> dict:
    """Customer-clustered bootstrap of PR-AUC(model) - PR-AUC(baseline)."""
    rng = np.random.default_rng(seed)
    y, pm, pb, g = map(np.asarray, (y, p_model, p_base, groups))
    uniq = np.unique(g)
    index_by = {u: np.where(g == u)[0] for u in uniq}
    diffs = []
    for _ in range(n_boot):
        pick = rng.choice(uniq, size=len(uniq), replace=True)
        idx = np.concatenate([index_by[u] for u in pick])
        if y[idx].sum() == 0:
            continue
        diffs.append(average_precision_score(y[idx], pm[idx]) - average_precision_score(y[idx], pb[idx]))
    if not diffs:
        return {"mean": None, "ci_low": None, "ci_high": None, "n_boot": 0}
    lo, hi = np.percentile(diffs, [2.5, 97.5])
    return {"mean": float(np.mean(diffs)), "ci_low": float(lo), "ci_high": float(hi), "n_boot": len(diffs)}
