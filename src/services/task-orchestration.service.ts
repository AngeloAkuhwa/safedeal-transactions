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
    | "rebalance" | "escalate" | "complete" | "save_rules" | "test_rules";
  task_id?: string;
  task_ids?: string[];
  agent_id?: string;
  mode?: string;
  reason?: string;
  resolution?: string;
  rules?: AssignmentRulesConfig;
}

export async function runOrchestrationAction<T = unknown>(payload: OrchestrationActionPayload): Promise<T> {
  const { data, error } = await supabase.functions.invoke("admin-task-orchestration-action", { body: payload });
  if (error) throw error;
  return data as T;
}