// Returns the calling teammate's roles + effective permissions.
// Consumed by <AdminPermissionsProvider /> so client-side gating is derived
// from DB truth, never trusted from the browser.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { requireAdmin, authErrorResponse } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Legacy consumer-admin gets treated as super_admin so the platform owner
// account never loses screens.
const ALL_PERMISSIONS_SENTINEL = "*";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let ctx;
  try { ctx = await requireAdmin(req); }
  catch (err) {
    const resp = authErrorResponse(err, corsHeaders);
    if (resp) return resp;
    throw err;
  }

  const client = ctx.adminClient;

  // Idempotent promotion: if this teammate is still marked "invited" but has
  // already signed in, flip them to "active". Guarded by `.eq("status","invited")`
  // so it never clobbers suspended/deactivated rows and only writes once.
  try {
    const { data: iu } = await client
      .from("internal_users")
      .select("status")
      .eq("id", ctx.userId)
      .maybeSingle();
    if (iu && (iu as any).status === "invited") {
      await client
        .from("internal_users")
        .update({
          status: "active",
          invitation_status: "accepted",
          activated_at: new Date().toISOString(),
        })
        .eq("id", ctx.userId)
        .eq("status", "invited");
    }
  } catch (_e) {
    // non-fatal: permissions load must not be blocked by promotion
  }

  const [{ data: internalRoles }, { data: consumerRoles }, { data: perms }, { data: level }, { data: profileRow }, { data: hasMfa }] = await Promise.all([
    client.from("internal_user_roles").select("role_key").eq("user_id", ctx.userId),
    client.from("user_roles").select("role").eq("user_id", ctx.userId),
    client.rpc("internal_effective_permissions", { _user_id: ctx.userId }),
    client.rpc("internal_effective_access_level", { _user_id: ctx.userId }),
    // Display identity for the admin shell. Primary-key lookup; nullable for
    // legacy consumer-admins that have no internal_users row.
    client.from("internal_users").select("full_name, display_id").eq("id", ctx.userId).maybeSingle(),
    // Real 2FA enrolment state, derived from auth.mfa_factors.
    client.rpc("user_has_verified_mfa", { _user_id: ctx.userId }),
  ]);

  const roles = [
    ...((internalRoles ?? []) as Array<{ role_key: string }>).map((r) => r.role_key),
    ...((consumerRoles ?? []) as Array<{ role: string }>).map((r) => r.role),
  ];

  const isSuper =
    roles.includes("super_admin") || roles.includes("admin"); // legacy consumer admin

  let permissions: string[] = Array.isArray(perms) ? (perms as string[]) : [];
  if (isSuper) permissions = [ALL_PERMISSIONS_SENTINEL];

  return new Response(
    JSON.stringify({
      user_id: ctx.userId,
      email: ctx.email,
      full_name: (profileRow as { full_name?: string | null } | null)?.full_name ?? null,
      display_id: (profileRow as { display_id?: string | null } | null)?.display_id ?? null,
      roles,
      permissions,
      access_level: (level as string) ?? "limited",
      is_super: isSuper,
      aal: ctx.aal ?? null,
      mfa_enrolled: hasMfa === true,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
  );
});
