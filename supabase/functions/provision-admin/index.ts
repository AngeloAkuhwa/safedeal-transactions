// One-shot admin provisioning function. Gated by a hard-coded token so it
// cannot be invoked anonymously. Safe to re-run (idempotent).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-provision-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PROVISION_TOKEN = "safedeal-provision-2026-admin-bootstrap";
const ADMIN_EMAIL = "admin@safedeal.test";
const ADMIN_PASSWORD = "SafeDealAdmin#2026";
const ADMIN_FULL_NAME = "SafeDeal Admin";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const token = req.headers.get("x-provision-token");
  if (token !== PROVISION_TOKEN) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    // 1) Find or create the auth user.
    let userId: string | null = null;

    // Page through users to locate an existing match (admin.listUsers has no
    // direct email filter on this SDK version).
    const { data: list, error: listErr } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (listErr) throw listErr;
    const existing = list.users.find(
      (u) => (u.email ?? "").toLowerCase() === ADMIN_EMAIL,
    );

    if (existing) {
      userId = existing.id;
      // Reset password + ensure email confirmed.
      const { error: updErr } = await supabase.auth.admin.updateUserById(
        userId,
        {
          password: ADMIN_PASSWORD,
          email_confirm: true,
          user_metadata: { full_name: ADMIN_FULL_NAME, default_role: "admin" },
        },
      );
      if (updErr) throw updErr;
    } else {
      const { data: created, error: createErr } =
        await supabase.auth.admin.createUser({
          email: ADMIN_EMAIL,
          password: ADMIN_PASSWORD,
          email_confirm: true,
          user_metadata: { full_name: ADMIN_FULL_NAME, default_role: "admin" },
        });
      if (createErr) throw createErr;
      userId = created.user!.id;
    }

    // 2) Upsert profile (handle_new_user trigger may already have created it).
    const { error: profileErr } = await supabase
      .from("profiles")
      .upsert(
        {
          id: userId,
          email: ADMIN_EMAIL,
          full_name: ADMIN_FULL_NAME,
          default_role: "admin",
        },
        { onConflict: "id" },
      );
    if (profileErr) throw profileErr;

    // 3) Grant admin role.
    const { error: roleErr } = await supabase
      .from("user_roles")
      .upsert(
        { user_id: userId, role: "admin" },
        { onConflict: "user_id,role" },
      );
    if (roleErr) throw roleErr;

    // 4) Mark verifications fully verified for a clean profile UI.
    const { error: verErr } = await supabase
      .from("account_verifications")
      .upsert(
        {
          user_id: userId,
          email_verified: true,
          phone_verified: true,
          identity_verified: true,
          payout_verified: true,
          verification_level: "trusted_buyer",
        },
        { onConflict: "user_id" },
      );
    if (verErr) {
      // non-fatal
      console.warn("verification upsert warning:", verErr.message);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        user_id: userId,
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
        role: "admin",
        sign_in_url: "/auth?mode=login&redirect=%2Fadmin%2Fdashboard",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("provision-admin error:", message);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});