// Agent Performance & Dispute Operations.
// Single read endpoint powering /admin/agent-performance: summary KPIs,
// per-agent workload / performance / SLA / ranking rows, filter facets and
// CSV export. Everything is derived from existing internal-user, orchestration
// task and dispute records: no separate agent registry.
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
/** Waiting states where the workflow genuinely stops the SLA clock. */
const PAUSED_STATUSES = new Set(["waiting_on_buyer", "waiting_on_seller", "waiting_on_evidence"]);
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

type Range = { from: Date; to: Date; prevFrom: Date; prevTo: Date; label: string; allTime: boolean };

function resolveRange(body: Record<string, unknown>): Range {
  const now = new Date();
  const key = String(body.range ?? "7d");
  // "All time" scope ignores the range selector entirely and suppresses
  // period-over-period deltas (there is no meaningful previous window).
  if (String(body.scope ?? "range") === "all_time") {
    const from = new Date(0);
    return { from, to: now, prevFrom: from, prevTo: from, label: "All time", allTime: true };
  }
  let from: Date;
  let to = now;
  let label = "Last 7 Days";
  if (key === "custom" && body.date_from) {
    from = new Date(String(body.date_from));
    to = body.date_to ? new Date(String(body.date_to)) : now;
    label = "Custom range";
  } else if (key === "today") {
    from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    label = "Today";
  } else if (key === "prev_month") {
    from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    label = "Previous Month";
  } else if (key === "quarter") {
    const q = Math.floor(now.getUTCMonth() / 3) * 3;
    from = new Date(Date.UTC(now.getUTCFullYear(), q, 1));
    label = "Current Quarter";
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
    allTime: false,
  };
}

const inWindow = (ts: string | null | undefined, a: Date, b: Date) => {
  if (!ts) return false;
  const t = new Date(ts).getTime();
  return t >= a.getTime() && t <= b.getTime();
};
const hours = (ms: number) => Math.round((ms / 3_600_000) * 10) / 10;
const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0);

function scoreBand(score: number): string {
  if (score >= 90) return "Excellent";
  if (score >= 75) return "Very Good";
  if (score >= 60) return "Good";
  return "Needs Attention";
}

/** Default minimum completed cases before a score is considered comparable. */
const DEFAULT_MIN_SAMPLE = 3;

export interface ScoreComponent {
  key: string;
  label: string;
  weight: number;
  raw: number | null;
  raw_label: string;
  normalised: number | null;
  contribution: number;
  tracked: boolean;
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
  const isAgentActivity = body.mode === "agent_activity";

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

  // ---- per-agent operational activity (drawer) --------------------------
  if (isAgentActivity) {
    const agentId = String(body.agent_id ?? "");
    if (!agentId) {
      return new Response(JSON.stringify({ error: "agent_id_required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const [{ data: assignEvents }, { data: statusEvents }, { data: comments }] = await Promise.all([
      admin.from("task_assignment_history")
        .select("id, task_id, from_agent_id, to_agent_id, mode, reason, created_at")
        .or(`from_agent_id.eq.${agentId},to_agent_id.eq.${agentId}`)
        .order("created_at", { ascending: false }).limit(60),
      admin.from("task_status_history")
        .select("id, task_id, from_status, to_status, actor_id, created_at")
        .eq("actor_id", agentId)
        .order("created_at", { ascending: false }).limit(60),
      admin.from("task_comments")
        .select("id, task_id, created_at, author_id")
        .eq("author_id", agentId)
        .order("created_at", { ascending: false }).limit(40),
    ]);
    const events = [
      ...(assignEvents ?? []).map((e) => ({
        id: `a-${e.id}`,
        at: e.created_at,
        kind: e.to_agent_id === agentId ? "assigned" : "reassigned_away",
        title: e.to_agent_id === agentId ? "Case assigned to agent" : "Case moved to another agent",
        detail: [e.mode ? `mode: ${e.mode}` : null, e.reason].filter(Boolean).join(" · ") || null,
        task_id: e.task_id,
      })),
      ...(statusEvents ?? []).map((e) => ({
        id: `s-${e.id}`,
        at: e.created_at,
        kind: "status_change",
        title: `Status changed${e.from_status ? ` from ${String(e.from_status).replace(/_/g, " ")}` : ""} to ${String(e.to_status).replace(/_/g, " ")}`,
        detail: null as string | null,
        task_id: e.task_id,
      })),
      ...(comments ?? []).map((c) => ({
        id: `c-${c.id}`,
        at: c.created_at,
        kind: "comment",
        title: "Added a case note",
        detail: null as string | null,
        task_id: c.task_id,
      })),
    ]
      .filter((e) => !!e.at)
      .sort((a, b) => new Date(String(b.at)).getTime() - new Date(String(a.at)).getTime())
      .slice(0, 100);
    return new Response(JSON.stringify({ events }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ---- per-agent case list (drawer) -------------------------------------
  if (isAgentCases) {
    const agentId = String(body.agent_id ?? "");
    if (!agentId) {
      return new Response(JSON.stringify({ error: "agent_id_required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const page = Math.max(1, Number(body.page ?? 1) || 1);
    const pageSize = Math.min(200, Math.max(25, Number(body.page_size ?? 100) || 100));
    const { data: caseRows, error: caseErr, count: taskCount } = await admin
      .from("orchestration_tasks")
      .select("id, task_code, title, type, priority, status, stage, sla_status, due_at, created_at, assigned_at, resolved_at, dispute_id, transaction_id, amount, currency, escalation_level")
      .eq("assigned_agent_id", agentId)
      .order("created_at", { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1)
      .limit(pageSize);
    if (caseErr) {
      return new Response(JSON.stringify({ error: "cases_fetch_failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const nowTs = Date.now();
    // Same filter semantics as the dashboard rows so the drawer count and the
    // workload row can never disagree.
    const cf = {
      priority: String(body.case_priority ?? "all"),
      status: String(body.case_status ?? "all"),
      sla: String(body.case_sla ?? "all"),
      stage: String(body.case_stage ?? "all"),
    };
    const isOverdueTask = (t: Record<string, any>) =>
      ["overdue", "breached"].includes(String(t.sla_status)) ||
      (!!t.due_at && !t.resolved_at && new Date(t.due_at).getTime() < nowTs);
    const taskMatches = (t: Record<string, any>) => {
      if (cf.priority !== "all" && String(t.priority) !== cf.priority) return false;
      if (cf.stage !== "all" && String(t.stage) !== cf.stage) return false;
      if (cf.status !== "all") {
        const st = String(t.status);
        if (cf.status === "open" && !ACTIVE_STATUSES.has(st)) return false;
        if (cf.status === "waiting" && !WAITING_STATUSES.has(st)) return false;
        if (cf.status === "resolved" && !DONE_STATUSES.has(st)) return false;
        if (!["open", "waiting", "resolved"].includes(cf.status) && st !== cf.status) return false;
      }
      if (cf.sla !== "all") {
        const overdue = isOverdueTask(t);
        if (cf.sla === "overdue" && !overdue) return false;
        if (cf.sla === "on_track" && overdue) return false;
      }
      return true;
    };
    // Active work is window-independent (open now is open now); resolved work
    // must fall inside the selected window, matching the dashboard KPI.
    const scopedRows = (caseRows ?? []).filter((t) => {
      if (!taskMatches(t)) return false;
      if (ACTIVE_STATUSES.has(String(t.status))) return true;
      if (DONE_STATUSES.has(String(t.status))) return inWindow(t.resolved_at, range.from, range.to);
      return false;
    });
    const cases: Record<string, unknown>[] = scopedRows.map((t) => ({
      ...t,
      source: "task",
      case_ref: t.task_code,
      opened_at: t.created_at,
      is_active: ACTIVE_STATUSES.has(String(t.status)),
      is_overdue: isOverdueTask(t),
    }));

    // Disputes this agent personally resolved may have no orchestration task
    // (legacy or manually handled cases). Surface them as dispute-backed rows
    // so the drawer never looks empty while the KPIs count the work.
    // Dedupe rule mirrors buildRow: only the agent's resolved-in-window tasks
    // suppress a dispute row, so one case is never listed twice.
    const coveredDisputeIds = new Set(
      scopedRows
        .filter((t) => DONE_STATUSES.has(String(t.status)))
        .map((t) => t.dispute_id)
        .filter(Boolean) as string[],
    );
    const { data: agentOutcomes } = await admin
      .from("dispute_outcomes")
      .select("dispute_id, outcome_type, decision_summary, refund_amount, release_amount, resolved_at")
      .eq("resolved_by_user_id", agentId)
      .gte("resolved_at", range.from.toISOString())
      .lte("resolved_at", range.to.toISOString())
      .order("resolved_at", { ascending: false })
      .limit(1001);
    const extraDisputeIds = (agentOutcomes ?? [])
      .map((o) => o.dispute_id)
      .filter((id): id is string => !!id && !coveredDisputeIds.has(id));
    // Dispute rows are always "resolved" cases, so they are dropped whenever
    // the case-status filter is asking for open/waiting work only.
    const disputesPassFilters = cf.priority === "all" &&
      cf.sla !== "overdue" &&
      ["all", "resolved"].includes(cf.status);
    if (extraDisputeIds.length && disputesPassFilters) {
      const { data: disputeRows } = await admin
        .from("disputes")
        .select("id, reason, description, status, opened_at, resolved_at, transaction_id")
        .in("id", extraDisputeIds);
      const byId = new Map((disputeRows ?? []).map((d) => [d.id, d]));
      const seen = new Set<string>();
      for (const o of agentOutcomes ?? []) {
        if (!o.dispute_id || coveredDisputeIds.has(o.dispute_id)) continue;
        if (seen.has(o.dispute_id)) continue;
        seen.add(o.dispute_id);
        // Orphan outcome (parent dispute unreadable) still counts. The
        // dashboard counts it, so the drawer must list it too.
        const d = byId.get(o.dispute_id) ?? null;
        const amount = Number(o.refund_amount ?? 0) || Number(o.release_amount ?? 0) || null;
        if (d && CANCELLED_STATUSES.has(String(d.status))) continue;
        cases.push({
          id: o.dispute_id,
          source: "dispute",
          case_ref: `DSP-${String(o.dispute_id).slice(0, 8).toUpperCase()}`,
          task_code: null,
          title: `${String(d?.reason ?? "dispute").replace(/_/g, " ")} dispute`,
          type: "dispute_review",
          priority: null,
          status: d?.status ?? "resolved",
          stage: null,
          sla_status: null,
          due_at: null,
          created_at: d?.opened_at ?? o.resolved_at,
          opened_at: d?.opened_at ?? null,
          assigned_at: null,
          resolved_at: o.resolved_at ?? d?.resolved_at ?? null,
          dispute_id: o.dispute_id,
          transaction_id: d?.transaction_id ?? null,
          amount,
          currency: "NGN",
          escalation_level: 0,
          outcome_type: o.outcome_type,
          decision_summary: o.decision_summary,
          is_active: false,
          is_overdue: false,
        });
      }
    }
    cases.sort((a, b) =>
      new Date(String(b.created_at ?? 0)).getTime() - new Date(String(a.created_at ?? 0)).getTime());
    const total = cases.length;
    const hasMore = (taskCount ?? 0) > page * pageSize || (agentOutcomes?.length ?? 0) > pageSize;
    return new Response(JSON.stringify({
      cases,
      total,
      page,
      page_size: pageSize,
      has_more: hasMore,
      truncated: hasMore,
      range: { key: range.allTime ? "all_time" : String(body.range ?? "7d"), label: range.label },
    }), {
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
    const canEscalate = callerPerms.has("task_orchestration.escalate");
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
    if (range.allTime) {
      const firstRecordedAt = [
        ...allTasks.flatMap((t) => [t.created_at, t.assigned_at, t.resolved_at]),
        ...(outcomes ?? []).map((o) => o.resolved_at),
        ...(disputes ?? []).map((d) => d.opened_at),
      ]
        .filter(Boolean)
        .map((value) => new Date(String(value)).getTime())
        .filter((value) => Number.isFinite(value) && value > 0)
        .sort((a, b) => a - b)[0];
      if (firstRecordedAt) range.from = new Date(firstRecordedAt);
    }

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
      min_completed: Number(body.min_completed ?? 0) || 0,
      hide_insufficient: body.hide_insufficient === true,
      performance_level: String(body.performance_level ?? "all"),
      case_priority: String(body.case_priority ?? "all"),
      case_status: String(body.case_status ?? "all"),
      case_sla: String(body.case_sla ?? "all"),
      case_stage: String(body.case_stage ?? "all"),
      search: String(body.search ?? "").trim().toLowerCase(),
    };
    const caseFiltered = f.case_priority !== "all" || f.case_status !== "all" ||
      f.case_sla !== "all" || f.case_stage !== "all";
    // Dispute records carry no priority or task SLA, so they only participate
    // when no case-level priority/SLA filter is active and the status filter
    // is compatible with completed dispute work.
    const disputesEligibleForFilters =
      f.case_priority === "all" && f.case_sla === "all" && f.case_stage === "all" &&
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
      if (f.case_stage !== "all" && String(t.stage) !== f.case_stage) return false;
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
      const slaTracked = resolvedTasks.filter((t) => !!t.due_at && !!t.resolved_at);
      const onTime = slaTracked.filter((t) => new Date(t.resolved_at!).getTime() <= new Date(t.due_at!).getTime());
      const breached = slaTracked.length - onTime.length;
      const slaCompliance = slaTracked.length ? pct(onTime.length, slaTracked.length) : null;
      // Live SLA posture across the agent's open, SLA-tracked work.
      const activeTracked = active.filter((t) => !!t.due_at && String(t.sla_status) !== "paused");
      const atRisk = activeTracked.filter((t) => {
        const left = new Date(t.due_at!).getTime() - now;
        return left > 0 && left <= 2 * 60 * 60 * 1000;
      }).length;
      const onTrack = activeTracked.filter((t) => new Date(t.due_at!).getTime() - now > 2 * 60 * 60 * 1000).length;

      const windowHistory = (history ?? []).filter((h) => inWindow(h.created_at, range.from, range.to));
      const reassignedAway = windowHistory.filter((h) => h.from_agent_id === u.id).length;
      // Manager-initiated load balancing must never count against an agent.
      const rebalanceOut = windowHistory.filter(
        (h) =>
          h.from_agent_id === u.id &&
          /rebalanc|balanc|capacity|workload/i.test(`${h.mode ?? ""} ${h.reason ?? ""}`),
      ).length;
      const avoidableReassignments = Math.max(0, reassignedAway - rebalanceOut);
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
        sla_on_track: onTrack,
        sla_at_risk: atRisk,
        sla_completed_within: onTime.length,
        sla_completed_outside: breached,
        reassignments: reassignedAway + reassignedIn,
        reassignments_out: reassignedAway,
        reassignments_in: reassignedIn,
        escalations,
        first_action_sample: firstActionMs.length,
        sla_sample: slaTracked.length,
        avoidable_reassignments: avoidableReassignments,
        // Cases deliberately kept out of penalty maths, with their reason.
        score_exclusions: [
          { reason: "Waiting on buyer or seller", count: waiting.length },
          {
            reason: "Paused by an authorised workflow",
            count: active.filter((t) => String(t.sla_status) === "paused").length,
          },
          { reason: "No configured SLA", count: mine.filter((t) => !t.due_at).length },
          { reason: "Manager rebalance reassignment", count: rebalanceOut },
        ].filter((e) => e.count > 0),
        score: 0,
        score_band: "",
        score_components: [] as ScoreComponent[],
        score_penalties: [] as { reason: string; points: number }[],
        score_included_cases: 0,
        score_excluded_cases: 0,
        insufficient_data: false,
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
      if (f.sla === "compliant" && r.sla_compliance !== 100) return false;
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

    const medianFirstAction = (() => {
      const xs = rows.map((r) => r.avg_first_action_minutes).filter((x): x is number => x != null).sort((a, b) => a - b);
      return xs.length ? xs[Math.floor(xs.length / 2)] : null;
    })();
    const maxResolved = Math.max(1, ...rows.map((r) => r.resolved));

    for (const r of rows) {
      const load = r.active_cases + r.resolved;
      const excluded = (r.score_exclusions ?? []).reduce((s: number, e: { count: number }) => s + e.count, 0);
      // Penalty denominators ignore excluded cases so waiting / paused /
      // unconfigured work can never drag a score down.
      const penaltyBase = Math.max(1, load - excluded);

      /** Speed component: relative to the cohort median, never absolute. */
      const relSpeed = (value: number | null, median: number | null) =>
        value == null || !median
          ? null
          : Math.max(0, Math.min(100, 100 - ((value - median) / Math.max(median, 0.5)) * 25));

      const overdueRate = r.overdue / penaltyBase;
      const escalationRate = r.escalations / penaltyBase;
      // Log normalisation so raw case volume alone cannot dominate the score.
      const workloadNorm = Math.round((Math.log10(1 + r.resolved) / Math.log10(1 + maxResolved)) * 1000) / 10;

      const defs: Omit<ScoreComponent, "contribution">[] = [
        {
          key: "sla_compliance", label: "SLA compliance", weight: 0.3,
          raw: r.sla_compliance, raw_label: r.sla_compliance == null ? "Not tracked" : `${r.sla_compliance}%`,
          normalised: r.sla_compliance, tracked: r.sla_compliance != null,
        },
        {
          key: "resolution_time", label: "Avg resolution time", weight: 0.2,
          raw: r.avg_resolution_hours,
          raw_label: r.avg_resolution_hours == null ? "No sample" : `${r.avg_resolution_hours}h`,
          normalised: relSpeed(r.avg_resolution_hours, medianResolution),
          tracked: r.avg_resolution_hours != null && medianResolution != null,
        },
        {
          key: "first_action_time", label: "Avg first action", weight: 0.15,
          raw: r.avg_first_action_minutes,
          raw_label: r.avg_first_action_minutes == null ? "No sample" : `${r.avg_first_action_minutes}m`,
          normalised: relSpeed(r.avg_first_action_minutes, medianFirstAction),
          tracked: r.avg_first_action_minutes != null && medianFirstAction != null,
        },
        {
          key: "overdue_rate", label: "Overdue rate", weight: 0.15,
          raw: Math.round(overdueRate * 1000) / 10, raw_label: `${Math.round(overdueRate * 1000) / 10}%`,
          normalised: Math.max(0, 100 - overdueRate * 200), tracked: true,
        },
        {
          key: "escalation_accuracy", label: "Escalation accuracy", weight: 0.1,
          raw: Math.round(escalationRate * 1000) / 10, raw_label: `${Math.round(escalationRate * 1000) / 10}%`,
          normalised: Math.max(0, 100 - escalationRate * 150), tracked: true,
        },
        {
          key: "resolved_workload", label: "Resolved workload (log-normalised)", weight: 0.1,
          raw: r.resolved, raw_label: `${r.resolved} resolved`,
          normalised: workloadNorm, tracked: true,
        },
      ];

      // Untracked components are dropped and their weight redistributed, so a
      // missing metric never reads as a zero.
      const trackedWeight = defs.filter((d) => d.tracked && d.normalised != null)
        .reduce((s, d) => s + d.weight, 0);
      const components: ScoreComponent[] = defs.map((d) => {
        const usable = d.tracked && d.normalised != null && trackedWeight > 0;
        const effWeight = usable ? d.weight / trackedWeight : 0;
        return {
          ...d,
          weight: Math.round(effWeight * 1000) / 10,
          contribution: usable ? Math.round((d.normalised as number) * effWeight * 10) / 10 : 0,
        };
      });

      const base = components.reduce((s, c) => s + c.contribution, 0);

      const penalties: { reason: string; points: number }[] = [];
      if (r.overdue > 0) penalties.push({ reason: `${r.overdue} overdue case(s)`, points: Math.min(6, r.overdue * 1.5) });
      if (r.breached >= 3) penalties.push({ reason: `${r.breached} SLA breaches (repeated)`, points: Math.min(6, r.breached) });
      if (r.avoidable_reassignments > 0) {
        penalties.push({
          reason: `${r.avoidable_reassignments} avoidable reassignment(s)`,
          points: Math.min(4, r.avoidable_reassignments),
        });
      }
      const penaltyTotal = penalties.reduce((s, p) => s + p.points, 0);

      const minSample = f.min_completed > 0 ? f.min_completed : DEFAULT_MIN_SAMPLE;
      const insufficient = r.resolved < minSample;

      r.score = Math.max(0, Math.min(100, Math.round((base - penaltyTotal) * 10) / 10));
      r.score_components = components;
      r.score_penalties = penalties;
      r.score_included_cases = Math.max(0, load - excluded);
      r.score_excluded_cases = excluded;
      r.insufficient_data = insufficient;
      r.score_band = insufficient ? "Insufficient Data" : scoreBand(r.score);
    }
    // Insufficient-data agents always rank after comparable agents.
    rows.sort((a, b) =>
      Number(a.insufficient_data) - Number(b.insufficient_data) ||
      b.score - a.score || b.resolved - a.resolved);
    const ranked = rows
      .map((r, i) => ({ ...r, rank: i + 1 }))
      .filter((r) => r.score >= f.score_min && r.score <= f.score_max)
      .filter((r) => !f.hide_insufficient || !r.insufficient_data)
      .filter((r) =>
        f.performance_level === "all" ||
        r.score_band.toLowerCase().replace(/\s+/g, "_") === f.performance_level);

    // ---- summary --------------------------------------------------------
    const liveAgents = ranked.filter((r) => r.is_live).length;
    // Eligible, active-status agents in the current team/role scope. Being
    // signed in is never the criterion. Suspended / on-leave are excluded.
    const activeAgents = ranked.filter((r) => !["on_leave", "suspended"].includes(r.availability)).length;
    const rankedIds = new Set(ranked.map((r) => r.user_id));
    const prevActiveAgents = eligible.filter(
      (u) => rankedIds.has(u.id) && u.last_active_at && new Date(u.last_active_at) < range.from,
    ).length;

    const scopedIds = new Set(ranked.map((r) => r.user_id));
    const scopedTasks = allTasks.filter((t) => t.assigned_agent_id && scopedIds.has(t.assigned_agent_id));
    // Open dispute work owned by the agents currently in scope. Always
    // dispute-backed and always assigned. Never a global fallback count.
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
    const resolvedDeltaPct = range.allTime
      ? null
      : prevResolvedTotal > 0
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
    const resolutionDelta = range.allTime
      ? null
      : avgResolution != null && prevAvgResolution != null
      ? Math.round((avgResolution - prevAvgResolution) * 10) / 10
      : null;

    const overdueTotal = ranked.reduce((s, r) => s + r.overdue, 0);
    const topCandidates = ranked.filter((r) => r.resolved >= TOP_AGENT_MIN_CASES);
    const top = topCandidates[0] ?? null;

    const summary = {
      active_agents: activeAgents,
      active_agents_delta: range.allTime ? null : activeAgents - prevActiveAgents,
      live_agents: liveAgents,
      open_disputes: openDisputeTasks.length,
      open_disputes_platform: openDisputesPlatform,
      open_disputes_unassigned: unassignedDisputes,
      resolved_in_window: resolvedTotal,
      resolved_label: range.label,
      resolved_delta_pct: resolvedDeltaPct,
      avg_resolution_hours: avgResolution,
      avg_resolution_sample: resolutionSamples.length,
      avg_resolution_sample_tasks: taskSamples.length,
      avg_resolution_sample_disputes: disputeSamples.length,
      avg_resolution_delta: resolutionDelta,
      overdue_cases: overdueTotal,
      top_agent: top ? { user_id: top.user_id, name: top.full_name ?? top.email, score: top.score } : null,
    };

    // ---- trend (bucketed, for the Performance tab) ------------------------
    // All-time windows start at the first recorded case instead of 1970 so the
    // chart never renders decades of empty buckets.
    const DAY = 86_400_000;
    const earliestTask = [
      ...scopedTasks.map((t) => t.created_at),
      ...(outcomes ?? []).filter((o) => o.resolved_by_user_id && scopedIds.has(o.resolved_by_user_id)).map((o) => o.resolved_at),
    ]
      .map((value) => new Date(String(value ?? "")).getTime())
      .filter((n) => Number.isFinite(n) && n > 0)
      .sort((a, b) => a - b)[0];
    const trendStart = range.allTime
      ? new Date(earliestTask ?? range.to.getTime() - 30 * DAY)
      : range.from;
    const trendSpan = Math.max(DAY, range.to.getTime() - trendStart.getTime());
    const granularity: "day" | "week" | "month" =
      trendSpan <= 31 * DAY ? "day" : trendSpan <= 200 * DAY ? "week" : "month";
    const bucketMs = granularity === "day" ? DAY : granularity === "week" ? 7 * DAY : 30 * DAY;
    const bucketCount = Math.min(36, Math.max(1, Math.ceil(trendSpan / bucketMs)));

    /** Resolution durations for tasks closed inside an arbitrary window. */
    const taskMsBetween = (a: Date, b: Date) =>
      scopedTasks
        .filter((t) =>
          DONE_STATUSES.has(String(t.status)) &&
          !CANCELLED_STATUSES.has(String(t.status)) &&
          inWindow(t.resolved_at, a, b) && t.assigned_at)
        .map((t) => new Date(t.resolved_at!).getTime() - new Date(t.assigned_at!).getTime())
        .filter((ms) => ms >= 0);

    const days: {
      date: string; label: string;
      resolved: number; assigned: number;
      completed: number; untracked: number;
      avg_hours: number | null; prev_avg_hours: number | null;
      on_time: number; breached: number; compliance: number | null;
    }[] = [];
    for (let i = bucketCount - 1; i >= 0; i--) {
      const bEnd = new Date(range.to.getTime() - i * bucketMs);
      const bStart = new Date(Math.max(trendStart.getTime(), bEnd.getTime() - bucketMs));
      const done = scopedTasks.filter((t) => DONE_STATUSES.has(String(t.status)) && inWindow(t.resolved_at, bStart, bEnd));
      const disputeDone = (outcomes ?? []).filter(
        (o) => o.resolved_by_user_id && scopedIds.has(o.resolved_by_user_id) &&
          inWindow(o.resolved_at, bStart, bEnd) &&
          !(o.dispute_id && taskDisputeIdsAll.has(o.dispute_id)),
      ).length;
      const ms = taskMsBetween(bStart, bEnd);
      const prevMs = range.allTime ? [] : taskMsBetween(new Date(bStart.getTime() - bucketMs), new Date(bEnd.getTime() - bucketMs));
      const slaDone = done.filter((t) => !!t.due_at && !!t.resolved_at);
      const onTimeCount = slaDone.filter(
        (t) => new Date(t.resolved_at!).getTime() <= new Date(t.due_at!).getTime(),
      ).length;
      const label = granularity === "month"
        ? bEnd.toISOString().slice(0, 7)
        : bEnd.toISOString().slice(5, 10);
      days.push({
        date: bEnd.toISOString().slice(0, 10),
        label,
        resolved: done.length + disputeDone,
        assigned: scopedTasks.filter((t) => inWindow(t.assigned_at, bStart, bEnd)).length,
        completed: done.length,
        untracked: done.length - slaDone.length + disputeDone,
        avg_hours: ms.length ? hours(avg(ms)) : null,
        prev_avg_hours: prevMs.length ? hours(avg(prevMs)) : null,
        on_time: onTimeCount,
        breached: slaDone.length - onTimeCount,
        compliance: slaDone.length ? pct(onTimeCount, slaDone.length) : null,
      });
    }

    // ---- performance block (Performance tab headline metrics) -------------
    const assignedInWindow = scopedTasks.filter((t) => inWindow(t.assigned_at, range.from, range.to)).length;
    const startedInWindow = scopedTasks.filter((t) => inWindow(t.started_at, range.from, range.to)).length;
    const firstActionSamples = scopedTasks
      .filter((t) => t.assigned_at && t.first_action_at && inWindow(t.first_action_at, range.from, range.to))
      .map((t) => new Date(t.first_action_at!).getTime() - new Date(t.assigned_at!).getTime())
      .filter((ms) => ms >= 0);
    const activeTotal = ranked.reduce((s, r) => s + r.active_cases, 0);
    const onTimeTotal = ranked.reduce((s, r) => s + r.on_time, 0);
    const breachedTotal = ranked.reduce((s, r) => s + r.breached, 0);
    const escalationsTotal = ranked.reduce((s, r) => s + r.escalations, 0);
    const reassignedOutTotal = ranked.reduce((s, r) => s + r.reassignments_out, 0);

    const performance = {
      cases_assigned: assignedInWindow,
      cases_started: startedInWindow,
      cases_resolved: resolvedTotal,
      cases_escalated: escalationsTotal,
      cases_reassigned_away: reassignedOutTotal,
      resolution_rate: assignedInWindow > 0 ? pct(resolvedTotal, assignedInWindow) : null,
      avg_first_action_minutes: firstActionSamples.length ? Math.round(avg(firstActionSamples) / 60_000) : null,
      avg_resolution_hours: avgResolution,
      avg_resolution_prev_hours: range.allTime ? null : prevAvgResolution,
      sla_compliance: onTimeTotal + breachedTotal > 0 ? pct(onTimeTotal, onTimeTotal + breachedTotal) : null,
      overdue_rate: activeTotal > 0 ? pct(overdueTotal, activeTotal) : null,
      // Not modelled anywhere in the schema yet. Surfaced as "not tracked"
      // rather than a fabricated zero.
      reopened_cases: null as number | null,
      quality_review_score: null as number | null,
      agents_counted: ranked.length,
      granularity,
      // Sample sizes so every average can state what it was measured on.
      resolution_sample: resolutionSamples.length,
      resolution_sample_tasks: taskSamples.length,
      resolution_sample_disputes: disputeSamples.length,
      first_action_sample: firstActionSamples.length,
      sla_sample: onTimeTotal + breachedTotal,
    };

    const statusBuckets = { active: 0, waiting: 0, escalated: 0, overdue: 0, resolved: 0 } as Record<string, number>;
    for (const t of scopedTasks) {
      const st = String(t.status);
      if (DONE_STATUSES.has(st)) {
        if (inWindow(t.resolved_at, range.from, range.to)) statusBuckets.resolved += 1;
        continue;
      }
      if (!ACTIVE_STATUSES.has(st)) continue;
      if (["overdue", "breached"].includes(String(t.sla_status)) || (t.due_at && new Date(t.due_at).getTime() < now)) {
        statusBuckets.overdue += 1;
      } else if (st === "escalated") statusBuckets.escalated += 1;
      else if (WAITING_STATUSES.has(st)) statusBuckets.waiting += 1;
      else statusBuckets.active += 1;
    }
    // Dispute-only resolutions have no task row but are counted in the
    // resolved KPI, so the distribution must include them to reconcile.
    for (const o of outcomes ?? []) {
      if (!o.resolved_by_user_id || !scopedIds.has(o.resolved_by_user_id)) continue;
      if (!inWindow(o.resolved_at, range.from, range.to)) continue;
      if (o.dispute_id && taskDisputeIdsAll.has(o.dispute_id)) continue;
      statusBuckets.resolved += 1;
    }

    // ---- SLA case rows (SLA Compliance tab) --------------------------------
    const agentNameById = new Map(ranked.map((r) => [
      r.user_id,
      { name: r.full_name ?? [r.first_name, r.last_name].filter(Boolean).join(" ") ?? r.email, team: r.team, role: r.role_label },
    ]));
    const slaState = (t: Record<string, any>) => {
      const st = String(t.status);
      if (CANCELLED_STATUSES.has(st)) return "cancelled";
      if (!t.due_at) return "not_configured";
      const due = new Date(t.due_at).getTime();
      if (!Number.isFinite(due)) return "not_configured";
      if (DONE_STATUSES.has(st)) {
        const end = t.resolved_at ? new Date(t.resolved_at).getTime() : due;
        return end <= due ? "completed_within" : "completed_outside";
      }
      const stored = String(t.sla_status ?? "");
      // Only the states where the workflow genuinely stops the clock pause the
      // SLA. Approval waits keep counting, and a stored breach always wins.
      if (["overdue", "breached"].includes(stored)) return "breached";
      if (PAUSED_STATUSES.has(st)) return "paused";
      if (due < now) return "breached";
      if (stored === "at_risk") return "at_risk";
      const start = t.assigned_at ? new Date(t.assigned_at).getTime() : new Date(String(t.created_at)).getTime();
      const total = Math.max(1, due - start);
      if ((due - now) / total <= 0.25) return "at_risk";
      return "on_track";
    };
    const slaRank: Record<string, number> = {
      breached: 0, at_risk: 1, on_track: 2, paused: 3,
      completed_outside: 4, completed_within: 5, not_configured: 6, cancelled: 7,
    };
    const slaTaskRows = scopedTasks
      .filter((t) => caseMatch(t) && scopedIds.has(String(t.assigned_agent_id)))
      .filter((t) =>
        ACTIVE_STATUSES.has(String(t.status)) ||
        (DONE_STATUSES.has(String(t.status)) && inWindow(t.resolved_at, range.from, range.to)))
      .map((t) => ({
        id: t.id,
        source: "task" as const,
        task_code: t.task_code,
        title: t.title,
        type: t.type,
        agent_id: t.assigned_agent_id,
        agent_name: agentNameById.get(String(t.assigned_agent_id))?.name ?? null,
        team: agentNameById.get(String(t.assigned_agent_id))?.team ?? null,
        role_label: agentNameById.get(String(t.assigned_agent_id))?.role ?? null,
        priority: t.priority,
        stage: t.stage,
        status: t.status,
        assigned_at: t.assigned_at,
        first_action_at: t.first_action_at,
        due_at: t.due_at,
        resolved_at: t.resolved_at,
        updated_at: t.resolved_at ?? t.first_action_at ?? t.started_at ?? t.assigned_at ?? t.created_at,
        dispute_id: t.dispute_id,
        transaction_id: t.transaction_id,
        sla_state: slaState(t),
        remaining_minutes: t.due_at && !t.resolved_at
          ? Math.round((new Date(t.due_at).getTime() - now) / 60_000)
          : null,
      }));

    // Dispute-only resolutions have no orchestration task and therefore no SLA
    // configuration. They are listed so the tab reconciles with the resolved
    // KPI, but always excluded from every SLA denominator.
    const slaDisputeRows = (disputesEligibleForFilters ? (outcomes ?? []) : [])
      .filter((o) =>
        o.resolved_by_user_id && scopedIds.has(o.resolved_by_user_id) &&
        inWindow(o.resolved_at, range.from, range.to) &&
        o.dispute_id && !taskDisputeIdsAll.has(o.dispute_id))
      .filter((o) => {
        const d = disputeById.get(String(o.dispute_id));
        return !(d && CANCELLED_STATUSES.has(String(d.status)));
      })
      .map((o) => {
        const d = disputeById.get(String(o.dispute_id));
        const meta = agentNameById.get(String(o.resolved_by_user_id));
        return {
          id: String(o.dispute_id),
          source: "dispute" as const,
          task_code: `DSP-${String(o.dispute_id).slice(0, 8).toUpperCase()}`,
          title: "Dispute resolution",
          type: "dispute_review",
          agent_id: o.resolved_by_user_id,
          agent_name: meta?.name ?? null,
          team: meta?.team ?? null,
          role_label: meta?.role ?? null,
          priority: null as string | null,
          stage: null as string | null,
          status: d?.status ?? "resolved",
          assigned_at: d?.opened_at ?? null,
          first_action_at: null as string | null,
          due_at: null as string | null,
          resolved_at: o.resolved_at,
          updated_at: o.resolved_at,
          dispute_id: o.dispute_id,
          transaction_id: null as string | null,
          sla_state: "not_configured",
          remaining_minutes: null as number | null,
        };
      });

    const slaAll = [...slaTaskRows, ...slaDisputeRows].sort((a, b) =>
      (slaRank[a.sla_state] ?? 9) - (slaRank[b.sla_state] ?? 9) ||
      new Date(a.due_at ?? 0).getTime() - new Date(b.due_at ?? 0).getTime());

    // Server-side SLA filters so chips, counts, pages and the table agree.
    const slaFilter = {
      states: Array.isArray(body.sla_states)
        ? (body.sla_states as unknown[]).map(String).filter(Boolean)
        : String(body.sla_states ?? "").split(",").map((s) => s.trim()).filter((s) => s && s !== "all"),
      agent: String(body.sla_agent ?? "all"),
      priority: String(body.sla_priority ?? "all"),
      stage: String(body.sla_stage ?? "all"),
    };
    const slaFiltered = slaAll.filter((c) => {
      if (slaFilter.states.length && !slaFilter.states.includes(c.sla_state)) return false;
      if (slaFilter.agent !== "all" && String(c.agent_id) !== slaFilter.agent) return false;
      if (slaFilter.priority !== "all" && String(c.priority ?? "") !== slaFilter.priority) return false;
      if (slaFilter.stage !== "all" && String(c.stage ?? "") !== slaFilter.stage) return false;
      return true;
    });
    const slaPageSize = Math.min(200, Math.max(25, Number(body.sla_page_size ?? 50) || 50));
    const slaPage = Math.max(1, Number(body.sla_page ?? 1) || 1);
    const slaCases = slaFiltered.slice((slaPage - 1) * slaPageSize, slaPage * slaPageSize);
    // Counts always describe the complete (unpaged, state-unfiltered) set so
    // the chips never shrink as the operator pages through results.
    const slaCountBase = slaAll.filter((c) =>
      (slaFilter.agent === "all" || String(c.agent_id) === slaFilter.agent) &&
      (slaFilter.priority === "all" || String(c.priority ?? "") === slaFilter.priority) &&
      (slaFilter.stage === "all" || String(c.stage ?? "") === slaFilter.stage));
    const slaCounts = slaCountBase.reduce((acc, item) => {
      acc[item.sla_state] = (acc[item.sla_state] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    const slaCompleted = (slaCounts.completed_within ?? 0) + (slaCounts.completed_outside ?? 0);
    // Averages are measured on the same SLA-tracked, in-scope case set that
    // backs the table: never on every task the agents ever touched.
    const slaTracked = slaCountBase.filter(
      (c) => c.sla_state !== "not_configured" && c.sla_state !== "cancelled",
    );
    const slaFirstActionSamples = slaTracked
      .filter((c) => c.assigned_at && c.first_action_at)
      .map((c) => new Date(String(c.first_action_at)).getTime() - new Date(String(c.assigned_at)).getTime())
      .filter((ms) => ms >= 0);
    const slaResolutionSamples = slaTracked
      .filter((c) => c.assigned_at && c.resolved_at)
      .map((c) => new Date(String(c.resolved_at)).getTime() - new Date(String(c.assigned_at)).getTime())
      .filter((ms) => ms >= 0);
    const slaSummary = {
      tracked: slaTracked.length,
      on_track: slaCounts.on_track ?? 0,
      at_risk: slaCounts.at_risk ?? 0,
      breached: slaCounts.breached ?? 0,
      paused: slaCounts.paused ?? 0,
      not_configured: slaCounts.not_configured ?? 0,
      completed_within: slaCounts.completed_within ?? 0,
      completed_outside: slaCounts.completed_outside ?? 0,
      compliance: slaCompleted ? pct(slaCounts.completed_within ?? 0, slaCompleted) : null,
      avg_first_action_minutes: slaFirstActionSamples.length ? Math.round(avg(slaFirstActionSamples) / 60_000) : null,
      avg_resolution_hours: slaResolutionSamples.length ? hours(avg(slaResolutionSamples)) : null,
      first_action_sample: slaFirstActionSamples.length,
      resolution_sample: slaResolutionSamples.length,
    };

    // ---- export -----------------------------------------------------------
    if (isExport) {
      const tab = String(body.tab ?? "workload");
      const maskPii = body.mask_pii === true;
      const reportAgentId = typeof body.agent_id === "string" ? body.agent_id : null;
      // "Filtered agent" report narrows the same rows to one agent; every other
      // report keeps the current filter scope and only changes its columns.
      const exportRows = reportAgentId ? ranked.filter((r) => r.user_id === reportAgentId) : ranked;
      const reportType = reportAgentId ? "filtered_agent" : tab;
      const REPORT_LABELS: Record<string, string> = {
        workload: "Workload report",
        performance: "Performance report",
        sla: "SLA compliance report",
        rankings: "Rankings report",
        filtered_agent: "Filtered agent report",
      };
      const identity = (r: Record<string, any>) => [
        maskPii ? `Agent ${r.rank}` : (r.full_name ?? `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim()),
        maskPii ? "" : (r.email ?? ""),
        r.role_label, r.team ?? "",
      ];
      const IDENTITY_HEADER = ["agent", "email", "role", "team"];
      let header: string[];
      let build: (r: Record<string, any>) => (string | number)[];
      if (reportType === "performance") {
        header = ["rank", ...IDENTITY_HEADER, "resolved", "avg_first_action_minutes", "avg_resolution_hours",
          "sla_compliance_pct", "overdue", "escalations", "reassignments", "score", "band"];
        build = (r) => [r.rank, ...identity(r), r.resolved, r.avg_first_action_minutes ?? "", r.avg_resolution_hours ?? "",
          r.sla_compliance, r.overdue, r.escalations, r.reassignments, r.score, r.score_band];
      } else if (reportType === "sla") {
        header = ["rank", ...IDENTITY_HEADER, "sla_on_track", "sla_at_risk", "overdue", "breached",
          "completed_within_sla", "completed_outside_sla", "sla_compliance_pct"];
        build = (r) => [r.rank, ...identity(r), r.sla_on_track ?? 0, r.sla_at_risk ?? 0, r.overdue, r.breached,
          r.sla_completed_within ?? 0, r.sla_completed_outside ?? 0, r.sla_compliance];
      } else if (reportType === "rankings") {
        header = ["rank", ...IDENTITY_HEADER, "score", "band", "completed_cases", "cases_included", "cases_excluded",
          "insufficient_data", "sla_compliance_pct", "avg_resolution_hours", "overdue"];
        build = (r) => [r.rank, ...identity(r), r.insufficient_data ? "" : r.score, r.score_band, r.resolved,
          r.score_included_cases ?? 0, r.score_excluded_cases ?? 0, r.insufficient_data ? "yes" : "no",
          r.sla_compliance, r.avg_resolution_hours ?? "", r.overdue];
      } else if (reportType === "filtered_agent") {
        header = ["rank", ...IDENTITY_HEADER, "availability", "active_cases", "waiting_cases", "critical_cases",
          "resolved", "avg_first_action_minutes", "avg_resolution_hours", "sla_compliance_pct", "sla_on_track",
          "sla_at_risk", "overdue", "breached", "reassignments", "escalations", "score", "band"];
        build = (r) => [r.rank, ...identity(r), r.availability, r.active_cases, r.waiting_cases, r.critical_cases,
          r.resolved, r.avg_first_action_minutes ?? "", r.avg_resolution_hours ?? "", r.sla_compliance,
          r.sla_on_track ?? 0, r.sla_at_risk ?? 0, r.overdue, r.breached, r.reassignments, r.escalations,
          r.score, r.score_band];
      } else {
        header = ["rank", ...IDENTITY_HEADER, "availability", "active_cases", "waiting_cases", "critical_cases",
          "capacity", "utilisation_pct", "overdue", "resolved", "score", "band"];
        build = (r) => [r.rank, ...identity(r), r.availability, r.active_cases, r.waiting_cases, r.critical_cases,
          r.max_active ?? "", r.max_active ? Math.round((r.active_cases / r.max_active) * 100) : "",
          r.overdue, r.resolved, r.score, r.score_band];
      }
      // Context preamble so a downloaded file is self-describing in audit.
      const appliedFilters = Object.entries(f)
        .filter(([, v]) => v !== "all" && v !== "" && v !== false && v !== 0 && v !== 100)
        .map(([k, v]) => `${k}=${v}`)
        .join("; ");
      const lines = [
        ["Report type", REPORT_LABELS[reportType] ?? reportType].map(csvEscape).join(","),
        ["Date range", range.label].map(csvEscape).join(","),
        ["Range from", range.allTime ? "" : range.from.toISOString()].map(csvEscape).join(","),
        ["Range to", range.allTime ? "" : range.to.toISOString()].map(csvEscape).join(","),
        ["Applied filters", appliedFilters || "None"].map(csvEscape).join(","),
        ["Generated date", new Date().toISOString()].map(csvEscape).join(","),
        ["Generated by", ctx.email ?? ctx.userId].map(csvEscape).join(","),
        ["Rows", String(exportRows.length)].map(csvEscape).join(","),
        "",
        header.join(","),
      ];
      for (const r of exportRows) lines.push(build(r).map(csvEscape).join(","));
      const meta = extractRequestMeta(req);
      await logAdminAction(admin, {
        actorId: ctx.userId,
        action: "export_agent_performance",
        targetType: "system",
        reason: typeof body.reason === "string" ? body.reason : undefined,
        metadata: { tab, report_type: reportType, agent_id: reportAgentId, scope: range.allTime ? "all_time" : "range", range: range.label, from: range.from.toISOString(), to: range.to.toISOString(), rows: exportRows.length, mask_pii: maskPii, filters: f },
        mirrorToAuditLogs: true,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      return new Response(
        JSON.stringify({ csv: lines.join("\n"), filename: `agent-performance-${reportType}-${range.allTime ? "all-time" : String(body.range ?? "range")}-${new Date().toISOString().slice(0, 10)}.csv` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        summary,
        agents: ranked,
        total: ranked.length,
        trend: days,
        performance,
        status_distribution: statusBuckets,
        sla_cases: slaCases,
        sla_total: slaFiltered.length,
        sla_page: slaPage,
        sla_page_size: slaPageSize,
        sla_has_more: slaPage * slaPageSize < slaFiltered.length,
        sla_counts: slaCounts,
        sla_cases_truncated: false,
        sla_summary: slaSummary,
        facets: {
          teams,
          // Only roles that actually qualify someone for this screen. The
          // same eligibility rule used above, plus any role already held by a
          // listed agent.
          roles: (roles ?? [])
            .filter((r) => agentRoleKeys.has(r.key) || ranked.some((a) => a.role_keys.includes(r.key)))
            .map((r) => ({ key: r.key, name: r.name })),
        },
        range: {
          key: range.allTime ? "all_time" : String(body.range ?? "7d"),
          label: range.label,
          from: range.from.toISOString(),
          to: range.to.toISOString(),
          all_time: range.allTime,
          comparison_available: !range.allTime,
          granularity,
        contract_version: 4,
        },
        permissions: {
          can_export: canExport,
          can_rebalance: canRebalance,
          can_escalate: canEscalate,
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