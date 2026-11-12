export type Risk = 'low' | 'medium' | 'high' | 'unscored'

export interface Me {
  user: { id: number; email: string; full_name: string | null; is_platform_admin: boolean }
  organization: { id: number; name: string; default_currency: string; is_demo: boolean; settings: Record<string, unknown> }
  role: 'owner' | 'analyst' | 'csm' | 'viewer'
  permissions: string[]
}
export interface Page<T> { total: number; page: number; page_size: number; items: T[] }
export interface Customer {
  id: number; external_customer_id: string; email: string | null; signed_up_at: string | null; subscription_status: string | null
  plan_id: string | null; mrr_cents: number; currency: string | null; last_activity_at: string | null; payment_issue: boolean
  churn_probability: number | null; risk_category: Risk; last_prediction_at: string | null
}
export interface HighRiskRow {
  id: number; external_customer_id: string; email: string | null; plan_id: string | null; mrr_cents: number; currency: string | null
  last_activity_at: string | null; churn_probability: number; risk_category: Risk; indicators: string[]
  expected_revenue_at_risk_cents: number; assigned_to: string | null; next_action: string | null; next_action_status: string | null
}
export interface Metrics {
  currency: string; mrr_start_cents: number; mrr_end_cents: number; arr_end_cents: number; customers_start: number; customers_end: number
  churned_customers: number; new_customers: number; customer_churn_rate: number | null; churned_mrr_cents: number
  contraction_mrr_cents: number; expansion_mrr_cents: number; new_mrr_cents: number; gross_revenue_churn_rate: number | null
  net_revenue_retention: number | null; payment_failures: number; payment_attempts: number; payment_failure_rate: number | null
  customer_growth: number; excluded_currencies: Record<string, number>
}
export interface Summary {
  period: { start: string; end: string }; currency: string; metrics: Metrics
  previous_period: { mrr_end_cents: number; customers_end: number; customer_churn_rate: number | null }
  movement: { new_subscriptions: number; cancellations: number; upgrades: number; downgrades: number; scheduled_cancellations: number }
  risk: { high_risk_customers: number; scored_customers: number; revenue_at_risk_cents: number; thresholds: { medium: number; high: number; source: string }; model_version: string | null }
  definitions: Record<string, string>; warnings: { code: string; message: string }[]
}
export interface SeriesPoint {
  month: string; mrr_cents: number; new_customers: number; churned_customers: number; churned_mrr_cents: number; new_mrr_cents: number
  expansion_mrr_cents: number; contraction_mrr_cents: number; customers: number; customer_churn_rate: number | null
  payment_failure_rate: number | null; partial: boolean
}
export interface RevenueResp { currency: string; series: SeriesPoint[]; by_plan: { plan_id: string; customers: number; mrr_cents: number }[] }
export interface CohortRow { cohort: string; size: number; retention: number[]; mrr_cents: number[]; last_point_partial: boolean }
export interface ChurnResp {
  currency: string; scored: number
  churn_rate_series: { month: string; customer_churn_rate: number | null; churned_customers: number }[]
  distribution: { risk: string; customers: number; mrr_cents: number }[]
  histogram: { from: number; to: number; customers: number }[]
  by_plan: { plan: string; low: number; medium: number; high: number }[]
  by_tenure: { bucket: string; customers: number; avg_probability: number; high_risk: number }[]
  engagement: { group: string; customers: number; avg_sessions_30d: number; avg_active_days_30d: number; avg_days_since_activity: number }[]
}
export interface Signal { code: string; label: string }
export interface Action {
  id: number; customer_id: number; action_type: string; suggested_step: string | null; priority: 'low' | 'medium' | 'high'
  status: 'suggested' | 'open' | 'in_progress' | 'done' | 'dismissed'; reason: string | null; signals: Signal[]; risk_category: string | null
  source: string; assigned_user_id: number | null; assigned_to: string | null; due_at: string | null; completed_at: string | null
  outcome: string | null; created_at: string; overdue: boolean
  notes: { id: number; kind: string; body: string; created_at: string }[]
  customer?: { id: number; external_customer_id: string; email: string | null; mrr_cents: number; currency: string | null; risk_category: Risk; churn_probability: number | null }
}
export interface Indicator { feature: string; label: string; contribution: number; value: number | null }
export interface CustomerDetail {
  customer: Customer
  prediction: null | { probability: number; risk_category: Risk; generated_at: string; cutoff: string; horizon_days: number
    explanation: { indicators: Indicator[]; protective: Indicator[]; disclaimer: string; model_version: string; thresholds: { medium: number; high: number } } }
  signals: null | Record<string, number | string>
  rule_recommendations: { action_type: string; priority: string; reason: string; suggested_step: string; signals: Signal[] }[]
  actions: Action[]
}
export interface ModelRow {
  id: number; model_version: string; status: string; horizon_days: number; training_completed_at: string | null; dataset_version: string | null
  is_synthetic: boolean; thresholds: { medium: number; high: number; basis?: string } | null; error: string | null
  summary: null | { roc_auc: number | null; pr_auc: number | null; precision: number | null; recall: number | null; f1: number | null; brier: number | null }
}
export interface Evaluation { evaluation: any; note: string; model_version: string; is_synthetic: boolean }
export interface ChurnSummary {
  mode: 'model' | 'rules_only'; model: ModelRow | null; thresholds: { medium: number; high: number; source: string }
  counts: { low: number; medium: number; high: number; unscored: number }; disclaimer: string
}
