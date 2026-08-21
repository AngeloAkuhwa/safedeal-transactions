import { requireAdmin, authErrorResponse , requirePermission} from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function maskAccount(num?: string | null): string | null {
  if (!num) return null;
  const s = String(num);
  if (s.length < 4) return s;
  return `••••${s.slice(-4)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let ctx;
  try {
    ctx = await requirePermission(req, "financial_controls.view");
  } catch (err) {
    const r = authErrorResponse(err, corsHeaders);
    if (r) return r;
    return json({ error: "auth_failed" }, 500);
  }

  if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405);
  const admin = ctx.adminClient;

  const url = new URL(req.url);
  const payoutId = url.searchParams.get("payout_id");
  if (!payoutId) return json({ error: "payout_id_required" }, 400);

  const { data: payout, error: pErr } = await admin
    .from("payouts")
    .select("*")
    .eq("id", payoutId)
    .maybeSingle();
  if (pErr) return json({ error: "payout_fetch_failed", detail: pErr.message }, 500);
  if (!payout) return json({ error: "not_found" }, 404);

  const [{ data: tx }, { data: pricing }, { data: account }, { data: accountState }, { data: profile }, { data: queue }, { data: notes }, { data: events }, { data: dispute }, { data: investigation }, { data: refunds }, { data: payment }] = await Promise.all([
    admin.from("transactions").select("id, transaction_code, status, money_status, dispute_status, needs_release_review, needs_admin_review, source_product_id, buyer_id, seller_id, created_at").eq("id", payout.transaction_id).maybeSingle(),
    admin.from("transaction_pricing").select("item_amount, platform_fee_amount, payment_processing_fee_amount, seller_payout_amount, buyer_total_amount, currency_code, is_total_service_fee_capped, pricing_model_version").eq("transaction_id", payout.transaction_id).maybeSingle(),
    admin.from("payout_accounts").select("*").eq("user_id", payout.seller_id).maybeSingle(),
    admin.from("v_payout_account_state").select("account_state").eq("user_id", payout.seller_id).maybeSingle(),
    admin.from("profiles").select("id, full_name, email, avatar_url").eq("id", payout.seller_id).maybeSingle(),
    admin.from("release_review_queue").select("id, queue_type, status, notes, entered_queue_at, resolved_at").eq("transaction_id", payout.transaction_id).order("created_at", { ascending: false }),
    admin.from("admin_transaction_notes").select("id, note, created_at, admin_user_id").eq("transaction_id", payout.transaction_id).order("created_at", { ascending: false }).limit(20),
    admin.from("transaction_events").select("id, event_type, event_data, actor_role, created_at").eq("transaction_id", payout.transaction_id).order("created_at", { ascending: false }).limit(60),
    admin.from("disputes").select("id, status, opened_at, resolved_at").eq("transaction_id", payout.transaction_id).order("opened_at", { ascending: false }).maybeSingle(),
    admin.from("admin_investigations").select("id, status, priority").eq("transaction_id", payout.transaction_id).maybeSingle(),
    admin.from("refunds").select("id, status, refund_amount, created_at").eq("transaction_id", payout.transaction_id).order("created_at", { ascending: false }),
    admin.from("payments").select("id, status, amount, provider_reference, captured_at, authorized_at, created_at").eq("transaction_id", payout.transaction_id).eq("status", "succeeded").order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const productTitle = (() => { return null; })();
  let itemTitle: string | null = null;
  if (tx?.source_product_id) {
    const { data: prod } = await admin.from("products").select("title").eq("id", tx.source_product_id).maybeSingle();
    itemTitle = prod?.title ?? null;
  }

  const hasPricing = !!pricing;
  const itemTotal = hasPricing && pricing!.item_amount != null ? Number(pricing!.item_amount) : null;
  // The protection fee was already charged and frozen into the snapshot. We
  // display it verbatim — re-capping a charged amount from a duplicated
  // constant would show the admin a figure the buyer never paid.
  const protectionFee = hasPricing && pricing!.platform_fee_amount != null
    ? Number(pricing!.platform_fee_amount)
    : null;
  // Cap facts come from the snapshot flag only, never re-derived.
  const protectionFeeCapped = hasPricing ? pricing!.is_total_service_fee_capped === true : false;
  const paymentProcessingFee = hasPricing && pricing!.payment_processing_fee_amount != null
    ? Number(pricing!.payment_processing_fee_amount)
    : null;
  const totalCharged = hasPricing && pricing!.buyer_total_amount != null
    ? Number(pricing!.buyer_total_amount)
    : (itemTotal != null && protectionFee != null && paymentProcessingFee != null
        ? itemTotal + protectionFee + paymentProcessingFee
        : null);
  // Canonical seller release amount = the immutable pricing snapshot.
  // payouts.amount is the *recorded* movement; when the two disagree the
  // record is flagged instead of silently showing a different number.
  const snapshotSellerPayout = hasPricing && pricing!.seller_payout_amount != null
    ? Number(pricing!.seller_payout_amount)
    : null;
  // No snapshot => no canonical release figure. Substituting the payout
  // record's own amount would make a mismatch undetectable exactly when the
  // evidence is missing.
  const recordedPayoutAmount = payout.amount != null ? Number(payout.amount) : null;
  const sellerPayout = snapshotSellerPayout;
  const releaseAmountMismatch =
    snapshotSellerPayout != null &&
    recordedPayoutAmount != null &&
    Math.abs(snapshotSellerPayout - recordedPayoutAmount) > 0.005;

  const investigationOpen = investigation && ["open","under_review","escalated"].includes(investigation.status);
  const refundInFlight = (refunds ?? []).some((r: any) => ["pending","processing"].includes(r.status));
  const openQueue = (queue ?? []).find((q: any) =>
    ["pending","claimed","processing","awaiting_info","held"].includes(q.status)
    && q.queue_type !== "ready_for_release"
  );
  const activeDisputeStatuses = new Set(["open","under_review","awaiting_response","escalated","pending"]);
  const hasActiveDispute = !!(dispute && dispute.status && activeDisputeStatuses.has(String(dispute.status).toLowerCase()))
    || !!(tx?.dispute_status && activeDisputeStatuses.has(String(tx.dispute_status).toLowerCase()));

  const gates = [
    { key: "money_pending_release", label: "Funds pending release",
      pass: tx?.money_status === "funds_pending_release",
      actual: tx?.money_status ?? "unknown",
      detail: tx?.money_status === "funds_pending_release"
        ? "Buyer payment is held in escrow and ready for release."
        : `Money status is "${tx?.money_status ?? "unknown"}". Must be 'funds_pending_release'.` },
    { key: "dispute_clear", label: "No active dispute",
      pass: !hasActiveDispute,
      actual: tx?.dispute_status ?? dispute?.status ?? "none",
      detail: hasActiveDispute
        ? `Dispute is ${dispute?.status ?? tx?.dispute_status}. Resolve before releasing.`
        : "No open dispute." },
    { key: "no_investigation", label: "No open investigation",
      pass: !investigationOpen && !tx?.needs_admin_review,
      actual: investigation?.status ?? (tx?.needs_admin_review ? "needs_admin_review" : "clear"),
      detail: investigationOpen
        ? `Investigation is ${investigation?.status} (priority: ${investigation?.priority ?? "n/a"}).`
        : tx?.needs_admin_review ? "Transaction is flagged for admin review."
        : "No active investigation." },
    { key: "payout_awaiting", label: "Payout awaiting release",
      pass: payout.status === "awaiting_release",
      actual: payout.status,
      detail: payout.status === "awaiting_release"
        ? "Payout is queued for release."
        : `Payout status is "${payout.status}".` },
    { key: "not_blocked", label: "Payout not blocked",
      pass: !payout.release_blocked,
      actual: payout.release_blocked ? "blocked" : "unblocked",
      detail: payout.release_blocked
        ? `Blocked: ${payout.payout_blocked_reason ?? "no reason recorded"}.`
        : "No admin block." },
    { key: "account_verified", label: "Seller payout account verified",
      pass: account?.verification_status === "verified",
      actual: account?.verification_status ?? "missing",
      detail: !account ? "Seller has not added a payout account."
        : account.verification_status === "verified" ? `${account.bank_name} ${maskAccount(account.account_number)} — verified.`
        : `Account ${maskAccount(account.account_number) ?? ""} is "${account.verification_status}".` },
    { key: "recipient_code", label: "Provider recipient code on file",
      pass: !!account?.provider_recipient_code,
      actual: account?.provider_recipient_code ? "present" : "missing",
      detail: account?.provider_recipient_code
        ? "Paystack recipient code present."
        : "Recipient code missing. Re-verify the bank account." },
    { key: "queue_clear", label: "Release review cleared",
      pass: !openQueue,
      actual: openQueue?.status ?? "clear",
      detail: openQueue
        ? `Held in '${openQueue.queue_type}' queue, status: ${openQueue.status}. Resolve queue item before releasing.`
        : "Not held in the release review queue." },
    { key: "no_refund", label: "No in-flight refund",
      pass: !refundInFlight,
      actual: refundInFlight ? "in_flight" : "none",
      detail: refundInFlight
        ? `${(refunds ?? []).filter((r:any)=>["pending","processing"].includes(r.status)).length} refund(s) in flight.`
        : "No pending or processing refunds." },
  ];
  const eligible = gates.every((g) => g.pass);

  // Build the timeline (same shape as AdminCaseTimeline)
  const [{ data: moneyHist }, { data: dispHist }] = await Promise.all([
    admin.from("money_status_history")
      .select("id, from_status, to_status, reason, changed_at, changed_by_role")
      .eq("transaction_id", payout.transaction_id)
      .order("changed_at", { ascending: false }),
    admin.from("dispute_status_history")
      .select("id, from_status, to_status, reason, changed_at")
      .eq("dispute_id", dispute?.id ?? "00000000-0000-0000-0000-000000000000")
      .order("changed_at", { ascending: false }),
  ]);

  const tl: any[] = [];

  (events ?? []).forEach((e: any) => tl.push({
    id: `evt-${e.id}`, at: e.created_at, type: "event",
    title: String(e.event_type).replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
    description: e.event_data?.summary ?? e.event_data?.reason ?? null,
    actorType: e.actor_role, actorName: null, severity: "blue", icon: "activity",
  }));

  (moneyHist ?? []).forEach((m: any) => tl.push({
    id: `money-${m.id}`, at: m.changed_at, type: "money_status",
    title: `Money: ${String(m.to_status).replace(/_/g, " ")}`,
    description: `From ${m.from_status ? String(m.from_status).replace(/_/g, " ") : "—"}${m.reason ? ` — ${m.reason}` : ""}`,
    actorType: m.changed_by_role, actorName: null,
    severity: m.to_status === "funds_frozen" ? "critical" : null, icon: "vault",
  }));

  (dispHist ?? []).forEach((d: any) => tl.push({
    id: `disp-${d.id}`, at: d.changed_at, type: "dispute",
    title: `Dispute: ${String(d.to_status).replace(/_/g, " ")}`,
    description: d.reason ?? (d.from_status ? `From ${String(d.from_status).replace(/_/g, " ")}` : null),
    actorType: null, actorName: null,
    severity: d.to_status === "resolved" ? "success" : null, icon: "scale",
  }));

  if (payout.created_at) tl.push({ id: `pay-q-${payout.id}`, at: payout.created_at, type: "payout", title: "Payout queued", description: "Entered release review queue", severity: null, icon: "wallet" });
  if (payout.initiated_at) tl.push({ id: `pay-i-${payout.id}`, at: payout.initiated_at, type: "payout", title: "Payout initiated", description: payout.provider_reference ?? null, severity: null, icon: "wallet" });
  if (payout.released_at) tl.push({ id: `pay-r-${payout.id}`, at: payout.released_at, type: "payout", title: "Payout released", description: "Funds sent to seller", severity: "success", icon: "wallet" });
  if (payout.status === "failed" && payout.failure_reason) tl.push({ id: `pay-f-${payout.id}`, at: payout.updated_at ?? payout.created_at, type: "payout", title: "Payout failed", description: payout.failure_reason, severity: "critical", icon: "wallet" });

  tl.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return json({
    payout: {
      id: payout.id,
      status: payout.status,
      amount: payout.amount != null ? Number(payout.amount) : null,
      currency: payout.currency_code ?? null,
      release_blocked: !!payout.release_blocked,
      payout_blocked_reason: payout.payout_blocked_reason ?? null,
      retry_allowed: !!payout.retry_allowed,
      failed_attempt_count: payout.failed_attempt_count ?? 0,
      failure_reason: payout.failure_reason ?? null,
      provider_reference: payout.provider_reference ?? null,
      entered_queue_at: payout.created_at,
      released_at: payout.released_at,
      initiated_at: payout.initiated_at,
      // A completed payout MUST carry a completion timestamp. When it is
      // missing we surface "Unavailable" and flag the record for review
      // instead of rendering a blank value.
      completed_at: payout.completed_at ?? null,
      completed_at_display:
        payout.status === "completed" && !payout.completed_at
          ? "Unavailable"
          : payout.completed_at ?? null,
      needs_review: payout.status === "completed" && !payout.completed_at,
      needs_review_reason:
        payout.status === "completed" && !payout.completed_at
          ? "Completed payout has no completion timestamp."
          : null,
      transaction_id: payout.transaction_id,
      seller_id: payout.seller_id,
      notes: payout.notes ?? null,
    },
    transaction: tx ? {
      id: tx.id,
      code: tx.transaction_code,
      status: tx.status,
      money_status: tx.money_status,
      dispute_status: tx.dispute_status,
      needs_release_review: !!tx.needs_release_review,
      needs_admin_review: !!tx.needs_admin_review,
      buyer_id: tx.buyer_id,
      seller_id: tx.seller_id,
      item_title: itemTitle,
      created_at: tx.created_at,
    } : null,
    pricing: {
      item_total: itemTotal,
      protection_fee: protectionFee,
      protection_fee_raw: protectionFee,
      protection_fee_capped: protectionFeeCapped,
      payment_processing_fee: paymentProcessingFee,
      total_charged: totalCharged,
      seller_payout: sellerPayout,
      seller_payout_source: snapshotSellerPayout != null ? "pricing_snapshot" : null,
      recorded_payout_amount: recordedPayoutAmount,
      release_amount_mismatch: releaseAmountMismatch,
      currency: pricing?.currency_code ?? null,
      has_pricing_snapshot: hasPricing,
    },
    seller: profile ? {
      id: profile.id, name: profile.full_name, email: profile.email, avatar_url: profile.avatar_url,
    } : null,
    payout_account: account ? {
      bank_name: account.bank_name,
      masked_account: maskAccount(account.account_number),
      account_name: account.account_name,
      verification_status: account.verification_status,
      has_recipient_code: !!account.provider_recipient_code,
      last_verified_at: account.verified_at ?? null,
      account_state: (accountState as any)?.account_state ?? null,
    } : null,
    payment: payment ?? null,
    refunds: refunds ?? [],
    dispute: dispute ?? null,
    investigation: investigation ?? null,
    queue: queue ?? [],
    notes: notes ?? [],
    events: events ?? [],
    timeline: tl,
    eligibility: { gates, eligible },
  });
});