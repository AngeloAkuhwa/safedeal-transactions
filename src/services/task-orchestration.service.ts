import { supabase } from "@/integrations/supabase/client";

export type OrchestrationPriority = "low" | "medium" | "high" | "critical";
export type OrchestrationStatus =
  | "unassigned" | "assigned" | "in_progress"
  | "waiting_on_buyer" | "waiting_on_seller" | "waiting_on_evidence"
  | "escalated" | "pending_approval" | "resolved" | "closed" | "cancelled";
export type AgentAvailability =
  | "available" | "active" | "busy" | "at_capacity" | "offline" | "on_leave" | "suspended";

export interface OrchestrationKpis {
  unassigned: number;
  unassigned_last_hour: number;
  active_agents: number;
  available_agents: number;
  at_capacity: number;
  assigned_today: number;
  assigned_delta_pct: number | null;
  overdue: number;
  avg_first_action_minutes: number;
}

export interface UnassignedTask {
  id: string;
  task_code: string;
  type: string;
  title: string;
  priority: OrchestrationPriority;
  amount: number | null;
  currency: string;
  created_at: string;
  dispute_id: string | null;
  suggested_agent_id: string | null;
  stage?: string | null;
  status?: string | null;
  sla_status?: string | null;
  sla_due_at?: string | null;
  queue?: string | null;
  required_role?: string | null;
  required_permissions?: string[] | null;
  transaction_id?: string | null;
  version?: number;
}

export interface LiveTask {
  id: string;
  task_code: string;
  stage: string;
  status: OrchestrationStatus;
  started_at: string | null;
  updated_at: string;
  sla_status: string;
  assigned_agent_id: string | null;
  dispute_id: string | null;
}

export interface AgentRosterEntry {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  avatar_url: string | null;
  team?: string | null;
  job_title?: string | null;
  role?: string | null;
  role_key?: string | null;
  skills?: string[];
  critical_active?: number;
  sla_risk?: "low" | "medium" | "high";
  last_activity_at?: string | null;
  last_heartbeat?: string | null;
  availability: AgentAvailability;
  max_active: number;
  active: number;
  overdue: number;
  avg_first_action_seconds: number;
  avg_resolution_seconds?: number;
  resolved_today: number;
  tasks_today: number;
}

export interface AssignmentRulesConfig {
  mode?: string;
  round_robin?: boolean;
  online_only?: boolean;
  skip_at_capacity?: boolean;
  priority_to_senior_pool?: boolean;
  auto_escalate_stale?: boolean;
  auto_reassign_on_offline?: boolean;
  max_active_per_agent?: number;
  max_overdue_before_skip?: number;
  fallback_target?: string;
  super_admin_self_assign?: boolean;
  stale_after_minutes?: number;
  stale_escalation_queue?: string;
  offline_reassign_after_minutes?: number;
  senior_pool_queue?: string;
  senior_pool_role_key?: string;
}

export interface AssignmentRulesRow {
  id: string;
  scope: string;
  active: boolean;
  mode: string;
  config: AssignmentRulesConfig;
  updated_at: string;
}

export interface QueueFiltersPayload {
  search?: string;
  priority?: string;
  type?: string;
  status?: string;
  stage?: string;
  sla?: string;
  queue?: string;
  team?: string;
  required_role?: string;
  amount_min?: number | null;
  amount_max?: number | null;
  date_from?: string | null;
  date_to?: string | null;
  age_bucket?: string;
  sort_by?: string;
  sort_dir?: "asc" | "desc";
  page?: number;
  per_page?: number;
}

export interface QueuePage {
  rows: UnassignedTask[];
  total: number;
  page: number;
  per_page: number;
  matching_ids?: string[];
}

export interface OrchestrationOverview {
  kpis: OrchestrationKpis;
  unassigned_queue: UnassignedTask[];
  unassigned_page?: QueuePage;
  live_progression: LiveTask[];
  roster: AgentRosterEntry[];
  insights: {
    most_active: AgentRosterEntry | null;
    most_resolved: AgentRosterEntry | null;
    least_loaded: AgentRosterEntry | null;
    highest_overdue: AgentRosterEntry | null;
    fastest_response: AgentRosterEntry | null;
  };
  rules: AssignmentRulesRow | null;
  scope?: { can_view_all: boolean; can_assign: boolean; can_view_load: boolean; user_id: string };
}

export async function fetchOrchestrationOverview(
  queueFilters?: QueueFiltersPayload,
): Promise<OrchestrationOverview> {
  const { data, error } = await supabase.functions.invoke(
    "admin-task-orchestration-overview",
    { body: { queue_filters: queueFilters ?? {} } },
  );
  if (error) throw error;
  return data as OrchestrationOverview;
}

export interface OrchestrationActionPayload {
  action:
    | "assign" | "assign_selected" | "auto_assign" | "assign_to_me"
    | "reassign" | "rebalance" | "escalate" | "complete" | "save_rules" | "test_rules"
    | "add_comment" | "send_for_approval"
    | "preview_auto_assign" | "preview_rebalance"
    | "task_detail" | "export_queue"
    | "start" | "update_stage" | "add_internal_note"
    | "request_info" | "request_evidence"
    | "submit_resolution" | "close";
  task_id?: string;
  task_ids?: string[];
  agent_id?: string;
  from_agent_id?: string;
  mode?: string;
  reason?: string;
  resolution?: string;
  body_text?: string;
  stage?: string;
  target?: "buyer" | "seller" | "both";
  expected_version?: number;
  rules?: AssignmentRulesConfig;
  exclude_task_ids?: string[];
  exclude_agent_ids?: string[];
  exclude_move_ids?: string[];
  override_capacity?: boolean;
  scope?: "queue" | "live" | "roster";
  queue_filters?: QueueFiltersPayload;
  // Escalate drawer extras
  target_queue?: string;
  target_team?: string;
  escalate_priority?: "high" | "critical";
  internal_note?: string;
  requested_reviewer_id?: string;
  // Export report extras
  export_scope?: "queue" | "live" | "assignment_history" | "agent_load" | "automation_rules";
  include_pii?: boolean;
  include_financial?: boolean;
}

export interface BulkAssignRowResult { task_id: string; ok: boolean; error?: string }
export interface BulkAssignResponse {
  ok: boolean; count: number; total: number; results: BulkAssignRowResult[];
}

export async function exportOrchestrationCsv(scope: "queue" | "live" | "roster"): Promise<void> {
  const res = await runOrchestrationAction<{ ok: boolean; filename: string; csv: string }>({
    action: "export_queue", scope,
  });
  const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = res.filename; a.click();
  URL.revokeObjectURL(url);
}

export async function exportOrchestrationReport(opts: {
  scope: "queue" | "live" | "assignment_history" | "agent_load" | "automation_rules";
  includePii?: boolean;
  includeFinancial?: boolean;
  filters?: QueueFiltersPayload;
}): Promise<void> {
  const res = await runOrchestrationAction<{ ok: boolean; filename: string; csv: string }>({
    action: "export_queue",
    export_scope: opts.scope,
    include_pii: opts.includePii,
    include_financial: opts.includeFinancial,
    queue_filters: opts.filters,
  });
  const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = res.filename; a.click();
  URL.revokeObjectURL(url);
}

export async function runOrchestrationAction<T = unknown>(payload: OrchestrationActionPayload): Promise<T> {
  const { data, error } = await supabase.functions.invoke("admin-task-orchestration-action", { body: payload });
  if (error) throw error;
  return data as T;
}

// -------- Task detail --------

export interface TaskStatusHistoryRow {
  id: string; task_id: string;
  from_status: string | null; to_status: string;
  from_stage: string | null; to_stage: string | null;
  actor_id: string | null; reason: string | null; created_at: string;
}
export interface TaskAssignmentHistoryRow {
  id: string; task_id: string;
  from_agent_id: string | null; to_agent_id: string | null;
  mode: string; reason: string | null; actor_id: string | null; created_at: string;
}
export interface TaskCommentRow {
  id: string; task_id: string; author_id: string | null; body: string; created_at: string;
  visibility?: "public" | "internal";
}
export interface TaskEvidenceRow {
  id: string; kind: string; label?: string | null; url?: string | null; created_at: string; submitted_by?: string | null;
}
export interface TaskMessageRow {
  id: string; author: string | null; role?: string | null; body: string; created_at: string;
}
export interface TaskLinkedContext {
  transaction?: Record<string, any> | null;
  dispute?: Record<string, any> | null;
  buyer?: Record<string, any> | null;
  seller?: Record<string, any> | null;
}
export interface TaskDetail {
  task: Record<string, any>;
  status_history: TaskStatusHistoryRow[];
  assignment_history: TaskAssignmentHistoryRow[];
  comments: TaskCommentRow[];
  internal_notes?: TaskCommentRow[];
  evidence?: TaskEvidenceRow[];
  messages?: TaskMessageRow[];
  context?: TaskLinkedContext;
  actor_names: Record<string, string>;
}
export async function fetchTaskDetail(taskId: string): Promise<TaskDetail> {
  return await runOrchestrationAction<TaskDetail>({ action: "task_detail", task_id: taskId });
}

// -------- Preview dry-runs --------

export interface AutoAssignPreview {
  ok: boolean;
  mode: string;
  pending: number;
  would_assign: number;
  plan: Array<{ task_id: string; task_code: string; agent_id: string; reason: string }>;
  agent_loads?: Array<{ agent_id: string; current: number; projected: number; max: number }>;
  unmatched?: Array<{ task_id: string; task_code: string; reason: string }>;
}

export interface TestConfigResult {
  ok: boolean;
  mode: string;
  pending: number;
  would_assign: number;
  sample: Array<{
    task_id: string; task_code: string; priority: string;
    proposed_agent: string | null; rule_used: string; reason?: string;
  }>;
  unassigned: Array<{ task_id: string; task_code: string; reason: string }>;
  capacity_impact: Array<{ agent_id: string; current: number; projected: number; max: number }>;
  distribution_summary: {
    mode: string; assigned: number; unassigned: number; per_agent_average: number;
  };
}

export async function testRules(rules?: AssignmentRulesConfig): Promise<TestConfigResult> {
  return await runOrchestrationAction<TestConfigResult>({ action: "test_rules", rules });
}

export interface RebalanceMove {
  task_id: string;
  task_code: string;
  from: string;
  to: string;
  reason: string;
  priority: string;
  sla_delta?: string | null;
}
export interface RebalancePreview {
  ok: boolean;
  moves: number;
  plan: RebalanceMove[];
  skipped?: Array<{ task_id: string; task_code: string; reason: string }>;
}