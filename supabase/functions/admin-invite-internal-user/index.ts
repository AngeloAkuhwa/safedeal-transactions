// Creates a new internal user (or resends an invite) from the Access Control
// "Add User" drawer. Uses service role to:
//   1. Send a Supabase auth invitation email
//   2. Insert into public.internal_users
//   3. Insert one row per role into public.internal_user_roles
//   4. Emit a canonical admin_actions audit row via logAdminAction
// Returns a hydrated InternalUser payload matching the client contract.
import { requireAdmin, authErrorResponse , requirePermission} from "../_shared/auth.ts";
import { logAdminAction, extractRequestMeta } from "../_shared/audit.ts";
import { assertCanGrantRoles } from "../_shared/internal-role-rank.ts";
import { enforceAdminRateLimit } from "../_shared/rate-limit.ts";

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

// ---------------- Branded invite email ----------------

function escapeHtml(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function humanizeRole(role: string): string {
  return role.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function renderInviteHtml(opts: {
  inviteeName: string;
  inviterName: string;
  roleLabel: string;
  actionLink: string;
}): string {
  const name = escapeHtml(opts.inviteeName || "there");
  const inviter = escapeHtml(opts.inviterName || "A SafeDeal admin");
  const role = escapeHtml(opts.roleLabel || "Admin");
  const link = escapeHtml(opts.actionLink);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>You're invited to SafeDeal</title>
  </head>
  <body style="margin:0;padding:0;background:#F1F5F9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,Helvetica,Arial,sans-serif;color:#0F172A;">
    <span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">Your SafeDeal admin invitation: accept to set your password.</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9;padding:32px 12px;">
      <tr><td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#FFFFFF;border:1px solid #E2E8F0;border-radius:14px;overflow:hidden;">
          <tr><td style="padding:24px 28px 8px 28px;">
            <table role="presentation" width="100%"><tr>
              <td style="font-weight:700;font-size:20px;letter-spacing:-0.2px;color:#0F5BB3;">SafeDeal</td>
              <td align="right"><span style="display:inline-block;padding:4px 10px;border-radius:999px;background:#E0F2FE;color:#0F5BB3;font-size:11px;font-weight:600;letter-spacing:0.3px;text-transform:uppercase;">Admin Console</span></td>
            </tr></table>
          </td></tr>
          <tr><td style="padding:16px 28px 4px 28px;">
            <h1 style="margin:0 0 8px 0;font-size:22px;line-height:1.3;font-weight:700;color:#0F172A;">You've been invited to SafeDeal</h1>
            <p style="margin:0 0 20px 0;font-size:15px;line-height:1.6;color:#334155;">Hi ${name}, ${inviter} invited you to join the <strong style="color:#0F172A;">${role}</strong> team on the SafeDeal admin console. Accept below to set your password and get started.</p>
          </td></tr>
          <tr><td style="padding:8px 28px 4px 28px;">
            <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:10px;background:#0F5BB3;">
              <a href="${link}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:10px;">Accept invitation &amp; set password</a>
            </td></tr></table>
          </td></tr>
          <tr><td style="padding:20px 28px 4px 28px;">
            <table role="presentation" cellpadding="0" cellspacing="0" style="font-size:12px;color:#475569;">
              <tr>
                <td style="padding-right:14px;">🔒 Secure link</td>
                <td style="padding-right:14px;">⏱ Expires in 24h</td>
                <td>🛡 SafeDeal Trust Layer</td>
              </tr>
            </table>
          </td></tr>
          <tr><td style="padding:20px 28px 4px 28px;">
            <p style="margin:0 0 6px 0;font-size:12px;color:#64748B;">Button not working? Paste this link into your browser:</p>
            <div style="font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;color:#0F172A;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:10px 12px;word-break:break-all;">${link}</div>
          </td></tr>
          <tr><td style="padding:20px 28px 24px 28px;">
            <hr style="border:none;border-top:1px solid #E2E8F0;margin:0 0 14px 0;" />
            <p style="margin:0;font-size:12px;line-height:1.6;color:#64748B;">You're receiving this because your email was added to the SafeDeal admin console. If this wasn't expected, you can ignore this email.</p>
            <p style="margin:8px 0 0 0;font-size:11px;color:#94A3B8;">© ${new Date().getFullYear()} SafeDeal. Trust layer for online transactions.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

function renderInviteText(opts: { inviteeName: string; inviterName: string; roleLabel: string; actionLink: string; }): string {
  return `Hi ${opts.inviteeName || "there"},

${opts.inviterName || "A SafeDeal admin"} invited you to join the ${opts.roleLabel} team on the SafeDeal admin console.

Accept your invitation and set your password:
${opts.actionLink}

If this wasn't expected, you can ignore this email.
— SafeDeal`;
}

type EmailChannel = "resend" | "supabase_default" | "failed";

async function sendViaResend(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<{ ok: true } | { ok: false; status: number; body: string }> {
  const key = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("RESEND_FROM_EMAIL") || "SafeDeal <onboarding@resend.dev>";
  if (!key) return { ok: false, status: 0, body: "resend_api_key_missing" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        from,
        to: [opts.to],
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
        reply_to: from,
        tags: [{ name: "category", value: "internal-invite" }],
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`[invite] resend failed [${res.status}]: ${body}`);
      return { ok: false, status: res.status, body };
    }
    return { ok: true };
  } catch (err) {
    console.error("[invite] resend threw:", err);
    return { ok: false, status: 0, body: err instanceof Error ? err.message : String(err) };
  }
}

async function issueInviteEmail(admin: any, opts: {
  email: string;
  fullName: string;
  inviterName: string;
  roleLabel: string;
  redirectTo: string;
  isExistingUser?: boolean;
}): Promise<{ channel: EmailChannel; actionLink?: string; error?: string; userId?: string }> {
  // 1) Generate an action link.
  //    - New user: try "invite" first (creates the auth user, does NOT email).
  //    - Existing user (resend, or invite that races with an existing row):
  //      use "recovery": "invite" rejects registered users, and recovery
  //      links drop the user into the same /accept-invite page to set a
  //      password.
  async function gen(type: "invite" | "recovery") {
    return await admin.auth.admin.generateLink({
      type,
      email: opts.email,
      options: {
        redirectTo: opts.redirectTo,
        data: { full_name: opts.fullName },
      },
    });
  }

  let linkData: any;
  let linkErr: any;
  if (opts.isExistingUser) {
    ({ data: linkData, error: linkErr } = await gen("recovery"));
  } else {
    ({ data: linkData, error: linkErr } = await gen("invite"));
    // Retry as recovery if the user already exists (leftover from a prior attempt).
    if (linkErr && /already|registered|exist/i.test(linkErr.message ?? "")) {
      console.warn("[invite] user already exists, retrying with recovery link");
      ({ data: linkData, error: linkErr } = await gen("recovery"));
    }
  }

  const actionLink: string | undefined = linkData?.properties?.action_link ?? linkData?.action_link;
  const userId: string | undefined = linkData?.user?.id;

  if (linkErr || !actionLink) {
    console.error("[invite] generateLink failed:", linkErr?.message);
    // Only try inviteUserByEmail for brand-new users; it rejects existing ones.
    if (!opts.isExistingUser) {
      const { data: fbData, error: fbErr } = await admin.auth.admin.inviteUserByEmail(opts.email, {
        data: { full_name: opts.fullName },
        redirectTo: opts.redirectTo,
      });
      if (fbErr) return { channel: "failed", error: fbErr.message };
      return { channel: "supabase_default", userId: fbData?.user?.id };
    }
    return { channel: "failed", error: linkErr?.message ?? "no_action_link" };
  }

  // 2) Try Resend first with our branded template.
  const html = renderInviteHtml({
    inviteeName: opts.fullName,
    inviterName: opts.inviterName,
    roleLabel: opts.roleLabel,
    actionLink,
  });
  const text = renderInviteText({
    inviteeName: opts.fullName,
    inviterName: opts.inviterName,
    roleLabel: opts.roleLabel,
    actionLink,
  });
  const resendResult = await sendViaResend({
    to: opts.email,
    subject: "You're invited to the SafeDeal admin console",
    html,
    text,
  });
  if (resendResult.ok) return { channel: "resend", actionLink, userId };

  // 3) Resend failed. For new users, fall back to Supabase's default invite email.
  //    For existing users, inviteUserByEmail rejects them. Return failed.
  if (!opts.isExistingUser) {
    const { error: fbErr } = await admin.auth.admin.inviteUserByEmail(opts.email, {
      data: { full_name: opts.fullName },
      redirectTo: opts.redirectTo,
    });
    if (fbErr) {
      return { channel: "failed", actionLink, userId, error: `resend_failed:${resendResult.status}; supabase_failed:${fbErr.message}` };
    }
    return { channel: "supabase_default", actionLink, userId, error: `resend_failed:${resendResult.status}` };
  }
  return { channel: "failed", actionLink, userId, error: `resend_failed:${resendResult.status}:${resendResult.body}` };
}

async function lookupAuthUserId(admin: any, email: string): Promise<string | undefined> {
  try {
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    return list?.users?.find((u: any) => (u.email ?? "").toLowerCase() === email)?.id;
  } catch {
    return undefined;
  }
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
  // Derived from auth.mfa_factors. `internal_users.two_factor_enabled` is a
  // deprecated shadow flag and is not trusted for display.
  const { data: hasMfa } = await (admin as any).rpc("user_has_verified_mfa", { _user_id: userId });
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
    two_factor_enabled: hasMfa === true,
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

  let ctx;
  try { ctx = await requirePermission(req, "users_and_access.manage_permissions"); }
  catch (err) {
    const r = authErrorResponse(err, corsHeaders);
    if (r) return r;
    return json(500, { error: "auth_failed" });
  }

  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const rl = await enforceAdminRateLimit(ctx, "invite_internal_user", 20, corsHeaders);
  if (rl) return rl;

  let body: InviteBody;
  try { body = await req.json(); }
  catch { return json(400, { error: "invalid_json" }); }

  const admin = ctx.adminClient;
  const meta = extractRequestMeta(req);
  const origin = req.headers.get("origin") ?? req.headers.get("referer") ?? undefined;
  const redirectTo = `${origin ?? ""}/accept-invite`;

  // Look up inviter's display name for the email body (best-effort).
  let inviterName = "A SafeDeal admin";
  try {
    const { data: inviter } = await admin
      .from("internal_users")
      .select("full_name")
      .eq("id", ctx.userId)
      .maybeSingle();
    if (inviter?.full_name) inviterName = inviter.full_name;
  } catch { /* ignore */ }

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

    // Pull primary role label for the email body.
    let roleLabel = "Admin";
    try {
      const { data: rr } = await admin
        .from("internal_user_roles")
        .select("role_key,is_primary")
        .eq("user_id", existing.id);
      const key = (rr ?? []).find((r: any) => r.is_primary)?.role_key ?? (rr ?? [])[0]?.role_key;
      if (key) roleLabel = humanizeRole(String(key));
    } catch { /* ignore */ }

    const emailRes = await issueInviteEmail(admin, {
      email,
      fullName: existing.full_name ?? "",
      inviterName,
      roleLabel,
      redirectTo,
      isExistingUser: true,
    });

    await admin
      .from("internal_users")
      .update({
        invitation_status: emailRes.channel === "failed" ? "failed" : "sent",
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);

    await logAdminAction(admin, {
      actorId: ctx.userId,
      action: "invitation_resent",
      targetType: "user",
      targetId: existing.id,
      reason: body.reason,
      metadata: {
        email,
        entity_ref: `internal_users:${existing.id}`,
        result: emailRes.channel === "failed" ? "email_failed" : "success",
        email_channel: emailRes.channel,
        email_error: emailRes.error,
      },
      mirrorToAuditLogs: true,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    const user = await hydrateUser(admin, existing.id);
    return json(200, { user, email_channel: emailRes.channel, email_error: emailRes.error });
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

  // Privilege-escalation guard: an actor may only grant roles strictly below
  // their own highest internal rank, and ONLY a super_admin may grant
  // super_admin or senior_admin. Mirrors the DB trigger
  // `enforce_internal_role_rules` so a direct table write can't bypass it.
  const rank = await assertCanGrantRoles(admin, ctx.userId, roles);
  if (!rank.ok) {
    if (rank.error === "invalid_role") {
      return json(400, { error: "invalid_role", invalid_roles: rank.invalid });
    }
    await logAdminAction(admin, {
      actorId: ctx.userId,
      action: "user_invited",
      targetType: "user",
      targetId: ctx.userId,
      reason: body.reason,
      metadata: {
        result: "blocked_insufficient_rank",
        email,
        requested_roles: roles,
        blocked_roles: rank.blocked,
        actor_roles: rank.actorRoles,
      },
      mirrorToAuditLogs: true,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return json(403, {
      error: "insufficient_rank",
      blocked_roles: rank.blocked,
      detail: "You may only grant roles below your own; super_admin and senior_admin can be granted by a super_admin only.",
    });
  }

  // Prevent duplicates
  const { data: dupe } = await admin
    .from("internal_users").select("id").ilike("email", email).maybeSingle();
  if (dupe) return json(409, { error: "email_already_exists" });

  // 1) Issue the invite (branded Resend, fallback to Supabase default).
  const shouldSend = body.send_invitation !== false;
  let newUserId: string | undefined;
  let emailRes: { channel: EmailChannel; error?: string } = { channel: "failed" };

  if (shouldSend) {
    const res = await issueInviteEmail(admin, {
      email,
      fullName,
      inviterName,
      roleLabel: humanizeRole(primary),
      redirectTo,
    });
    newUserId = res.userId ?? (await lookupAuthUserId(admin, email));
    emailRes = { channel: res.channel, error: res.error };
    if (!newUserId) {
      return json(400, { error: "invite_failed", detail: res.error ?? "no_user_returned" });
    }
  } else {
    // Create the auth user without emailing anything.
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      email_confirm: false,
      user_metadata: { full_name: fullName },
    });
    if (createErr && !/already/i.test(createErr.message)) {
      return json(400, { error: "invite_failed", detail: createErr.message });
    }
    newUserId = created?.user?.id ?? (await lookupAuthUserId(admin, email));
    if (!newUserId) return json(400, { error: "invite_failed", detail: "no_user_returned" });
    emailRes = { channel: "failed" };
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
      // New internal users start as "invited": they only flip to "active"
      // after they accept the invite and set their password. Prevents the
      // roster from showing green "Active" pills for un-onboarded people.
      status: "invited",
      invitation_status: !shouldSend
        ? "not_invited"
        : emailRes.channel === "failed"
          ? "failed"
          : "sent",
      two_factor_enabled: !!body.require_2fa,
    })
    .select("id")
    .maybeSingle();
  if (iuErr) {
    // Best-effort cleanup: the auth user exists but the row failed.
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
      result: shouldSend && emailRes.channel === "failed" ? "email_failed" : "success",
      send_invitation: shouldSend,
      email_channel: emailRes.channel,
      email_error: emailRes.error,
    },
    mirrorToAuditLogs: true,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  const user = await hydrateUser(admin, newUserId);
  return json(200, { user, email_channel: emailRes.channel, email_error: emailRes.error });
});