import { admin, corsHeaders, jsonResponse, logRun, verifyCronSecret } from "../_shared/cron.ts";
import { notifyOpsTeam } from "../_shared/notify.ts";
import {
  ALERT_COOLDOWN_HOURS,
  DEFAULT_STUCK_HOURS,
  WATCHDOG_IN_FLIGHT_STATUSES,
  WATCHDOG_STUCK_HOURS_KEY,
  isStuckPayout,
  parseStuckHours,
  payoutAgeHours,
  shouldAlert,
  stuckCutoffIso,
} from "../_shared/payout-watchdog.ts";

const SERVICE = "cron.payout-watchdog";
const BATCH = 200;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = verifyCronSecret(req);
  if (!auth.ok) return auth.res;

  const client = admin();
  const now = new Date();

  try {
    // Threshold from system settings (platform scope), default 6h.
    const { data: setting } = await client
      .from("system_settings")
      .select("setting_value")
      .eq("setting_key", WATCHDOG_STUCK_HOURS_KEY)
      .eq("scope", "platform")
      .maybeSingle();
    const thresholdHours = parseStuckHours((setting as any)?.setting_value ?? DEFAULT_STUCK_HOURS);
    const cutoffIso = stuckCutoffIso(thresholdHours, now);

    const { data: rows, error } = await client
      .from("payouts")
      .select(
        "id, transaction_id, seller_id, amount, currency_code, status, provider_reference, initiated_at, created_at, watchdog_alerted_at",
      )
      .in("status", WATCHDOG_IN_FLIGHT_STATUSES as unknown as string[])
      .is("provider_reference", null)
      .or(`initiated_at.lt.${cutoffIso},and(initiated_at.is.null,created_at.lt.${cutoffIso})`)
      .order("created_at", { ascending: true })
      .limit(BATCH);
    if (error) throw error;

    const scanned = (rows ?? []).length;
    const stuck = (rows ?? []).filter((p: any) => isStuckPayout(p, thresholdHours, now));
    const alertedIds: string[] = [];

    for (const p of stuck as any[]) {
      const ageHours = Math.round(payoutAgeHours(p, now) * 10) / 10;
      const severity = ageHours >= thresholdHours * 4 ? "critical" : "high";
      // A null payout amount is itself the anomaly ops must see. Rendering it
      // as "0" would page them about a zero-value payout that does not exist.
      const amountValue: number | null =
        p.amount === null || p.amount === undefined || Number.isNaN(Number(p.amount))
          ? null
          : Number(p.amount);
      const amountText = amountValue === null ? "amount not recorded" : amountValue.toLocaleString();

      await client.from("system_logs").insert({
        level: severity === "critical" ? "error" : "warn",
        service_name: SERVICE,
        message: `Payout ${p.id} stuck in '${p.status}' for ${ageHours}h with no provider reference`,
        metadata: {
          payout_id: p.id,
          transaction_id: p.transaction_id,
          seller_id: p.seller_id,
          amount: amountValue,
          currency: p.currency_code ?? "NGN",
          status: p.status,
          stuck_hours: ageHours,
          threshold_hours: thresholdHours,
        },
      });

      if (!shouldAlert(p, now, ALERT_COOLDOWN_HOURS)) continue;

      await notifyOpsTeam(client, {
        type: "security_alert",
        title: "Stuck payout detected",
        message:
          `Payout ${p.id} (${p.currency_code ?? "NGN"} ${amountText}) ` +
          `has been '${p.status}' for ${ageHours}h with no Paystack reference. Investigate before releasing again.`,
        related_transaction_id: p.transaction_id ?? null,
        metadata: {
          alert: "payout_stuck",
          severity,
          payout_id: p.id,
          transaction_id: p.transaction_id,
          amount: amountValue,
          currency: p.currency_code ?? "NGN",
          stuck_hours: ageHours,
          threshold_hours: thresholdHours,
          deep_link: `/admin/payouts?tab=stuck&search=${p.id}`,
        },
      });

      const { error: stampErr } = await client
        .from("payouts")
        .update({ watchdog_alerted_at: now.toISOString() })
        .eq("id", p.id);
      if (stampErr) console.error("watchdog_alerted_at stamp failed:", stampErr);

      alertedIds.push(p.id);
    }

    await logRun(
      client,
      SERVICE,
      {
        scanned,
        stuck: stuck.length,
        alerted: alertedIds.length,
        alerted_payout_ids: alertedIds,
        threshold_hours: thresholdHours,
        cutoff_iso: cutoffIso,
      },
      stuck.length > 0 ? "warn" : "info",
      `payout-watchdog: ${stuck.length} stuck payout(s), ${alertedIds.length} alert(s) raised`,
    );

    return jsonResponse({
      ok: true,
      scanned,
      stuck: stuck.length,
      alerted: alertedIds.length,
      threshold_hours: thresholdHours,
      stuck_payout_ids: (stuck as any[]).map((p) => p.id),
    });
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    await logRun(client, SERVICE, { error: msg }, "error", `payout-watchdog fatal: ${msg}`);
    return jsonResponse({ error: "internal_error" }, 500);
  }
});
