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

function maskEmail(email?: string | null): string | null {
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
  const { data: userData, error: userErr } = await userClient.auth.getUser(auth.replace("Bearer ", ""));
  if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);
  const userId = userData.user.id;
  const { data: isAdmin } = await userClient.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!isAdmin) return json({ error: "admin_access_required" }, 403);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const txId = String(body.transaction_id ?? body.transactionId ?? "");
  if (!txId) return json({ error: "missing_transaction_id" }, 400);
  const reason = String(body.reason ?? "").trim();
  if (reason.length < 8) return json({ error: "Reason must be at least 8 characters" }, 400);

  const opts = {
    summary: body.include_summary !== false,
    agreement: body.include_agreement !== false,
    payment_ledger: body.include_payment_ledger !== false,
    timeline: body.include_timeline !== false,
    dispute_summary: body.include_dispute_summary !== false,
    evidence_metadata: body.include_evidence_metadata !== false,
    admin_notes: body.include_admin_notes === true,
  };

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: tx, error: txErr } = await admin
    .from("transactions")
    .select("id, transaction_code, status, money_status, dispute_status, buyer_id, seller_id, agreement_locked_at, payment_received_at, completed_at, cancelled_at, created_at, updated_at, currency_code")
    .eq("id", txId)
    .maybeSingle();
  if (txErr) return json({ error: "query_failed", detail: txErr.message }, 500);
  if (!tx) return json({ error: "transaction_not_found" }, 404);

  const userIds = [tx.buyer_id, tx.seller_id].filter(Boolean) as string[];

  const [profilesRes, pricingRes, escrowRes, paymentRes, payoutRes, ledgerRes, eventsRes,
         disputeRes, itemsRes, deliveryRes, agreementRes, notesRes] = await Promise.all([
    userIds.length
      ? admin.from("profiles").select("id, full_name, email").in("id", userIds)
      : Promise.resolve({ data: [] as any[] }),
    admin.from("transaction_pricing").select("currency_code, item_amount, platform_fee_amount, processing_fee_amount, seller_net_amount, buyer_total_amount").eq("transaction_id", txId).maybeSingle(),
    admin.from("escrow_states").select("state, held_amount, frozen_amount, released_amount, refunded_amount, last_changed_at").eq("transaction_id", txId).maybeSingle(),
    admin.from("payments").select("id, provider, status, amount, currency_code, payment_method_type, authorized_at, captured_at, failed_at, failure_reason, created_at").eq("transaction_id", txId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    admin.from("payouts").select("id, status, amount, currency_code, initiated_at, completed_at, released_at, failed_at, failure_reason, created_at").eq("transaction_id", txId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    opts.payment_ledger
      ? admin.from("escrow_ledger_entries").select("id, created_at, entry_type, amount, currency_code, balance_after, reference_type, notes").eq("transaction_id", txId).order("created_at", { ascending: true }).limit(500)
      : Promise.resolve({ data: [] as any[] }),
    opts.timeline
      ? admin.from("transaction_events").select("id, occurred_at, event_type, actor_role").eq("transaction_id", txId).order("occurred_at", { ascending: true }).limit(500)
      : Promise.resolve({ data: [] as any[] }),
    opts.dispute_summary
      ? admin.from("disputes").select("id, status, reason, description, opened_at, resolved_at, seller_response_due_at").eq("transaction_id", txId).order("opened_at", { ascending: false }).limit(1).maybeSingle()
      : Promise.resolve({ data: null }),
    admin.from("transaction_items").select("id, title, description, quantity, condition_label, brand, model").eq("transaction_id", txId),
    admin.from("transaction_delivery_terms").select("delivery_method, expected_delivery_date, verification_window_hours").eq("transaction_id", txId).maybeSingle(),
    opts.agreement
      ? admin.from("transaction_agreement_snapshots").select("snapshot_json, locked_at").eq("transaction_id", txId).maybeSingle()
      : Promise.resolve({ data: null }),
    opts.admin_notes
      ? admin.from("admin_transaction_notes").select("id, created_at, admin_user_id, note").eq("transaction_id", txId).order("created_at", { ascending: false }).limit(200)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const profById = new Map<string, any>(((profilesRes as any).data ?? []).map((p: any) => [p.id, p]));
  const partySafe = (uid: string | null) => {
    if (!uid) return null;
    const p = profById.get(uid);
    if (!p) return null;
    return { id: p.id, name: p.full_name ?? null, maskedEmail: maskEmail(p.email) };
  };

  const payload: any = { exportedAt: new Date().toISOString(), transactionId: tx.id, transactionCode: tx.transaction_code };

  if (opts.summary) {
    payload.summary = {
      transactionCode: tx.transaction_code,
      status: tx.status,
      moneyStatus: tx.money_status,
      disputeStatus: tx.dispute_status,
      currency: tx.currency_code ?? "NGN",
      createdAt: tx.created_at,
      paymentReceivedAt: tx.payment_received_at,
      agreementLockedAt: tx.agreement_locked_at,
      completedAt: tx.completed_at,
      cancelledAt: tx.cancelled_at,
      buyer: partySafe(tx.buyer_id),
      seller: partySafe(tx.seller_id),
      pricing: pricingRes.data ?? null,
      escrow: escrowRes.data ?? null,
      payment: paymentRes.data ?? null,
      payout: payoutRes.data ?? null,
      delivery: deliveryRes.data ?? null,
      items: itemsRes.data ?? [],
    };
  }

  if (opts.agreement) {
    const snap: any = (agreementRes as any)?.data ?? null;
    payload.agreement = snap ? {
      lockedAt: snap.locked_at ?? tx.agreement_locked_at,
      // immutable JSONB snapshot only — no PDF/file URL
      snapshot: snap.snapshot_json ?? null,
    } : null;
  }

  if (opts.payment_ledger) {
    payload.paymentLedger = (ledgerRes.data ?? []).map((e: any) => ({
      id: e.id, at: e.created_at, type: e.entry_type, amount: e.amount,
      currency: e.currency_code, balanceAfter: e.balance_after,
      referenceType: e.reference_type, notes: e.notes,
    }));
  }

  if (opts.timeline) {
    payload.timeline = (eventsRes.data ?? []).map((e: any) => ({
      id: e.id, at: e.occurred_at, type: e.event_type, actorRole: e.actor_role,
    }));
  }

  if (opts.dispute_summary && disputeRes && (disputeRes as any).data) {
    const d: any = (disputeRes as any).data;
    let evMeta: any[] = [];
    if (opts.evidence_metadata) {
      const { data: ev } = await admin
        .from("dispute_evidence")
        .select("id, created_at, evidence_type, submitted_by_role, file_id, is_active")
        .eq("dispute_id", d.id)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(200);
      const fileIds = Array.from(new Set((ev ?? []).map((x: any) => x.file_id).filter(Boolean)));
      const filesById = new Map<string, any>();
      if (fileIds.length) {
        const { data: fs } = await admin
          .from("files")
          .select("id, mime_type, original_file_name, file_hash")
          .in("id", fileIds);
        for (const f of (fs ?? [])) filesById.set((f as any).id, f);
      }
      evMeta = (ev ?? []).map((e: any) => {
        const f = filesById.get(e.file_id);
        return {
          id: e.id,
          kind: e.evidence_type ?? null,
          title: f?.original_file_name ?? null,
          mimeType: f?.mime_type ?? null,
          uploadedByRole: e.submitted_by_role ?? null,
          uploadedAt: e.created_at,
          fileHash: f?.file_hash ?? null,
          // Strict redaction — NO storage_path, secure_url, file_url, signed_url, download_url.
        };
      });
    }
    payload.dispute = {
      id: d.id, status: d.status, reason: d.reason, description: d.description,
      openedAt: d.opened_at, resolvedAt: d.resolved_at,
      sellerResponseDueAt: d.seller_response_due_at,
      evidence: evMeta,
    };
  } else if (opts.evidence_metadata) {
    payload.evidence = [];
  }

  if (opts.admin_notes) {
    const noteAdminIds = Array.from(new Set(((notesRes as any).data ?? []).map((n: any) => n.admin_user_id)));
    let noteProfMap = new Map<string, any>();
    if (noteAdminIds.length) {
      const { data: np } = await admin.from("profiles").select("id, full_name").in("id", noteAdminIds);
      noteProfMap = new Map((np ?? []).map((p: any) => [p.id, p]));
    }
    payload.adminNotes = ((notesRes as any).data ?? []).map((n: any) => ({
      id: n.id, at: n.created_at, note: n.note,
      author: noteProfMap.get(n.admin_user_id)?.full_name ?? null,
    }));
  }

  const filename = `safedeal-transaction-${tx.transaction_code ?? tx.id}-${new Date().toISOString().slice(0,10)}.json`;
  const sectionsChosen = Object.entries(opts).filter(([_, v]) => v).map(([k]) => k);
  const byteSize = JSON.stringify(payload).length;

  // Audit
  await admin.from("admin_actions").insert({
    admin_user_id: userId,
    transaction_id: txId,
    action_type: "export_data",
    action_notes: `[${sectionsChosen.join(",")}] reason: ${reason.slice(0, 200)}`,
  });
  await admin.from("audit_logs").insert({
    action: "admin_export",
    actor_user_id: userId,
    transaction_id: txId,
    description: `Admin exported transaction ${tx.transaction_code}`,
    metadata: { sections: sectionsChosen, reason, byteSize, filename },
  });
  await admin.from("transaction_events").insert({
    transaction_id: txId,
    event_type: "admin_export_generated",
    actor_user_id: userId,
    actor_role: "admin",
    event_data: { sections: sectionsChosen, byteSize },
  });

  return json({ filename, generatedAt: payload.exportedAt, payload });
});