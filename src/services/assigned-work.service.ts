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

export interface AssignedWorkImpact {
  open_items: number;
  affected_modules: string[];
  removed_keys: string[];
}

/**
 * Rule f: non-blocking warning surface. Given a set of permission keys that
 * would be removed from the target user, return a coarse count of open work
 * items in the affected modules so the UI can render an "I understand" panel.
 * Best-effort: never throws; returns zero counts on error.
 */
export async function fetchAssignedWorkImpact(
  targetUserId: string,
  removedKeys: string[],
): Promise<AssignedWorkImpact> {
  if (!removedKeys.length) {
    return { open_items: 0, affected_modules: [], removed_keys: [] };
  }
  const modules = Array.from(new Set(removedKeys.map((k) => k.split(".")[0])));
  let open = 0;
  if (modules.includes("disputes")) {
    const { count } = await supabase
      .from("disputes")
      .select("id", { count: "exact", head: true })
      .eq("opened_by_user_id", targetUserId)
      .in("status", ["open", "seller_response_pending", "under_review"]);
    open += count ?? 0;
  }
  return { open_items: open, affected_modules: modules, removed_keys: removedKeys };
}