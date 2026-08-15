import { admin, corsHeaders, jsonResponse, logRun, verifyCronSecret } from "../_shared/cron.ts";

const SERVICE = "cron.auto-timeout-payments";
const BATCH = 200;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = verifyCronSecret(req);
  if (!auth.ok) return auth.res;

  const client = admin();
  const errors: Array<{ id: string; reason: string }> = [];
  let updated = 0;

  try {
    // The window is configuration, not a constant. `timeout_transaction_atomic`
    // re-verifies it authoritatively; this pre-filter must not disagree with it.
    const { data: setting, error: settingErr } = await client
      .from("system_settings")
      .select("setting_value")
      .eq("setting_key", "transactions.payment_window_hours")
      .eq("scope", "platform")
      .maybeSingle();
    if (settingErr) throw settingErr;
    const windowHours = Number(setting?.setting_value);
    if (!Number.isFinite(windowHours) || windowHours <= 0) {
      throw new Error("payment_window_not_configured");
    }
    const cutoffIso = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();

    const { data: rows, error } = await client
      .from("transactions")
      .select("id")
      .eq("status", "awaiting_payment")
      .lt("created_at", cutoffIso)
      .limit(BATCH);
    if (error) throw error;

    const ids = (rows ?? []).map(r => r.id as string);
    for (const id of ids) {
      const { data, error: rpcErr } = await client.rpc("timeout_transaction_atomic", { p_tx_id: id });
      if (rpcErr) {
        errors.push({ id, reason: rpcErr.message });
        continue;
      }
      const result = (data ?? {}) as { ok?: boolean; skipped?: boolean };
      if (result.ok) updated += 1;
    }

    // Vendor plans that ran past their paid period fall back to the free
    // Verified plan. Idempotent and safe to run on every pass.
    let plans_downgraded = 0;
    const { data: expired, error: expireErr } = await client.rpc("expire_vendor_plans", {});
    if (expireErr) {
      errors.push({ id: "expire_vendor_plans", reason: expireErr.message });
    } else {
      plans_downgraded = Number(expired ?? 0);
    }

    await logRun(client, SERVICE, {
      records_found: ids.length,
      records_updated: updated,
      vendor_plans_downgraded: plans_downgraded,
      errors: errors.length,
      cutoff_iso: cutoffIso,
    });

    return jsonResponse({ ok: true, found: ids.length, updated, plans_downgraded, errors });
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    await logRun(client, SERVICE, { error: msg }, "error", `auto-timeout-payments fatal: ${msg}`);
    return jsonResponse({ error: "internal_error" }, 500);
  }
});
