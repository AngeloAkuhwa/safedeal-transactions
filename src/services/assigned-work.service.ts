import { supabase } from "@/integrations/supabase/client";

export interface AssignedWorkSummary {
  active_disputes: number;
  open_tasks: number;
  // True when the Task Orchestration surface isn't wired yet so the UI can
  // show a helpful placeholder rather than a misleading zero.
  task_orchestration_available: boolean;
}

/**
 * Best-effort snapshot of the work currently sitting on an internal user's
 * plate. Uses `disputes.opened_by_user_id` as a lightweight proxy today since
 * the disputes table doesn't yet expose an explicit `assigned_to` column;
 * this will be swapped for the real assignment table when Task Orchestration
 * lands.
 */
export async function fetchAssignedWorkSummary(userId: string): Promise<AssignedWorkSummary> {
  const { count, error } = await supabase
    .from("disputes")
    .select("id", { count: "exact", head: true })
    .eq("opened_by_user_id", userId)
    .in("status", ["open", "seller_response_pending", "under_review"]);
  if (error) throw error;
  return {
    active_disputes: count ?? 0,
    open_tasks: 0,
    task_orchestration_available: false,
  };
}