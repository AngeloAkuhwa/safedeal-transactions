import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { SUPPORT_ACK_SENTENCE } from "../_shared/support-copy.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const TOPICS = new Set([
  "general",
  "transaction",
  "payment",
  "dispute",
  "account",
  "report_issue",
]);

const clean = (v: unknown, max: number) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

/** Sends the acknowledgement email. Returns true only when it actually left. */
async function sendAcknowledgement(to: string, name: string, reference: string | null) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return false;
  const from = Deno.env.get("RESEND_FROM_EMAIL") || "SafeDeal <onboarding@resend.dev>";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [to],
        subject: "We received your SafeDeal support message",
        html: `<p>Hi ${name},</p>
<p>We have your message${reference ? ` about <strong>${reference}</strong>` : ""}. ${SUPPORT_ACK_SENTENCE}</p>
<p>If money is still held in escrow on a transaction, open a dispute from the transaction itself. That freezes the funds while the case is reviewed.</p>
<p>— SafeDeal Support</p>`,
      }),
    });
    if (!res.ok) {
      console.error("[submit-contact-message] resend failed", res.status, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("[submit-contact-message] resend threw", err);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const full_name = clean(body.full_name, 120);
    const email = clean(body.email, 255).toLowerCase();
    const message = clean(body.message, 4000);
    const transaction_reference = clean(body.transaction_reference, 64) || null;
    const topic = TOPICS.has(body.topic) ? String(body.topic) : "general";

    if (!full_name) return json({ error: "Your name is required" }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))
      return json({ error: "A valid email address is required" }, 400);
    if (message.length < 10)
      return json({ error: "Please describe the issue in at least 10 characters" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    // Attribute to the signed-in user when a valid token is present.
    let userId: string | null = null;
    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const { data } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
      userId = data.user?.id ?? null;
    }

    // Basic abuse guard: max 5 submissions per email per hour.
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await admin
      .from("contact_messages")
      .select("id", { count: "exact", head: true })
      .eq("email", email)
      .gte("created_at", since);
    if ((count ?? 0) >= 5) {
      return json({ error: "Too many messages sent recently. Please try again later." }, 429);
    }

    const { data: inserted, error } = await admin
      .from("contact_messages")
      .insert({ user_id: userId, full_name, email, topic, transaction_reference, message })
      .select("id, created_at")
      .single();

    if (error) {
      console.error("[submit-contact-message] insert failed", error.message);
      return json({ error: "Could not save your message. Please try again." }, 500);
    }

    // Notify admins through the existing system-alert notification path.
    const { error: alertErr } = await admin.rpc("raise_system_alert", {
      _dedupe_key: `contact_message:${inserted.id}`,
      _type: "system_message",
      _title: `New support message${transaction_reference ? ` · ${transaction_reference}` : ""}`,
      _message: `${full_name} (${email}): ${topic}: ${message.slice(0, 240)}`,
      _related_transaction_id: null,
      _metadata: { contact_message_id: inserted.id, topic, transaction_reference },
    });
    if (alertErr) console.error("[submit-contact-message] alert failed", alertErr.message);

    const acknowledged = await sendAcknowledgement(email, full_name, transaction_reference);

    return json({ ok: true, id: inserted.id, notified: !alertErr, acknowledged });
  } catch (e) {
    console.error("[submit-contact-message] unexpected", e);
    return json({ error: "Unexpected error" }, 500);
  }
});
