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
    | "task_detail" | "export_queue";
  task_id?: string;
  task_ids?: string[];
  agent_id?: string;
  from_agent_id?: string;
  mode?: string;
  reason?: string;
  resolution?: string;
  body_text?: string;
  expected_version?: number;
  rules?: Record<string, unknown>;
  exclude_task_ids?: string[];
  exclude_agent_ids?: string[];
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

  async function pickBestAgent(): Promise<string | null> {
    const [{ data: cap }, { data: avail }] = await Promise.all([
      admin.from("agent_capacity").select("*"),
      admin.from("agent_availability").select("*"),
    ]);
    const availMap = new Map((avail ?? []).map((a: any) => [a.user_id, a.status]));
    const eligible = (cap ?? [])
      .filter((c: any) => (availMap.get(c.user_id) ?? "offline") !== "offline")
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
    const [{ data: pending }, { data: cap }, { data: avail }] = await Promise.all([
      admin.from("orchestration_tasks")
        .select("id, task_code, priority")
        .eq("status","unassigned")
        .order("priority",{ ascending: false })
        .order("created_at",{ ascending: true }).limit(50),
      admin.from("agent_capacity").select("*"),
      admin.from("agent_availability").select("*"),
    ]);
    const availMap = new Map((avail ?? []).map((a: any) => [a.user_id, a.status]));
    const seats = new Map(
      (cap ?? []).filter((c: any) => (availMap.get(c.user_id) ?? "offline") !== "offline")
        .map((c: any) => [c.user_id, Math.max(0, (c.max_active_tasks ?? 0) - (c.current_active ?? 0))]),
    );
    const plan: Array<{ task_id: string; task_code: string; agent_id: string; reason: string }> = [];
    for (const t of pending ?? []) {
      const candidate = [...seats.entries()].filter(([, s]) => s > 0)
        .sort((a, b) => b[1] - a[1])[0];
      if (!candidate) break;
      const [agentId, s] = candidate;
      seats.set(agentId, s - 1);
      plan.push({ task_id: (t as any).id, task_code: (t as any).task_code, agent_id: agentId, reason: `auto:${mode}` });
    }
    return plan;
  }

  async function buildRebalancePlan() {
    const { data: overloaded } = await admin.from("agent_capacity").select("*");
    const plan: Array<{ task_id: string; from: string; to: string }> = [];
    for (const a of overloaded ?? []) {
      if (a.current_active > a.max_active_tasks) {
        const excess = a.current_active - a.max_active_tasks;
        const { data: taskRows } = await admin.from("orchestration_tasks")
          .select("id").eq("assigned_agent_id", a.user_id).in("status", ["assigned","in_progress"])
          .order("priority", { ascending: true }).limit(excess);
        for (const t of taskRows ?? []) {
          const to = await pickBestAgent();
          if (!to || to === a.user_id) continue;
          plan.push({ task_id: (t as any).id, from: a.user_id, to });
        }
      }
    }
    return plan;
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
        if (ids.length === 1 && typeof body.expected_version === "number") {
          const v = await checkVersion(ids[0], body.expected_version);
          if (!v.ok) return respond({ error: "version_conflict", current: v.current, expected: body.expected_version }, 409);
        }
        const [{ data: capRow }, { data: availRow }, { data: taskRows }] = await Promise.all([
          admin.from("agent_capacity").select("current_active, max_active_tasks").eq("user_id", body.agent_id).maybeSingle(),
          admin.from("agent_availability").select("status").eq("user_id", body.agent_id).maybeSingle(),
          admin.from("orchestration_tasks").select("id, required_permissions").in("id", ids),
        ]);
        if (!body.override_capacity && availRow && availRow.status === "offline") {
          return respond({ error: "agent_offline" }, 409);
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
          if (availRow?.status === "offline") return respond({ error: "agent_offline" }, 409);
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
        const fullPlan = await buildAutoAssignPlan(mode);
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
        const plan = await buildRebalancePlan();
        let moved = 0;
        for (const m of plan) {
          await admin.rpc("assign_task", {
            _task_id: m.task_id, _agent_id: m.to, _mode: "rebalance", _reason: "load rebalance", _actor_id: ctx.userId,
          });
          moved++;
        }
        await logAdminAction({
          actorId: ctx.userId, action: "orchestration_rebalance",
          targetType: "system", metadata: { moved }, mirrorToAuditLogs: true,
          ip: meta.ip, userAgent: meta.userAgent,
        }, admin);
        return respond({ ok: true, moved });
      }
      case "escalate": {
        const ids = body.task_ids ?? (body.task_id ? [body.task_id] : []);
        if (!ids.length) return respond({ error: "missing_task_ids" }, 400);
        if (ids.length === 1 && typeof body.expected_version === "number") {
          const v = await checkVersion(ids[0], body.expected_version);
          if (!v.ok) return respond({ error: "version_conflict", current: v.current, expected: body.expected_version }, 409);
        }
        for (const id of ids) {
          await admin.rpc("escalate_task", { _task_id: id, _reason: body.reason ?? "escalated", _actor_id: ctx.userId });
        }
        await logAdminAction({
          actorId: ctx.userId, action: "orchestration_escalate",
          targetType: "system", metadata: { task_ids: ids, reason: body.reason }, mirrorToAuditLogs: true,
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
        ].filter(Boolean) as string[];
        const allowedModes = ["round_robin","least_loaded","priority_weighted","skill_match","manual_only"];
        if (r.mode !== undefined && !allowedModes.includes(String(r.mode))) {
          errs.push(`mode must be one of ${allowedModes.join(", ")}`);
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
          rule_id: saved.id, version: nextVer, config: nextConfig, actor_id: ctx.userId, note: body.reason ?? null,
        });
        await logAdminAction({
          actorId: ctx.userId, action: "orchestration_save_rules",
          targetType: "setting", before, after: nextConfig, mirrorToAuditLogs: true,
          ip: meta.ip, userAgent: meta.userAgent,
        }, admin);
        return respond({ ok: true, rules: saved, version: nextVer });
      }
      case "test_rules": {
        const { data: pending } = await admin.from("orchestration_tasks").select("id").eq("status","unassigned").limit(50);
        const { data: cap } = await admin.from("agent_capacity").select("*");
        const { data: avail } = await admin.from("agent_availability").select("*");
        const availMap = new Map((avail ?? []).map((a: any) => [a.user_id, a.status]));
        const seats = (cap ?? [])
          .filter((c: any) => (availMap.get(c.user_id) ?? "offline") !== "offline")
          .reduce((sum: number, c: any) => sum + Math.max(0, c.max_active_tasks - c.current_active), 0);
        const wouldAssign = Math.min(seats, pending?.length ?? 0);
        return respond({ ok: true, would_assign: wouldAssign, pending: pending?.length ?? 0, seats });
      }
      case "preview_auto_assign": {
        const { data: rules } = await admin.from("assignment_rules").select("config").eq("scope","global").maybeSingle();
        const mode = (rules?.config as any)?.mode ?? body.mode ?? "round_robin";
        const plan = await buildAutoAssignPlan(mode);
        const { count: pending } = await admin.from("orchestration_tasks")
          .select("id", { count: "exact", head: true }).eq("status","unassigned");
        return respond({ ok: true, mode, pending: pending ?? 0, would_assign: plan.length, plan });
      }
      case "preview_rebalance": {
        const plan = await buildRebalancePlan();
        return respond({ ok: true, moves: plan.length, plan });
      }
      case "task_detail": {
        if (!body.task_id) return respond({ error: "missing_task_id" }, 400);
        const [{ data: task }, { data: statusHist }, { data: assignHist }, { data: comments }] = await Promise.all([
          admin.from("orchestration_tasks").select("*").eq("id", body.task_id).maybeSingle(),
          admin.from("task_status_history").select("*").eq("task_id", body.task_id).order("created_at",{ ascending: false }).limit(50),
          admin.from("task_assignment_history").select("*").eq("task_id", body.task_id).order("created_at",{ ascending: false }).limit(50),
          admin.from("task_comments").select("*").eq("task_id", body.task_id).order("created_at",{ ascending: false }).limit(100),
        ]);
        if (!task) return respond({ error: "task_not_found" }, 404);
        const actorIds = new Set<string>();
        (statusHist ?? []).forEach((r: any) => r.actor_id && actorIds.add(r.actor_id));
        (assignHist ?? []).forEach((r: any) => {
          r.actor_id && actorIds.add(r.actor_id);
          r.from_agent_id && actorIds.add(r.from_agent_id);
          r.to_agent_id && actorIds.add(r.to_agent_id);
        });
        (comments ?? []).forEach((r: any) => r.author_id && actorIds.add(r.author_id));
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
          comments: comments ?? [],
          actor_names: nameMap,
        });
      }
    }
    return respond({ error: "unknown_action" }, 400);
  } catch (e) {
    return respond({ error: "action_failed", detail: e instanceof Error ? e.message : String(e) }, 500);
  }
});