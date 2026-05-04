import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const [local, domain] = email.split("@");
  if (!domain) return email;
  const head = local.length <= 2 ? local : local.slice(0, 2);
  return `${head}***@${domain}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: auth } } },
  );
  const token = auth.replace("Bearer ", "");
  const { data: userData, error: userErr } = await userClient.auth.getUser(token);
  if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);
  const userId = userData.user.id;
  const { data: isAdmin } = await userClient.rpc("has_role", {
    _user_id: userId, _role: "admin",
  });
  if (!isAdmin) return json({ error: "admin_access_required" }, 403);

  let body: { transactionId?: string; sections?: string[] };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const txId = body?.transactionId;
  if (!txId) return json({ error: "missing_transactionId" }, 400);
  const wanted = new Set(body?.sections ?? ["summary", "timeline", "ledger", "messages", "notes"]);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: tx, error: txErr } = await admin
    .from("transactions")
    .select("id, transaction_code, status, money_status, dispute_status, buyer_id, seller_id, created_at, updated_at, needs_release_review, release_review_reason")
    .eq("id", txId)
    .single();
  if (txErr || !tx) return json({ error: "transaction_not_found" }, 404);

  const out: any = {};

  if (wanted.has("summary")) {
    const userIds = [tx.buyer_id, tx.seller_id].filter(Boolean) as string[];
    const [profilesRes, pricingRes, escrowRes] = await Promise.all([
      userIds.length
        ? admin.from("profiles").select("id, full_name, email, phone").in("id", userIds)
        : Promise.resolve({ data: [] as any[] }),
      admin.from("transaction_pricing").select("currency_code, buyer_total_amount, platform_fee_amount, seller_net_amount").eq("transaction_id", txId).maybeSingle(),
      admin.from("escrow_states").select("state, held_amount, frozen_amount, released_amount, refunded_amount").eq("transaction_id", txId).maybeSingle(),
    ]);
    const byId = new Map<string, any>();
    for (const p of (profilesRes.data ?? []) as any[]) byId.set(p.id, p);
    const buyer = tx.buyer_id ? byId.get(tx.buyer_id) : null;
    const seller = tx.seller_id ? byId.get(tx.seller_id) : null;
    out.summary = {
      transactionId: tx.id,
      transactionCode: tx.transaction_code,
      status: tx.status,
      moneyStatus: tx.money_status,
      disputeStatus: tx.dispute_status,
      createdAt: tx.created_at,
      updatedAt: tx.updated_at,
      needsReleaseReview: tx.needs_release_review,
      releaseReviewReason: tx.release_review_reason,
      buyer: buyer ? { name: buyer.full_name ?? null, email: maskEmail(buyer.email), phone: buyer.phone ?? null } : null,
      seller: seller ? { name: seller.full_name ?? null, email: maskEmail(seller.email), phone: seller.phone ?? null } : null,
      pricing: pricingRes.data ?? null,
      escrow: escrowRes.data ?? null,
    };
  }

  if (wanted.has("timeline")) {
    const [tsh, msh, evt, du, dsh, aa] = await Promise.all([
      admin.from("transaction_status_history").select("changed_at, old_status, new_status, reason").eq("transaction_id", txId).order("changed_at", { ascending: false }).limit(100),
      admin.from("money_status_history").select("changed_at, old_status, new_status, reason").eq("transaction_id", txId).order("changed_at", { ascending: false }).limit(100),
      admin.from("transaction_events").select("created_at, event_type, event_data").eq("transaction_id", txId).order("created_at", { ascending: false }).limit(100),
      admin.from("delivery_updates").select("created_at, status, notes").eq("transaction_id", txId).order("created_at", { ascending: false }).limit(50),
      admin.from("disputes").select("id").eq("transaction_id", txId).limit(5),
      admin.from("admin_actions").select("created_at, action_type, action_notes").eq("transaction_id", txId).order("created_at", { ascending: false }).limit(50),
    ]);
    const disputeIds = ((dsh.data ?? []) as any[]).map((d) => d.id);
    const dshRows = disputeIds.length
      ? (await admin.from("dispute_status_history").select("changed_at, old_status, new_status, reason").in("dispute_id", disputeIds).order("changed_at", { ascending: false }).limit(100)).data ?? []
      : [];
    const items: any[] = [];
    for (const r of (tsh.data ?? []) as any[]) items.push({ at: r.changed_at, kind: "transaction_status", from: r.old_status, to: r.new_status, note: r.reason });
    for (const r of (msh.data ?? []) as any[]) items.push({ at: r.changed_at, kind: "money_status", from: r.old_status, to: r.new_status, note: r.reason });
    for (const r of (evt.data ?? []) as any[]) items.push({ at: r.created_at, kind: "event", to: r.event_type, note: null, data: r.event_data });
    for (const r of (du.data ?? []) as any[]) items.push({ at: r.created_at, kind: "delivery", to: r.status, note: r.notes });
    for (const r of dshRows as any[]) items.push({ at: r.changed_at, kind: "dispute", from: r.old_status, to: r.new_status, note: r.reason });
    for (const r of (aa.data ?? []) as any[]) items.push({ at: r.created_at, kind: "admin_action", to: r.action_type, note: r.action_notes });
    items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    out.timeline = items.slice(0, 200);
  }

  if (wanted.has("ledger")) {
    const { data } = await admin
      .from("escrow_ledger_entries")
      .select("id, created_at, entry_type, amount, currency_code, balance_after, reference_type, reference_id, notes")
      .eq("transaction_id", txId)
      .order("created_at", { ascending: false })
      .limit(200);
    out.ledger = data ?? [];
  }

  if (wanted.has("messages")) {
    const { data } = await admin
      .from("transaction_messages")
      .select("id, created_at, sender_user_id, recipient_user_id, message_text, is_read")
      .eq("transaction_id", txId)
      .order("created_at", { ascending: false })
      .limit(100);
    out.messages = data ?? [];
  }

  if (wanted.has("notes")) {
    const { data } = await admin
      .from("admin_transaction_notes")
      .select("id, created_at, admin_user_id, note, is_pinned")
      .eq("transaction_id", txId)
      .order("created_at", { ascending: false })
      .limit(100);
    const adminIds = Array.from(new Set(((data ?? []) as any[]).map((r) => r.admin_user_id)));
    const profiles = adminIds.length
      ? (await admin.from("profiles").select("id, full_name, email").in("id", adminIds)).data ?? []
      : [];
    const byId = new Map(profiles.map((p: any) => [p.id, p]));
    out.notes = ((data ?? []) as any[]).map((n) => ({
      ...n,
      author: byId.get(n.admin_user_id) ?? null,
    }));
  }

  return json(out);
});