"""Synthetic SaaS data generator for DEMONSTRATION ONLY.

Relationships (disengagement raises churn hazard, failed payments cause involuntary churn, etc.) are planted
by this simulator, so model results on this data demonstrate the pipeline, not real-world predictive power.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

PLANS = [("starter", 2900), ("growth", 9900), ("scale", 29900)]
FEATURES = ["dashboards", "reports", "alerts", "api", "exports", "integrations", "teams", "automation"]
DAY = pd.Timedelta(days=1)


def generate_demo_data(n_customers: int = 450, days: int = 400, seed: int = 7, as_of=None, currency: str = "usd") -> dict:
    rng = np.random.default_rng(seed)
    end = pd.Timestamp(as_of if as_of is not None else pd.Timestamp.now("UTC")).tz_localize("UTC") \
        if pd.Timestamp(as_of if as_of is not None else pd.Timestamp.now("UTC")).tzinfo is None else \
        pd.Timestamp(as_of if as_of is not None else pd.Timestamp.now("UTC")).tz_convert("UTC")
    end = end.floor("D")
    start = end - days * DAY
    customers, changes, events, payments = [], [], [], []
    ch_id = [0]

    def change(sub, cust, ctype, t, status, plan, amount, interval, cancel=False, reason=None):
        ch_id[0] += 1
        changes.append({"id": ch_id[0], "subscription_id": sub, "customer_id": cust, "change_type": ctype, "occurred_at": t,
                            "status": status, "plan_id": plan, "amount_cents": amount, "interval": interval, "interval_count": 1,
                            "currency": currency, "cancel_at_period_end": cancel, "reason": reason})

    def pay(cust, sub, t, status, amount):
        payments.append({"customer_id": cust, "subscription_id": sub, "occurred_at": t, "status": status, "amount_cents": amount, "currency": currency})

    for i in range(1, n_customers + 1):
        cid, sid = f"cus_demo_{i:04d}", f"sub_demo_{i:04d}"
        off = rng.uniform(0, days - 10)
        signup = start + pd.Timedelta(days=float(off))
        plan_i = int(rng.choice(3, p=[0.5, 0.35, 0.15]))
        annual = rng.random() < 0.12
        interval = "year" if annual else "month"
        bill_period = 365 if annual else 30
        def price(pi, annual=annual): return PLANS[pi][1] * (10 if annual else 1)
        customers.append({"external_customer_id": cid, "email": f"user{i:04d}@demo-saas.invalid", "signed_up_at": signup})
        lam = float(rng.lognormal(np.log(2.2 * (1.0, 1.4, 1.9)[plan_i]), 0.5))
        onboarded = rng.random() < 0.72
        onb_day = int(rng.integers(1, 8))
        fragile = rng.random() < 0.25
        dis_p = 0.08 if fragile else 0.02
        risky_pay = rng.random() < 0.12
        pf = 0.20 if risky_pay else 0.04
        k_feat = int(rng.integers(2, 8))
        my_feats = rng.choice(FEATURES, size=k_feat, replace=False)
        trial = rng.random() < 0.2

        n_days = int((end - signup) / DAY)
        n_days = max(n_days, 2)
        # ---- activity intensity path
        decay = np.ones(n_days)
        d, dis = 1.0, False
        for t in range(n_days):
            if t % 7 == 0:
                if not dis and rng.random() < dis_p:
                    dis = True
                elif dis and rng.random() < 0.12:
                    dis, d = False, 1.0
            if dis:
                d = max(0.04, d * 0.96)
            decay[t] = d
        onb_mult = np.where((np.arange(n_days) >= onb_day) & onboarded, 1.0, 0.45)
        sessions = rng.poisson(lam / 7.0 * decay * onb_mult)

        # ---- subscription / billing state machine
        status = "trialing" if trial else "active"
        cur_plan = plan_i
        change(sid, cid, "created", signup, status, PLANS[cur_plan][0], price(cur_plan), interval)
        trial_end = 14 if trial else 0
        if trial:
            if rng.random() < 0.10:
                change(sid, cid, "canceled", signup + 14 * DAY, "canceled", PLANS[cur_plan][0], price(cur_plan), interval, reason="trial_expired")
                churn_day = 14
                status = "canceled"
            else:
                change(sid, cid, "status_changed", signup + trial_end * DAY, "active", PLANS[cur_plan][0], price(cur_plan), interval)
                pay(cid, sid, signup + trial_end * DAY, "succeeded", price(cur_plan))
                status = "active"
                churn_day = None
        else:
            pay(cid, sid, signup, "succeeded", price(cur_plan))
            churn_day = None
        if status == "canceled":
            churn_day = 14
        next_bill = (trial_end or 0) + bill_period
        sched_cancel = False
        retry = []  # list of (day, attempt)
        last_fail_day = -999
        last_down_day = -999
        failed_state = False
        for t in range(max(trial_end, 1), n_days):
            if status == "canceled":
                break
            u = rng.random()
            # plan changes
            if status == "active" and not sched_cancel:
                if cur_plan < 2 and decay[t] > 0.7 and u < 0.0007:
                    cur_plan += 1
                    change(sid, cid, "upgraded", signup + t * DAY, "active", PLANS[cur_plan][0], price(cur_plan), interval)
                    events.append((cid, "subscription_upgraded", signup + t * DAY, None))
                elif cur_plan > 0 and u > 1 - (0.0004 * (6 if decay[t] < 0.5 else 1)):
                    cur_plan -= 1
                    last_down_day = t
                    change(sid, cid, "downgraded", signup + t * DAY, "active", PLANS[cur_plan][0], price(cur_plan), interval)
                    events.append((cid, "subscription_downgraded", signup + t * DAY, None))
            # churn decision
            if status in ("active", "past_due") and not sched_cancel and not failed_state:
                m = (1 if decay[t] > 0.7 else 3 if decay[t] > 0.4 else 8)
                m *= 2.5 if t - last_fail_day <= 30 else 1
                m *= 2 if (not onboarded and t > 14) else 1
                m *= 2.5 if t - last_down_day <= 60 else 1
                h = 0.0011 * m
                decide = rng.random() < h
                if annual:
                    decide = (t % 365 == 0 and t > 0) and rng.random() < min(0.5, 30 * h)
                if decide:
                    if rng.random() < 0.55:
                        sched_cancel = True
                        saved = rng.random() < 0.15
                        change(sid, cid, "cancel_scheduled", signup + t * DAY, status, PLANS[cur_plan][0], price(cur_plan), interval, cancel=True)
                        cancel_day = next_bill if not saved else None
                        unsched_day = t + int(rng.integers(2, 12)) if saved else None
                    else:
                        change(sid, cid, "canceled", signup + t * DAY, "canceled", PLANS[cur_plan][0], price(cur_plan), interval, reason="customer_request")
                        status, churn_day = "canceled", t
                        continue
            if sched_cancel and unsched_day is not None and t == unsched_day and status != "canceled":
                sched_cancel = False
                change(sid, cid, "cancel_unscheduled", signup + t * DAY, status, PLANS[cur_plan][0], price(cur_plan), interval, cancel=False)
                unsched_day = None
            # billing
            if t == next_bill:
                next_bill += bill_period
                if sched_cancel and cancel_day is not None:
                    change(sid, cid, "canceled", signup + t * DAY, "canceled", PLANS[cur_plan][0], price(cur_plan), interval, reason="customer_request")
                    status, churn_day = "canceled", t
                    continue
                if rng.random() < pf:
                    pay(cid, sid, signup + t * DAY, "failed", price(cur_plan))
                    last_fail_day = t
                    failed_state = True
                    if status == "active":
                        status = "past_due"
                        change(sid, cid, "status_changed", signup + t * DAY, "past_due", PLANS[cur_plan][0], price(cur_plan), interval, cancel=sched_cancel)
                    retry = [(t + 3, 2), (t + 7, 3)]
                else:
                    pay(cid, sid, signup + t * DAY, "succeeded", price(cur_plan))
            for rt, att in list(retry):
                if t == rt:
                    retry.remove((rt, att))
                    if rng.random() < 0.6:
                        pay(cid, sid, signup + t * DAY, "succeeded", price(cur_plan))
                        status, failed_state, retry = "active", False, []
                        change(sid, cid, "status_changed", signup + t * DAY, "active", PLANS[cur_plan][0], price(cur_plan), interval)
                    else:
                        pay(cid, sid, signup + t * DAY, "failed", price(cur_plan))
                        last_fail_day = t
                        if att == 3:
                            change(sid, cid, "canceled", signup + t * DAY, "canceled", PLANS[cur_plan][0], price(cur_plan), interval, reason="payment_failed")
                            status, churn_day = "canceled", t
        final_day = churn_day if churn_day is not None else n_days
        final_day = min(final_day, n_days)

        # ---- events
        events.append((cid, "user_registered", signup, None))
        if onboarded and onb_day < final_day:
            events.append((cid, "onboarding_completed", signup + onb_day * DAY + pd.Timedelta(hours=1), None))
        s = sessions[:final_day]
        for t in np.nonzero(s)[0]:
            for _ in range(int(s[t])):
                ts = signup + t * DAY + pd.Timedelta(seconds=int(rng.integers(0, 86400)))
                events.append((cid, "session_started", ts, None))
                if rng.random() < 0.7:
                    events.append((cid, "login", ts - pd.Timedelta(seconds=30), None))
                nf = rng.poisson(1.4 * max(decay[t], 0.2))
                for _f in range(nf):
                    events.append((cid, "feature_used", ts + pd.Timedelta(seconds=int(rng.integers(5, 1800))), str(rng.choice(my_feats))))
                if rng.random() < 0.05:
                    events.append((cid, "project_created", ts + pd.Timedelta(minutes=5), None))
                if rng.random() < 0.08:
                    events.append((cid, "report_generated", ts + pd.Timedelta(minutes=9), None))

    changes_df = pd.DataFrame(changes)
    last = changes_df.sort_values(["occurred_at", "id"]).groupby("subscription_id").tail(1).set_index("subscription_id")
    first = changes_df.sort_values(["occurred_at", "id"]).groupby("subscription_id").head(1).set_index("subscription_id")
    sub_df = pd.DataFrame({
        "external_subscription_id": last.index, "external_customer_id": last["customer_id"].values,
        "plan_id": last["plan_id"].values, "status": last["status"].values, "billing_interval": last["interval"].values,
        "interval_count": 1, "currency": currency, "recurring_amount_cents": last["amount_cents"].values,
        "started_at": first["occurred_at"].reindex(last.index).values,
        "canceled_at": np.where(last["status"].values == "canceled", last["occurred_at"].values, np.datetime64("NaT")),
        "cancel_at_period_end": last["cancel_at_period_end"].values, "cancellation_reason": last["reason"].values,
    })
    ev_df = pd.DataFrame(events, columns=["customer_id", "event_type", "event_timestamp", "feature"])
    ev_df = ev_df[ev_df["event_timestamp"] < end].sort_values("event_timestamp").reset_index(drop=True)
    ev_df["event_id"] = [f"evt_{i:07d}" for i in range(len(ev_df))]
    pay_df = pd.DataFrame(payments)
    pay_df = pay_df[pay_df["occurred_at"] < end].reset_index(drop=True)
    return {"customers": pd.DataFrame(customers), "subscriptions": sub_df, "changes": changes_df[changes_df["occurred_at"] < end],
            "events": ev_df, "payments": pay_df, "as_of": end}
