// Task Orchestration overview endpoint. Returns KPIs, unassigned queue
// (with server-side filters + pagination), agent roster, live task progression,
// productivity insights and the current assignment rules in a single call.
import { requirePermission, authErrorResponse } from "../_shared/auth.ts";
import { INELIGIBLE_STATUSES } from "../_shared/orchestration-rules.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const INELIGIBLE = INELIGIBLE_STATUSES;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let ctx;
  try { ctx = await requirePermission(req, "task_orchestration.view"); }
  catch (err) {
    const resp = authErrorResponse(err, corsHeaders);
    if (resp) return resp;
    throw err;
  }

  const body = (await req.json().catch(() => ({}))) as { queue_filters?: Record<string, any> };
  const qf = body.queue_filters ?? {};

  const admin = ctx.adminClient;
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

  const scopeAssigned = <T,>(qb: T): T => {
    if (canViewAll) return qb;
    // deno-lint-ignore no-explicit-any
    return (qb as any).eq("assigned_agent_id", ctx.userId);
  };

  // Server-side unassigned queue with filters + pagination.
  const page = Math.max(1, Number(qf.page ?? 1) | 0);
  const perPage = Math.min(100, Math.max(5, Number(qf.per_page ?? 25) | 0));
  const sortBy = ["created_at", "priority", "amount", "sla_due_at"].includes(String(qf.sort_by)) ? String(qf.sort_by) : "created_at";
  const sortDir = qf.sort_dir === "asc" ? "asc" : "desc";

  const applyQueueFilters = (qb: any) => {
    let q = qb.eq("status", "unassigned");
    if (qf.priority && qf.priority !== "all") q = q.eq("priority", qf.priority);
    if (qf.type && qf.type !== "all") q = q.eq("type", qf.type);
    if (qf.stage && qf.stage !== "all") q = q.eq("stage", qf.stage);
    if (qf.sla && qf.sla !== "all") q = q.eq("sla_status", qf.sla);
    if (qf.queue && qf.queue !== "all") q = q.eq("queue", qf.queue);
    if (qf.required_role && qf.required_role !== "all") q = q.eq("required_role", qf.required_role);
    if (typeof qf.amount_min === "number") q = q.gte("amount", qf.amount_min);
    if (typeof qf.amount_max === "number") q = q.lte("amount", qf.amount_max);
    if (qf.date_from) q = q.gte("created_at", qf.date_from);
    if (qf.date_to) q = q.lte("created_at", qf.date_to);
    if (qf.age_bucket && qf.age_bucket !== "all") {
      const now = Date.now();
      const mins = { lt15: 15, lt1h: 60, lt4h: 240, gte4h: 240 }[qf.age_bucket as string];
      if (mins) {
        const iso = new Date(now - mins * 60_000).toISOString();
        q = qf.age_bucket === "gte4h" ? q.lte("created_at", iso) : q.gte("created_at", iso);
      }
    }
    if (qf.search) {
      const s = String(qf.search).trim();
      if (s) q = q.or(`task_code.ilike.%${s}%,title.ilike.%${s}%`);
    }
    return q;
  };

  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  const [
    { data: allTasks },
    unassignedRes,
    unassignedCountRes,
    unassignedIdsRes,
    { data: liveTasks },
    { data: capacity },
    { data: availability },
    { data: rules },
    { data: internalUsers },
  ] = await Promise.all([
    scopeAssigned(admin.from("orchestration_tasks").select("id,status,priority,sla_status,created_at,first_action_at,assigned_at,assigned_agent_id")),
    canAssign
      ? applyQueueFilters(admin.from("orchestration_tasks")
          .select("id,task_code,type,title,priority,stage,status,amount,currency,created_at,dispute_id,transaction_id,suggested_agent_id,required_permissions,required_role,queue,sla_status,sla_due_at,version"))
          .order(sortBy, { ascending: sortDir === "asc" }).range(from, to)
      : Promise.resolve({ data: [] as any[] }),
    canAssign
      ? applyQueueFilters(admin.from("orchestration_tasks").select("id", { count: "exact", head: true }))
      : Promise.resolve({ count: 0 as number | null }),
    canAssign
      ? applyQueueFilters(admin.from("orchestration_tasks").select("id")).limit(2000)
      : Promise.resolve({ data: [] as any[] }),
    scopeAssigned(admin.from("orchestration_tasks")
      .select("id,task_code,stage,status,started_at,updated_at,sla_status,assigned_agent_id,dispute_id,priority,type,version")
      .in("status", ["assigned","in_progress","waiting_on_buyer","waiting_on_seller","waiting_on_evidence","pending_approval","escalated"])
      .order("updated_at", { ascending: false })
      .limit(100)),
    admin.from("agent_capacity").select("*"),
    admin.from("agent_availability").select("*"),
    admin.from("assignment_rules").select("*").eq("scope","global").maybeSingle(),
    admin.from("internal_users").select("id,user_id,first_name,last_name,full_name,email,status,team,job_title,role_id").eq("status","active"),
  ]);

  // Fetch role names for the roster in a single call.
  // Recent assignment-rule versions (with approval provenance).
  const nameFor = (uid: string | null) => {
    if (!uid) return null;
    const u = (internalUsers ?? []).find((x: any) => x.user_id === uid || x.id === uid);
    if (!u) return null;
    return u.full_name ?? [u.first_name, u.last_name].filter(Boolean).join(" ") ?? u.email ?? null;
  };
  const { data: ruleVersions } = rules?.id
    ? await admin.from("assignment_rule_versions")
        .select("id,version,note,created_at,actor_id,approved_by,approved_at,change_set_id")
        .eq("rule_id", rules.id).order("version", { ascending: false }).limit(5)
    : { data: [] as any[] };

  const roleIds = Array.from(new Set((internalUsers ?? []).map((u: any) => u.role_id).filter(Boolean)));
  const { data: internalRoles } = roleIds.length
    ? await admin.from("internal_roles").select("id,key,name").in("id", roleIds)
    : { data: [] as any[] };
  const roleMap = new Map((internalRoles ?? []).map((r: any) => [r.id, r]));

  // Skills (may not exist per agent. Safe default = []).
  const userIds = (internalUsers ?? []).map((u: any) => u.user_id ?? u.id).filter(Boolean);
  const { data: allSkills } = userIds.length
    ? await admin.from("agent_skills").select("user_id,permission_key").in("user_id", userIds)
    : { data: [] as any[] };
  const skillMap = new Map<string, string[]>();
  (allSkills ?? []).forEach((s: any) => {
    const arr = skillMap.get(s.user_id) ?? [];
    arr.push(s.permission_key);
    skillMap.set(s.user_id, arr);
  });

  // Critical-active per agent.
  const { data: criticalRows } = await admin.from("orchestration_tasks")
    .select("assigned_agent_id")
    .eq("priority", "critical")
    .in("status", ["assigned","in_progress","escalated","pending_approval"]);
  const criticalMap = new Map<string, number>();
  (criticalRows ?? []).forEach((r: any) => {
    if (!r.assigned_agent_id) return;
    criticalMap.set(r.assigned_agent_id, (criticalMap.get(r.assigned_agent_id) ?? 0) + 1);
  });

  const nowMs = Date.now();
  const hourAgo = nowMs - 3600_000;
  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  const yStart = new Date(todayStart); yStart.setDate(yStart.getDate() - 1);
  const tasks = allTasks ?? [];

  const unassignedCount = tasks.filter((t: any) => t.status === "unassigned").length;
  const unassignedLastHour = tasks.filter((t: any) => t.status === "unassigned" && new Date(t.created_at).getTime() > hourAgo).length;
  const overdueCount = tasks.filter((t: any) => t.sla_status === "overdue" || t.sla_status === "breached").length;
  const assignedToday = tasks.filter((t: any) => t.assigned_at && new Date(t.assigned_at) >= todayStart).length;
  const assignedYesterday = tasks.filter((t: any) => t.assigned_at && new Date(t.assigned_at) >= yStart && new Date(t.assigned_at) < todayStart).length;

  const availMap = new Map((availability ?? []).map((a: any) => [a.user_id, a]));
  const capMap = new Map((capacity ?? []).map((c: any) => [c.user_id, c]));
  const HEARTBEAT_ONLINE_MS = 5 * 60 * 1000;
  const isRecent = (a: any) => a?.last_heartbeat && (nowMs - new Date(a.last_heartbeat).getTime()) < HEARTBEAT_ONLINE_MS;
  const activeAgents = (internalUsers ?? []).filter((u: any) => {
    const a: any = availMap.get(u.user_id ?? u.id);
    return a && (!INELIGIBLE.has(a.status) || isRecent(a));
  }).length;
  const availableAgents = (internalUsers ?? []).filter((u: any) => {
    const a: any = availMap.get(u.user_id ?? u.id);
    return a?.status === "available";
  }).length;
  const atCapacityCount = (capacity ?? []).filter((c: any) => c.current_active >= c.max_active_tasks).length;

  const firstActionSecs = tasks
    .filter((t: any) => t.first_action_at && t.created_at)
    .map((t: any) => (new Date(t.first_action_at).getTime() - new Date(t.created_at).getTime()) / 1000);
  const avgFirstAction = firstActionSecs.length
    ? Math.round(firstActionSecs.reduce((a: number, b: number) => a + b, 0) / firstActionSecs.length / 60)
    : 0;

  const roster = (internalUsers ?? []).map((u: any) => {
    const uid = u.user_id ?? u.id;
    const cap: any = capMap.get(uid);
    const avail: any = availMap.get(uid);
    const rawStatus = avail?.status ?? "offline";
    const effectiveStatus = rawStatus === "offline" && isRecent(avail) ? "available" : rawStatus;
    const role = u.role_id ? roleMap.get(u.role_id) : null;
    const overdue = cap?.overdue_count ?? 0;
    const crit = criticalMap.get(uid) ?? 0;
    const slaRisk = overdue >= 3 ? "high" : overdue >= 1 || crit >= 2 ? "medium" : "low";
    return {
      user_id: uid,
      first_name: u.first_name ?? (u.full_name?.split(" ")[0] ?? ""),
      last_name: u.last_name ?? (u.full_name?.split(" ").slice(1).join(" ") ?? ""),
      email: u.email,
      avatar_url: null,
      team: u.team ?? null,
      job_title: u.job_title ?? null,
      role: (role as any)?.name ?? null,
      role_key: (role as any)?.key ?? null,
      skills: skillMap.get(uid) ?? [],
      critical_active: crit,
      sla_risk: slaRisk,
      last_activity_at: avail?.last_heartbeat ?? null,
      last_heartbeat: avail?.last_heartbeat ?? null,
      availability: effectiveStatus,
      max_active: cap?.max_active_tasks ?? 5,
      active: cap?.current_active ?? 0,
      overdue,
      avg_first_action_seconds: cap?.avg_first_action_seconds ?? 0,
      avg_resolution_seconds: cap?.avg_resolution_seconds ?? 0,
      resolved_today: cap?.resolved_today ?? 0,
      tasks_today: cap?.tasks_today ?? 0,
    };
  });

  const eligible = roster.filter((a: any) => !INELIGIBLE.has(a.availability));
  const insights = {
    most_active: [...roster].sort((a, b) => b.tasks_today - a.tasks_today)[0] ?? null,
    most_resolved: [...roster].sort((a, b) => b.resolved_today - a.resolved_today)[0] ?? null,
    least_loaded: [...eligible].sort((a, b) => a.active - b.active)[0] ?? null,
    highest_overdue: [...roster].sort((a, b) => b.overdue - a.overdue)[0] ?? null,
    fastest_response: [...roster].filter((a: any) => a.avg_first_action_seconds > 0)
      .sort((a, b) => a.avg_first_action_seconds - b.avg_first_action_seconds)[0] ?? null,
  };

  const queueRows = (unassignedRes as any).data ?? [];
  const queueTotal = (unassignedCountRes as any).count ?? queueRows.length;
  const matchingIds = ((unassignedIdsRes as any).data ?? []).map((r: any) => r.id);

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
    unassigned_queue: queueRows,
    unassigned_page: { rows: queueRows, total: queueTotal, page, per_page: perPage, matching_ids: matchingIds },
    live_progression: liveTasks ?? [],
    roster: (canViewLoad || canViewAll) ? roster : [],
    insights: (canViewLoad || canViewAll) ? insights : {
      most_active: null, most_resolved: null, least_loaded: null,
      highest_overdue: null, fastest_response: null,
    },
    rules: rules ?? null,
    rule_versions: (ruleVersions ?? []).map((v: any) => ({
      ...v,
      actor_name: nameFor(v.actor_id),
      approver_name: v.approved_by ? nameFor(v.approved_by) : null,
    })),
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});