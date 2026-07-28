// Single mutation endpoint for Task Orchestration. Handles: assign,
// auto_assign, rebalance, escalate, complete, save_rules, comments,
// send_for_approval, preview_* dry-runs, and task_detail reads.
import { requirePermission, requireAnyPermission, authErrorResponse } from "../_shared/auth.ts";
import { logAdminAction, extractRequestMeta } from "../_shared/audit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Body = {
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
  rules?: Record<string, unknown>;
  exclude_task_ids?: string[];
  exclude_agent_ids?: string[];
  exclude_move_ids?: string[];
  override_capacity?: boolean;
  scope?: "queue" | "live" | "roster";
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const body = (await req.json().catch(() => ({}))) as Body;
  const permMap: Record<Body["action"], string> = {
    assign: "task_orchestration.assign",
    assign_selected: "task_orchestration.bulk_assign",
    auto_assign: "task_orchestration.assign",
    assign_to_me: "task_orchestration.assign_self",
    reassign: "task_orchestration.reassign",
    rebalance: "task_orchestration.rebalance",
    escalate: "task_orchestration.escalate",
    complete: "task_orchestration.view",
    save_rules: "task_orchestration.manage_rules",
    test_rules: "task_orchestration.view",
    add_comment: "task_orchestration.view",
    send_for_approval: "task_orchestration.view",
    preview_auto_assign: "task_orchestration.view",
    preview_rebalance: "task_orchestration.view",
    task_detail: "task_orchestration.view",
    export_queue: "task_orchestration.export",
    start: "task_orchestration.view",
    update_stage: "task_orchestration.view",
    add_internal_note: "task_orchestration.view",
    request_info: "task_orchestration.view",
    request_evidence: "task_orchestration.view",
    submit_resolution: "task_orchestration.view",
    close: "task_orchestration.view",
  };
  const permission = permMap[body.action] ?? "task_orchestration.view";

  let ctx;
  try { ctx = await requirePermission(req, permission); }
  catch (err) {
    const resp = authErrorResponse(err, corsHeaders);
    if (resp) return resp;
    throw err;
  }
  const admin = ctx.adminClient;
  const meta = extractRequestMeta(req);

  const respond = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const INELIGIBLE = new Set(["offline", "on_leave", "suspended"]);

  // -------- Notification helper with lightweight dedupe --------
  // Prevents identical unchanged conditions from re-firing within a window
  // by scanning the last hour of notifications for a matching dedupe_key.
  async function notifyEvent(opts: {
    event: string;
    recipients: string[];
    title: string;
    body: string;
    dedupeKey?: string;
    dedupeMinutes?: number;
    data?: Record<string, unknown>;
    channel?: string;
  }) {
    const recipients = [...new Set(opts.recipients.filter(Boolean))];
    if (!recipients.length) return;
    const windowMin = opts.dedupeMinutes ?? 60;
    const cutoff = new Date(Date.now() - windowMin * 60_000).toISOString();
    if (opts.dedupeKey) {
      const { data: recent } = await admin
        .from("notifications")
        .select("id, user_id, metadata")
        .gte("created_at", cutoff)
        .eq("type", opts.event)
        .in("user_id", recipients);
      const dedup = new Set(
        (recent ?? [])
          .filter((r: any) => (r.metadata?.dedupe_key ?? null) === opts.dedupeKey)
          .map((r: any) => r.user_id),
      );
      const remaining = recipients.filter((u) => !dedup.has(u));
      if (!remaining.length) return;
      const rows = remaining.map((uid) => ({
        user_id: uid,
        type: opts.event,
        channel: opts.channel ?? "in_app",
        title: opts.title,
        message: opts.body,
        metadata: { ...(opts.data ?? {}), dedupe_key: opts.dedupeKey },
      }));
      await admin.from("notifications").insert(rows);
      return;
    }
    const rows = recipients.map((uid) => ({
      user_id: uid,
      type: opts.event,
      channel: opts.channel ?? "in_app",
      title: opts.title,
      message: opts.body,
      metadata: opts.data ?? {},
    }));
    await admin.from("notifications").insert(rows);
  }

  async function seniorAdmins(): Promise<string[]> {
    const { data } = await admin
      .from("user_roles")
      .select("user_id")
      .in("role", ["super_admin", "senior_admin"]);
    return (data ?? []).map((r: any) => r.user_id);
  }

  async function pickBestAgent(exclude: Set<string> = new Set()): Promise<string | null> {
    const [{ data: cap }, { data: avail }] = await Promise.all([
      admin.from("agent_capacity").select("*"),
      admin.from("agent_availability").select("*"),
    ]);
    const availMap = new Map((avail ?? []).map((a: any) => [a.user_id, a.status]));
    const eligible = (cap ?? [])
      .filter((c: any) => !INELIGIBLE.has(availMap.get(c.user_id) ?? "offline"))
      .filter((c: any) => !exclude.has(c.user_id))
      .filter((c: any) => c.current_active < c.max_active_tasks)
      .sort((a: any, b: any) => a.current_active - b.current_active);
    return eligible[0]?.user_id ?? null;
  }

  // Financial-permission requirement for auto-completing tasks that touch money.
  const financialTaskPerm: Record<string, string> = {
    refund_request: "refunds.process",
    escrow_release_review: "escrow.release",
    payment_hold_review: "payouts.release",
    payout_review: "payouts.release",
  };

  async function checkVersion(taskId: string, expected?: number): Promise<{ ok: boolean; current?: number }> {
    if (typeof expected !== "number") return { ok: true };
    const { data } = await admin.from("orchestration_tasks").select("version").eq("id", taskId).maybeSingle();
    const current = (data?.version as number) ?? 0;
    return { ok: current === expected, current };
  }

  async function buildAutoAssignPlan(mode: string) {
    const [{ data: pending }, { data: cap }, { data: avail }, { data: skillRows }] = await Promise.all([
      admin.from("orchestration_tasks")
        .select("id, task_code, priority, required_permissions")
        .eq("status","unassigned")
        .order("priority",{ ascending: false })
        .order("created_at",{ ascending: true }).limit(50),
      admin.from("agent_capacity").select("*"),
      admin.from("agent_availability").select("*"),
      admin.from("agent_skills").select("user_id, permission_key"),
    ]);
    const availMap = new Map((avail ?? []).map((a: any) => [a.user_id, a.status]));
    const skillsByAgent = new Map<string, Set<string>>();
    (skillRows ?? []).forEach((s: any) => {
      const set = skillsByAgent.get(s.user_id) ?? new Set<string>();
      set.add(s.permission_key);
      skillsByAgent.set(s.user_id, set);
    });
    const initialSeats = (cap ?? [])
      .filter((c: any) => !INELIGIBLE.has(availMap.get(c.user_id) ?? "offline"))
      .map((c: any) => [c.user_id, Math.max(0, (c.max_active_tasks ?? 0) - (c.current_active ?? 0))] as [string, number]);
    const seats = new Map<string, number>(initialSeats);
    const initialCurrent = new Map((cap ?? []).map((c: any) => [c.user_id, c.current_active ?? 0]));
    const projected = new Map(initialCurrent);
    const plan: Array<{ task_id: string; task_code: string; agent_id: string; reason: string }> = [];
    const unmatched: Array<{ task_id: string; task_code: string; reason: string }> = [];
    for (const t of pending ?? []) {
      const req = new Set<string>(((t as any).required_permissions ?? []) as string[]);
      const candidates = [...seats.entries()]
        .filter(([, s]) => s > 0)
        .filter(([aid]) => {
          if (req.size === 0) return true;
          const held = skillsByAgent.get(aid) ?? new Set();
          for (const p of req) if (!held.has(p)) return false;
          return true;
        })
        .sort((a, b) => b[1] - a[1]);
      if (candidates.length === 0) {
        const reason = req.size > 0 ? "no_eligible_agent_with_skill" : "no_available_seats";
        unmatched.push({ task_id: (t as any).id, task_code: (t as any).task_code, reason });
        continue;
      }
      const [agentId, s] = candidates[0];
      seats.set(agentId, s - 1);
      projected.set(agentId, (projected.get(agentId) ?? 0) + 1);
      plan.push({ task_id: (t as any).id, task_code: (t as any).task_code, agent_id: agentId, reason: `auto:${mode}` });
    }
    const agentLoads = (cap ?? [])
      .filter((c: any) => !INELIGIBLE.has(availMap.get(c.user_id) ?? "offline"))
      .map((c: any) => ({
        agent_id: c.user_id,
        current: c.current_active ?? 0,
        projected: projected.get(c.user_id) ?? c.current_active ?? 0,
        max: c.max_active_tasks ?? 0,
      }));
    return { plan, unmatched, agent_loads: agentLoads };
  }

  // Rebalance with safety rails: skips final decision, pending approval,
  // escalated, locked, or continuity-required tasks, and moves that would
  // violate the target agent's skill requirements.
  async function buildRebalancePlan() {
    const [{ data: overloaded }, { data: skillRows }] = await Promise.all([
      admin.from("agent_capacity").select("*"),
      admin.from("agent_skills").select("user_id, permission_key"),
    ]);
    const skillsByAgent = new Map<string, Set<string>>();
    (skillRows ?? []).forEach((s: any) => {
      const set = skillsByAgent.get(s.user_id) ?? new Set<string>();
      set.add(s.permission_key);
      skillsByAgent.set(s.user_id, set);
    });
    const plan: Array<{ task_id: string; task_code: string; from: string; to: string; reason: string; priority: string; sla_delta: string | null }> = [];
    const skipped: Array<{ task_id: string; task_code: string; reason: string }> = [];
    for (const a of overloaded ?? []) {
      if (a.current_active <= a.max_active_tasks) continue;
      const excess = a.current_active - a.max_active_tasks;
      const { data: taskRows } = await admin.from("orchestration_tasks")
        .select("id, task_code, priority, required_permissions, stage, status, sla_status, locked_by_action_id, continuity_required")
        .eq("assigned_agent_id", a.user_id)
        .in("status", ["assigned", "in_progress"])
        .order("priority", { ascending: true }).limit(excess * 2);
      for (const t of (taskRows ?? [])) {
        const row: any = t;
        if (row.stage === "final_decision") { skipped.push({ task_id: row.id, task_code: row.task_code, reason: "final_decision_locked" }); continue; }
        if (row.status === "pending_approval" || row.status === "escalated") { skipped.push({ task_id: row.id, task_code: row.task_code, reason: "approval_or_escalated" }); continue; }
        if (row.locked_by_action_id) { skipped.push({ task_id: row.id, task_code: row.task_code, reason: "locked_by_action" }); continue; }
        if (row.continuity_required) { skipped.push({ task_id: row.id, task_code: row.task_code, reason: "continuity_required" }); continue; }
        const req = new Set<string>((row.required_permissions ?? []) as string[]);
        // Pick a target that also holds required skills.
        const { data: caps } = await admin.from("agent_capacity").select("*");
        const { data: avails } = await admin.from("agent_availability").select("*");
        const availMap = new Map((avails ?? []).map((v: any) => [v.user_id, v.status]));
        const target = (caps ?? [])
          .filter((c: any) => c.user_id !== a.user_id)
          .filter((c: any) => !INELIGIBLE.has(availMap.get(c.user_id) ?? "offline"))
          .filter((c: any) => c.current_active < c.max_active_tasks)
          .filter((c: any) => {
            if (req.size === 0) return true;
            const held = skillsByAgent.get(c.user_id) ?? new Set();
            for (const p of req) if (!held.has(p)) return false;
            return true;
          })
          .sort((x: any, y: any) => x.current_active - y.current_active)[0];
        if (!target) { skipped.push({ task_id: row.id, task_code: row.task_code, reason: "no_eligible_target" }); continue; }
        plan.push({
          task_id: row.id,
          task_code: row.task_code,
          from: a.user_id,
          to: target.user_id,
          reason: "load_balance",
          priority: row.priority,
          sla_delta: row.sla_status ?? null,
        });
        if (plan.filter((p) => p.from === a.user_id).length >= excess) break;
      }
    }
    return { plan, skipped };
  }

  // Separation-of-duty: target agent must not be the task's initiator/originator
  // for financial task types unless override_capacity is held + reason ≥ 8 chars.
  const financialTypes = new Set(["refund_request", "escrow_release_review", "payment_hold_review", "payout_review"]);
  async function sodViolations(agentId: string, taskIds: string[], overrideAllowed: boolean, overrideReason?: string): Promise<string[]> {
    if (!taskIds.length) return [];
    const { data: rows } = await admin.from("orchestration_tasks")
      .select("id, type, created_by, originator_id").in("id", taskIds);
    const conflicts: string[] = [];
    for (const r of rows ?? []) {
      const row: any = r;
      if (!financialTypes.has(row.type)) continue;
      const originator = row.originator_id ?? row.created_by;
      if (originator && originator === agentId) conflicts.push(row.id);
    }
    if (!conflicts.length) return [];
    if (overrideAllowed && overrideReason && overrideReason.trim().length >= 8) return [];
    return conflicts;
  }

  // Fire a notification for both sides of a reassignment / move.
  async function notifyReassignment(taskId: string, fromAgentId: string | null, toAgentId: string, reason: string | null) {
    if (fromAgentId) {
      await notifyEvent({
        event: "task_reassigned",
        recipients: [fromAgentId],
        title: "Task removed from your queue",
        body: reason ?? "A task was reassigned to another agent.",
        dedupeKey: `reassign_from:${taskId}`,
        data: { task_id: taskId, to_agent: toAgentId, direction: "from" },
      });
    }
    await notifyEvent({
      event: "task_assigned",
      recipients: [toAgentId],
      title: "New task assigned to you",
      body: reason ?? "You have been assigned an orchestration task.",
      dedupeKey: `assign_to:${taskId}`,
      data: { task_id: taskId, from_agent: fromAgentId, direction: "to" },
    });
  }

  try {
    switch (body.action) {
      case "assign":
      case "assign_selected": {
        const ids = body.task_ids ?? (body.task_id ? [body.task_id] : []);
        if (!ids.length || !body.agent_id) return respond({ error: "missing_fields" }, 400);
        // Override capacity requires the override permission and a reason.
        if (body.override_capacity) {
          try { await requireAnyPermission(req, ["task_orchestration.override_capacity"], ctx); }
          catch { return respond({ error: "override_permission_required" }, 403); }
          if (!body.reason || body.reason.trim().length < 8) {
            return respond({ error: "override_reason_required" }, 400);
          }
        }
        // Separation-of-duty guard for financial tasks.
        const canOverrideSod = ctx.hasPermission?.("task_orchestration.override_capacity") ?? false;
        const sod = await sodViolations(body.agent_id, ids, !!body.override_capacity && canOverrideSod, body.reason);
        if (sod.length) return respond({ error: "sod_conflict", tasks: sod }, 409);
        if (ids.length === 1 && typeof body.expected_version === "number") {
          const v = await checkVersion(ids[0], body.expected_version);
          if (!v.ok) return respond({ error: "version_conflict", current: v.current, expected: body.expected_version }, 409);
        }
        const [{ data: capRow }, { data: availRow }, { data: taskRows }] = await Promise.all([
          admin.from("agent_capacity").select("current_active, max_active_tasks").eq("user_id", body.agent_id).maybeSingle(),
          admin.from("agent_availability").select("status").eq("user_id", body.agent_id).maybeSingle(),
          admin.from("orchestration_tasks").select("id, required_permissions").in("id", ids),
        ]);
        if (!body.override_capacity && availRow && INELIGIBLE.has(availRow.status)) {
          return respond({ error: "agent_ineligible", availability: availRow.status }, 409);
        }
        const current = capRow?.current_active ?? 0;
        const max = capRow?.max_active_tasks ?? 0;
        if (!body.override_capacity && max > 0 && current + ids.length > max) {
          return respond({ error: "agent_over_capacity", current, max, requested: ids.length }, 409);
        }
        const requiredSet = new Set<string>();
        (taskRows ?? []).forEach((t: any) => (t.required_permissions ?? []).forEach((p: string) => requiredSet.add(p)));
        if (requiredSet.size > 0) {
          const { data: skills } = await admin.from("agent_skills").select("permission_key").eq("user_id", body.agent_id);
          const held = new Set((skills ?? []).map((s: any) => s.permission_key));
          const missing = [...requiredSet].filter((p) => !held.has(p));
          if (!body.override_capacity && missing.length > 0) {
            return respond({ error: "agent_missing_skills", missing }, 409);
          }
        }
        const results: Array<{ task_id: string; ok: boolean; error?: string }> = [];
        for (const id of ids) {
          const { error: rpcErr } = await admin.rpc("assign_task", {
            _task_id: id, _agent_id: body.agent_id,
            _mode: body.mode ?? "manual", _reason: body.reason ?? null, _actor_id: ctx.userId,
          });
          results.push({ task_id: id, ok: !rpcErr, error: rpcErr?.message });
        }
        const succeeded = results.filter(r => r.ok).length;
        await logAdminAction({
          actorId: ctx.userId, action: "orchestration_assign",
          targetType: "system",
          metadata: { task_ids: ids, agent_id: body.agent_id, mode: body.mode, override: !!body.override_capacity, reason: body.reason, results },
          mirrorToAuditLogs: true,
          ip: meta.ip, userAgent: meta.userAgent,
        }, admin);
        return respond({ ok: true, count: succeeded, total: ids.length, results });
      }
      case "reassign": {
        if (!body.task_id || !body.agent_id) return respond({ error: "missing_fields" }, 400);
        const v = await checkVersion(body.task_id, body.expected_version);
        if (!v.ok) return respond({ error: "version_conflict", current: v.current, expected: body.expected_version }, 409);
        const { data: task } = await admin.from("orchestration_tasks")
          .select("id, assigned_agent_id, required_permissions").eq("id", body.task_id).maybeSingle();
        if (!task) return respond({ error: "task_not_found" }, 404);
        const from = task.assigned_agent_id as string | null;
        if (from === body.agent_id) return respond({ error: "same_agent" }, 400);
        if (!body.override_capacity) {
          const [{ data: capRow }, { data: availRow }] = await Promise.all([
            admin.from("agent_capacity").select("current_active, max_active_tasks").eq("user_id", body.agent_id).maybeSingle(),
            admin.from("agent_availability").select("status").eq("user_id", body.agent_id).maybeSingle(),
          ]);
          if (availRow && INELIGIBLE.has(availRow.status)) return respond({ error: "agent_ineligible", availability: availRow.status }, 409);
          if (capRow && capRow.max_active_tasks > 0 && capRow.current_active >= capRow.max_active_tasks) {
            return respond({ error: "agent_over_capacity" }, 409);
          }
        } else {
          try { await requireAnyPermission(req, ["task_orchestration.override_capacity"], ctx); }
          catch { return respond({ error: "override_permission_required" }, 403); }
          if (!body.reason || body.reason.trim().length < 8) {
            return respond({ error: "override_reason_required" }, 400);
          }
        }
        const { error: rpcErr } = await admin.rpc("assign_task", {
          _task_id: body.task_id, _agent_id: body.agent_id,
          _mode: "reassign", _reason: body.reason ?? "reassigned", _actor_id: ctx.userId,
        });
        if (rpcErr) return respond({ error: "reassign_failed", detail: rpcErr.message }, 500);
        // Notify previous & new agent.
        try { await notifyReassignment(body.task_id, from, body.agent_id, body.reason ?? null); } catch { /* best effort */ }
        await logAdminAction({
          actorId: ctx.userId, action: "orchestration_reassign",
          targetType: "system", metadata: { task_id: body.task_id, from, to: body.agent_id, reason: body.reason, override: !!body.override_capacity },
          mirrorToAuditLogs: true, ip: meta.ip, userAgent: meta.userAgent,
        }, admin);
        return respond({ ok: true, from, to: body.agent_id });
      }
      case "assign_to_me": {
        const ids = body.task_ids ?? (body.task_id ? [body.task_id] : []);
        if (!ids.length) return respond({ error: "missing_task_ids" }, 400);
        const canOverrideSod = ctx.hasPermission?.("task_orchestration.override_capacity") ?? false;
        const sod = await sodViolations(ctx.userId, ids, canOverrideSod, body.reason);
        if (sod.length) return respond({ error: "sod_conflict", tasks: sod }, 409);
        for (const id of ids) {
          await admin.rpc("assign_task", {
            _task_id: id, _agent_id: ctx.userId,
            _mode: "self", _reason: body.reason ?? "self-assigned", _actor_id: ctx.userId,
          });
        }
        await logAdminAction({
          actorId: ctx.userId, action: "orchestration_self_assign",
          targetType: "system", metadata: { task_ids: ids },
          ip: meta.ip, userAgent: meta.userAgent,
        }, admin);
        return respond({ ok: true, count: ids.length });
      }
      case "auto_assign": {
        const { data: rules } = await admin.from("assignment_rules").select("config").eq("scope","global").maybeSingle();
        const mode = (rules?.config as any)?.mode ?? body.mode ?? "round_robin";
        const { plan: fullPlan } = await buildAutoAssignPlan(mode);
        const excluded = new Set(body.exclude_task_ids ?? []);
        const plan = fullPlan.filter(p => !excluded.has(p.task_id));
        let count = 0;
        for (const p of plan) {
          await admin.rpc("assign_task", {
            _task_id: p.task_id, _agent_id: p.agent_id, _mode: mode, _reason: "auto-assign", _actor_id: ctx.userId,
          });
          count++;
        }
        await logAdminAction({
          actorId: ctx.userId, action: "orchestration_auto_assign",
          targetType: "system", metadata: { count, mode, excluded: [...excluded] }, mirrorToAuditLogs: true,
          ip: meta.ip, userAgent: meta.userAgent,
        }, admin);
        return respond({ ok: true, count });
      }
      case "rebalance": {
        const { plan: fullPlan } = await buildRebalancePlan();
        const excluded = new Set(body.exclude_move_ids ?? []);
        const plan = fullPlan.filter((m) => !excluded.has(m.task_id));
        if (plan.length && (!body.reason || body.reason.trim().length < 8)) {
          return respond({ error: "rebalance_reason_required" }, 400);
        }
        let moved = 0;
        for (const m of plan) {
          await admin.rpc("assign_task", {
            _task_id: m.task_id, _agent_id: m.to, _mode: "rebalance", _reason: "load rebalance", _actor_id: ctx.userId,
          });
          try { await notifyReassignment(m.task_id, m.from, m.to, body.reason ?? "load rebalance"); } catch { /* best effort */ }
          moved++;
        }
        await logAdminAction({
          actorId: ctx.userId, action: "orchestration_rebalance",
          targetType: "system", metadata: { moved, reason: body.reason, excluded: [...excluded] }, mirrorToAuditLogs: true,
          ip: meta.ip, userAgent: meta.userAgent,
        }, admin);
        return respond({ ok: true, moved });
      }
      case "escalate": {
        const ids = body.task_ids ?? (body.task_id ? [body.task_id] : []);
        if (!ids.length) return respond({ error: "missing_task_ids" }, 400);
        if (!body.reason || body.reason.trim().length < 20) {
          return respond({ error: "escalation_reason_required" }, 400);
        }
        if (ids.length === 1 && typeof body.expected_version === "number") {
          const v = await checkVersion(ids[0], body.expected_version);
          if (!v.ok) return respond({ error: "version_conflict", current: v.current, expected: body.expected_version }, 409);
        }
        // Financial / compliance targets restricted to queues that route to
        // roles holding the necessary permission. When target_queue is set,
        // verify no task in the batch violates that constraint.
        const financialQueuePerm: Record<string, string> = {
          refunds: "refunds.process",
          escrow: "escrow.release",
          payouts: "payouts.release",
          compliance: "compliance.review",
        };
        const targetQueue = body.target_queue?.trim();
        if (targetQueue && financialQueuePerm[targetQueue]) {
          const { data: tasksBatch } = await admin
            .from("orchestration_tasks")
            .select("id, type, required_permissions").in("id", ids);
          const missing = (tasksBatch ?? []).filter((t: any) => {
            const req = new Set<string>([...(t.required_permissions ?? [])]);
            req.add(financialQueuePerm[targetQueue]);
            return req.size > (t.required_permissions?.length ?? 0);
          });
          if (missing.length && !financialTypes.has(String((missing[0] as any).type))) {
            // Non-financial task cannot land in a financial queue.
            return respond({
              error: "target_queue_type_mismatch",
              tasks: missing.map((m: any) => m.id),
            }, 409);
          }
        }
        for (const id of ids) {
          await admin.rpc("escalate_task", { _task_id: id, _reason: body.reason, _actor_id: ctx.userId });
          const patch: Record<string, unknown> = {};
          if (targetQueue) patch.queue = targetQueue;
          if (body.target_team) patch.team = body.target_team;
          if (body.escalate_priority) patch.priority = body.escalate_priority;
          if (body.requested_reviewer_id) patch.suggested_agent_id = body.requested_reviewer_id;
          if (Object.keys(patch).length) {
            await admin.from("orchestration_tasks").update(patch).eq("id", id);
          }
          if (body.internal_note?.trim()) {
            await admin.from("task_comments").insert({
              task_id: id, author_id: ctx.userId,
              body: body.internal_note.trim().slice(0, 4000),
              visibility: "internal",
            });
          }
        }
        // Fan-out notifications: prior owners + senior admins.
        const { data: escalated } = await admin
          .from("orchestration_tasks").select("id, task_code, assigned_agent_id").in("id", ids);
        const priorOwners = [...new Set((escalated ?? []).map((t: any) => t.assigned_agent_id).filter(Boolean))] as string[];
        const seniors = await seniorAdmins();
        await notifyEvent({
          event: "task_escalated",
          recipients: [...priorOwners, ...seniors],
          title: `${ids.length} task${ids.length === 1 ? "" : "s"} escalated`,
          body: body.reason,
          dedupeKey: `escalate:${ids.slice().sort().join(",")}`,
          data: { task_ids: ids, target_queue: targetQueue ?? null, priority: body.escalate_priority ?? null },
        });
        await logAdminAction({
          actorId: ctx.userId, action: "orchestration_escalate",
          targetType: "system",
          metadata: {
            task_ids: ids, reason: body.reason,
            target_queue: targetQueue ?? null, target_team: body.target_team ?? null,
            priority: body.escalate_priority ?? null,
            requested_reviewer_id: body.requested_reviewer_id ?? null,
            has_internal_note: !!body.internal_note?.trim(),
          },
          mirrorToAuditLogs: true,
          ip: meta.ip, userAgent: meta.userAgent,
        }, admin);
        return respond({ ok: true, count: ids.length });
      }
      case "complete": {
        if (!body.task_id) return respond({ error: "missing_task_id" }, 400);
        const v = await checkVersion(body.task_id, body.expected_version);
        if (!v.ok) return respond({ error: "version_conflict", current: v.current, expected: body.expected_version }, 409);
        const { data: taskRow } = await admin
          .from("orchestration_tasks").select("type").eq("id", body.task_id).maybeSingle();
        const needed = taskRow?.type ? financialTaskPerm[taskRow.type as string] : undefined;
        if (needed) {
          try { await requireAnyPermission(req, [needed], ctx); }
          catch {
            return respond({ error: "financial_permission_required", required: needed, suggestion: "send_for_approval" }, 403);
          }
        }
        await admin.rpc("complete_orchestration_task", {
          _task_id: body.task_id, _resolution: body.resolution ?? "resolved", _actor_id: ctx.userId,
        });
        await logAdminAction({
          actorId: ctx.userId, action: "orchestration_complete",
          targetType: "system", metadata: { task_id: body.task_id, resolution: body.resolution }, mirrorToAuditLogs: true,
          ip: meta.ip, userAgent: meta.userAgent,
        }, admin);
        return respond({ ok: true });
      }
      case "send_for_approval": {
        if (!body.task_id) return respond({ error: "missing_task_id" }, 400);
        const v = await checkVersion(body.task_id, body.expected_version);
        if (!v.ok) return respond({ error: "version_conflict", current: v.current, expected: body.expected_version }, 409);
        const { data: taskRow } = await admin
          .from("orchestration_tasks").select("status, stage, version").eq("id", body.task_id).maybeSingle();
        if (!taskRow) return respond({ error: "task_not_found" }, 404);
        const { error: updErr } = await admin.from("orchestration_tasks").update({
          status: "pending_approval",
          stage: "pending_approval",
          version: (taskRow.version ?? 0) + 1,
        }).eq("id", body.task_id);
        if (updErr) return respond({ error: "update_failed", detail: updErr.message }, 500);
        await admin.from("task_status_history").insert({
          task_id: body.task_id,
          from_status: taskRow.status, to_status: "pending_approval",
          from_stage: taskRow.stage, to_stage: "pending_approval",
          actor_id: ctx.userId, reason: body.reason ?? "sent for approval",
        });
        await logAdminAction({
          actorId: ctx.userId, action: "orchestration_send_for_approval",
          targetType: "system", metadata: { task_id: body.task_id, reason: body.reason }, mirrorToAuditLogs: true,
          ip: meta.ip, userAgent: meta.userAgent,
        }, admin);
        return respond({ ok: true });
      }
      case "add_comment": {
        if (!body.task_id || !body.body_text?.trim()) return respond({ error: "missing_fields" }, 400);
        const text = body.body_text.trim().slice(0, 4000);
        const { data: inserted, error: insErr } = await admin
          .from("task_comments")
          .insert({ task_id: body.task_id, author_id: ctx.userId, body: text })
          .select("id, task_id, body, created_at, author_id").single();
        if (insErr) return respond({ error: "insert_failed", detail: insErr.message }, 500);
        await logAdminAction({
          actorId: ctx.userId, action: "orchestration_comment",
          targetType: "system", metadata: { task_id: body.task_id, length: text.length },
          ip: meta.ip, userAgent: meta.userAgent,
        }, admin);
        return respond({ ok: true, comment: inserted });
      }
      case "save_rules": {
        if (!body.rules) return respond({ error: "missing_rules" }, 400);
        const r = body.rules as Record<string, unknown>;
        const bounded = (k: string, min: number, max: number) => {
          if (r[k] === undefined || r[k] === null) return null;
          const v = Number(r[k]);
          if (!Number.isFinite(v) || v < min || v > max) return `${k} must be between ${min} and ${max}`;
          return null;
        };
        const errs = [
          bounded("max_active_per_agent", 1, 200),
          bounded("max_overdue_before_skip", 0, 100),
          bounded("stale_after_minutes", 5, 1440),
          bounded("offline_reassign_after_minutes", 1, 720),
        ].filter(Boolean) as string[];
        const allowedModes = ["manual","round_robin","least_loaded","skill_based","priority_based"];
        if (r.mode !== undefined && !allowedModes.includes(String(r.mode))) {
          errs.push(`mode must be one of ${allowedModes.join(", ")}`);
        }
        if (!body.reason || body.reason.trim().length < 20) {
          errs.push("reason must be at least 20 characters");
        }
        if (errs.length) return respond({ error: "invalid_rules", details: errs }, 400);
        const { data: existing } = await admin.from("assignment_rules").select("id, config").eq("scope","global").maybeSingle();
        const before = existing?.config ?? null;
        const nextConfig = { ...(before as object ?? {}), ...body.rules };
        const { data: saved, error: saveErr } = await admin.from("assignment_rules")
          .upsert({ scope: "global", mode: (nextConfig as any).mode ?? "round_robin", config: nextConfig, updated_by: ctx.userId },
                  { onConflict: "scope" })
          .select().single();
        if (saveErr) return respond({ error: "save_failed", detail: saveErr.message }, 500);
        const { data: versions } = await admin.from("assignment_rule_versions").select("version").eq("rule_id", saved.id).order("version",{ ascending: false }).limit(1);
        const nextVer = ((versions?.[0]?.version as number) ?? 0) + 1;
        await admin.from("assignment_rule_versions").insert({
          rule_id: saved.id, version: nextVer, config: nextConfig, actor_id: ctx.userId, note: body.reason,
        });
        await logAdminAction({
          actorId: ctx.userId, action: "orchestration_save_rules",
          targetType: "setting", before, after: nextConfig,
          metadata: { reason: body.reason, version: nextVer },
          mirrorToAuditLogs: true,
          ip: meta.ip, userAgent: meta.userAgent,
        }, admin);
        return respond({ ok: true, rules: saved, version: nextVer });
      }
      case "test_rules": {
        // Real dry-run against the current queue using the DRAFT rules payload
        // (or the stored rules when the caller sends nothing). Nothing is
        // persisted or assigned.
        const draftRules = (body.rules ?? {}) as Record<string, unknown>;
        const { data: savedRules } = await admin
          .from("assignment_rules").select("config").eq("scope","global").maybeSingle();
        const effective: any = { ...(savedRules?.config ?? {}), ...draftRules };
        const mode = String(effective.mode ?? "round_robin");
        const [{ data: pending }, { data: cap }, { data: avail }, { data: skillRows }] = await Promise.all([
          admin.from("orchestration_tasks")
            .select("id, task_code, priority, required_permissions, type")
            .eq("status","unassigned")
            .order("priority",{ ascending: false })
            .order("created_at",{ ascending: true }).limit(50),
          admin.from("agent_capacity").select("*"),
          admin.from("agent_availability").select("*"),
          admin.from("agent_skills").select("user_id, permission_key"),
        ]);
        const availMap = new Map((avail ?? []).map((a: any) => [a.user_id, a.status]));
        const skillsByAgent = new Map<string, Set<string>>();
        (skillRows ?? []).forEach((s: any) => {
          const set = skillsByAgent.get(s.user_id) ?? new Set<string>();
          set.add(s.permission_key); skillsByAgent.set(s.user_id, set);
        });
        const maxPerAgent = Number(effective.max_active_per_agent) || Infinity;
        const maxOverdue = Number(effective.max_overdue_before_skip);
        const onlineOnly = !!effective.online_only;
        const skipCap = effective.skip_at_capacity !== false;
        const seats = new Map<string, number>();
        (cap ?? []).forEach((c: any) => {
          const status = availMap.get(c.user_id) ?? "offline";
          if (INELIGIBLE.has(status)) return;
          if (onlineOnly && status === "offline") return;
          if (!Number.isNaN(maxOverdue) && (c.overdue_count ?? 0) >= maxOverdue) return;
          const cap0 = Math.min(c.max_active_tasks ?? 0, maxPerAgent);
          const free = Math.max(0, cap0 - (c.current_active ?? 0));
          seats.set(c.user_id, free);
        });
        const projected = new Map((cap ?? []).map((c: any) => [c.user_id, c.current_active ?? 0]));
        const sample: Array<{ task_id: string; task_code: string; priority: string; proposed_agent: string | null; rule_used: string; reason?: string }> = [];
        const unassigned: Array<{ task_id: string; task_code: string; reason: string }> = [];
        for (const t of pending ?? []) {
          const row: any = t;
          const req = new Set<string>((row.required_permissions ?? []) as string[]);
          const eligible = [...seats.entries()]
            .filter(([, s]) => (skipCap ? s > 0 : true))
            .filter(([aid]) => {
              if (req.size === 0) return true;
              const held = skillsByAgent.get(aid) ?? new Set();
              for (const p of req) if (!held.has(p)) return false;
              return true;
            });
          let ruleUsed = mode;
          let chosen: string | null = null;
          if (eligible.length === 0) {
            unassigned.push({ task_id: row.id, task_code: row.task_code, reason: req.size > 0 ? "no_eligible_agent_with_skill" : "no_available_seats" });
            continue;
          }
          if (mode === "priority_based" && (row.priority === "critical" || row.priority === "high")) {
            ruleUsed = "priority_to_senior";
            chosen = eligible.sort((a, b) => b[1] - a[1])[0][0];
          } else if (mode === "skill_based") {
            chosen = eligible.sort((a, b) => b[1] - a[1])[0][0];
          } else if (mode === "least_loaded") {
            chosen = eligible.sort((a, b) => b[1] - a[1])[0][0];
          } else {
            // round_robin fallback: pick agent with most free seats (approximation)
            chosen = eligible.sort((a, b) => b[1] - a[1])[0][0];
          }
          if (chosen) {
            seats.set(chosen, (seats.get(chosen) ?? 0) - 1);
            projected.set(chosen, (projected.get(chosen) ?? 0) + 1);
            sample.push({ task_id: row.id, task_code: row.task_code, priority: row.priority, proposed_agent: chosen, rule_used: ruleUsed });
          }
        }
        const capacityImpact = (cap ?? [])
          .filter((c: any) => !INELIGIBLE.has(availMap.get(c.user_id) ?? "offline"))
          .map((c: any) => ({
            agent_id: c.user_id,
            current: c.current_active ?? 0,
            projected: projected.get(c.user_id) ?? c.current_active ?? 0,
            max: c.max_active_tasks ?? 0,
          }));
        const perAgent = sample.length && capacityImpact.length
          ? Math.round((sample.length / capacityImpact.length) * 10) / 10 : 0;
        return respond({
          ok: true, mode,
          pending: pending?.length ?? 0,
          would_assign: sample.length,
          sample, unassigned,
          capacity_impact: capacityImpact,
          distribution_summary: {
            mode, assigned: sample.length,
            unassigned: unassigned.length, per_agent_average: perAgent,
          },
        });
      }
      case "preview_auto_assign": {
        const { data: rules } = await admin.from("assignment_rules").select("config").eq("scope","global").maybeSingle();
        const mode = (rules?.config as any)?.mode ?? body.mode ?? "round_robin";
        const { plan, unmatched, agent_loads } = await buildAutoAssignPlan(mode);
        const { count: pending } = await admin.from("orchestration_tasks")
          .select("id", { count: "exact", head: true }).eq("status","unassigned");
        return respond({ ok: true, mode, pending: pending ?? 0, would_assign: plan.length, plan, unmatched, agent_loads });
      }
      case "preview_rebalance": {
        const { plan, skipped } = await buildRebalancePlan();
        return respond({ ok: true, moves: plan.length, plan, skipped });
      }
      case "task_detail": {
        if (!body.task_id) return respond({ error: "missing_task_id" }, 400);
        const [{ data: task }, { data: statusHist }, { data: assignHist }, { data: allComments }] = await Promise.all([
          admin.from("orchestration_tasks").select("*").eq("id", body.task_id).maybeSingle(),
          admin.from("task_status_history").select("*").eq("task_id", body.task_id).order("created_at",{ ascending: false }).limit(50),
          admin.from("task_assignment_history").select("*").eq("task_id", body.task_id).order("created_at",{ ascending: false }).limit(50),
          admin.from("task_comments").select("*").eq("task_id", body.task_id).order("created_at",{ ascending: false }).limit(100),
        ]);
        if (!task) return respond({ error: "task_not_found" }, 404);
        // Split public comments vs internal notes.
        const comments = (allComments ?? []).filter((c: any) => (c.visibility ?? "public") !== "internal");
        const internal_notes = (allComments ?? []).filter((c: any) => c.visibility === "internal");

        // Linked context: transaction, dispute, buyer, seller, evidence, messages.
        const context: any = { transaction: null, dispute: null, buyer: null, seller: null };
        let evidence: any[] = [];
        let messages: any[] = [];
        const txId = (task as any).transaction_id;
        const disputeId = (task as any).dispute_id;
        if (txId) {
          const { data: tx } = await admin.from("transactions")
            .select("id, transaction_code, status, amount, currency, buyer_id, seller_id, created_at, updated_at").eq("id", txId).maybeSingle();
          context.transaction = tx ?? null;
          if (tx?.buyer_id) {
            const { data: b } = await admin.from("profiles").select("id, first_name, last_name, email, phone_number, verification_level").eq("id", tx.buyer_id).maybeSingle();
            context.buyer = b ?? null;
          }
          if (tx?.seller_id) {
            const { data: s } = await admin.from("profiles").select("id, first_name, last_name, email, phone_number, verification_level").eq("id", tx.seller_id).maybeSingle();
            context.seller = s ?? null;
          }
          const { data: msgs } = await admin.from("transaction_messages")
            .select("id, body, sender_id, created_at").eq("transaction_id", txId).order("created_at", { ascending: false }).limit(50);
          messages = (msgs ?? []).map((m: any) => ({ id: m.id, author: m.sender_id, body: m.body, created_at: m.created_at }));
        }
        if (disputeId) {
          const { data: d } = await admin.from("disputes")
            .select("id, dispute_code, status, reason_type, opened_by, created_at, updated_at, description").eq("id", disputeId).maybeSingle();
          context.dispute = d ?? null;
          const { data: ev } = await admin.from("dispute_evidence")
            .select("id, evidence_type, description, file_url, submitted_by, created_at").eq("dispute_id", disputeId).order("created_at", { ascending: false }).limit(50);
          evidence = (ev ?? []).map((e: any) => ({
            id: e.id, kind: e.evidence_type, label: e.description, url: e.file_url, created_at: e.created_at, submitted_by: e.submitted_by,
          }));
        }

        const actorIds = new Set<string>();
        (statusHist ?? []).forEach((r: any) => r.actor_id && actorIds.add(r.actor_id));
        (assignHist ?? []).forEach((r: any) => {
          r.actor_id && actorIds.add(r.actor_id);
          r.from_agent_id && actorIds.add(r.from_agent_id);
          r.to_agent_id && actorIds.add(r.to_agent_id);
        });
        (allComments ?? []).forEach((r: any) => r.author_id && actorIds.add(r.author_id));
        const { data: users } = actorIds.size
          ? await admin.from("internal_users").select("user_id, first_name, last_name, email").in("user_id", [...actorIds])
          : { data: [] as any[] };
        const nameMap: Record<string, string> = {};
        (users ?? []).forEach((u: any) => {
          nameMap[u.user_id] = [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || u.email || u.user_id.slice(0,8);
        });
        return respond({
          ok: true,
          task,
          status_history: statusHist ?? [],
          assignment_history: assignHist ?? [],
          comments,
          internal_notes,
          evidence,
          messages,
          context,
          actor_names: nameMap,
        });
      }
      case "start": {
        if (!body.task_id) return respond({ error: "missing_task_id" }, 400);
        const v = await checkVersion(body.task_id, body.expected_version);
        if (!v.ok) return respond({ error: "version_conflict", current: v.current, expected: body.expected_version }, 409);
        const { data: t } = await admin.from("orchestration_tasks").select("status, version, first_action_at").eq("id", body.task_id).maybeSingle();
        if (!t) return respond({ error: "task_not_found" }, 404);
        const patch: any = { status: "in_progress", version: (t.version ?? 0) + 1 };
        if (!t.first_action_at) patch.first_action_at = new Date().toISOString();
        const { error: uErr } = await admin.from("orchestration_tasks").update(patch).eq("id", body.task_id);
        if (uErr) return respond({ error: "update_failed", detail: uErr.message }, 500);
        await admin.from("task_status_history").insert({ task_id: body.task_id, from_status: t.status, to_status: "in_progress", actor_id: ctx.userId, reason: body.reason ?? "started" });
        await logAdminAction({ actorId: ctx.userId, action: "orchestration_start", targetType: "system", metadata: { task_id: body.task_id }, mirrorToAuditLogs: true, ip: meta.ip, userAgent: meta.userAgent }, admin);
        return respond({ ok: true });
      }
      case "update_stage": {
        if (!body.task_id || !body.stage) return respond({ error: "missing_fields" }, 400);
        const v = await checkVersion(body.task_id, body.expected_version);
        if (!v.ok) return respond({ error: "version_conflict", current: v.current, expected: body.expected_version }, 409);
        const { data: t } = await admin.from("orchestration_tasks").select("stage, version").eq("id", body.task_id).maybeSingle();
        if (!t) return respond({ error: "task_not_found" }, 404);
        const { error: uErr } = await admin.from("orchestration_tasks").update({ stage: body.stage, version: (t.version ?? 0) + 1 }).eq("id", body.task_id);
        if (uErr) return respond({ error: "update_failed", detail: uErr.message }, 500);
        await admin.from("task_status_history").insert({ task_id: body.task_id, from_stage: t.stage, to_stage: body.stage, to_status: "in_progress", actor_id: ctx.userId, reason: body.reason ?? "stage updated" });
        await logAdminAction({ actorId: ctx.userId, action: "orchestration_update_stage", targetType: "system", metadata: { task_id: body.task_id, from: t.stage, to: body.stage }, mirrorToAuditLogs: true, ip: meta.ip, userAgent: meta.userAgent }, admin);
        return respond({ ok: true });
      }
      case "add_internal_note": {
        if (!body.task_id || !body.body_text?.trim()) return respond({ error: "missing_fields" }, 400);
        const text = body.body_text.trim().slice(0, 4000);
        const { data: inserted, error: insErr } = await admin.from("task_comments")
          .insert({ task_id: body.task_id, author_id: ctx.userId, body: text, visibility: "internal" })
          .select("id, task_id, body, created_at, author_id, visibility").single();
        if (insErr) return respond({ error: "insert_failed", detail: insErr.message }, 500);
        await logAdminAction({ actorId: ctx.userId, action: "orchestration_internal_note", targetType: "system", metadata: { task_id: body.task_id, length: text.length }, ip: meta.ip, userAgent: meta.userAgent }, admin);
        return respond({ ok: true, note: inserted });
      }
      case "request_info":
      case "request_evidence": {
        if (!body.task_id) return respond({ error: "missing_task_id" }, 400);
        const v = await checkVersion(body.task_id, body.expected_version);
        if (!v.ok) return respond({ error: "version_conflict", current: v.current, expected: body.expected_version }, 409);
        const target = body.target ?? "buyer";
        const nextStatus = target === "seller" ? "waiting_on_seller" : target === "both" ? "waiting_on_evidence" : "waiting_on_buyer";
        const { data: t } = await admin.from("orchestration_tasks").select("status, version").eq("id", body.task_id).maybeSingle();
        if (!t) return respond({ error: "task_not_found" }, 404);
        await admin.from("orchestration_tasks").update({ status: nextStatus, version: (t.version ?? 0) + 1 }).eq("id", body.task_id);
        await admin.from("task_status_history").insert({ task_id: body.task_id, from_status: t.status, to_status: nextStatus, actor_id: ctx.userId, reason: body.reason ?? (body.action === "request_evidence" ? "evidence requested" : "info requested") });
        await logAdminAction({ actorId: ctx.userId, action: `orchestration_${body.action}`, targetType: "system", metadata: { task_id: body.task_id, target, reason: body.reason }, mirrorToAuditLogs: true, ip: meta.ip, userAgent: meta.userAgent }, admin);
        return respond({ ok: true, status: nextStatus });
      }
      case "submit_resolution": {
        if (!body.task_id) return respond({ error: "missing_task_id" }, 400);
        const v = await checkVersion(body.task_id, body.expected_version);
        if (!v.ok) return respond({ error: "version_conflict", current: v.current, expected: body.expected_version }, 409);
        const { data: t } = await admin.from("orchestration_tasks").select("status, version, type").eq("id", body.task_id).maybeSingle();
        if (!t) return respond({ error: "task_not_found" }, 404);
        // Financial types must go through send_for_approval when caller lacks the permission.
        const needed = t.type ? financialTaskPerm[t.type as string] : undefined;
        if (needed) {
          try { await requireAnyPermission(req, [needed], ctx); }
          catch { return respond({ error: "financial_permission_required", required: needed, suggestion: "send_for_approval" }, 403); }
        }
        await admin.from("orchestration_tasks").update({ status: "resolved", resolution_text: body.resolution ?? null, version: (t.version ?? 0) + 1, resolved_at: new Date().toISOString() }).eq("id", body.task_id);
        await admin.from("task_status_history").insert({ task_id: body.task_id, from_status: t.status, to_status: "resolved", actor_id: ctx.userId, reason: body.resolution ?? "resolved" });
        await logAdminAction({ actorId: ctx.userId, action: "orchestration_submit_resolution", targetType: "system", metadata: { task_id: body.task_id, resolution: body.resolution }, mirrorToAuditLogs: true, ip: meta.ip, userAgent: meta.userAgent }, admin);
        return respond({ ok: true });
      }
      case "close": {
        if (!body.task_id) return respond({ error: "missing_task_id" }, 400);
        const v = await checkVersion(body.task_id, body.expected_version);
        if (!v.ok) return respond({ error: "version_conflict", current: v.current, expected: body.expected_version }, 409);
        const { data: t } = await admin.from("orchestration_tasks").select("status, version").eq("id", body.task_id).maybeSingle();
        if (!t) return respond({ error: "task_not_found" }, 404);
        await admin.from("orchestration_tasks").update({ status: "closed", version: (t.version ?? 0) + 1, closed_at: new Date().toISOString() }).eq("id", body.task_id);
        await admin.from("task_status_history").insert({ task_id: body.task_id, from_status: t.status, to_status: "closed", actor_id: ctx.userId, reason: body.reason ?? "closed" });
        await logAdminAction({ actorId: ctx.userId, action: "orchestration_close", targetType: "system", metadata: { task_id: body.task_id }, mirrorToAuditLogs: true, ip: meta.ip, userAgent: meta.userAgent }, admin);
        return respond({ ok: true });
      }
      case "export_queue": {
        const scope = body.scope ?? "queue";
        let rows: Record<string, unknown>[] = [];
        let filename = "task-orchestration";
        if (scope === "queue") {
          const { data } = await admin.from("orchestration_tasks")
            .select("task_code,type,priority,status,stage,amount,currency,created_at,dispute_id,transaction_id,assigned_agent_id,sla_due_at")
            .eq("status","unassigned").order("created_at",{ ascending: true }).limit(5000);
          rows = data ?? [];
          filename = "task-queue";
        } else if (scope === "live") {
          const { data } = await admin.from("orchestration_tasks")
            .select("task_code,type,priority,status,stage,assigned_agent_id,started_at,updated_at,sla_status,dispute_id")
            .not("status","in","(unassigned,resolved,closed,cancelled)")
            .order("updated_at",{ ascending: false }).limit(5000);
          rows = data ?? [];
          filename = "task-live";
        } else if (scope === "roster") {
          const { data: cap } = await admin.from("agent_capacity").select("*");
          const { data: avail } = await admin.from("agent_availability").select("*");
          const availMap = new Map((avail ?? []).map((a: any) => [a.user_id, a]));
          rows = (cap ?? []).map((c: any) => {
            const a: any = availMap.get(c.user_id) ?? {};
            return {
              user_id: c.user_id, status: a.status ?? "offline", last_heartbeat: a.last_heartbeat ?? null,
              current_active: c.current_active, max_active_tasks: c.max_active_tasks,
              overdue_count: c.overdue_count, resolved_today: c.resolved_today,
            };
          });
          filename = "task-roster";
        }
        const headers = rows.length ? Object.keys(rows[0]) : [];
        const escape = (v: unknown) => {
          if (v === null || v === undefined) return "";
          const s = typeof v === "string" ? v : JSON.stringify(v);
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        };
        const csv = [headers.join(","), ...rows.map(r => headers.map(h => escape((r as any)[h])).join(","))].join("\n");
        await logAdminAction({
          actorId: ctx.userId, action: "orchestration_export",
          targetType: "system", metadata: { scope, rows: rows.length }, mirrorToAuditLogs: true,
          ip: meta.ip, userAgent: meta.userAgent,
        }, admin);
        return respond({ ok: true, filename: `${filename}-${new Date().toISOString().slice(0,10)}.csv`, csv, rows: rows.length });
      }
    }
    return respond({ error: "unknown_action" }, 400);
  } catch (e) {
    return respond({ error: "action_failed", detail: e instanceof Error ? e.message : String(e) }, 500);
  }
});