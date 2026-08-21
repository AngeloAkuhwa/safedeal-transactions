// Delivery worker: sends queued email notifications via Resend.
// Runs on pg_cron every 1 minute. SMS rows are skipped (no provider wired yet).
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const APP_URL =
  Deno.env.get("APP_PUBLIC_URL") ??
  "https://id-preview--6eccf2c7-b5a8-43bb-bf23-ab5ade5853d4.lovable.app";
const FROM = Deno.env.get("RESEND_FROM_EMAIL") ?? "SafeDeal <onboarding@resend.dev>";

// Map notification type -> preference column (opt-out check).
const prefFor = (t: string): string | null => {
  switch (t) {
    case "payment_update": return "payment_updates";
    case "delivery_update": return "delivery_updates";
    case "dispute_update": return "dispute_updates";
    case "verification_update": return "verification_reminders";
    case "security_alert":
    case "system_message": return "system_alerts";
    default: return null;
  }
};

function esc(s: string) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function renderEmail(title: string, message: string, ctaUrl?: string, ctaLabel = "View in SafeDeal") {
  const cta = ctaUrl
    ? `<div style="margin:24px 0"><a href="${esc(ctaUrl)}" style="background:#0F5BB3;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">${esc(ctaLabel)}</a></div>`
    : "";
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif;color:#0f172a">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px">
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
      <div style="background:#0F5BB3;padding:20px 24px"><div style="color:#fff;font-weight:700;font-size:18px">SafeDeal</div></div>
      <div style="padding:28px 24px">
        <h2 style="margin:0 0 12px;font-size:20px;color:#0f172a">${esc(title)}</h2>
        <p style="margin:0;color:#334155;line-height:1.55;font-size:15px;white-space:pre-wrap">${esc(message)}</p>
        ${cta}
      </div>
      <div style="padding:16px 24px;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px">
        You're receiving this because SafeDeal email notifications are enabled.
        <a href="${esc(APP_URL)}/dashboard/profile#notifications" style="color:#0F5BB3;text-decoration:none">Manage preferences</a>.
      </div>
    </div>
  </div></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (!RESEND_API_KEY) return json(500, { error: "RESEND_API_KEY not configured" });
  if (!LOVABLE_API_KEY) return json(500, { error: "LOVABLE_API_KEY not configured" });
  if (FROM.includes("onboarding@resend.dev")) {
    console.warn("Using onboarding@resend.dev. Resend restricts this to the account owner. Set RESEND_FROM_EMAIL to a verified sender.");
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Platform-level channel kill switches. Admins can pause outbound email/SMS
  // from System Settings > Notifications without redeploying the worker.
  const { data: switches } = await admin
    .from("system_settings")
    .select("setting_key, setting_value")
    .eq("scope", "platform")
    .in("setting_key", [
      "notifications.email_enabled",
      "notifications.sms_enabled",
      "notifications.email_batch_size",
    ]);
  const switchMap = new Map<string, unknown>((switches ?? []).map((r: any) => [r.setting_key, r.setting_value]));
  const emailEnabled = switchMap.get("notifications.email_enabled") !== false; // default ON
  if (!emailEnabled) {
    return json(200, { ok: true, processed: 0, sent: 0, failed: 0, suppressed: 0, skipped: 0, note: "email channel disabled by platform settings" });
  }

  // Broadcast throttling: cap batch size per cron tick so a massive broadcast
  // (millions of deliveries) drains gradually rather than stampeding Resend.
  const rawBatch = Number(switchMap.get("notifications.email_batch_size") ?? 50);
  const batchSize = Math.max(1, Math.min(500, Number.isFinite(rawBatch) ? rawBatch : 50));

  const { data: pending, error } = await admin
    .from("notification_deliveries")
    .select("id, notification_id, channel, attempt_count")
    .eq("channel", "email")
    .eq("delivery_status", "pending")
    .lt("attempt_count", 3)
    .order("created_at", { ascending: true })
    .limit(batchSize);
  if (error) return json(500, { error: error.message });

  const results = { sent: 0, failed: 0, suppressed: 0, skipped: 0 };

  for (const d of pending ?? []) {
    const { data: notif } = await admin
      .from("notifications")
      .select("id, user_id, type, title, message, metadata, related_transaction_id")
      .eq("id", d.notification_id).maybeSingle();
    if (!notif) { results.skipped++; continue; }

    const { data: profile } = await admin
      .from("profiles").select("id, email, full_name").eq("id", notif.user_id).maybeSingle();
    if (!profile?.email) {
      await admin.from("notification_deliveries").update({
        delivery_status: "failed", provider_response: "no recipient email",
        attempt_count: (d.attempt_count ?? 0) + 1,
      }).eq("id", d.id);
      results.failed++; continue;
    }

    // Opt-out check
    const prefCol = prefFor(notif.type);
    if (prefCol) {
      const { data: prefs } = await admin
        .from("notification_preferences").select(prefCol).eq("user_id", notif.user_id).maybeSingle();
      if (prefs && (prefs as any)[prefCol] === false) {
        await admin.from("notification_deliveries").update({
          delivery_status: "failed", provider_response: "suppressed: user opt-out",
        }).eq("id", d.id);
        results.suppressed++; continue;
      }
    }

    const meta = (notif.metadata ?? {}) as Record<string, unknown>;
    const route = typeof meta.route === "string" ? meta.route : null;
    const ctaUrl = route ? `${APP_URL}${route.startsWith("/") ? "" : "/"}${route}` : undefined;

    let ok = false;
    let providerResponse = "";
    try {
      const resp = await fetch("https://connector-gateway.lovable.dev/resend/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "X-Connection-Api-Key": RESEND_API_KEY,
        },
        body: JSON.stringify({
          from: FROM,
          to: [profile.email],
          subject: notif.title,
          html: renderEmail(notif.title, notif.message, ctaUrl),
        }),
      });
      const body = await resp.text();
      if (resp.ok) {
        ok = true;
        try { providerResponse = JSON.parse(body)?.id ?? body.slice(0, 500); }
        catch { providerResponse = body.slice(0, 500); }
      } else {
        providerResponse = `[${resp.status}] ${body.slice(0, 500)}`;
      }
    } catch (e) {
      providerResponse = `fetch error: ${(e as Error).message}`;
    }

    const nextAttempt = (d.attempt_count ?? 0) + 1;
    if (ok) {
      await admin.from("notification_deliveries").update({
        delivery_status: "sent", sent_at: new Date().toISOString(),
        provider_response: providerResponse, attempt_count: nextAttempt,
      }).eq("id", d.id);
      // Reflect on parent notification too.
      await admin.from("notifications").update({ status: "sent" }).eq("id", notif.id).eq("status", "pending");
      results.sent++;
    } else {
      const finalStatus = nextAttempt >= 3 ? "failed" : "pending";
      await admin.from("notification_deliveries").update({
        delivery_status: finalStatus, provider_response: providerResponse, attempt_count: nextAttempt,
      }).eq("id", d.id);
      results.failed++;
    }
  }

  return json(200, { ok: true, processed: (pending ?? []).length, ...results });
});