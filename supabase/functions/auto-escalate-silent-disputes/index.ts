import { admin, corsHeaders, jsonResponse, logRun, verifyCronSecret } from "../_shared/cron.ts";

const SERVICE = "cron.auto-escalate-silent-disputes";
const BATCH = 200;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const auth = verifyCronSecret(req);
  if (!auth.ok) return auth.res;

  const client = admin();
  const systemActor = Deno.env.get("SYSTEM_ACTOR_ID");
  if (!systemActor) return jsonResponse({ error: "SYSTEM_ACTOR_ID not configured" }, 500);

  const errors: Array<{ id: string; reason: string }> = [];
  let escalated = 0;

  try {
    const nowIso = new Date().toISOString();
    const { data: rows, error } = await client
      .from("disputes")
      .select("id,transaction_id,status,seller_response_due_at,transactions!inner(seller_id,buyer_id,transaction_code)")
      .eq("status", "seller_response_pending")
      .lt("seller_response_due_at", nowIso)
      .limit(BATCH);
    if (error) throw error;

    // Filter out disputes with any seller responses
    const ids = (rows ?? []).map((r: any) => r.id as string);
    let respondedSet = new Set<string>();
    if (ids.length) {
      const { data: resps } = await client
        .from("dispute_responses").select("dispute_id").in("dispute_id", ids);
      respondedSet = new Set((resps ?? []).map((r: any) => r.dispute_id as string));
    }
    const candidates = (rows ?? []).filter((r: any) => !respondedSet.has(r.id));

    const { data: adminRoles } = await client
      .from("user_roles").select("user_id").eq("role", "admin");
    const adminIds = (adminRoles ?? []).map((r: any) => r.user_id as string);

    for (const d of candidates as any[]) {
      try {
        // Race-safe status flip
        const { data: upd, error: updErr } = await client
          .from("disputes")
          .update({ status: "under_review", updated_at: new Date().toISOString() })
          .eq("id", d.id)
          .eq("status", "seller_response_pending")
          .select("id");
        if (updErr) { errors.push({ id: d.id, reason: updErr.message }); continue; }
        if (!upd || upd.length === 0) continue;

        await client.from("dispute_status_history").insert({
          dispute_id: d.id,
          old_status: "seller_response_pending",
          new_status: "under_review",
          changed_by_user_id: systemActor,
          reason: "auto_escalate_silent",
        });

        await client.rpc("flag_for_release_review", {
          p_transaction_id: d.transaction_id,
          p_reason: "silent_dispute",
          p_actor_user_id: systemActor,
          p_notes: "auto-escalated: seller did not respond",
        });

        const tx = d.transactions ?? {};
        const notifs: any[] = [];
        for (const aid of adminIds) {
          notifs.push({
            user_id: aid, type: "dispute_update", channel: "in_app",
            title: "Silent dispute escalated",
            message: `${tx.transaction_code ?? "Dispute"} moved to review (no seller response).`,
            related_dispute_id: d.id, related_transaction_id: d.transaction_id,
          });
        }
        if (tx.seller_id) notifs.push({
          user_id: tx.seller_id, type: "dispute_update", channel: "in_app",
          title: "Response deadline passed",
          message: "Your dispute response deadline has passed.",
          related_dispute_id: d.id, related_transaction_id: d.transaction_id,
        });
        if (tx.buyer_id) notifs.push({
          user_id: tx.buyer_id, type: "dispute_update", channel: "in_app",
          title: "Dispute moved to review",
          message: "This dispute has moved to review.",
          related_dispute_id: d.id, related_transaction_id: d.transaction_id,
        });
        if (notifs.length) await client.from("notifications").insert(notifs);

        escalated += 1;
      } catch (e) {
        errors.push({ id: d.id, reason: (e as Error).message });
      }
    }

    await logRun(client, SERVICE, {
      records_found: candidates.length,
      records_updated: escalated,
      errors: errors.length,
    });

    return jsonResponse({ ok: true, found: candidates.length, escalated, errors });
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    await logRun(client, SERVICE, { error: msg }, "error", `auto-escalate-silent-disputes fatal: ${msg}`);
    return jsonResponse({ error: "internal_error" }, 500);
  }
});
