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
  active_agents_delta: number;
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
  resolved: number;
  avg_hours: number | null;
  breached: number;
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
  facets: { teams: string[]; roles: { key: string; name: string }[] };
  range: { key: string; label: string; from: string; to: string };
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

export async function fetchAgentCases(agentId: string): Promise<AgentCaseRow[]> {
  const { data, error } = await supabase.functions.invoke("admin-agent-performance", {
    body: { mode: "agent_cases", agent_id: agentId },
  });
  if (error) throw error;
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  return ((data as { cases: AgentCaseRow[] }).cases) ?? [];
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