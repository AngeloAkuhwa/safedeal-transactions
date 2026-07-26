import { supabase } from "@/integrations/supabase/client";

export type OrchestrationPriority = "low" | "medium" | "high" | "critical";
export type OrchestrationStatus =
  | "unassigned" | "assigned" | "in_progress"
  | "waiting_on_buyer" | "waiting_on_seller" | "waiting_on_evidence"
  | "escalated" | "pending_approval" | "resolved" | "closed" | "cancelled";
export type AgentAvailability = "available" | "active" | "busy" | "at_capacity" | "offline";

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
  last_heartbeat?: string | null;
  availability: AgentAvailability;
  max_active: number;
  active: number;
  overdue: number;
  avg_first_action_seconds: number;
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
}

export interface AssignmentRulesRow {
  id: string;
  scope: string;
  active: boolean;
  mode: string;
  config: AssignmentRulesConfig;
  updated_at: string;
}

export interface OrchestrationOverview {
  kpis: OrchestrationKpis;
  unassigned_queue: UnassignedTask[];
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
}

export async function fetchOrchestrationOverview(): Promise<OrchestrationOverview> {
  const { data, error } = await supabase.functions.invoke("admin-task-orchestration-overview", { body: {} });
  if (error) throw error;
  return data as OrchestrationOverview;
}

export interface OrchestrationActionPayload {
  action:
    | "assign" | "assign_selected" | "auto_assign" | "assign_to_me"
    | "reassign" | "rebalance" | "escalate" | "complete" | "save_rules" | "test_rules"
    | "add_comment" | "send_for_approval"
    | "preview_auto_assign" | "preview_rebalance"
    | "task_detail";
  task_id?: string;
  task_ids?: string[];
  agent_id?: string;
  from_agent_id?: string;
  mode?: string;
  reason?: string;
  resolution?: string;
  body_text?: string;
  expected_version?: number;
  rules?: AssignmentRulesConfig;
  exclude_task_ids?: string[];
  exclude_agent_ids?: string[];
  override_capacity?: boolean;
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
}
export interface TaskDetail {
  task: Record<string, any>;
  status_history: TaskStatusHistoryRow[];
  assignment_history: TaskAssignmentHistoryRow[];
  comments: TaskCommentRow[];
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
}
export interface RebalancePreview {
  ok: boolean;
  moves: number;
  plan: Array<{ task_id: string; from: string; to: string }>;
}