// Support inbox actions: claim, reply (by email), and resolve a contact message.
// Every mutation is permission-gated, audited, and idempotent per status change.
import { requirePermission, authErrorResponse } from "../_shared/auth.ts";
import { logAdminAction, extractRequestMeta } from "../_shared/audit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const ACTIONS = new Set(["claim", "reply", "resolve", "reopen"]);

async function sendReplyEmail(to: string, name: string, reference: string | null, body: string) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return { sent: false, channel: "none" as const };
  const from = Deno.env.get("RESEND_FROM_EMAIL") || "SafeDeal <onboarding@resend.dev>";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [to],
        subject: `SafeDeal support${reference ? ` · ${reference}` : ""}`,
        html: `<p>Hi ${name},</p><p>${body.replace(/\n/g, "<br/>")}</p><p>— SafeDeal Support</p>`,
      }),
    });
    if (!res.ok) {
      console.error("[admin-reply-contact-message] resend failed", res.status, await res.text());
      return { sent: false, channel: "resend_failed" as const };
    }
    return { sent: true, channel: "resend" as const };
  } catch (err) {
    console.error("[admin-reply-contact-message] resend threw", err);
    return { sent: false, channel: "resend_failed" as const };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const ctx = await requirePermission(req, "support.update");

    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "");
    const id = String(body.id ?? "");
    const reply = typeof body.reply === "string" ? body.reply.trim().slice(0, 4000) : "";

    if (!ACTIONS.has(action)) return json({ error: "Unknown action" }, 400);
    if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "A valid message id is required" }, 400);
    if (action === "reply" && reply.length < 5)
      return json({ error: "Write at least 5 characters before sending" }, 400);

    const admin = ctx.adminClient;
    const { data: before, error: readErr } = await admin
      .from("contact_messages")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (readErr) return json({ error: readErr.message }, 500);
    if (!before) return json({ error: "Message not found" }, 404);

    let patch: Record<string, unknown> = {};
    let emailed = false;
    let channel = "none";

    if (action === "claim") {
      patch = { status: "in_progress", handled_by: ctx.userId, handled_at: new Date().toISOString() };
    } else if (action === "resolve") {
      patch = { status: "resolved", handled_by: ctx.userId, handled_at: new Date().toISOString() };
    } else if (action === "reopen") {
      patch = { status: "new", handled_by: null, handled_at: null };
    } else {
      const sent = await sendReplyEmail(before.email, before.full_name, before.transaction_reference, reply);
      emailed = sent.sent;
      channel = sent.channel;
      patch = {
        status: "resolved",
        admin_reply: reply,
        replied_at: new Date().toISOString(),
        replied_by: ctx.userId,
        reply_channel: sent.channel,
        handled_by: ctx.userId,
        handled_at: new Date().toISOString(),
      };
    }

    const { data: after, error: updErr } = await admin
      .from("contact_messages")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();
    if (updErr) return json({ error: updErr.message }, 500);

    const meta = extractRequestMeta(req);
    await logAdminAction(admin, {
      actorId: ctx.userId,
      action: `support_message_${action}`,
      targetType: "system",
      targetId: id,
      before,
      after,
      metadata: { emailed, channel },
      ...meta,
    });

    return json({ ok: true, emailed, channel, message: after });
  } catch (err) {
    const authRes = authErrorResponse(err, corsHeaders);
    if (authRes) return authRes;
    console.error("[admin-reply-contact-message] unexpected", err);
    return json({ error: "Unexpected error" }, 500);
  }

});
