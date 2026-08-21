import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  mapTransactionStatus,
  mapMoneyStatus,
  mapDisputeStatus,
  mapEscrowState,
  mapPayoutStatus,
  buildRiskFlags,
  mapRiskLevel as sharedMapRisk,
} from "../_shared/admin-mappers.ts";
import { requirePermission, requireAnyPermission, authErrorResponse } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function maskEmail(email?: string | null): string | null {
  if (!email) return null;
  const [local, domain] = email.split("@");
  if (!domain) return email;
  const head = local.length <= 2 ? local : local.slice(0, 2);
  return `${head}***@${domain}`;
}
function maskPhone(phone?: string | null): string | null {
  if (!phone) return null;
  if (phone.length <= 4) return phone;
  return `***${phone.slice(-4)}`;
}
const num = (v: any) => (v == null ? null : Number(v));

function titleCaseEvent(t?: string | null): string {
  if (!t) return "Event";
  return t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
function prettyEventData(d: any): string {
  if (d == null) return "";
  if (typeof d === "string") return d;
  if (typeof d !== "object") return String(d);
  const parts: string[] = [];
  const preferred = ["reason", "message", "note", "amount", "currency", "status", "from", "to", "provider", "reference"];
  for (const k of preferred) {
    if (d[k] != null && typeof d[k] !== "object") {
      const label = k.charAt(0).toUpperCase() + k.slice(1);
      parts.push(`${label}: ${d[k]}`);
    }
  }
  if (parts.length === 0) {
    for (const [k, v] of Object.entries(d)) {
      if (v != null && typeof v !== "object") {
        parts.push(`${k.replace(/_/g, " ")}: ${v}`);
      }
      if (parts.length >= 4) break;
    }
  }
  return parts.slice(0, 4).join(" · ");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let ctx;
  // Dispute review flows (AdminDisputeDetail) proxy through this endpoint. Accept
  // any of the relevant view permissions so dispute-focused roles like
  // support_agent / dispute_agent can open cases without holding a global
  // transactions.view grant.
  try { ctx = await requireAnyPermission(req, ["transactions.view", "disputes.view", "disputes.view_assigned"]); }
  catch (err) {
    const resp = authErrorResponse(err, corsHeaders);
    if (resp) return resp;
    throw err;
  }

  // Method contract is disclosed only to identified callers.
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const admin = ctx.adminClient;

  let body: { transaction_id?: string; transactionId?: string };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const txId = body.transaction_id ?? body.transactionId;
  if (!txId) return json({ error: "missing_transaction_id" }, 400);

  const { data: tx, error: txErr } = await admin
    .from("transactions")
    .select("id, transaction_code, status, money_status, dispute_status, buyer_id, seller_id, source_product_id, created_at, updated_at, completed_at, buyer_confirmed_at, seller_confirmed_at, agreement_locked_at, payment_received_at, delivered_at, verification_deadline_at, needs_release_review, release_review_reason")
    .eq("id", txId)
    .maybeSingle();
  if (txErr) return json({ error: "query_failed", detail: txErr.message }, 500);
  if (!tx) return json({ error: "transaction_not_found" }, 404);

  const userIds = [tx.buyer_id, tx.seller_id].filter(Boolean) as string[];

  const [
    profilesRes, verifsRes, pricingRes, escrowRes, ledgerRes,
    itemsRes, productRes, paymentRes, payoutRes, refundsRes,
    deliveryTermsRes, deliveryTrackingRes, deliveryUpdatesRes, deliveryProofRes,
    disputeRes, txStatusRes, moneyStatusRes, eventsRes, adminActionsRes, auditRes,
    productMediaRes, agreementSnapRes,
  ] = await Promise.all([
    userIds.length
      ? admin.from("profiles").select("id, full_name, email, phone, avatar_url, status, store_slug").in("id", userIds)
      : Promise.resolve({ data: [] as any[] }),
    userIds.length
      ? admin.from("account_verifications").select("user_id, verification_level, identity_verified, email_verified, phone_verified, payout_verified").in("user_id", userIds)
      : Promise.resolve({ data: [] as any[] }),
    admin.from("transaction_pricing").select("currency_code, item_amount, platform_fee_amount, payment_processing_fee_amount, seller_payout_amount, buyer_total_amount").eq("transaction_id", txId).maybeSingle(),
    admin.from("escrow_states").select("state, held_amount, frozen_amount, released_amount, refunded_amount, last_changed_at").eq("transaction_id", txId).maybeSingle(),
    admin.from("escrow_ledger_entries").select("id, created_at, entry_type, amount, currency_code, balance_after, reference_type, reference_id, notes").eq("transaction_id", txId).order("created_at", { ascending: false }).limit(100),
    admin.from("transaction_items").select("id, title, description, quantity, condition_label, brand, model, warranty_info, created_at").eq("transaction_id", txId).order("created_at", { ascending: true }),
    tx.source_product_id
      ? admin.from("products").select("id, title, slug, category_id, condition_label, unit_price, currency_code").eq("id", tx.source_product_id).maybeSingle()
      : Promise.resolve({ data: null }),
    admin.from("payments").select("id, provider, provider_reference, status, amount, currency_code, payment_method_type, authorized_at, captured_at, failed_at, failure_reason, created_at").eq("transaction_id", txId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    admin.from("payouts").select("id, status, amount, currency_code, provider_reference, initiated_at, completed_at, released_at, failed_at, failure_reason, last_release_error, retry_allowed, release_blocked, payout_blocked_reason, created_at").eq("transaction_id", txId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    admin.from("refunds").select("id, status, refund_amount, currency_code, reason, created_at, completed_at").eq("transaction_id", txId).order("created_at", { ascending: false }).limit(20),
    admin.from("transaction_delivery_terms").select("delivery_method, expected_delivery_date, verification_window_hours, delivery_address_line1, delivery_address_line2, delivery_city, delivery_state, delivery_country_code, delivery_postal_code").eq("transaction_id", txId).maybeSingle(),
    admin.from("delivery_tracking_details").select("courier_name, tracking_number, tracking_url, shipped_at, expected_delivery_at, delivered_at, signature_name").eq("transaction_id", txId).maybeSingle(),
    admin.from("delivery_updates").select("id, created_at, status, notes").eq("transaction_id", txId).order("created_at", { ascending: false }).limit(50),
    admin.from("delivery_proof_files").select("id, proof_type, created_at, file_id").eq("transaction_id", txId).order("created_at", { ascending: false }).limit(20),
    admin.from("disputes").select("id, status, reason, description, opened_at, seller_response_due_at, resolved_at").eq("transaction_id", txId).order("opened_at", { ascending: false }).limit(1).maybeSingle(),
    admin.from("transaction_status_history").select("changed_at, old_status, new_status, reason, changed_by_user_id").eq("transaction_id", txId).order("changed_at", { ascending: false }).limit(100),
    admin.from("money_status_history").select("changed_at, old_status, new_status, reason, changed_by_user_id").eq("transaction_id", txId).order("changed_at", { ascending: false }).limit(100),
    admin.from("transaction_events").select("id, occurred_at, event_type, actor_user_id, actor_role, event_data").eq("transaction_id", txId).order("occurred_at", { ascending: false }).limit(100),
    admin.from("admin_actions").select("id, created_at, admin_user_id, action_type, action_notes").eq("transaction_id", txId).order("created_at", { ascending: false }).limit(100),
    admin.from("audit_logs").select("id, created_at, action, actor_user_id, description, metadata").eq("transaction_id", txId).order("created_at", { ascending: false }).limit(100),
    tx.source_product_id
      ? admin.from("product_media").select("file_id, is_primary, sort_order").eq("product_id", tx.source_product_id).order("is_primary", { ascending: false }).order("sort_order", { ascending: true }).limit(1)
      : Promise.resolve({ data: [] as any[] }),
    admin.from("transaction_agreement_snapshots").select("snapshot_json, locked_at, locked_by_user_id").eq("transaction_id", txId).maybeSingle(),
  ]);

  // Profiles map + verification map
  const profById = new Map<string, any>(((profilesRes as any).data ?? []).map((p: any) => [p.id, p]));
  const vById = new Map<string, any>(((verifsRes as any).data ?? []).map((v: any) => [v.user_id, v]));

  const buildParty = (uid: string | null, kind: "buyer" | "seller") => {
    if (!uid) return null;
    const p = profById.get(uid);
    const v = vById.get(uid);
    if (!p) return null;
    return {
      id: p.id,
      name: p.full_name ?? null,
      storeSlug: kind === "seller" ? p.store_slug ?? null : null,
      avatarUrl: p.avatar_url ?? null,
      maskedEmail: maskEmail(p.email),
      maskedPhone: maskPhone(p.phone),
      flagged: p.status && p.status !== "active",
      accountStatus: p.status ?? null,
      verification: v ? {
        level: v.verification_level,
        identity: !!v.identity_verified,
        email: !!v.email_verified,
        phone: !!v.phone_verified,
        payout: !!v.payout_verified,
      } : null,
    };
  };

  // Product media (image) - file lookup via primary media row from parallel batch
  let productImage: string | null = null;
  const primaryMediaFileId = ((productMediaRes as any)?.data ?? [])[0]?.file_id ?? null;
  if (primaryMediaFileId) {
    const { data: f } = await admin.from("files").select("secure_url, file_url").eq("id", primaryMediaFileId).maybeSingle();
    productImage = f?.secure_url ?? f?.file_url ?? null;
  }

  // Items - attach unit_price from product if single-item
  const pricing = pricingRes.data ?? null;
  const items = (itemsRes.data ?? []).map((it: any, idx: number) => {
    const isSingle = (itemsRes.data ?? []).length === 1;
    const unitPrice = isSingle && pricing
      ? num(pricing.item_amount) / Math.max(1, it.quantity ?? 1)
      : num(productRes.data?.unit_price);
    const lineTotal = unitPrice != null ? unitPrice * (it.quantity ?? 1) : (isSingle ? num(pricing?.item_amount) : null);
    return {
      id: it.id,
      title: it.title,
      description: it.description,
      condition: it.condition_label,
      quantity: it.quantity,
      brand: it.brand,
      model: it.model,
      warrantyInfo: it.warranty_info,
      unitPrice,
      lineTotal,
      image: idx === 0 ? productImage : null,
      productId: tx.source_product_id ?? null,
    };
  });

  const dispute = disputeRes.data;
  const disputeOverdue = !!(dispute?.seller_response_due_at && new Date(dispute.seller_response_due_at).getTime() < Date.now() && !dispute.resolved_at);

  // Dispute evidence
  let evidence: any[] = [];
  let disputeHistory: any[] = [];
  let disputeOutcome: any = null;
  let disputeResponses: any[] = [];
  if (dispute?.id) {
    const [evRes, dhRes, doRes, drRes] = await Promise.all([
      admin.from("dispute_evidence").select("id, created_at, evidence_type, notes, submitted_by_role, file_id").eq("dispute_id", dispute.id).eq("is_active", true).order("created_at", { ascending: false }).limit(50),
      admin.from("dispute_status_history").select("changed_at, old_status, new_status, reason, changed_by_user_id").eq("dispute_id", dispute.id).order("changed_at", { ascending: false }).limit(50),
      admin.from("dispute_outcomes").select("id, outcome_type, decision_summary, refund_amount, release_amount, resolved_at").eq("dispute_id", dispute.id).maybeSingle(),
      admin.from("dispute_responses").select("id, response_number, response_text, submitted_at, responded_by_user_id").eq("dispute_id", dispute.id).order("submitted_at", { ascending: false }).limit(10),
    ]);
    evidence = evRes.data ?? [];
    disputeHistory = dhRes.data ?? [];
    disputeOutcome = doRes.data ?? null;
    disputeResponses = drRes.data ?? [];
  }

  // ===== Resolve evidence + delivery proof files =====
  const evFileIds = Array.from(new Set([
    ...evidence.map((e: any) => e.file_id).filter(Boolean),
    ...((deliveryProofRes as any).data ?? []).map((p: any) => p.file_id).filter(Boolean),
  ]));
  let filesById = new Map<string, any>();
  if (evFileIds.length) {
    const { data: fs } = await admin
      .from("files")
      .select("id, secure_url, file_url, mime_type, original_file_name, resource_type")
      .in("id", evFileIds);
    filesById = new Map((fs ?? []).map((f: any) => [f.id, f]));
  }
  const evUserIds = Array.from(new Set(evidence.map((e: any) => e.submitted_by_user_id).filter(Boolean)));
  let evUserById = new Map<string, any>();
  if (evUserIds.length) {
    const { data: us } = await admin.from("profiles").select("id, full_name").in("id", evUserIds);
    evUserById = new Map((us ?? []).map((u: any) => [u.id, u]));
  }
  const inferKind = (mime?: string | null, evType?: string | null): string => {
    const m = (mime ?? "").toLowerCase();
    if (m.startsWith("image/")) return "image";
    if (m.startsWith("video/")) return "video";
    if (m === "application/pdf") return "document";
    if ((evType ?? "").includes("receipt")) return "receipt";
    if ((evType ?? "").includes("tracking") || (evType ?? "").includes("delivery")) return "delivery_proof";
    return "document";
  };
  const evidenceOut = [
    ...evidence.map((e: any) => {
      const f = filesById.get(e.file_id);
      const url = f?.secure_url ?? f?.file_url ?? null;
      const u = evUserById.get(e.submitted_by_user_id);
      return {
        id: e.id,
        kind: inferKind(f?.mime_type, e.evidence_type),
        title: f?.original_file_name ?? (e.evidence_type ?? "evidence").replace(/_/g, " "),
        secureUrl: url,
        mimeType: f?.mime_type ?? null,
        evidenceType: e.evidence_type,
        uploadedByRole: e.submitted_by_role,
        uploadedByName: u?.full_name ?? null,
        uploadedAt: e.created_at,
        status: "pending",
        note: e.notes ?? null,
      };
    }),
    ...((deliveryProofRes as any).data ?? []).map((p: any) => {
      const f = filesById.get(p.file_id);
      const url = f?.secure_url ?? f?.file_url ?? null;
      return {
        id: `dp-${p.id}`,
        kind: inferKind(f?.mime_type, p.proof_type),
        title: f?.original_file_name ?? (p.proof_type ?? "delivery proof").replace(/_/g, " "),
        secureUrl: url,
        mimeType: f?.mime_type ?? null,
        evidenceType: p.proof_type,
        uploadedByRole: "seller",
        uploadedByName: null,
        uploadedAt: p.created_at,
        status: "verified",
        note: null,
      };
    }),
  ];

  // ===== Build response sections =====

  const transaction = {
    id: tx.id,
    transactionCode: tx.transaction_code,
    status: tx.status,
    moneyStatus: tx.money_status,
    disputeStatus: tx.dispute_status,
    statusLabel: mapTransactionStatus(tx.status),
    moneyStatusLabel: mapMoneyStatus(tx.money_status),
    disputeStatusLabel: mapDisputeStatus(tx.dispute_status),
    createdAt: tx.created_at,
    updatedAt: tx.updated_at,
    lastActivityAt: tx.updated_at ?? tx.created_at,
    completedAt: tx.completed_at,
    buyerConfirmedAt: tx.buyer_confirmed_at,
    sellerConfirmedAt: tx.seller_confirmed_at,
    agreementLockedAt: tx.agreement_locked_at,
    paymentReceivedAt: tx.payment_received_at,
    deliveredAt: tx.delivered_at,
    verificationDeadlineAt: tx.verification_deadline_at,
    needsAdminReview: tx.needs_release_review,
    adminReviewReason: tx.release_review_reason,
  };

  const parties = {
    buyer: buildParty(tx.buyer_id, "buyer"),
    seller: buildParty(tx.seller_id, "seller"),
  };

  const pricingOut = (() => {
    if (!pricing) return null;
    const MAX_PROTECTION_FEE = 2500;
    const itemTotal = num(pricing.item_amount);
    const rawProtection = num(pricing.platform_fee_amount);
    const protectionFee = Math.min(rawProtection, MAX_PROTECTION_FEE);
    // Payment processing fee: prefer transaction_pricing.payment_processing_fee_amount,
    // fall back to payments row if present, else 0.
    const processingFromPricing = num(pricing.payment_processing_fee_amount);
    const processingFromPayment = paymentRes.data ? num((paymentRes.data as any).fee_amount) : 0;
    const paymentProcessingFee = processingFromPricing > 0
      ? processingFromPricing
      : processingFromPayment;
    const totalCharged = itemTotal + protectionFee + paymentProcessingFee;
    // Seller payout = item total minus SafeDeal protection fee (buyer bears the
    // payment processing fee on top, seller is not charged for it).
    const sellerNet = Math.max(itemTotal - protectionFee, 0);
    const refundedTotal = (refundsRes.data ?? [])
      .filter((r: any) => r.status === "completed")
      .reduce((acc: number, r: any) => acc + Number(r.refund_amount ?? 0), 0);
    return {
      currency: pricing.currency_code,
      itemTotal,
      protectionFee,
      protectionFeeRaw: rawProtection,
      protectionFeeCapped: rawProtection > MAX_PROTECTION_FEE,
      paymentProcessingFee,
      processingFee: paymentProcessingFee, // back-compat alias
      totalCharged,
      buyerTotal: totalCharged, // back-compat alias
      sellerNet,
      sellerPayoutAmount: sellerNet,
      refundedTotal,
    };
  })();
  const payment = paymentRes.data ? {
    id: paymentRes.data.id,
    provider: paymentRes.data.provider,
    providerReference: paymentRes.data.provider_reference,
    status: paymentRes.data.status,
    amount: num(paymentRes.data.amount),
    currency: paymentRes.data.currency_code,
    paymentMethodType: paymentRes.data.payment_method_type,
    authorizedAt: paymentRes.data.authorized_at,
    capturedAt: paymentRes.data.captured_at,
    paidAt: paymentRes.data.captured_at ?? paymentRes.data.authorized_at,
    failedAt: paymentRes.data.failed_at,
    failureReason: paymentRes.data.failure_reason,
    createdAt: paymentRes.data.created_at,
  } : null;

  const escrow = escrowRes.data ? {
    state: escrowRes.data.state,
    heldAmount: num(escrowRes.data.held_amount),
    frozenAmount: num(escrowRes.data.frozen_amount),
    releasedAmount: num(escrowRes.data.released_amount),
    refundedAmount: num(escrowRes.data.refunded_amount),
    lastChangedAt: escrowRes.data.last_changed_at,
    ledger: (ledgerRes.data ?? []).map((e: any) => ({
      id: e.id,
      at: e.created_at,
      entryType: e.entry_type,
      amount: num(e.amount),
      currency: e.currency_code,
      balanceAfter: num(e.balance_after),
      referenceType: e.reference_type,
      referenceId: e.reference_id,
      notes: e.notes,
    })),
  } : null;

  const payout = payoutRes.data ? {
    id: payoutRes.data.id,
    status: payoutRes.data.status,
    amount: num(payoutRes.data.amount),
    currency: payoutRes.data.currency_code,
    providerReference: payoutRes.data.provider_reference,
    initiatedAt: payoutRes.data.initiated_at,
    completedAt: payoutRes.data.completed_at,
    releasedAt: payoutRes.data.released_at,
    failedAt: payoutRes.data.failed_at,
    failureReason: payoutRes.data.failure_reason ?? payoutRes.data.last_release_error,
    retryAllowed: !!payoutRes.data.retry_allowed,
    blocked: !!payoutRes.data.release_blocked,
    blockedReason: payoutRes.data.payout_blocked_reason,
    awaitingRelease: payoutRes.data.status === "pending" || payoutRes.data.status === "awaiting_release",
  } : null;

  const escrowStateLabel = escrow ? mapEscrowState(escrow.state) : null;
  const payoutStatusLabel = payout ? mapPayoutStatus(payout.status) : null;

  const delivery = {
    method: deliveryTermsRes.data?.delivery_method ?? null,
    expectedDate: deliveryTermsRes.data?.expected_delivery_date ?? null,
    verificationWindowHours: deliveryTermsRes.data?.verification_window_hours ?? null,
    address: deliveryTermsRes.data ? [
      deliveryTermsRes.data.delivery_address_line1,
      deliveryTermsRes.data.delivery_address_line2,
      deliveryTermsRes.data.delivery_city,
      deliveryTermsRes.data.delivery_state,
      deliveryTermsRes.data.delivery_country_code,
      deliveryTermsRes.data.delivery_postal_code,
    ].filter(Boolean).join(", ") || null : null,
    courier: deliveryTrackingRes.data?.courier_name ?? null,
    trackingNumber: deliveryTrackingRes.data?.tracking_number ?? null,
    trackingUrl: deliveryTrackingRes.data?.tracking_url ?? null,
    shippedAt: deliveryTrackingRes.data?.shipped_at ?? null,
    deliveredAt: deliveryTrackingRes.data?.delivered_at ?? tx.delivered_at ?? null,
    expectedDeliveryAt: deliveryTrackingRes.data?.expected_delivery_at ?? null,
    updates: (deliveryUpdatesRes.data ?? []).map((u: any) => ({ id: u.id, at: u.created_at, status: u.status, notes: u.notes })),
    proofs: (deliveryProofRes.data ?? []).map((p: any) => ({ id: p.id, proofType: p.proof_type, at: p.created_at, fileId: p.file_id })),
  };

  const disputeOut = dispute ? {
    id: dispute.id,
    status: dispute.status,
    claimType: dispute.reason,
    summary: dispute.description,
    openedAt: dispute.opened_at,
    sellerResponseDueAt: dispute.seller_response_due_at,
    resolvedAt: dispute.resolved_at,
    overdue: disputeOverdue,
    evidence: evidence.map((e: any) => ({
      id: e.id, at: e.created_at, evidenceType: e.evidence_type, notes: e.notes, submittedByRole: e.submitted_by_role, fileId: e.file_id,
    })),
    history: disputeHistory.map((h: any) => ({ at: h.changed_at, from: h.old_status, to: h.new_status, reason: h.reason })),
    responses: disputeResponses.map((r: any) => ({ id: r.id, number: r.response_number, text: r.response_text, at: r.submitted_at })),
    outcome: disputeOutcome ? {
      type: disputeOutcome.outcome_type,
      summary: disputeOutcome.decision_summary,
      refundAmount: num(disputeOutcome.refund_amount),
      releaseAmount: num(disputeOutcome.release_amount),
      resolvedAt: disputeOutcome.resolved_at,
    } : null,
  } : null;

  // ===== Timeline =====
  const TL_META: Record<string, { type: string; severity: string; icon: string; title: (r: any) => string; description: (r: any) => string }> = {};
  const items_tl: any[] = [];

  for (const r of (txStatusRes.data ?? []) as any[]) {
    items_tl.push({
      id: `ts-${r.changed_at}`, at: r.changed_at, type: "transaction_status",
      title: `Transaction: ${(r.new_status ?? "").replace(/_/g, " ")}`,
      description: r.old_status ? `From ${r.old_status.replace(/_/g, " ")}${r.reason ? `: ${r.reason}` : ""}` : (r.reason ?? ""),
      actorType: r.changed_by_user_id ? "user" : "system", actorName: null,
      severity: "info", icon: "truck",
    });
  }
  for (const r of (moneyStatusRes.data ?? []) as any[]) {
    items_tl.push({
      id: `ms-${r.changed_at}`, at: r.changed_at, type: "money_status",
      title: `Money: ${(r.new_status ?? "").replace(/_/g, " ")}`,
      description: r.old_status ? `From ${r.old_status.replace(/_/g, " ")}${r.reason ? `: ${r.reason}` : ""}` : (r.reason ?? ""),
      actorType: r.changed_by_user_id ? "user" : "system", actorName: null,
      severity: "info", icon: "lock",
    });
  }
  for (const r of (eventsRes.data ?? []) as any[]) {
    items_tl.push({
      id: `ev-${r.id}`, at: r.occurred_at, type: "event",
      title: titleCaseEvent(r.event_type),
      description: prettyEventData(r.event_data),
      actorType: r.actor_role ?? "system", actorName: null,
      severity: "info", icon: "credit-card",
    });
  }
  for (const r of (deliveryUpdatesRes.data ?? []) as any[]) {
    items_tl.push({
      id: `du-${r.id}`, at: r.created_at, type: "delivery",
      title: `Delivery: ${(r.status ?? "").replace(/_/g, " ")}`,
      description: r.notes ?? "",
      actorType: "user", actorName: null,
      severity: "info", icon: "package",
    });
  }
  for (const r of disputeHistory as any[]) {
    items_tl.push({
      id: `dh-${r.changed_at}`, at: r.changed_at, type: "dispute",
      title: `Dispute: ${(r.new_status ?? "").replace(/_/g, " ")}`,
      description: r.reason ?? "",
      actorType: r.changed_by_user_id ? "user" : "system", actorName: null,
      severity: "warning", icon: "scale",
    });
  }
  for (const r of (adminActionsRes.data ?? []) as any[]) {
    items_tl.push({
      id: `aa-${r.id}`, at: r.created_at, type: "admin_action",
      title: (r.action_type ?? "").replace(/_/g, " "),
      description: r.action_notes ?? "",
      actorType: "admin", actorName: profById.get(r.admin_user_id)?.full_name ?? null,
      severity: /freeze|escalat/i.test(r.action_type ?? "") ? "critical" : "warning",
      icon: "alert-triangle",
    });
  }
  if (payment) {
    if (payment.capturedAt) items_tl.push({ id: `pay-cap-${payment.id}`, at: payment.capturedAt, type: "payment", title: "Payment captured", description: `${payment.provider} · ${payment.providerReference}`, actorType: "system", actorName: null, severity: "success", icon: "credit-card" });
    if (payment.failedAt) items_tl.push({ id: `pay-fail-${payment.id}`, at: payment.failedAt, type: "payment", title: "Payment failed", description: payment.failureReason ?? "", actorType: "system", actorName: null, severity: "critical", icon: "credit-card" });
  }
  if (payout) {
    if (payout.releasedAt) items_tl.push({ id: `po-rel-${payout.id}`, at: payout.releasedAt, type: "payout", title: "Payout released", description: payout.providerReference ?? "", actorType: "system", actorName: null, severity: "success", icon: "credit-card" });
    if (payout.completedAt) items_tl.push({ id: `po-cmp-${payout.id}`, at: payout.completedAt, type: "payout", title: "Payout completed", description: payout.providerReference ?? "", actorType: "system", actorName: null, severity: "success", icon: "credit-card" });
    if (payout.failedAt) items_tl.push({ id: `po-fail-${payout.id}`, at: payout.failedAt, type: "payout", title: "Payout failed", description: payout.failureReason ?? "", actorType: "system", actorName: null, severity: "critical", icon: "credit-card" });
  }
  for (const e of (escrow?.ledger ?? [])) {
    items_tl.push({
      id: `el-${e.id}`, at: e.at, type: "escrow_ledger",
      title: `Escrow: ${(e.entryType ?? "").replace(/_/g, " ")}`,
      description: e.notes ?? "",
      actorType: "system", actorName: null,
      severity: "info", icon: "lock",
    });
  }
  items_tl.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  const timeline = items_tl.slice(0, 250);

  // ===== Risk =====
  const flags = buildRiskFlags({
    needsReleaseReview: tx.needs_release_review,
    releaseReviewReason: tx.release_review_reason,
    moneyStatus: tx.money_status,
    disputeStatus: tx.dispute_status,
    disputeOverdue,
    buyerFlagged: !!parties.buyer?.flagged,
    sellerFlagged: !!parties.seller?.flagged,
  });
  const sharedRisk = sharedMapRisk({
    needsReleaseReview: tx.needs_release_review,
    moneyStatus: tx.money_status,
    disputeStatus: tx.dispute_status,
  });
  const riskLevel = sharedRisk.level;

  const investigationNotes = (await admin
    .from("admin_transaction_notes")
    .select("id, created_at, admin_user_id, note, is_pinned")
    .eq("transaction_id", txId)
    .order("created_at", { ascending: false })
    .limit(50)).data ?? [];
  const noteAdminIds = Array.from(new Set(investigationNotes.map((n: any) => n.admin_user_id)));
  const noteAdminProfs = noteAdminIds.length
    ? (await admin.from("profiles").select("id, full_name").in("id", noteAdminIds)).data ?? []
    : [];
  const noteProfById = new Map(noteAdminProfs.map((p: any) => [p.id, p]));

  const escalationHistory = ((adminActionsRes.data ?? []) as any[])
    .filter((a) => /escalat|flag|freeze|review/i.test(a.action_type ?? ""))
    .map((a) => ({
      at: a.created_at,
      label: (a.action_type ?? "").replace(/_/g, " "),
      by: profById.get(a.admin_user_id)?.full_name ?? null,
      note: a.action_notes,
    }));

  // ===== Investigation =====
  const { data: invRow } = await admin
    .from("admin_investigations")
    .select("id, status, priority, assigned_admin_id, tags, opened_by_user_id, opened_at, resolved_at, last_updated_by, updated_at, created_at")
    .eq("transaction_id", txId)
    .maybeSingle();
  const invUserIds = Array.from(new Set([
    invRow?.assigned_admin_id, invRow?.opened_by_user_id, invRow?.last_updated_by,
  ].filter(Boolean) as string[]));
  let invProfById = new Map<string, any>();
  if (invUserIds.length) {
    const { data: ips } = await admin.from("profiles").select("id, full_name").in("id", invUserIds);
    invProfById = new Map((ips ?? []).map((p: any) => [p.id, p]));
  }
  const invHistory = [
    ...((adminActionsRes.data ?? []) as any[])
      .filter((a) => ["open_investigation","update_investigation","escalate_case"].includes(a.action_type))
      .map((a) => ({
        at: a.created_at,
        kind: a.action_type,
        by: profById.get(a.admin_user_id)?.full_name ?? null,
        note: a.action_notes ?? null,
      })),
    ...((auditRes.data ?? []) as any[])
      .filter((a) => ["admin_investigation_open","admin_investigation_update"].includes(a.action))
      .map((a) => ({
        at: a.created_at,
        kind: a.action,
        by: profById.get(a.actor_user_id)?.full_name ?? null,
        note: a.description,
        metadata: a.metadata ?? null,
      })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 100);
  const investigation = invRow ? {
    id: invRow.id,
    status: invRow.status,
    priority: invRow.priority,
    tags: invRow.tags ?? [],
    assignedAdmin: invRow.assigned_admin_id ? {
      id: invRow.assigned_admin_id,
      name: invProfById.get(invRow.assigned_admin_id)?.full_name ?? null,
    } : null,
    openedBy: invRow.opened_by_user_id ? {
      id: invRow.opened_by_user_id,
      name: invProfById.get(invRow.opened_by_user_id)?.full_name ?? null,
    } : null,
    openedAt: invRow.opened_at,
    updatedAt: invRow.updated_at,
    resolvedAt: invRow.resolved_at,
    history: invHistory,
  } : { history: invHistory };

  const risk = {
    level: riskLevel,
    flags,
    overdue: disputeOverdue,
    needsAdminReview: !!tx.needs_release_review,
    adminReviewReason: tx.release_review_reason ?? null,
    investigationNotes: investigationNotes.map((n: any) => ({
      id: n.id, at: n.created_at, note: n.note, isPinned: n.is_pinned,
      author: noteProfById.get(n.admin_user_id) ?? null,
    })),
    escalationHistory,
  };

  // ===== Linked Records =====
  const linkedRecords: any[] = [];
  if (parties.buyer) linkedRecords.push({
    type: "buyer", label: parties.buyer.name ?? "Buyer", subtitle: parties.buyer.maskedEmail ?? "",
    status: parties.buyer.flagged ? "flagged" : (parties.buyer.verification?.identity ? "verified" : "active"),
    route: `/admin/users/${parties.buyer.id}`,
  });
  if (parties.seller) linkedRecords.push({
    type: "seller", label: parties.seller.name ?? "Seller", subtitle: parties.seller.maskedEmail ?? "",
    status: parties.seller.verification?.identity ? "verified" : "unverified",
    route: `/admin/users/${parties.seller.id}`,
  });
  if (payment) linkedRecords.push({
    type: "payment", label: `${payment.provider} payment`, subtitle: payment.providerReference,
    status: payment.status, amount: payment.amount, currency: payment.currency,
    route: null,
  });
  if (escrow) linkedRecords.push({
    type: "escrow", label: "Escrow", subtitle: escrowStateLabel?.label ?? "—",
    status: escrow.state, amount: escrow.heldAmount, currency: pricingOut?.currency ?? "NGN",
    route: null,
  });
  if (payout) linkedRecords.push({
    type: "payout", label: "Payout", subtitle: payout.providerReference ?? payoutStatusLabel?.label ?? payout.status,
    status: payout.status, amount: payout.amount, currency: payout.currency,
    route: null,
  });
  if (disputeOut) linkedRecords.push({
    type: "dispute", label: "Dispute", subtitle: mapDisputeStatus(disputeOut.status).label,
    status: disputeOut.status,
    route: `/admin/disputes/${disputeOut.id}`,
  });
  if (productRes.data) linkedRecords.push({
    type: "product", label: productRes.data.title, subtitle: "Source product",
    status: "active",
    route: `/seller/products/${productRes.data.id}`,
  });

  // ===== Dispute-resolution linked records =====
  // Fetch release_review_queue rows (admin central release queue).
  const { data: releaseQueueRows } = await admin
    .from("release_review_queue")
    .select("id, status, queue_type, amount, currency_code, created_at, resolved_at")
    .eq("transaction_id", txId)
    .order("created_at", { ascending: false })
    .limit(5);
  const latestQueue = (releaseQueueRows ?? [])
    .find((r: any) => ["pending", "claimed", "processing", "awaiting_info", "held"].includes(r.status))
    ?? (releaseQueueRows ?? [])[0]
    ?? null;

  if (latestQueue) linkedRecords.push({
    type: "release_queue",
    label: "Release Review",
    subtitle: String(latestQueue.queue_type ?? "").replace(/_/g, " "),
    status: latestQueue.status,
    amount: latestQueue.amount != null ? Number(latestQueue.amount) : null,
    currency: latestQueue.currency_code ?? "NGN",
    route: null,
  });

  const latestRefund = (refundsRes.data ?? [])
    .find((r: any) => r.status !== "cancelled")
    ?? (refundsRes.data ?? [])[0]
    ?? null;
  if (latestRefund) linkedRecords.push({
    type: "refund",
    label: "Refund Record",
    subtitle: latestRefund.reason ?? "Refund",
    status: latestRefund.status,
    amount: latestRefund.refund_amount != null ? Number(latestRefund.refund_amount) : null,
    currency: latestRefund.currency_code ?? "NGN",
    route: null,
  });

  if (disputeOutcome) linkedRecords.push({
    type: "dispute_outcome",
    label: "Dispute Outcome",
    subtitle: String(disputeOutcome.outcome_type ?? "").replace(/_/g, " "),
    status: disputeOutcome.outcome_type,
    amount: Number(disputeOutcome.refund_amount ?? 0) + Number(disputeOutcome.release_amount ?? 0),
    currency: pricingOut?.currency ?? "NGN",
    route: null,
  });

  const ledgerRows = (ledgerRes as any).data ?? [];
  if (ledgerRows.length) linkedRecords.push({
    type: "escrow_ledger",
    label: "Escrow Ledger",
    subtitle: `${ledgerRows.length} ${ledgerRows.length === 1 ? "entry" : "entries"}`,
    status: ledgerRows[0]?.entry_type ?? null,
    amount: null,
    currency: pricingOut?.currency ?? "NGN",
    route: null,
  });

  // ===== Admin actions available (state-aware) =====
  const TERMINAL_TX = ["completed", "cancelled", "refunded", "timed_out"];
  const isTerminal = TERMINAL_TX.includes(tx.status as string);
  const hasOpenInvestigation = (investigationNotes ?? []).some((n: any) =>
    /^\[investigation\]/i.test(String(n?.note ?? ""))
  );
  const adminActionsAvailable = {
    canFreeze: ["funds_held_in_escrow","funds_pending_release"].includes(tx.money_status as string)
      && tx.money_status !== "funds_frozen"
      && tx.money_status !== "funds_released"
      && tx.money_status !== "refund_issued"
      && Number(escrow?.held_amount ?? 0) > 0
      && !isTerminal,
    canUnfreeze: tx.money_status === "funds_frozen",
    canManageDispute: !!disputeOut && disputeOut.status !== "closed",
    hasDispute: !!disputeOut,
    canExport: true,
    canAddNote: true,
    canViewBuyer: !!parties.buyer,
    canViewSeller: !!parties.seller,
    canRetryPayout: !!(payout && payout.retryAllowed && (payout.status === "failed")),
    canApproveRelease: tx.needs_release_review === true,
    canOpenInvestigation: !isTerminal,
    investigationAlreadyOpen: !!invRow && !["resolved","dismissed"].includes(invRow.status as string),
    canFlagForReview: !tx.needs_release_review && !isTerminal,
    canViewPayment: !!payment,
    canViewEscrow: !!escrow,
    canViewPayout: !!payout,
  };

  return json({
    transaction,
    parties,
    items,
    pricing: pricingOut,
    payment,
    escrow,
    escrowStateLabel,
    payout,
    payoutStatusLabel,
    delivery,
    dispute: disputeOut,
    timeline,
    risk,
    linkedRecords,
    adminActionsAvailable,
    evidence: evidenceOut,
    investigation,
    lockedAgreement: (() => {
      const snap = (agreementSnapRes as any)?.data ?? null;
      if (!snap && !tx.agreement_locked_at) return null;
      const j = snap?.snapshot_json ?? {};
      return {
        lockedAt: snap?.locked_at ?? tx.agreement_locked_at ?? null,
        transactionCode: tx.transaction_code,
        buyerName: parties.buyer?.name ?? null,
        sellerName: parties.seller?.name ?? null,
        item: {
          title: items[0]?.title ?? j?.item?.title ?? null,
          description: items[0]?.description ?? j?.item?.description ?? null,
          condition: items[0]?.condition ?? j?.item?.condition ?? null,
          quantity: items[0]?.quantity ?? j?.item?.quantity ?? null,
        },
        agreedPrice: pricingOut?.itemTotal ?? null,
        protectionFee: pricingOut?.protectionFee ?? null,
        total: pricingOut?.buyerTotal ?? null,
        currency: pricingOut?.currency ?? "NGN",
        deliveryMethod: delivery.method,
        verificationWindowHours: delivery.verificationWindowHours,
        sellerNotes: j?.seller_notes ?? j?.sellerNotes ?? null,
        buyerNotes: j?.buyer_notes ?? j?.buyerNotes ?? null,
        rules: j?.rules ?? j?.terms ?? null,
        hash: j?.hash ?? null,
        version: j?.version ?? null,
        snapshot: snap?.snapshot_json ?? null,
      };
    })(),
  });
});
