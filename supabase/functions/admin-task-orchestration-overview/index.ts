// Task Orchestration overview endpoint. Returns KPIs, unassigned queue,
// agent roster, live task progression, productivity insights and the
// current assignment rules in a single call.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { requirePermission, authErrorResponse } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let ctx;
  try { ctx = await requirePermission(req, "task_orchestration.view"); }
  catch (err) {
    const resp = authErrorResponse(err, corsHeaders);
    if (resp) return resp;
    throw err;
  }

  const admin = ctx.adminClient;
  // Derive scope from the caller's effective permissions.
  const [{ data: isSuper }, { data: isConsumerAdmin }, { data: permRows }] = await Promise.all([
    admin.rpc("has_any_internal_role", { _user_id: ctx.userId, _role_keys: ["super_admin"] }),
    admin.rpc("has_role", { _user_id: ctx.userId, _role: "admin" }),
    admin.rpc("internal_effective_permissions", { _user_id: ctx.userId }),
  ]);
  const perms = new Set<string>(Array.isArray(permRows) ? (permRows as string[]) : []);
  const isSuperCaller = !!isSuper || !!isConsumerAdmin;
  const canViewAll = isSuperCaller || perms.has("task_orchestration.view_all");
  const canAssign = isSuperCaller || perms.has("task_orchestration.assign") || perms.has("task_orchestration.bulk_assign");
  const canViewLoad = isSuperCaller || perms.has("task_orchestration.view_agent_load");

  // Helper to scope a query on assigned_agent_id when the caller can only see
  // their own tasks.
  const scopeAssigned = <T,>(qb: T): T => {
    if (canViewAll) return qb;
    // deno-lint-ignore no-explicit-any
    return (qb as any).eq("assigned_agent_id", ctx.userId);
  };

  const [
    { data: allTasks },
    { data: unassigned },
    { data: liveTasks },
    { data: capacity },
    { data: availability },
    { data: rules },
    { data: internalUsers },
  ] = await Promise.all([
    scopeAssigned(admin.from("orchestration_tasks").select("id,status,priority,sla_status,created_at,first_action_at,assigned_at,assigned_agent_id")),
    // Unassigned queue is only visible to callers who can assign.
    canAssign
      ? admin.from("orchestration_tasks")
          .select("id,task_code,type,title,priority,amount,currency,created_at,dispute_id,suggested_agent_id,required_permissions")
          .eq("status", "unassigned")
          .order("created_at", { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [] as any[] }),
    scopeAssigned(admin.from("orchestration_tasks")
      .select("id,task_code,stage,status,started_at,updated_at,sla_status,assigned_agent_id,dispute_id")
      .in("status", ["assigned","in_progress","waiting_on_buyer","waiting_on_seller","waiting_on_evidence","pending_approval","escalated"])
      .order("updated_at", { ascending: false })
      .limit(50)),
    admin.from("agent_capacity").select("*"),
    admin.from("agent_availability").select("*"),
    admin.from("assignment_rules").select("*").eq("scope","global").maybeSingle(),
    admin.from("internal_users").select("id, first_name, last_name, full_name, email, status, team, job_title").eq("status","active"),
  ]);

  const nowMs = Date.now();
  const hourAgo = nowMs - 3600_000;
  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  const yStart = new Date(todayStart); yStart.setDate(yStart.getDate() - 1);
  const tasks = allTasks ?? [];

  const unassignedCount = tasks.filter(t => t.status === "unassigned").length;
  const unassignedLastHour = tasks.filter(t => t.status === "unassigned" && new Date(t.created_at).getTime() > hourAgo).length;
  const overdueCount = tasks.filter(t => t.sla_status === "overdue" || t.sla_status === "breached").length;
  const assignedToday = tasks.filter(t => t.assigned_at && new Date(t.assigned_at) >= todayStart).length;
  const assignedYesterday = tasks.filter(t => t.assigned_at && new Date(t.assigned_at) >= yStart && new Date(t.assigned_at) < todayStart).length;

  const availMap = new Map((availability ?? []).map(a => [a.user_id, a]));
  const capMap = new Map((capacity ?? []).map(c => [c.user_id, c]));
  const HEARTBEAT_ONLINE_MS = 5 * 60 * 1000;
  const isRecent = (a: any) => a?.last_heartbeat && (nowMs - new Date(a.last_heartbeat).getTime()) < HEARTBEAT_ONLINE_MS;
  const activeAgents = (internalUsers ?? []).filter(u => {
    const a = availMap.get(u.id);
    return a && (a.status !== "offline" || isRecent(a));
  }).length;
  const availableAgents = (internalUsers ?? []).filter(u => availMap.get(u.id)?.status === "available").length;
  const atCapacityCount = (capacity ?? []).filter(c => c.current_active >= c.max_active_tasks).length;

  const firstActionSecs = tasks
    .filter(t => t.first_action_at && t.created_at)
    .map(t => (new Date(t.first_action_at!).getTime() - new Date(t.created_at).getTime()) / 1000);
  const avgFirstAction = firstActionSecs.length
    ? Math.round(firstActionSecs.reduce((a,b) => a+b, 0) / firstActionSecs.length / 60)
    : 0;

  const roster = (internalUsers ?? []).map(u => {
    const cap = capMap.get(u.id);
    const avail = availMap.get(u.id);
    const effectiveStatus = avail?.status === "offline" && isRecent(avail) ? "available" : (avail?.status ?? "offline");
    return {
      user_id: u.id,
      first_name: u.first_name ?? (u.full_name?.split(" ")[0] ?? ""),
      last_name: u.last_name ?? (u.full_name?.split(" ").slice(1).join(" ") ?? ""),
      email: u.email,
      avatar_url: null,
      team: u.team ?? null,
      job_title: u.job_title ?? null,
      last_heartbeat: avail?.last_heartbeat ?? null,
      availability: effectiveStatus,
      max_active: cap?.max_active_tasks ?? 5,
      active: cap?.current_active ?? 0,
      overdue: cap?.overdue_count ?? 0,
      avg_first_action_seconds: cap?.avg_first_action_seconds ?? 0,
      resolved_today: cap?.resolved_today ?? 0,
      tasks_today: cap?.tasks_today ?? 0,
    };
  });

  const insights = {
    most_active: [...roster].sort((a,b) => b.tasks_today - a.tasks_today)[0] ?? null,
    most_resolved: [...roster].sort((a,b) => b.resolved_today - a.resolved_today)[0] ?? null,
    least_loaded: [...roster].filter(a => a.availability !== "offline").sort((a,b) => a.active - b.active)[0] ?? null,
    highest_overdue: [...roster].sort((a,b) => b.overdue - a.overdue)[0] ?? null,
    fastest_response: [...roster].filter(a => a.avg_first_action_seconds > 0).sort((a,b) => a.avg_first_action_seconds - b.avg_first_action_seconds)[0] ?? null,
  };

  return new Response(JSON.stringify({
    scope: { can_view_all: canViewAll, can_assign: canAssign, can_view_load: canViewLoad, user_id: ctx.userId },
    kpis: {
      unassigned: unassignedCount,
      unassigned_last_hour: unassignedLastHour,
      active_agents: activeAgents,
      available_agents: availableAgents,
      at_capacity: atCapacityCount,
      assigned_today: assignedToday,
      assigned_delta_pct: assignedYesterday > 0 ? Math.round(((assignedToday - assignedYesterday) / assignedYesterday) * 100) : null,
      overdue: overdueCount,
      avg_first_action_minutes: avgFirstAction,
    },
    unassigned_queue: unassigned ?? [],
    live_progression: liveTasks ?? [],
    roster: (canViewLoad || canViewAll) ? roster : [],
    insights: (canViewLoad || canViewAll) ? insights : {
      most_active: null, most_resolved: null, least_loaded: null,
      highest_overdue: null, fastest_response: null,
    },
    rules: rules ?? null,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});