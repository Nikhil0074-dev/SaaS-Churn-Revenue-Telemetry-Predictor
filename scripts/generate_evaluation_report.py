#!/usr/bin/env python
"""Write a Markdown evaluation report from the stored metrics of an organization's active model.

    python scripts/generate_evaluation_report.py --org-id 1 --out docs/evaluation-report.md

Nothing is computed or estimated here: every number is read from ``model_versions.evaluation_metrics_json``,
which the training pipeline produced on a chronologically held-out period.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / "backend"), str(ROOT / "ml")]

from app.core.config import get_settings
from app.db.models import ModelVersion
from app.db.session import make_engine, make_session_factory
from sqlalchemy import select


def f(v, d=3):
    return "n/a" if v is None else f"{v:.{d}f}"


def pc(v, d=1):
    return "n/a" if v is None else f"{v * 100:.{d}f}%"


def render(m: ModelVersion) -> str:
    e = m.evaluation_metrics_json
    t, ds, sp, cmp_ = e["test"], e["dataset"], e["split"], e["comparison"]
    L = []
    L += [f"# Model evaluation report: {m.model_version}", ""]
    if m.is_synthetic:
        L += [("> **SYNTHETIC DEMONSTRATION DATA.** The simulator plants the relationships the model learns, so these results demonstrate the "
              "pipeline and are **not evidence of real-world predictive power**."), ""]
    L += ["## 1. Setup", "",
          f"- Model: {e['model_name']} (C={e['config']['C']}, class_weight={e['config']['class_weight']}, seed={e['config']['seed']})",
          f"- Prediction horizon: {e['horizon_days']} days",
          f"- Dataset version `{ds['version']}`: {ds['rows']:,} customer-snapshots, {ds['customers']:,} customers, base churn rate {pc(ds['positive_rate'])}",
          f"- Snapshot cutoffs {ds['first_cutoff'][:10]} to {ds['last_cutoff'][:10]} (every 14 days; labels complete)",
          f"- Churn types in positives: {ds['churn_types']}", "",
          "### Chronological split", "", "| Part | First cutoff | Last cutoff | Snapshots |", "|---|---|---|---|"]
    for k in ("train", "train_core", "validation", "test"):
        L.append(f"| {k} | {sp[k]['first'][:10]} | {sp[k]['last'][:10]} | {sp[k]['snapshots']} |")
    L += ["", f"A {sp['embargo_days']}-day embargo separates train, validation and test so that no label window overlaps the next period.", "",
          "## 2. Held-out test results", "",
          f"{t['n']:,} rows, {t['positives']} churn examples (prevalence {pc(t['prevalence'])}).", "",
          "| Metric | Value |", "|---|---|",
          f"| ROC-AUC | {f(t['roc_auc'])} |", f"| PR-AUC | {f(t['pr_auc'])} |", f"| Brier score | {f(t['brier'], 4)} |",
          f"| Calibration error (ECE) | {f(e['calibration']['ece'], 4)} |",
          f"| Precision at high threshold ({pc(t['threshold'])}) | {pc(t['precision'])} |", f"| Recall at high threshold | {pc(t['recall'])} |",
          f"| F1 at high threshold | {f(t['f1'])} |", f"| False-positive rate | {pc(t['false_positive_rate'])} |",
          f"| False-negative rate | {pc(t['false_negative_rate'])} |", "",
          "### Confusion matrix at the high-risk threshold", "", "| | Predicted high | Predicted not high |", "|---|---|---|",
          f"| Churned | {t['tp']} | {t['fn']} |", f"| Stayed | {t['fp']} | {t['tn']} |", "",
          "## 3. Baselines and pre-registered criterion", "", "| Approach | ROC-AUC | PR-AUC |", "|---|---|---|",
          f"| Logistic Regression | {f(t['roc_auc'])} | {f(t['pr_auc'])} |",
          f"| Days since last activity (ranking only) | {f(e['baselines']['days_since_last_activity']['roc_auc'])} | {f(e['baselines']['days_since_last_activity']['pr_auc'])} |",
          f"| Base rate only | {f(e['baselines']['prior']['roc_auc'])} | {f(e['baselines']['prior']['pr_auc'])} |", "",
          f"**{cmp_['statement']}**", "",
          (f"Bootstrap (customer-clustered, {cmp_['bootstrap']['n_boot']} resamples): mean difference {f(cmp_['bootstrap']['mean'])}, "
          f"95% CI [{f(cmp_['bootstrap']['ci_low'])}, {f(cmp_['bootstrap']['ci_high'])}]."), "",
          "## 4. Ablation (feature groups)", "", "| Feature set | ROC-AUC | PR-AUC | Brier |", "|---|---|---|---|"]
    L += [f"| {a['feature_set']} | {f(a['roc_auc'])} | {f(a['pr_auc'])} | {f(a['brier'], 4)} |" for a in e["ablation"]]
    L += ["", "## 5. Calibration (deciles of the test set)", "", "| Bin | Rows | Mean predicted | Observed rate |", "|---|---|---|---|"]
    L += [f"| {b['bin'] + 1} | {b['n']} | {pc(b['mean_predicted'])} | {pc(b['observed_rate'])} |" for b in e["calibration"]["bins"]]
    L += ["", "## 6. Outreach capacity (threshold table)", "", "| Flag top | Threshold | Precision | Recall |", "|---|---|---|---|"]
    L += [f"| {pc(r['target_flagged_fraction'], 0)} | {pc(r['threshold'])} | {pc(r['precision'])} | {pc(r['recall'])} |" for r in e["threshold_table"]]
    L += ["", f"Active risk thresholds: medium {pc(e['thresholds']['medium'])}, high {pc(e['thresholds']['high'])} ({e['thresholds']['basis']}).", "",
          "## 7. Performance by plan (test period)", "", "| Plan | Rows | Churn examples | ROC-AUC | Precision | Recall |", "|---|---|---|---|---|---|"]
    L += [f"| {k} | {v['n']} | {v['positives']} | {f(v['roc_auc'])} | {pc(v['precision'])} | {pc(v['recall'])} |" for k, v in e["by_plan"].items()]
    L += ["", "## 8. Performance over time (test cutoffs)", "", "| Cutoff | Rows | Churn examples | ROC-AUC | PR-AUC |", "|---|---|---|---|---|"]
    L += [f"| {r['cutoff'][:10]} | {r['n']} | {r['positives']} | {f(r['roc_auc'])} | {f(r['pr_auc'])} |" for r in e["over_time"]]
    L += ["", "## 9. Largest coefficients (standardized log-odds)", "", "| Feature | Coefficient |", "|---|---|"]
    L += [f"| {c['feature']} | {c['coefficient']:+.3f} |" for c in e["coefficients"][:10]]
    L += ["", "## 10. Warnings and limitations", ""] + [f"- {w}" for w in e["warnings"]]
    L += ["- Coefficients are associations in this dataset, not causal effects.",
          ("- A scheduled cancellation is a legitimate, observable feature but is very strongly associated with churn; models that include it "
          "rank already-announced cancellations highest. Remove `cancel_at_period_end` if you want to predict *unannounced* churn."),
          "- One-hot coefficients for billing interval are strongly anti-correlated by construction.",
          "- Results describe a historical held-out period, not outcomes for current customers.", ""]
    return "\n".join(L)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--org-id", type=int, required=True)
    ap.add_argument("--out", type=Path, default=Path("docs/evaluation-report.md"))
    args = ap.parse_args()
    factory = make_session_factory(make_engine(get_settings().database_url))
    with factory() as db:
        m = db.execute(select(ModelVersion).where(ModelVersion.organization_id == args.org_id, ModelVersion.status == "active")).scalar_one_or_none()
        if m is None or not (m.evaluation_metrics_json or {}).get("test"):
            print("no active model with evaluation metrics for this organization", file=sys.stderr)
            return 1
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(render(m), encoding="utf-8")
    print(f"wrote {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
