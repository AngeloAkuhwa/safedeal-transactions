// Agent Performance & Dispute Operations.
// Single read endpoint powering /admin/agent-performance: summary KPIs,
// per-agent workload / performance / SLA / ranking rows, filter facets and
// CSV export. Everything is derived from existing internal-user, orchestration
// task and dispute records — no separate agent registry.
import { requirePermission, authErrorResponse } from "../_shared/auth.ts";
import { logAdminAction, extractRequestMeta } from "../_shared/audit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Task statuses that represent live, in-flight work. */
const ACTIVE_STATUSES = new Set([
  "assigned", "in_progress",
  "waiting_on_buyer", "waiting_on_seller", "waiting_on_evidence",
  "escalated", "pending_approval",
]);
const DONE_STATUSES = new Set(["resolved", "closed"]);
/** Statuses that mean the case is parked waiting on somebody else. */
const WAITING_STATUSES = new Set(["waiting_on_buyer", "waiting_on_seller", "waiting_on_evidence", "pending_approval"]);
/** Priorities treated as critical work. */
const CRITICAL_PRIORITIES = new Set(["critical", "urgent"]);
/** Statuses that must never feed resolution-time maths. */
const CANCELLED_STATUSES = new Set(["cancelled", "canceled", "void", "invalid"]);
/** Minimum completed cases before an agent can be named Top Agent. */
const TOP_AGENT_MIN_CASES = 1;
/** Task types that represent dispute-side casework. */
const DISPUTE_TASK_TYPES = new Set([
  "new_dispute_review", "buyer_complaint", "seller_complaint",
  "evidence_review", "seller_response_review", "buyer_response_review",
  "compliance_escalation",
]);
/** Modules whose permissions make an internal user a case-handling agent. */
const AGENT_MODULES = ["disputes", "task_orchestration"];
const HEARTBEAT_WINDOW_MS = 5 * 60_000;

type Range = { from: Date; to: Date; prevFrom: Date; prevTo: Date; label: string };

function resolveRange(body: Record<string, unknown>): Range {
  const now = new Date();
  const key = String(body.range ?? "7d");
  let from: Date;
  let to = now;
  let label = "Last 7 Days";
  if (key === "custom" && body.date_from) {
    from = new Date(String(body.date_from));
    to = body.date_to ? new Date(String(body.date_to)) : now;
    label = "Custom range";
  } else if (key === "30d") {
    from = new Date(now.getTime() - 30 * 86_400_000);
    label = "Last 30 Days";
  } else if (key === "month") {
    from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    label = "This Month";
  } else if (key === "week") {
    // Calendar week, Monday start.
    const dow = (now.getUTCDay() + 6) % 7;
    from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - dow));
    label = "This Week";
  } else {
    from = new Date(now.getTime() - 7 * 86_400_000);
  }
  if (Number.isNaN(from.getTime())) from = new Date(now.getTime() - 7 * 86_400_000);
  if (Number.isNaN(to.getTime())) to = now;
  const span = Math.max(1, to.getTime() - from.getTime());
  return {
    from, to,
    prevFrom: new Date(from.getTime() - span),
    prevTo: from,
    label,
  };
}

const inWindow = (ts: string | null | undefined, a: Date, b: Date) => {
  if (!ts) return false;
  const t = new Date(ts).getTime();
  return t >= a.getTime() && t <= b.getTime();
};
const hours = (ms: number) => Math.round((ms / 3_600_000) * 10) / 10;
const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : 100);

function scoreBand(score: number): string {
  if (score >= 97) return "Excellent";
  if (score >= 93) return "Very Good";
  if (score >= 85) return "Good";
  return "Needs attention";
}

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const isExport = body.mode === "export";
  const isAgentCases = body.mode === "agent_cases";

  let ctx;
  try {
    ctx = await requirePermission(req, isExport ? "agent_performance.export" : "agent_performance.view");
  } catch (err) {
    const resp = authErrorResponse(err, corsHeaders);
    if (resp) return resp;
    throw err;
  }

  const admin = ctx.adminClient;
  const range = resolveRange(body);

  // ---- per-agent case list (drawer) -------------------------------------
  if (isAgentCases) {
    const agentId = String(body.agent_id ?? "");
    if (!agentId) {
      return new Response(JSON.stringify({ error: "agent_id_required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: caseRows, error: caseErr } = await admin
      .from("orchestration_tasks")
      .select("id, task_code, title, type, priority, status, stage, sla_status, due_at, created_at, assigned_at, resolved_at, dispute_id, transaction_id, amount, currency, escalation_level")
      .eq("assigned_agent_id", agentId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (caseErr) {
      return new Response(JSON.stringify({ error: "cases_fetch_failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const nowTs = Date.now();
    const cases: Record<string, unknown>[] = (caseRows ?? []).map((t) => ({
      ...t,
      source: "task",
      case_ref: t.task_code,
      opened_at: t.created_at,
      is_active: ACTIVE_STATUSES.has(String(t.status)),
      is_overdue: ["overdue", "breached"].includes(String(t.sla_status)) ||
        (!!t.due_at && !t.resolved_at && new Date(t.due_at).getTime() < nowTs),
    }));

    // Disputes this agent personally resolved may have no orchestration task
    // (legacy or manually handled cases). Surface them as dispute-backed rows
    // so the drawer never looks empty while the KPIs count the work.
    const coveredDisputeIds = new Set(
      (caseRows ?? []).map((t) => t.dispute_id).filter(Boolean) as string[],
    );
    const { data: agentOutcomes } = await admin
      .from("dispute_outcomes")
      .select("dispute_id, outcome_type, decision_summary, refund_amount, release_amount, resolved_at")
      .eq("resolved_by_user_id", agentId)
      .order("resolved_at", { ascending: false })
      .limit(200);
    const extraDisputeIds = (agentOutcomes ?? [])
      .map((o) => o.dispute_id)
      .filter((id): id is string => !!id && !coveredDisputeIds.has(id));
    if (extraDisputeIds.length) {
      const { data: disputeRows } = await admin
        .from("disputes")
        .select("id, reason, description, status, opened_at, resolved_at, transaction_id")
        .in("id", extraDisputeIds);
      const byId = new Map((disputeRows ?? []).map((d) => [d.id, d]));
      for (const o of agentOutcomes ?? []) {
        const d = o.dispute_id ? byId.get(o.dispute_id) : null;
        if (!d) continue;
        const amount = Number(o.refund_amount ?? 0) || Number(o.release_amount ?? 0) || null;
        cases.push({
          id: d.id,
          source: "dispute",
          case_ref: `DSP-${String(d.id).slice(0, 8).toUpperCase()}`,
          task_code: null,
          title: `${String(d.reason ?? "dispute").replace(/_/g, " ")} dispute`,
          type: "dispute_review",
          priority: null,
          status: d.status,
          stage: null,
          sla_status: null,
          due_at: null,
          created_at: d.opened_at,
          opened_at: d.opened_at,
          assigned_at: null,
          resolved_at: o.resolved_at ?? d.resolved_at,
          dispute_id: d.id,
          transaction_id: d.transaction_id,
          amount,
          currency: "NGN",
          escalation_level: 0,
          outcome_type: o.outcome_type,
          decision_summary: o.decision_summary,
          is_active: false,
          is_overdue: false,
        });
      }
      cases.sort((a, b) =>
        new Date(String(b.created_at ?? 0)).getTime() - new Date(String(a.created_at ?? 0)).getTime());
    }
    return new Response(JSON.stringify({ cases }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const [
      { data: permRows },
      { data: rolePerms },
      { data: users },
      { data: userRoles },
      { data: roles },
      { data: availability },
      { data: capacity },
      { data: skills },
      { data: tasks },
      { data: history },
      { data: outcomes },
      { data: disputes },
      { data: escalationEvents },
    ] = await Promise.all([
      admin.rpc("internal_effective_permissions", { _user_id: ctx.userId }),
      admin.from("role_permissions").select("role_key, permission_key"),
      admin.from("internal_users").select("id, first_name, last_name, full_name, email, status, team, job_title, department, last_active_at"),
      admin.from("internal_user_roles").select("user_id, role_key, is_primary"),
      admin.from("internal_roles").select("key, name"),
      admin.from("agent_availability").select("user_id, status, last_heartbeat"),
      admin.from("agent_capacity").select("user_id, max_active_tasks, current_active, overdue_count, avg_first_action_seconds, resolved_today"),
      admin.from("agent_skills").select("user_id, skill, proficiency"),
      admin.from("orchestration_tasks").select(
        "id, task_code, title, type, priority, status, stage, queue, team, assigned_agent_id, dispute_id, transaction_id, amount, currency, sla_status, escalation_level, reassignment_count, created_at, assigned_at, started_at, first_action_at, due_at, resolved_at",
      ),
      admin.from("task_assignment_history").select("id, task_id, from_agent_id, to_agent_id, mode, reason, created_at")
        .gte("created_at", range.prevFrom.toISOString()),
      admin.from("dispute_outcomes").select("id, dispute_id, outcome_type, resolved_by_user_id, resolved_at")
        .gte("resolved_at", range.prevFrom.toISOString()),
      admin.from("disputes").select("id, status, opened_at, resolved_at"),
      admin.from("task_status_history").select("task_id, to_status, created_at")
        .eq("to_status", "escalated")
        .gte("created_at", range.prevFrom.toISOString()),
    ]);

    const callerPerms = new Set<string>(Array.isArray(permRows) ? (permRows as string[]) : []);
    const canExport = callerPerms.has("agent_performance.export");
    const canRebalance = callerPerms.has("task_orchestration.rebalance") || callerPerms.has("task_orchestration.assign");
    const canViewOrchestration = callerPerms.has("task_orchestration.view_all") ||
      callerPerms.has("task_orchestration.view_assigned") || callerPerms.has("task_orchestration.view");
    const canViewDisputes = callerPerms.has("disputes.view_all") || callerPerms.has("disputes.view");

    // ---- eligibility -------------------------------------------------
    const agentRoleKeys = new Set<string>();
    for (const rp of rolePerms ?? []) {
      const mod = String(rp.permission_key ?? "").split(".")[0];
      if (AGENT_MODULES.includes(mod)) agentRoleKeys.add(rp.role_key);
    }
    const rolesByUser = new Map<string, string[]>();
    for (const r of userRoles ?? []) {
      const list = rolesByUser.get(r.user_id) ?? [];
      if (r.is_primary) list.unshift(r.role_key); else list.push(r.role_key);
      rolesByUser.set(r.user_id, list);
    }
    const roleName = new Map<string, string>((roles ?? []).map((r) => [r.key, r.name]));

    const hasWorked = new Set<string>();
    for (const t of tasks ?? []) if (t.assigned_agent_id) hasWorked.add(t.assigned_agent_id);
    for (const h of history ?? []) {
      if (h.from_agent_id) hasWorked.add(h.from_agent_id);
      if (h.to_agent_id) hasWorked.add(h.to_agent_id);
    }
    for (const o of outcomes ?? []) if (o.resolved_by_user_id) hasWorked.add(o.resolved_by_user_id);

    const eligible = (users ?? []).filter((u) => {
      if (u.status !== "active") return false;
      const keys = rolesByUser.get(u.id) ?? [];
      return keys.some((k) => agentRoleKeys.has(k)) || hasWorked.has(u.id);
    });

    const availByUser = new Map((availability ?? []).map((a) => [a.user_id, a]));
    const capByUser = new Map((capacity ?? []).map((c) => [c.user_id, c]));
    const skillsByUser = new Map<string, { skill: string; proficiency: number | null }[]>();
    for (const s of skills ?? []) {
      const list = skillsByUser.get(s.user_id) ?? [];
      list.push({ skill: s.skill, proficiency: s.proficiency });
      skillsByUser.set(s.user_id, list);
    }

    // ---- per-agent metrics -------------------------------------------
    const now = Date.now();
    const allTasks = tasks ?? [];
    const taskById = new Map(allTasks.map((t) => [t.id, t]));

    // Escalations attributed to the agent who owns the task, counted at the
    // moment the escalation happened (not when the task was created).
    const escalationsByAgent = new Map<string, number>();
    for (const e of escalationEvents ?? []) {
      if (!inWindow(e.created_at, range.from, range.to)) continue;
      const owner = taskById.get(e.task_id)?.assigned_agent_id;
      if (!owner) continue;
      escalationsByAgent.set(owner, (escalationsByAgent.get(owner) ?? 0) + 1);
    }
    // Fall back to escalation_level for tasks with no recorded event, so older
    // records created before status history existed are still represented.
    const escalatedTaskIds = new Set((escalationEvents ?? []).map((e) => e.task_id));

    // ---- filters (case-level filters must apply before metrics) ---------
    const f = {
      team: String(body.team ?? "all"),
      role: String(body.role ?? "all"),
      availability: String(body.availability ?? "all"),
      sla: String(body.sla ?? "all"),
      overdue_only: body.overdue_only === true,
      min_active: Number(body.min_active ?? 0) || 0,
      min_overdue: Number(body.min_overdue ?? 0) || 0,
      score_min: Number(body.score_min ?? 0) || 0,
      score_max: body.score_max == null ? 100 : (Number(body.score_max) || 100),
      case_priority: String(body.case_priority ?? "all"),
      case_status: String(body.case_status ?? "all"),
      case_sla: String(body.case_sla ?? "all"),
      search: String(body.search ?? "").trim().toLowerCase(),
    };
    const caseFiltered = f.case_priority !== "all" || f.case_status !== "all" || f.case_sla !== "all";
    // Dispute records carry no priority or task SLA, so they only participate
    // when no case-level priority/SLA filter is active and the status filter
    // is compatible with completed dispute work.
    const disputesEligibleForFilters =
      f.case_priority === "all" && f.case_sla === "all" &&
      (f.case_status === "all" || f.case_status === "resolved");
    const disputeById = new Map((disputes ?? []).map((d) => [d.id, d]));
    /** Recognised investigation start for a dispute-backed case. */
    const disputeStart = (disputeId: string): number | null => {
      const d = disputeById.get(disputeId);
      const task = allTasks.find((t) => t.dispute_id === disputeId);
      const raw = task?.assigned_at ?? task?.started_at ?? d?.opened_at ?? null;
      if (!raw) return null;
      const ms = new Date(raw).getTime();
      return Number.isNaN(ms) ? null : ms;
    };
    /** Resolution durations for disputes personally resolved by an agent. */
    const disputeResolutionMs = (userId: string, from: Date, to: Date, skip: Set<string>) => {
      if (!disputesEligibleForFilters) return [] as number[];
      const out: number[] = [];
      for (const o of outcomes ?? []) {
        if (o.resolved_by_user_id !== userId) continue;
        if (!inWindow(o.resolved_at, from, to)) continue;
        if (!o.dispute_id || skip.has(o.dispute_id)) continue;
        const d = disputeById.get(o.dispute_id);
        if (d && CANCELLED_STATUSES.has(String(d.status))) continue;
        const start = disputeStart(o.dispute_id);
        const end = new Date(String(o.resolved_at)).getTime();
        if (start == null || Number.isNaN(end)) continue;
        const ms = end - start;
        if (ms >= 0) out.push(ms);
      }
      return out;
    };
    const caseMatch = (t: Record<string, any>) => {
      if (f.case_priority !== "all" && String(t.priority) !== f.case_priority) return false;
      if (f.case_status !== "all") {
        const st = String(t.status);
        if (f.case_status === "open" && !ACTIVE_STATUSES.has(st)) return false;
        if (f.case_status === "waiting" && !WAITING_STATUSES.has(st)) return false;
        if (f.case_status === "resolved" && !DONE_STATUSES.has(st)) return false;
        if (!["open", "waiting", "resolved"].includes(f.case_status) && st !== f.case_status) return false;
      }
      if (f.case_sla !== "all") {
        const overdue = ["overdue", "breached"].includes(String(t.sla_status)) ||
          (!!t.due_at && !t.resolved_at && new Date(t.due_at).getTime() < Date.now());
        if (f.case_sla === "overdue" && !overdue) return false;
        if (f.case_sla === "on_track" && overdue) return false;
      }
      return true;
    };

    const buildRow = (u: Record<string, any>) => {
      const mine = allTasks.filter((t) => t.assigned_agent_id === u.id && caseMatch(t));
      const active = mine.filter((t) => ACTIVE_STATUSES.has(String(t.status)));
      const waiting = active.filter((t) => WAITING_STATUSES.has(String(t.status)));
      const critical = active.filter((t) => CRITICAL_PRIORITIES.has(String(t.priority)));
      const resolvedTasks = mine.filter(
        (t) => DONE_STATUSES.has(String(t.status)) && inWindow(t.resolved_at, range.from, range.to),
      );
      const prevResolved = mine.filter(
        (t) => DONE_STATUSES.has(String(t.status)) && inWindow(t.resolved_at, range.prevFrom, range.prevTo),
      );
      // Historical attribution: disputes this agent personally resolved,
      // even if the underlying task later moved to someone else.
      const outcomeIds = new Set(
        (outcomes ?? [])
          .filter((o) => o.resolved_by_user_id === u.id && inWindow(o.resolved_at, range.from, range.to))
          .map((o) => o.dispute_id),
      );
      for (const t of resolvedTasks) if (t.dispute_id) outcomeIds.delete(t.dispute_id);
      const disputeResolvedCount = disputesEligibleForFilters ? outcomeIds.size : 0;
      const resolvedCount = resolvedTasks.length + disputeResolvedCount;
      const prevOutcomeIds = new Set(
        (outcomes ?? [])
          .filter((o) => o.resolved_by_user_id === u.id && inWindow(o.resolved_at, range.prevFrom, range.prevTo))
          .map((o) => o.dispute_id),
      );
      for (const t of prevResolved) if (t.dispute_id) prevOutcomeIds.delete(t.dispute_id);
      const prevResolvedCount = prevResolved.length + (disputesEligibleForFilters ? prevOutcomeIds.size : 0);

      const taskDisputeIds = new Set(resolvedTasks.map((t) => t.dispute_id).filter(Boolean) as string[]);
      const resolutionMs = resolvedTasks
        .filter((t) => t.assigned_at && t.resolved_at && !CANCELLED_STATUSES.has(String(t.status)))
        .map((t) => new Date(t.resolved_at!).getTime() - new Date(t.assigned_at!).getTime())
        .filter((ms) => ms >= 0)
        // Disputes this agent personally resolved without a task record still
        // count toward their average resolution time.
        .concat(disputeResolutionMs(u.id, range.from, range.to, taskDisputeIds));
      const firstActionMs = mine
        .filter((t) => t.assigned_at && t.first_action_at && inWindow(t.first_action_at, range.from, range.to))
        .map((t) => new Date(t.first_action_at!).getTime() - new Date(t.assigned_at!).getTime())
        .filter((ms) => ms >= 0);

      const overdue = active.filter(
        (t) => ["overdue", "breached"].includes(String(t.sla_status)) || (t.due_at && new Date(t.due_at).getTime() < now),
      );
      const onTime = resolvedTasks.filter((t) => !t.due_at || (t.resolved_at && new Date(t.resolved_at).getTime() <= new Date(t.due_at).getTime()));
      const breached = resolvedTasks.length - onTime.length;
      const slaCompliance = pct(onTime.length, resolvedTasks.length);

      const windowHistory = (history ?? []).filter((h) => inWindow(h.created_at, range.from, range.to));
      const reassignedAway = windowHistory.filter((h) => h.from_agent_id === u.id).length;
      const reassignedIn = windowHistory.filter(
        (h) => h.to_agent_id === u.id && h.from_agent_id && h.from_agent_id !== u.id,
      ).length;
      const legacyEscalations = mine.filter(
        (t) =>
          Number(t.escalation_level ?? 0) > 0 &&
          !escalatedTaskIds.has(t.id) &&
          inWindow(t.created_at, range.from, range.to),
      ).length;
      const escalations = (escalationsByAgent.get(u.id) ?? 0) + legacyEscalations;

      const cap = capByUser.get(u.id);
      const maxActive = Number(cap?.max_active_tasks ?? 10);
      const av = availByUser.get(u.id);
      const heartbeat = av?.last_heartbeat ? new Date(av.last_heartbeat).getTime() : 0;
      const isLive = now - heartbeat < HEARTBEAT_WINDOW_MS;
      const availabilityStatus = !isLive && av?.status && !["on_leave", "suspended"].includes(av.status)
        ? "offline"
        : (av?.status ?? "offline");

      const roleKeys = rolesByUser.get(u.id) ?? [];
      const primaryRole = roleKeys[0] ?? null;

      return {
        user_id: u.id,
        first_name: u.first_name,
        last_name: u.last_name,
        full_name: u.full_name,
        email: u.email,
        role_key: primaryRole,
        role_label: primaryRole ? (roleName.get(primaryRole) ?? primaryRole) : "Internal User",
        role_keys: roleKeys,
        team: u.team ?? null,
        department: u.department ?? null,
        job_title: u.job_title ?? null,
        availability: availabilityStatus,
        is_live: isLive,
        last_heartbeat: av?.last_heartbeat ?? null,
        last_active_at: u.last_active_at ?? null,
        skills: skillsByUser.get(u.id) ?? [],
        active_cases: active.length,
        waiting_cases: waiting.length,
        critical_cases: critical.length,
        max_active: maxActive,
        at_capacity: active.length >= maxActive,
        resolved: resolvedCount,
        resolved_prev: prevResolvedCount,
        avg_resolution_hours: resolutionMs.length ? hours(avg(resolutionMs)) : null,
        resolution_sample: resolutionMs.length,
        avg_first_action_minutes: firstActionMs.length ? Math.round(avg(firstActionMs) / 60_000) : null,
        overdue: overdue.length,
        breached,
        on_time: onTime.length,
        sla_compliance: slaCompliance,
        reassignments: reassignedAway + reassignedIn,
        reassignments_out: reassignedAway,
        reassignments_in: reassignedIn,
        escalations,
        score: 0,
        score_band: "",
      };
    };

    let rows = eligible.map(buildRow);
    const teams = Array.from(new Set(rows.map((r) => r.team).filter(Boolean))) as string[];

    rows = rows.filter((r) => {
      if (f.team !== "all" && (r.team ?? "") !== f.team) return false;
      if (f.role !== "all" && !r.role_keys.includes(f.role)) return false;
      if (f.availability !== "all" && r.availability !== f.availability) return false;
      if (f.overdue_only && r.overdue === 0) return false;
      if (f.min_active > 0 && r.active_cases < f.min_active) return false;
      if (f.min_overdue > 0 && r.overdue < f.min_overdue) return false;
      if (caseFiltered && r.active_cases === 0 && r.resolved === 0) return false;
      if (f.sla === "breached" && r.breached === 0) return false;
      if (f.sla === "compliant" && r.sla_compliance < 100) return false;
      if (f.search) {
        const hay = `${r.first_name ?? ""} ${r.last_name ?? ""} ${r.full_name ?? ""} ${r.email ?? ""} ${r.user_id}`.toLowerCase();
        if (!hay.includes(f.search)) return false;
      }
      return true;
    });

    // ---- score ---------------------------------------------------------
    const medianResolution = (() => {
      const xs = rows.map((r) => r.avg_resolution_hours).filter((x): x is number => x != null).sort((a, b) => a - b);
      return xs.length ? xs[Math.floor(xs.length / 2)] : null;
    })();

    for (const r of rows) {
      const slaPart = r.sla_compliance; // 0..100
      const speedPart = r.avg_resolution_hours == null || !medianResolution
        ? 100
        : Math.max(0, Math.min(100, 100 - ((r.avg_resolution_hours - medianResolution) / Math.max(medianResolution, 0.5)) * 25));
      const load = r.active_cases + r.resolved;
      const overduePart = Math.max(0, 100 - (load > 0 ? (r.overdue / Math.max(load, 1)) * 100 : 0) * 2);
      const escalationPart = Math.max(0, 100 - (load > 0 ? (r.escalations / Math.max(load, 1)) * 100 : 0) * 1.5);
      const score = Math.round((slaPart * 0.4 + speedPart * 0.25 + overduePart * 0.2 + escalationPart * 0.15) * 10) / 10;
      r.score = Math.max(0, Math.min(100, score));
      r.score_band = scoreBand(r.score);
    }
    rows.sort((a, b) => b.score - a.score || b.resolved - a.resolved);
    const ranked = rows
      .map((r, i) => ({ ...r, rank: i + 1 }))
      .filter((r) => r.score >= f.score_min && r.score <= f.score_max);

    // ---- summary --------------------------------------------------------
    const liveAgents = ranked.filter((r) => r.is_live).length;
    // Eligible, active-status agents in the current team/role scope. Being
    // signed in is never the criterion — suspended / on-leave are excluded.
    const activeAgents = ranked.filter((r) => !["on_leave", "suspended"].includes(r.availability)).length;
    const prevActiveAgents = (users ?? []).filter(
      (u) => u.status === "active" && u.last_active_at && new Date(u.last_active_at) < range.from,
    ).length;

    const scopedIds = new Set(ranked.map((r) => r.user_id));
    const scopedTasks = allTasks.filter((t) => t.assigned_agent_id && scopedIds.has(t.assigned_agent_id));
    // Open dispute work owned by the agents currently in scope. Always
    // dispute-backed and always assigned — never a global fallback count.
    const openDisputeTasks = scopedTasks.filter(
      (t) => ACTIVE_STATUSES.has(String(t.status)) && (t.dispute_id || DISPUTE_TASK_TYPES.has(String(t.type))),
    );
    // Platform-wide open disputes, reported separately as context.
    const openDisputesPlatform = (disputes ?? []).filter(
      (d) => !["resolved", "closed", "cancelled"].includes(String(d.status)),
    ).length;
    const coveredDisputeIds = new Set(
      openDisputeTasks.map((t) => t.dispute_id).filter(Boolean) as string[],
    );
    const unassignedDisputes = Math.max(0, openDisputesPlatform - coveredDisputeIds.size);

    const resolvedTotal = ranked.reduce((s, r) => s + r.resolved, 0);
    const prevResolvedTotal = ranked.reduce((s, r) => s + r.resolved_prev, 0);
    const resolvedDeltaPct = prevResolvedTotal > 0
      ? Math.round(((resolvedTotal - prevResolvedTotal) / prevResolvedTotal) * 1000) / 10
      : null;

    // Case-level mean over completed cases only (both timestamps present,
    // not cancelled/invalid), so the tooltip sample size is meaningful.
    const taskDisputeIdsAll = new Set(
      scopedTasks.filter((t) => DONE_STATUSES.has(String(t.status)) && t.dispute_id).map((t) => t.dispute_id) as string[],
    );
    const taskSamples = scopedTasks
      .filter((t) =>
        DONE_STATUSES.has(String(t.status)) &&
        !CANCELLED_STATUSES.has(String(t.status)) &&
        inWindow(t.resolved_at, range.from, range.to) &&
        t.assigned_at && t.resolved_at)
      .map((t) => new Date(t.resolved_at!).getTime() - new Date(t.assigned_at!).getTime())
      .filter((ms) => ms >= 0);
    const disputeSamples = ranked.flatMap((r) =>
      disputeResolutionMs(r.user_id, range.from, range.to, taskDisputeIdsAll));
    const resolutionSamples = taskSamples.concat(disputeSamples);
    const avgResolution = resolutionSamples.length ? hours(avg(resolutionSamples)) : null;

    const prevResolutionMs = scopedTasks
      .filter((t) => DONE_STATUSES.has(String(t.status)) && inWindow(t.resolved_at, range.prevFrom, range.prevTo) && t.assigned_at)
      .map((t) => new Date(t.resolved_at!).getTime() - new Date(t.assigned_at!).getTime())
      .filter((ms) => ms >= 0)
      .concat(
        ranked.flatMap((r) => disputeResolutionMs(r.user_id, range.prevFrom, range.prevTo, taskDisputeIdsAll)),
      );
    const prevAvgResolution = prevResolutionMs.length ? hours(avg(prevResolutionMs)) : null;
    const resolutionDelta = avgResolution != null && prevAvgResolution != null
      ? Math.round((avgResolution - prevAvgResolution) * 10) / 10
      : null;

    const overdueTotal = ranked.reduce((s, r) => s + r.overdue, 0);
    const topCandidates = ranked.filter((r) => r.resolved >= TOP_AGENT_MIN_CASES);
    const top = topCandidates[0] ?? null;

    const summary = {
      active_agents: activeAgents,
      active_agents_delta: activeAgents - prevActiveAgents,
      live_agents: liveAgents,
      open_disputes: openDisputeTasks.length,
      open_disputes_platform: openDisputesPlatform,
      open_disputes_unassigned: unassignedDisputes,
      resolved_in_window: resolvedTotal,
      resolved_label: range.label,
      resolved_delta_pct: resolvedDeltaPct,
      avg_resolution_hours: avgResolution,
      avg_resolution_sample: resolutionSamples.length,
      avg_resolution_delta: resolutionDelta,
      overdue_cases: overdueTotal,
      top_agent: top ? { user_id: top.user_id, name: top.full_name ?? top.email, score: top.score } : null,
    };

    // ---- trend (per day, for the Performance tab) -------------------------
    const days: { date: string; resolved: number; avg_hours: number | null; breached: number }[] = [];
    const dayCount = Math.min(30, Math.max(1, Math.ceil((range.to.getTime() - range.from.getTime()) / 86_400_000)));
    for (let i = dayCount - 1; i >= 0; i--) {
      const dayEnd = new Date(range.to.getTime() - i * 86_400_000);
      const dayStart = new Date(dayEnd.getTime() - 86_400_000);
      const dayTasks = scopedTasks.filter((t) => DONE_STATUSES.has(String(t.status)) && inWindow(t.resolved_at, dayStart, dayEnd));
      const ms = dayTasks.filter((t) => t.assigned_at).map((t) => new Date(t.resolved_at!).getTime() - new Date(t.assigned_at!).getTime());
      days.push({
        date: dayEnd.toISOString().slice(0, 10),
        resolved: dayTasks.length,
        avg_hours: ms.length ? hours(avg(ms)) : null,
        breached: dayTasks.filter((t) => t.due_at && new Date(t.resolved_at!).getTime() > new Date(t.due_at).getTime()).length,
      });
    }

    // ---- export -----------------------------------------------------------
    if (isExport) {
      const tab = String(body.tab ?? "workload");
      const header = [
        "rank", "agent", "email", "role", "team", "availability",
        "active_cases", "waiting_cases", "critical_cases", "resolved", "avg_resolution_hours", "avg_first_action_minutes",
        "overdue", "breached", "sla_compliance_pct", "reassignments", "escalations", "score", "band",
      ];
      const maskPii = body.mask_pii === true;
      const lines = [header.join(",")];
      for (const r of ranked) {
        lines.push([
          r.rank,
          maskPii ? `Agent ${r.rank}` : (r.full_name ?? `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim()),
          maskPii ? "" : (r.email ?? ""),
          r.role_label, r.team ?? "", r.availability,
          r.active_cases, r.waiting_cases, r.critical_cases, r.resolved, r.avg_resolution_hours ?? "", r.avg_first_action_minutes ?? "",
          r.overdue, r.breached, r.sla_compliance, r.reassignments, r.escalations, r.score, r.score_band,
        ].map(csvEscape).join(","));
      }
      const meta = extractRequestMeta(req);
      await logAdminAction(admin, {
        actorId: ctx.userId,
        action: "export_agent_performance",
        targetType: "system",
        reason: typeof body.reason === "string" ? body.reason : undefined,
        metadata: { tab, range: range.label, rows: ranked.length, mask_pii: maskPii, filters: f },
        mirrorToAuditLogs: true,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      return new Response(
        JSON.stringify({ csv: lines.join("\n"), filename: `agent-performance-${tab}-${new Date().toISOString().slice(0, 10)}.csv` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        summary,
        agents: ranked,
        total: ranked.length,
        trend: days,
        facets: {
          teams,
          // Only roles that actually qualify someone for this screen — the
          // same eligibility rule used above, plus any role already held by a
          // listed agent.
          roles: (roles ?? [])
            .filter((r) => agentRoleKeys.has(r.key) || ranked.some((a) => a.role_keys.includes(r.key)))
            .map((r) => ({ key: r.key, name: r.name })),
        },
        range: { key: String(body.range ?? "7d"), label: range.label, from: range.from.toISOString(), to: range.to.toISOString() },
        permissions: {
          can_export: canExport,
          can_rebalance: canRebalance,
          can_view_orchestration: canViewOrchestration,
          can_view_disputes: canViewDisputes,
        },
        generated_at: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("agent_performance_failed", err);
    return new Response(JSON.stringify({ error: "agent_performance_failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});