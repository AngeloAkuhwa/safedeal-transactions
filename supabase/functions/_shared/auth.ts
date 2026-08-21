import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export interface AuthContext {
  userId: string;
  email: string | null;
  adminClient: SupabaseClient;
  /** Assurance level from the access token ("aal1" or "aal2"). */
  aal?: string | null;
}

/** Raised when the AAL2 gate cannot read `system_settings`. */
export class SettingsReadError extends Error {}

/**
 * Last successfully observed value of `security.two_factor_admin_enforced`.
 * Seeded from the environment so a cold isolate still fails CLOSED once the
 * platform has turned enforcement on.
 */
let lastKnownMfaEnforced =
  (Deno.env.get("ADMIN_MFA_ENFORCED_HINT") ?? "").toLowerCase() === "true";

/** Test seam: override / read the cached enforcement belief. */
export function __setLastKnownMfaEnforced(v: boolean) { lastKnownMfaEnforced = v; }
export function __getLastKnownMfaEnforced() { return lastKnownMfaEnforced; }

/**
 * Resolve the calling user from the Authorization bearer token, returning
 * a service-role client and the user identity. Throws on auth failure.
 */
export async function requireUser(req: Request): Promise<AuthContext> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new AuthError(401, "not_authenticated");
  }
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const token = authHeader.replace("Bearer ", "");
  const { data, error } = await adminClient.auth.getUser(token);
  if (error || !data?.user) throw new AuthError(401, "invalid_session");
  let aal: string | null = null;
  try {
    const payload = JSON.parse(
      atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
    );
    aal = typeof payload?.aal === "string" ? payload.aal : null;
  } catch { /* non-fatal */ }
  return { userId: data.user.id, email: data.user.email ?? null, adminClient, aal };
}

/**
 * Resolve the caller and assert they have the `admin` role.
 * Internal helper for back-office release / refund / queue endpoints.
 */
export async function requireAdmin(req: Request): Promise<AuthContext> {
  const ctx = await requireUser(req);
  // Accept either the legacy consumer `admin` role OR any internal
  // (back-office) role. Internal teammates like support_agent, auditor,
  // finance_ops, etc. don't have rows in `user_roles`: their access
  // comes from `internal_user_roles`.
  const [{ data: hasConsumerAdmin, error: consumerErr }, { data: hasInternal, error: internalErr }] =
    await Promise.all([
      ctx.adminClient.rpc("has_role", { _user_id: ctx.userId, _role: "admin" }),
      ctx.adminClient.rpc("has_any_internal_role", {
        _user_id: ctx.userId,
        _role_keys: [
          "super_admin", "senior_admin",
          "dispute_manager", "dispute_agent",
          "support_agent",
          "identity_officer",
          "finance_operator", "finance_approver",
          "compliance_officer",
          "auditor",
        ],
      }),
    ]);
  if (consumerErr || internalErr) throw new AuthError(500, "role_check_failed");
  if (!hasConsumerAdmin && !hasInternal) throw new AuthError(403, "admin_required");

  // AAL2 gate.
  //   `security.two_factor_admin`         : ADVISORY policy signal only.
  //   `security.two_factor_admin_enforced`: the real switch (default OFF).
  // Until the enforcement key is turned on we run in log-only mode so the
  // platform can measure how many admins would be blocked.
  //
  // FAIL-CLOSED CONTRACT: if enforcement is (or was last observed to be) ON,
  // a settings-read failure must NOT bypass the gate. We return 503
  // `mfa_gate_unavailable` instead of silently allowing the request. When the
  // flags are off we keep the log-only behaviour.
  try {
    const { data: rows, error: readErr } = await ctx.adminClient
      .from("system_settings")
      .select("setting_key, setting_value")
      .eq("scope", "platform")
      .in("setting_key", [
        "security.two_factor_admin",
        "security.two_factor_admin_enforced",
      ]);
    if (readErr) throw new SettingsReadError(readErr.message ?? "system_settings_read_failed");
    const truthy = (raw: unknown) =>
      raw === true || raw === "true" ||
      (typeof raw === "object" && raw !== null && (raw as { enabled?: unknown }).enabled === true);
    const byKey = new Map<string, unknown>(
      ((rows ?? []) as { setting_key: string; setting_value: unknown }[])
        .map((r) => [r.setting_key, r.setting_value]),
    );
    const advisory = truthy(byKey.get("security.two_factor_admin"));
    const enforced = truthy(byKey.get("security.two_factor_admin_enforced"));
    lastKnownMfaEnforced = enforced;
    if (ctx.aal !== "aal2" && (advisory || enforced)) {
      if (enforced) {
        throw new AuthError(403, "mfa_required");
      }
      console.warn(
        JSON.stringify({
          event: "mfa_gate_log_only",
          user_id: ctx.userId,
          aal: ctx.aal ?? null,
          note: "would_block_if_security.two_factor_admin_enforced_were_on",
        }),
      );
    }
  } catch (e) {
    if (e instanceof AuthError) throw e;
    console.error(
      JSON.stringify({
        event: "mfa_gate_settings_read_failed",
        user_id: ctx.userId,
        last_known_enforced: lastKnownMfaEnforced,
        message: (e as Error).message,
      }),
    );
    // Fail CLOSED when enforcement is believed to be on and the caller is not
    // already at AAL2. Fail open (log-only) only while enforcement is off.
    if (lastKnownMfaEnforced && ctx.aal !== "aal2") {
      throw new AuthError(503, "mfa_gate_unavailable");
    }
  }

  return ctx;
}

/**
 * Assert the caller (already authenticated as an admin/internal user) has a
 * specific fine-grained permission. Bypasses the check for `super_admin`
 * and the legacy consumer `admin` role.
 *
 * Should be called AFTER `requireAdmin(req)`; when `ctx` is omitted this
 * helper will run `requireAdmin` itself.
 */
export async function requirePermission(
  req: Request,
  permission: string,
  existingCtx?: AuthContext,
): Promise<AuthContext> {
  const ctx = existingCtx ?? (await requireAdmin(req));

  // Short-circuit for super roles.
  const [{ data: isSuper }, { data: isConsumerAdmin }] = await Promise.all([
    ctx.adminClient.rpc("has_any_internal_role", {
      _user_id: ctx.userId,
      _role_keys: ["super_admin"],
    }),
    ctx.adminClient.rpc("has_role", { _user_id: ctx.userId, _role: "admin" }),
  ]);
  if (isSuper || isConsumerAdmin) return ctx;

  const { data: perms, error } = await ctx.adminClient.rpc(
    "internal_effective_permissions",
    { _user_id: ctx.userId },
  );
  if (error) throw new AuthError(500, "permission_check_failed");
  const list = Array.isArray(perms) ? (perms as string[]) : [];
  if (!list.includes(permission)) {
    throw new PermissionError(permission);
  }
  return ctx;
}

/**
 * Like `requirePermission` but accepts a set of alternative permission keys.
 * Passes when the caller holds AT LEAST ONE of them (or is a super role).
 */
export async function requireAnyPermission(
  req: Request,
  permissions: string[],
  existingCtx?: AuthContext,
): Promise<AuthContext> {
  const ctx = existingCtx ?? (await requireAdmin(req));

  const [{ data: isSuper }, { data: isConsumerAdmin }] = await Promise.all([
    ctx.adminClient.rpc("has_any_internal_role", {
      _user_id: ctx.userId,
      _role_keys: ["super_admin"],
    }),
    ctx.adminClient.rpc("has_role", { _user_id: ctx.userId, _role: "admin" }),
  ]);
  if (isSuper || isConsumerAdmin) return ctx;

  const { data: perms, error } = await ctx.adminClient.rpc(
    "internal_effective_permissions",
    { _user_id: ctx.userId },
  );
  if (error) throw new AuthError(500, "permission_check_failed");
  const held = new Set(Array.isArray(perms) ? (perms as string[]) : []);
  if (!permissions.some((p) => held.has(p))) {
    throw new PermissionError(permissions.join("|"));
  }
  return ctx;
}

export class AuthError extends Error {
  constructor(public status: number, public code: string) {
    super(code);
  }
}

export class PermissionError extends AuthError {
  constructor(public required: string) {
    super(403, "permission_denied");
  }
}

export function authErrorResponse(err: unknown, corsHeaders: Record<string, string>): Response | null {
  if (err instanceof PermissionError) {
    return new Response(
      JSON.stringify({ error: err.code, required: err.required }),
      { status: err.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  if (err instanceof AuthError) {
    return new Response(JSON.stringify({ error: err.code }), {
      status: err.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  return null;
}