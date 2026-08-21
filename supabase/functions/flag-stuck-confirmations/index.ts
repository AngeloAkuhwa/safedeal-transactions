import { admin, corsHeaders, jsonResponse, logRun, verifyCronSecret } from "../_shared/cron.ts";

const SERVICE = "cron.flag-stuck-confirmations";
const BATCH = 200;
const SELLER_TIMEOUT_HOURS = 72;
const RELEASE_SLA_HOURS = 48;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const auth = verifyCronSecret(req);
  if (!auth.ok) return auth.res;

  const client = admin();
  const systemActor = Deno.env.get("SYSTEM_ACTOR_ID");
  if (!systemActor) return jsonResponse({ error: "SYSTEM_ACTOR_ID not configured" }, 500);

  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const sellerCut = new Date(now - SELLER_TIMEOUT_HOURS * 3600_000).toISOString();
  const releaseCut = new Date(now - RELEASE_SLA_HOURS * 3600_000).toISOString();

  const errors: Array<{ id: string; reason: string }> = [];
  let flagged = 0;

  try {
    const { data: rows, error } = await client
      .from("transactions")
      .select("id,seller_id,buyer_id,transaction_code,status,money_status,delivered_at,verification_deadline_at,buyer_confirmed_at,seller_confirmed_at,needs_release_review")
      .in("money_status", ["funds_held_in_escrow", "funds_pending_release"])
      .eq("needs_release_review", false)
      .limit(BATCH * 4);
    if (error) throw error;

    const candidates = (rows ?? []).filter((t: any) => {
      // As soon as the buyer's own verification deadline passes with no
      // confirmation, the transaction needs manual review. There is no
      // automatic release job, so this must not wait for a fixed 72h.
      const case1 = t.status === "delivered_awaiting_verification"
        && t.verification_deadline_at && t.verification_deadline_at < nowIso
        && !t.buyer_confirmed_at;
      const case2 = t.buyer_confirmed_at && !t.seller_confirmed_at
        && t.buyer_confirmed_at < sellerCut;
      const case3 = t.buyer_confirmed_at && t.seller_confirmed_at
        && t.money_status === "funds_pending_release"
        && t.seller_confirmed_at < releaseCut;
      return case1 || case2 || case3;
    }).slice(0, BATCH);

    // Cache admin user list once
    const { data: adminRoles } = await client
      .from("user_roles").select("user_id").eq("role", "admin");
    const adminIds = (adminRoles ?? []).map((r: any) => r.user_id as string);

    for (const t of candidates as any[]) {
      const caseLabel = (!t.buyer_confirmed_at)
        ? "buyer_not_confirmed"
        : (!t.seller_confirmed_at ? "seller_not_confirmed" : "release_pending");
      try {
        const { error: flagErr } = await client.rpc("flag_for_release_review", {
          p_transaction_id: t.id,
          p_reason: "stuck_confirmation",
          p_actor_user_id: systemActor,
          p_notes: `auto: ${caseLabel}`,
        });
        if (flagErr) { errors.push({ id: t.id, reason: flagErr.message }); continue; }
        flagged += 1;

        // Notify admins, seller, buyer
        const notifs: any[] = [];
        for (const aid of adminIds) {
          notifs.push({
            user_id: aid, type: "system_message", channel: "in_app",
            title: "Stuck transaction flagged",
            message: `${t.transaction_code} is awaiting review (${caseLabel}).`,
            related_transaction_id: t.id,
          });
        }
        notifs.push({
          user_id: t.seller_id, type: "transaction_update", channel: "in_app",
          title: "Transaction awaiting review",
          message: "This transaction is awaiting review.",
          related_transaction_id: t.id,
        });
        if (t.buyer_id) {
          notifs.push({
            user_id: t.buyer_id, type: "transaction_update", channel: "in_app",
            title: "Transaction awaiting review",
            message: "This transaction is awaiting review.",
            related_transaction_id: t.id,
          });
        }
        if (notifs.length) await client.from("notifications").insert(notifs);
      } catch (e) {
        errors.push({ id: t.id, reason: (e as Error).message });
      }
    }

    await logRun(client, SERVICE, {
      records_found: candidates.length,
      records_updated: flagged,
      errors: errors.length,
    });

    return jsonResponse({ ok: true, found: candidates.length, flagged, errors });
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    await logRun(client, SERVICE, { error: msg }, "error", `flag-stuck-confirmations fatal: ${msg}`);
    return jsonResponse({ error: "internal_error" }, 500);
  }
});
