// Creates a new internal user (or resends an invite) from the Access Control
// "Add User" drawer. Uses service role to:
//   1. Send a Supabase auth invitation email
//   2. Insert into public.internal_users
//   3. Insert one row per role into public.internal_user_roles
//   4. Emit a canonical admin_actions audit row via logAdminAction
// Returns a hydrated InternalUser payload matching the client contract.
import { requireAdmin, authErrorResponse } from "../_shared/auth.ts";
import { logAdminAction, extractRequestMeta } from "../_shared/audit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface InviteBody {
  full_name?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  department?: string;
  team?: string | null;
  job_title?: string | null;
  roles?: string[];
  primary_role?: string;
  reporting_manager_id?: string | null;
  access_expires_at?: string | null;
  reason?: string;
  send_invitation?: boolean;
  require_2fa?: boolean;
  resend?: boolean;
  user_id?: string; // resend path
}

async function hydrateUser(admin: ReturnType<typeof requireAdmin> extends Promise<infer C> ? (C extends { adminClient: infer A } ? A : never) : never, userId: string) {
  const [{ data: row }, { data: roleRows }] = await Promise.all([
    (admin as any).from("internal_users").select("*").eq("id", userId).maybeSingle(),
    (admin as any).from("internal_user_roles").select("role_key,is_primary").eq("user_id", userId),
  ]);
  if (!row) return null;
  const roles = (roleRows ?? []).map((r: any) => r.role_key as string);
  const primary = (roleRows ?? []).find((r: any) => r.is_primary)?.role_key
    ?? roles[0] ?? "support_agent";
  return {
    id: row.id,
    display_id: row.display_id,
    employee_id: row.employee_id ?? row.display_id,
    full_name: row.full_name,
    first_name: row.first_name ?? null,
    last_name: row.last_name ?? null,
    email: row.email,
    avatar_url: null,
    roles,
    primary_role: primary,
    access_level: "standard",
    status: row.status,
    last_active_at: row.last_active_at,
    two_factor_enabled: !!row.two_factor_enabled,
    created_at: row.created_at,
    department: row.department,
    team: row.team ?? null,
    job_title: row.job_title ?? null,
    reporting_manager_id: row.reporting_manager_id ?? null,
    reporting_manager_name: null,
    reporting_manager_role: null,
    access_expires_at: row.access_expires_at ?? null,
    reason_for_access: row.reason_for_access ?? null,
    invitation_status: row.invitation_status ?? "sent",
    permissions: [],
    base_permissions: [],
    grants: [],
    revokes: [],
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  let ctx;
  try { ctx = await requireAdmin(req); }
  catch (err) {
    const r = authErrorResponse(err, corsHeaders);
    if (r) return r;
    return json(500, { error: "auth_failed" });
  }

  let body: InviteBody;
  try { body = await req.json(); }
  catch { return json(400, { error: "invalid_json" }); }

  const admin = ctx.adminClient;
  const meta = extractRequestMeta(req);
  const origin = req.headers.get("origin") ?? req.headers.get("referer") ?? undefined;

  // ---------- Resend path ----------
  if (body.resend) {
    const email = (body.email ?? "").trim().toLowerCase();
    if (!email) return json(400, { error: "missing_email" });

    const { data: existing } = await admin
      .from("internal_users")
      .select("id,email,full_name")
      .ilike("email", email)
      .maybeSingle();
    if (!existing) return json(404, { error: "user_not_found" });

    const { error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { full_name: existing.full_name },
      redirectTo: origin,
    });
    if (inviteErr && !/already/i.test(inviteErr.message)) {
      return json(400, { error: "invite_failed", detail: inviteErr.message });
    }

    await admin
      .from("internal_users")
      .update({ invitation_status: "sent", updated_at: new Date().toISOString() })
      .eq("id", existing.id);

    await logAdminAction(admin, {
      actorId: ctx.userId,
      action: "invitation_resent",
      targetType: "user",
      targetId: existing.id,
      reason: body.reason,
      metadata: { email, entity_ref: `internal_users:${existing.id}`, result: "success" },
      mirrorToAuditLogs: true,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    const user = await hydrateUser(admin, existing.id);
    return json(200, { user });
  }

  // ---------- New invite ----------
  const email = (body.email ?? "").trim().toLowerCase();
  const roles = Array.isArray(body.roles) ? body.roles.filter((r) => typeof r === "string" && r.length) : [];
  const primary = body.primary_role;
  const fullName = (body.full_name ?? `${body.first_name ?? ""} ${body.last_name ?? ""}`).trim();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(400, { error: "invalid_email" });
  if (!roles.length) return json(400, { error: "missing_roles" });
  if (!primary || !roles.includes(primary)) return json(400, { error: "invalid_primary_role" });
  if (!fullName) return json(400, { error: "missing_name" });
  if (!body.department) return json(400, { error: "missing_department" });

  // Prevent duplicates
  const { data: dupe } = await admin
    .from("internal_users").select("id").ilike("email", email).maybeSingle();
  if (dupe) return json(409, { error: "email_already_exists" });

  // 1) Send Supabase auth invite (creates auth.users row + emails link)
  let newUserId: string | undefined;
  const { data: authRes, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName, default_role: primary },
    redirectTo: origin,
  });
  if (authRes?.user?.id) {
    newUserId = authRes.user.id;
  } else if (inviteErr && /already been registered|already registered|already exists/i.test(inviteErr.message)) {
    // Auth user exists (likely from a previous failed insert). Reuse it.
    try {
      const { data: list } = await (admin as any).auth.admin.listUsers({ page: 1, perPage: 200 });
      const found = list?.users?.find((u: any) => (u.email ?? "").toLowerCase() === email);
      if (found?.id) newUserId = found.id;
    } catch { /* ignore */ }
    if (!newUserId) {
      return json(400, { error: "invite_failed", detail: inviteErr.message });
    }
    // Best-effort: re-send an invitation link so the user still gets an email.
    try {
      await admin.auth.admin.inviteUserByEmail(email, {
        data: { full_name: fullName, default_role: primary },
        redirectTo: origin,
      });
    } catch { /* ignore */ }
  } else {
    return json(400, { error: "invite_failed", detail: inviteErr?.message ?? "no_user_returned" });
  }

  // 2) Insert into internal_users. employee_id + display_id filled by DB triggers.
  // Generate employee_id via RPC (no BEFORE INSERT trigger exists) and mirror to display_id.
  const { data: empIdData, error: empIdErr } = await (admin as any).rpc("generate_employee_id");
  if (empIdErr || !empIdData) {
    try { await admin.auth.admin.deleteUser(newUserId); } catch { /* ignore */ }
    return json(400, { error: "insert_failed", detail: empIdErr?.message ?? "employee_id_generation_failed" });
  }
  const employeeId = String(empIdData);

  const { data: iuRow, error: iuErr } = await admin
    .from("internal_users")
    .insert({
      id: newUserId,
      employee_id: employeeId,
      display_id: employeeId,
      full_name: fullName,
      first_name: body.first_name ?? null,
      last_name: body.last_name ?? null,
      email,
      department: body.department,
      team: body.team ?? null,
      job_title: body.job_title ?? null,
      reporting_manager_id: body.reporting_manager_id ?? null,
      access_expires_at: body.access_expires_at ?? null,
      reason_for_access: body.reason ?? null,
      status: "active",
      invitation_status: body.send_invitation === false ? "not_invited" : "sent",
      two_factor_enabled: !!body.require_2fa,
    })
    .select("id")
    .maybeSingle();
  if (iuErr) {
    // Best-effort cleanup — the auth user exists but the row failed.
    try { await admin.auth.admin.deleteUser(newUserId); } catch { /* ignore */ }
    return json(400, { error: "insert_failed", detail: iuErr.message });
  }

  // 3) Insert role assignments
  const roleRows = roles.map((r) => ({
    user_id: newUserId,
    role_key: r,
    is_primary: r === primary,
  }));
  const { error: roleErr } = await admin.from("internal_user_roles").insert(roleRows);
  if (roleErr) {
    return json(400, { error: "role_insert_failed", detail: roleErr.message });
  }

  // 4) Audit
  await logAdminAction(admin, {
    actorId: ctx.userId,
    action: "user_invited",
    targetType: "user",
    targetId: newUserId,
    reason: body.reason,
    after: {
      email, full_name: fullName, department: body.department,
      roles, primary_role: primary, require_2fa: !!body.require_2fa,
    },
    metadata: {
      entity_ref: `internal_users:${newUserId}`,
      result: "success",
      send_invitation: body.send_invitation !== false,
    },
    mirrorToAuditLogs: true,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  const user = await hydrateUser(admin, newUserId);
  return json(200, { user });
});