// Single mutation endpoint for Task Orchestration. Handles: assign,
// auto_assign, rebalance, escalate, complete, save_rules.
import { requirePermission, authErrorResponse } from "../_shared/auth.ts";
import { logAdminAction, extractRequestMeta } from "../_shared/audit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Body = {
  action:
    | "assign" | "assign_selected" | "auto_assign" | "assign_to_me"
    | "rebalance" | "escalate" | "complete" | "save_rules" | "test_rules";
  task_id?: string;
  task_ids?: string[];
  agent_id?: string;
  mode?: string;
  reason?: string;
  resolution?: string;
  rules?: Record<string, unknown>;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const body = (await req.json().catch(() => ({}))) as Body;
  const permMap: Record<Body["action"], string> = {
    assign: "task_orchestration.assign",
    assign_selected: "task_orchestration.assign",
    auto_assign: "task_orchestration.assign",
    assign_to_me: "task_orchestration.assign",
    rebalance: "task_orchestration.rebalance",
    escalate: "task_orchestration.escalate",
    complete: "task_orchestration.manage",
    save_rules: "task_orchestration.manage",
    test_rules: "task_orchestration.view",
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
    const availMap = new Map((avail ?? []).map(a => [a.user_id, a.status]));
    const eligible = (cap ?? [])
      .filter(c => (availMap.get(c.user_id) ?? "offline") !== "offline")
      .filter(c => c.current_active < c.max_active_tasks)
      .sort((a,b) => a.current_active - b.current_active);
    return eligible[0]?.user_id ?? null;
  }

  try {
    switch (body.action) {
      case "assign":
      case "assign_selected": {
        const ids = body.task_ids ?? (body.task_id ? [body.task_id] : []);
        if (!ids.length || !body.agent_id) return respond({ error: "missing_fields" }, 400);
        // Enforce capacity + required-permission (skill) for the target agent.
        const [{ data: capRow }, { data: availRow }, { data: taskRows }] = await Promise.all([
          admin.from("agent_capacity").select("current_active, max_active_tasks").eq("user_id", body.agent_id).maybeSingle(),
          admin.from("agent_availability").select("status").eq("user_id", body.agent_id).maybeSingle(),
          admin.from("orchestration_tasks").select("id, required_permissions").in("id", ids),
        ]);
        if (availRow && availRow.status === "offline") {
          return respond({ error: "agent_offline" }, 409);
        }
        const current = capRow?.current_active ?? 0;
        const max = capRow?.max_active_tasks ?? 0;
        if (max > 0 && current + ids.length > max) {
          return respond({ error: "agent_over_capacity", current, max, requested: ids.length }, 409);
        }
        // Skill check: agent must hold every required permission across selected tasks.
        const requiredSet = new Set<string>();
        (taskRows ?? []).forEach((t: any) => (t.required_permissions ?? []).forEach((p: string) => requiredSet.add(p)));
        if (requiredSet.size > 0) {
          const { data: skills } = await admin.from("agent_skills").select("permission_key").eq("user_id", body.agent_id);
          const held = new Set((skills ?? []).map((s: any) => s.permission_key));
          const missing = [...requiredSet].filter((p) => !held.has(p));
          if (missing.length > 0) {
            return respond({ error: "agent_missing_skills", missing }, 409);
          }
        }
        for (const id of ids) {
          await admin.rpc("assign_task", {
            _task_id: id, _agent_id: body.agent_id,
            _mode: body.mode ?? "manual", _reason: body.reason ?? null, _actor_id: ctx.userId,
          });
        }
        await logAdminAction({
          actorId: ctx.userId, action: "orchestration_assign",
          targetType: "system", metadata: { task_ids: ids, agent_id: body.agent_id, mode: body.mode },
          ip: meta.ip, userAgent: meta.userAgent,
        }, admin);
        return respond({ ok: true, count: ids.length });
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
        const { data: pending } = await admin.from("orchestration_tasks")
          .select("id, priority").eq("status","unassigned")
          .order("priority", { ascending: false }).order("created_at", { ascending: true }).limit(25);
        let count = 0;
        for (const task of pending ?? []) {
          const agent = await pickBestAgent();
          if (!agent) break;
          await admin.rpc("assign_task", {
            _task_id: task.id, _agent_id: agent, _mode: mode, _reason: "auto-assign", _actor_id: ctx.userId,
          });
          count++;
        }
        await logAdminAction({
          actorId: ctx.userId, action: "orchestration_auto_assign",
          targetType: "system", metadata: { count, mode },
          ip: meta.ip, userAgent: meta.userAgent,
        }, admin);
        return respond({ ok: true, count });
      }
      case "rebalance": {
        const { data: overloaded } = await admin.from("agent_capacity").select("*");
        const movable: { task_id: string; from: string }[] = [];
        for (const a of overloaded ?? []) {
          if (a.current_active > a.max_active_tasks) {
            const excess = a.current_active - a.max_active_tasks;
            const { data: taskRows } = await admin.from("orchestration_tasks")
              .select("id").eq("assigned_agent_id", a.user_id).in("status", ["assigned","in_progress"])
              .order("priority", { ascending: true }).limit(excess);
            (taskRows ?? []).forEach(t => movable.push({ task_id: t.id, from: a.user_id }));
          }
        }
        let moved = 0;
        for (const m of movable) {
          const agent = await pickBestAgent();
          if (!agent || agent === m.from) continue;
          await admin.rpc("assign_task", {
            _task_id: m.task_id, _agent_id: agent, _mode: "rebalance", _reason: "load rebalance", _actor_id: ctx.userId,
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
        await admin.rpc("complete_orchestration_task", {
          _task_id: body.task_id, _resolution: body.resolution ?? "resolved", _actor_id: ctx.userId,
        });
        await logAdminAction({
          actorId: ctx.userId, action: "orchestration_complete",
          targetType: "system", metadata: { task_id: body.task_id, resolution: body.resolution },
          ip: meta.ip, userAgent: meta.userAgent,
        }, admin);
        return respond({ ok: true });
      }
      case "save_rules": {
        if (!body.rules) return respond({ error: "missing_rules" }, 400);
        const { data: existing } = await admin.from("assignment_rules").select("id, config").eq("scope","global").maybeSingle();
        const before = existing?.config ?? null;
        const nextConfig = { ...(before as object ?? {}), ...body.rules };
        const { data: saved, error: saveErr } = await admin.from("assignment_rules")
          .upsert({ scope: "global", mode: (nextConfig as any).mode ?? "round_robin", config: nextConfig, updated_by: ctx.userId },
                  { onConflict: "scope" })
          .select().single();
        if (saveErr) return respond({ error: "save_failed", detail: saveErr.message }, 500);
        // Version snapshot
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
        return respond({ ok: true, rules: saved });
      }
      case "test_rules": {
        // Dry-run: how many pending tasks could we assign right now?
        const { data: pending } = await admin.from("orchestration_tasks").select("id").eq("status","unassigned").limit(50);
        const { data: cap } = await admin.from("agent_capacity").select("*");
        const { data: avail } = await admin.from("agent_availability").select("*");
        const availMap = new Map((avail ?? []).map(a => [a.user_id, a.status]));
        const seats = (cap ?? [])
          .filter(c => (availMap.get(c.user_id) ?? "offline") !== "offline")
          .reduce((sum, c) => sum + Math.max(0, c.max_active_tasks - c.current_active), 0);
        const wouldAssign = Math.min(seats, pending?.length ?? 0);
        return respond({ ok: true, would_assign: wouldAssign, pending: pending?.length ?? 0, seats });
      }
    }
    return respond({ error: "unknown_action" }, 400);
  } catch (e) {
    return respond({ error: "action_failed", detail: e instanceof Error ? e.message : String(e) }, 500);
  }
});