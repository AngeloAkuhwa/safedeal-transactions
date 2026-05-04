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
    const [profilesRes, pricingRes, escrowRes, firstItemRes, latestPaymentRes, latestPayoutRes, openDisputeRes] = await Promise.all([
      userIds.length
        ? admin.from("profiles").select("id, full_name, email, phone, avatar_url").in("id", userIds)
        : Promise.resolve({ data: [] as any[] }),
      admin.from("transaction_pricing").select("currency_code, item_amount, buyer_total_amount, platform_fee_amount, processing_fee_amount, seller_net_amount").eq("transaction_id", txId).maybeSingle(),
      admin.from("escrow_states").select("state, held_amount, frozen_amount, released_amount, refunded_amount").eq("transaction_id", txId).maybeSingle(),
      admin.from("transaction_items").select("title").eq("transaction_id", txId).order("created_at", { ascending: true }).limit(1).maybeSingle(),
      admin.from("payments").select("provider, provider_reference, status, amount, currency_code, created_at").eq("transaction_id", txId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      admin.from("payouts").select("status, amount, currency_code, provider_reference, created_at").eq("transaction_id", txId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      admin.from("disputes").select("id, status, reason, description, opened_at, seller_response_due_at, resolved_at").eq("transaction_id", txId).maybeSingle(),
    ]);
    const byId = new Map<string, any>();
    for (const p of (profilesRes.data ?? []) as any[]) byId.set(p.id, p);
    const buyer = tx.buyer_id ? byId.get(tx.buyer_id) : null;
    const seller = tx.seller_id ? byId.get(tx.seller_id) : null;
    const payment = latestPaymentRes.data ?? null;
    const payout = latestPayoutRes.data ?? null;
    const lastActivityAt = tx.updated_at ?? tx.created_at ?? null;
    out.summary = {
      transactionId: tx.id,
      transactionCode: tx.transaction_code,
      itemTitle: firstItemRes.data?.title ?? null,
      status: tx.status,
      moneyStatus: tx.money_status,
      disputeStatus: tx.dispute_status,
      payoutStatus: payout?.status ?? null,
      paymentProvider: payment?.provider ?? null,
      providerReference: payment?.provider_reference ?? null,
      createdAt: tx.created_at,
      updatedAt: tx.updated_at,
      lastActivityAt,
      agreementLockedAt: tx.agreement_locked_at ?? null,
      needsReleaseReview: tx.needs_release_review,
      releaseReviewReason: tx.release_review_reason,
      buyer: buyer ? { id: buyer.id, name: buyer.full_name ?? null, email: maskEmail(buyer.email), phone: buyer.phone ?? null, avatarUrl: buyer.avatar_url ?? null } : null,
      seller: seller ? { id: seller.id, name: seller.full_name ?? null, email: maskEmail(seller.email), phone: seller.phone ?? null, avatarUrl: seller.avatar_url ?? null } : null,
      pricing: pricingRes.data ?? null,
      escrow: escrowRes.data ?? null,
      payment,
      payout,
      dispute: openDisputeRes.data ?? null,
      deadlineOverdue: !!(openDisputeRes.data?.seller_response_due_at && new Date(openDisputeRes.data.seller_response_due_at).getTime() < Date.now() && !openDisputeRes.data?.resolved_at),
    };
  }

  if (wanted.has("risk")) {
    const [aaRes, alRes] = await Promise.all([
      admin.from("admin_actions").select("id, created_at, admin_user_id, action_type, action_notes").eq("transaction_id", txId).order("created_at", { ascending: false }).limit(50),
      admin.from("audit_logs").select("id, created_at, actor_user_id, action, description, metadata").eq("transaction_id", txId).order("created_at", { ascending: false }).limit(50),
    ]);
    const signals: { label: string; severity: "low" | "medium" | "high" }[] = [];
    if (tx.needs_release_review) signals.push({ label: tx.release_review_reason ?? "Needs release review", severity: "high" });
    if (tx.money_status === "funds_frozen") signals.push({ label: "Funds frozen", severity: "high" });
    if (tx.dispute_status && tx.dispute_status !== "none") signals.push({ label: `Dispute: ${tx.dispute_status}`, severity: "medium" });
    let level: "clean" | "elevated" | "high" | "escalated" = "clean";
    if (signals.some(s => s.severity === "high")) level = signals.length > 1 ? "escalated" : "high";
    else if (signals.length > 0) level = "elevated";
    const escalationHistory = ((aaRes.data ?? []) as any[])
      .filter((a) => /escalat|flag|freeze|review/i.test(a.action_type ?? ""))
      .map((a) => ({ at: a.created_at, label: (a.action_type ?? "").replace(/_/g, " "), by: a.admin_user_id, note: a.action_notes }));
    out.risk = {
      level,
      signals,
      adminActions: aaRes.data ?? [],
      auditLog: alRes.data ?? [],
      escalationHistory,
    };
  }

  if (wanted.has("dispute")) {
    const { data: d } = await admin.from("disputes").select("id, status, reason, description, opened_at, seller_response_due_at, resolved_at").eq("transaction_id", txId).maybeSingle();
    let evidence: any[] = [];
    if (d?.id) {
      const { data: ev } = await admin.from("dispute_evidence").select("id, created_at, evidence_type, notes, submitted_by_role, file_id").eq("dispute_id", d.id).eq("is_active", true).order("created_at", { ascending: false }).limit(50);
      evidence = ev ?? [];
    }
    out.dispute = d ? { ...d, evidence } : null;
  }

  if (wanted.has("linked")) {
    const userIds = [tx.buyer_id, tx.seller_id].filter(Boolean) as string[];
    const [paymentsRes, payoutsRes, refundsRes, profsRes, vRes] = await Promise.all([
      admin.from("payments").select("id, provider, provider_reference, status, amount, currency_code, created_at").eq("transaction_id", txId).order("created_at", { ascending: false }).limit(20),
      admin.from("payouts").select("id, status, amount, currency_code, provider_reference, created_at, completed_at").eq("transaction_id", txId).order("created_at", { ascending: false }).limit(20),
      admin.from("refunds").select("id, status, refund_amount, currency_code, reason, created_at, completed_at").eq("transaction_id", txId).order("created_at", { ascending: false }).limit(20),
      userIds.length ? admin.from("profiles").select("id, full_name, email, avatar_url, status").in("id", userIds) : Promise.resolve({ data: [] as any[] }),
      userIds.length ? admin.from("account_verifications").select("user_id, verification_level, identity_verified, email_verified, phone_verified").in("user_id", userIds) : Promise.resolve({ data: [] as any[] }),
    ]);
    const profById = new Map(((profsRes as any).data ?? []).map((p: any) => [p.id, p]));
    const vById = new Map(((vRes as any).data ?? []).map((v: any) => [v.user_id, v]));
    const enrich = (uid: string | null) => {
      if (!uid) return null;
      const p = profById.get(uid); const v = vById.get(uid);
      return p ? {
        id: p.id, name: p.full_name, email: maskEmail(p.email), avatarUrl: p.avatar_url ?? null,
        flagged: p.status && p.status !== "active",
        verified: !!(v && (v.identity_verified || v.verification_level === "verified" || v.verification_level === "trusted")),
        verificationLevel: v?.verification_level ?? "unverified",
      } : null;
    };
    out.linked = {
      payments: paymentsRes.data ?? [],
      payouts: payoutsRes.data ?? [],
      refunds: refundsRes.data ?? [],
      buyer: enrich(tx.buyer_id),
      seller: enrich(tx.seller_id),
    };
  }

  if (wanted.has("items")) {
    const { data } = await admin
      .from("transaction_items")
      .select("id, title, description, quantity, condition_label, brand, model, warranty_info, created_at")
      .eq("transaction_id", txId)
      .order("created_at", { ascending: true });
    out.items = data ?? [];
  }

  if (wanted.has("delivery")) {
    const [termsRes, updatesRes, trackRes] = await Promise.all([
      admin.from("transaction_delivery_terms").select("delivery_method, expected_delivery_date, verification_window_hours, delivery_address_line1, delivery_address_line2, delivery_city, delivery_state, delivery_country_code, delivery_postal_code").eq("transaction_id", txId).maybeSingle(),
      admin.from("delivery_updates").select("id, created_at, status, notes").eq("transaction_id", txId).order("created_at", { ascending: false }).limit(50),
      admin.from("delivery_tracking_details").select("courier_name, tracking_number, tracking_url, shipped_at, delivered_at, expected_delivery_at").eq("transaction_id", txId).maybeSingle(),
    ]);
    out.delivery = {
      terms: termsRes.data ?? null,
      updates: updatesRes.data ?? [],
      tracking: trackRes.data ?? null,
      deliveredAt: tx.delivered_at ?? trackRes.data?.delivered_at ?? null,
      verificationDeadlineAt: tx.verification_deadline_at ?? null,
    };
  }

  if (wanted.has("agreement")) {
    const [pricingRes, itemsRes, termsRes] = await Promise.all([
      admin.from("transaction_pricing").select("currency_code, item_amount, platform_fee_amount, processing_fee_amount, seller_net_amount, buyer_total_amount").eq("transaction_id", txId).maybeSingle(),
      admin.from("transaction_items").select("title, quantity, condition_label").eq("transaction_id", txId).order("created_at", { ascending: true }),
      admin.from("transaction_delivery_terms").select("delivery_method, expected_delivery_date, verification_window_hours").eq("transaction_id", txId).maybeSingle(),
    ]);
    out.agreement = {
      lockedAt: tx.agreement_locked_at ?? null,
      pricing: pricingRes.data ?? null,
      items: itemsRes.data ?? [],
      terms: termsRes.data ?? null,
    };
  }

  if (wanted.has("audit")) {
    const { data } = await admin
      .from("audit_logs")
      .select("id, created_at, action, actor_user_id, target_user_id, description, metadata, ip_address")
      .eq("transaction_id", txId)
      .order("created_at", { ascending: false })
      .limit(50);
    out.audit = data ?? [];
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