import { supabase } from "@/integrations/supabase/client";

export type AgentAvailabilityStatus =
  | "available" | "active" | "busy" | "at_capacity" | "offline" | "on_leave" | "suspended";

export interface AgentPerformanceRow {
  user_id: string;
  rank: number;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  email: string | null;
  role_key: string | null;
  role_label: string;
  role_keys: string[];
  team: string | null;
  department: string | null;
  job_title: string | null;
  availability: AgentAvailabilityStatus;
  is_live: boolean;
  last_heartbeat: string | null;
  last_active_at: string | null;
  skills: { skill: string; proficiency: number | null }[];
  active_cases: number;
  waiting_cases: number;
  critical_cases: number;
  max_active: number;
  at_capacity: boolean;
  resolved: number;
  resolved_prev: number;
  avg_resolution_hours: number | null;
  resolution_sample: number;
  avg_first_action_minutes: number | null;
  overdue: number;
  breached: number;
  on_time: number;
  sla_compliance: number;
  reassignments: number;
  reassignments_in: number;
  reassignments_out: number;
  escalations: number;
  score: number;
  score_band: string;
}

export interface AgentPerformanceSummaryData {
  active_agents: number;
  active_agents_delta: number | null;
  live_agents: number;
  open_disputes: number;
  open_disputes_platform: number;
  open_disputes_unassigned: number;
  resolved_in_window: number;
  resolved_label: string;
  resolved_delta_pct: number | null;
  avg_resolution_hours: number | null;
  avg_resolution_sample: number;
  avg_resolution_sample_tasks: number;
  avg_resolution_sample_disputes: number;
  avg_resolution_delta: number | null;
  overdue_cases: number;
  top_agent: { user_id: string; name: string | null; score: number } | null;
}

export interface AgentTrendPoint {
  date: string;
  label: string;
  resolved: number;
  assigned: number;
  avg_hours: number | null;
  prev_avg_hours: number | null;
  on_time: number;
  breached: number;
  compliance: number | null;
}

export interface AgentPerformanceMetrics {
  cases_assigned: number;
  cases_started: number;
  cases_resolved: number;
  cases_escalated: number;
  cases_reassigned_away: number;
  resolution_rate: number | null;
  avg_first_action_minutes: number | null;
  avg_resolution_hours: number | null;
  avg_resolution_prev_hours: number | null;
  sla_compliance: number | null;
  overdue_rate: number | null;
  reopened_cases: number | null;
  quality_review_score: number | null;
  agents_counted: number;
  granularity: "day" | "week" | "month";
}

export type SlaState =
  | "on_track" | "at_risk" | "breached" | "paused"
  | "completed_within" | "completed_outside" | "not_configured" | "cancelled";

export interface SlaCaseRow {
  id: string;
  task_code: string | null;
  title: string | null;
  type: string | null;
  agent_id: string | null;
  agent_name: string | null;
  team: string | null;
  role_label: string | null;
  priority: string | null;
  stage: string | null;
  status: string | null;
  assigned_at: string | null;
  first_action_at: string | null;
  due_at: string | null;
  resolved_at: string | null;
  updated_at: string | null;
  dispute_id: string | null;
  transaction_id: string | null;
  sla_state: SlaState;
  remaining_minutes: number | null;
}

export interface AgentPerformanceFilters {
  range: "week" | "7d" | "30d" | "month" | "custom";
  /** "range" = selected time frame, "all_time" = ignore the window entirely. */
  scope: "range" | "all_time";
  date_from?: string;
  date_to?: string;
  team: string;
  role: string;
  availability: string;
  sla: string;
  overdue_only: boolean;
  min_active: number;
  min_overdue: number;
  score_min: number;
  score_max: number;
  case_priority: string;
  case_status: string;
  case_sla: string;
  workload_status: string;
  search: string;
}

export const DEFAULT_AGENT_FILTERS: AgentPerformanceFilters = {
  range: "7d",
  scope: "range",
  team: "all",
  role: "all",
  availability: "all",
  sla: "all",
  overdue_only: false,
  min_active: 0,
  min_overdue: 0,
  score_min: 0,
  score_max: 100,
  case_priority: "all",
  case_status: "all",
  case_sla: "all",
  workload_status: "all",
  search: "",
};

export interface AgentPerformanceOverview {
  summary: AgentPerformanceSummaryData;
  agents: AgentPerformanceRow[];
  total: number;
  trend: AgentTrendPoint[];
  performance: AgentPerformanceMetrics;
  status_distribution: Record<string, number>;
  sla_cases: SlaCaseRow[];
  sla_cases_truncated: boolean;
  facets: { teams: string[]; roles: { key: string; name: string }[] };
  range: { key: string; label: string; from: string; to: string; all_time?: boolean };
  permissions: {
    can_export: boolean;
    can_rebalance: boolean;
    can_view_orchestration: boolean;
    can_view_disputes: boolean;
  };
  generated_at: string;
}

export async function fetchAgentPerformance(
  filters: AgentPerformanceFilters,
): Promise<AgentPerformanceOverview> {
  const { data, error } = await supabase.functions.invoke("admin-agent-performance", {
    body: { ...filters },
  });
  if (error) throw error;
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  return data as AgentPerformanceOverview;
}

export async function exportAgentPerformance(
  filters: AgentPerformanceFilters,
  opts: { tab: string; maskPii: boolean; reason?: string },
): Promise<{ csv: string; filename: string }> {
  const { data, error } = await supabase.functions.invoke("admin-agent-performance", {
    body: { ...filters, mode: "export", tab: opts.tab, mask_pii: opts.maskPii, reason: opts.reason },
  });
  if (error) throw error;
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  return data as { csv: string; filename: string };
}

export function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export interface AgentCaseRow {
  id: string;
  source: "task" | "dispute";
  case_ref: string | null;
  task_code: string | null;
  title: string | null;
  type: string | null;
  priority: string | null;
  status: string | null;
  stage: string | null;
  sla_status: string | null;
  due_at: string | null;
  created_at: string | null;
  opened_at: string | null;
  assigned_at: string | null;
  resolved_at: string | null;
  dispute_id: string | null;
  transaction_id: string | null;
  amount: number | null;
  currency: string | null;
  escalation_level: number | null;
  outcome_type?: string | null;
  decision_summary?: string | null;
  is_active: boolean;
  is_overdue: boolean;
}

export interface AgentCasesResult {
  cases: AgentCaseRow[];
  truncated: boolean;
  range: { key: string; label: string };
}

/**
 * Case list for one agent. The window and case filters are passed through so
 * the drawer's "Resolved" count always matches the workload row / KPI card.
 */
export async function fetchAgentCases(
  agentId: string,
  filters?: Partial<AgentPerformanceFilters>,
): Promise<AgentCasesResult> {
  const { data, error } = await supabase.functions.invoke("admin-agent-performance", {
    body: {
      mode: "agent_cases",
      agent_id: agentId,
      scope: filters?.scope ?? "range",
      range: filters?.range ?? "7d",
      date_from: filters?.date_from,
      date_to: filters?.date_to,
      case_priority: filters?.case_priority ?? "all",
      case_status: filters?.case_status ?? "all",
      case_sla: filters?.case_sla ?? "all",
    },
  });
  if (error) throw error;
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  const res = data as AgentCasesResult;
  const requestedAllTime = (filters?.scope ?? "range") === "all_time";
  return {
    cases: res?.cases ?? [],
    truncated: !!res?.truncated,
    // Fall back to a scope-derived label so a stale backend never mislabels an
    // all-time list as the selected range.
    range: res?.range ?? {
      key: requestedAllTime ? "all_time" : (filters?.range ?? "7d"),
      label: requestedAllTime ? "All time" : "Selected range",
    },
  };
}

/** Display helpers shared across the Agent Performance components. */
export function agentName(a: Pick<AgentPerformanceRow, "full_name" | "first_name" | "last_name" | "email">): string {
  const composed = [a.first_name, a.last_name].filter(Boolean).join(" ").trim();
  return a.full_name || composed || a.email || "Agent";
}

export function agentShortName(a: Pick<AgentPerformanceRow, "full_name" | "first_name" | "last_name" | "email">): string {
  const first = a.first_name || a.full_name?.split(" ")[0] || a.email?.split("@")[0] || "Agent";
  const lastSource = a.last_name || a.full_name?.split(" ")[1];
  return lastSource ? `${first} ${lastSource[0]}.` : first;
}

export function agentInitials(a: Pick<AgentPerformanceRow, "full_name" | "first_name" | "last_name" | "email">): string {
  const name = agentName(a);
  const parts = name.split(" ").filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}