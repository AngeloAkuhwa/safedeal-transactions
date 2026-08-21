/**
 * Admin Escrow Detail — read-only deep view of one transaction's escrow record.
 * GET ?tx=<transaction_id>
 */
import { requireAdmin, authErrorResponse , requirePermission} from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let ctx;
  try {
    ctx = await requirePermission(req, "escrow.view");
  } catch (err) {
    const r = authErrorResponse(err, corsHeaders);
    if (r) return r;
    return json(500, { error: "auth_failed" });
  }

  if (req.method !== "GET") return json(405, { error: "method_not_allowed" });
  const admin = ctx.adminClient;
  const url = new URL(req.url);
  const txId = (url.searchParams.get("tx") ?? "").trim();
  if (!txId) return json(400, { error: "tx_required" });

  const { data: tx, error: txErr } = await admin
    .from("transactions")
    .select("id, transaction_code, created_at, status, money_status, buyer_id, seller_id")
    .eq("id", txId)
    .maybeSingle();
  if (txErr) {
    console.error("[admin-escrow-detail] tx fetch", txErr);
    return json(500, { error: "tx_fetch_failed", detail: txErr.message });
  }
  if (!tx) return json(404, { error: "not_found" });

  const [escrowRes, pricingRes, ledgerRes, statusHistRes, moneyHistRes, notesRes, disputeRes, profilesRes] = await Promise.all([
    admin.from("escrow_states").select("held_amount, frozen_amount, released_amount, refunded_amount, last_changed_at").eq("transaction_id", txId).maybeSingle(),
    admin.from("transaction_pricing").select("*").eq("transaction_id", txId).maybeSingle(),
    admin.from("escrow_ledger_entries").select("id, entry_type, amount, created_at, reference").eq("transaction_id", txId).order("created_at", { ascending: true }).limit(100),
    admin.from("transaction_status_history").select("id, from_status, to_status, changed_at, reason").eq("transaction_id", txId).order("changed_at", { ascending: false }).limit(50),
    admin.from("money_status_history").select("id, from_status, to_status, changed_at, reason").eq("transaction_id", txId).order("changed_at", { ascending: false }).limit(50),
    admin.from("admin_transaction_notes").select("id, note, created_at, admin_user_id").eq("transaction_id", txId).order("created_at", { ascending: false }).limit(20),
    admin.from("disputes").select("id, status, opened_at").eq("transaction_id", txId).order("opened_at", { ascending: false }).limit(1),
    admin.from("profiles").select("id, full_name, avatar_url, email").in("id", [tx.buyer_id as string, tx.seller_id as string]),
  ]);

  const profMap = new Map<string, { full_name?: string; avatar_url?: string; email?: string }>(
    (profilesRes.data ?? []).map((p) => [p.id as string, p as never]),
  );

  const adminIds = Array.from(new Set((notesRes.data ?? []).map((n) => n.admin_user_id as string).filter(Boolean)));
  const adminMap = new Map<string, string>();
  if (adminIds.length) {
    const { data: admins } = await admin.from("profiles").select("id, full_name").in("id", adminIds);
    for (const a of admins ?? []) adminMap.set(a.id as string, (a.full_name as string) ?? "Admin");
  }

  const buyer = profMap.get(tx.buyer_id as string);
  const seller = profMap.get(tx.seller_id as string);
  const escrow = escrowRes.data ?? { held_amount: 0, frozen_amount: 0, released_amount: 0, refunded_amount: 0, last_changed_at: tx.created_at };

  return json(200, {
    transaction: {
      id: tx.id,
      code: tx.transaction_code,
      created_at: tx.created_at,
      transaction_status: tx.status,
      money_status: tx.money_status,
      buyer: { id: tx.buyer_id, name: buyer?.full_name ?? "Unknown", email: buyer?.email ?? null, avatar_url: buyer?.avatar_url ?? null },
      seller: { id: tx.seller_id, name: seller?.full_name ?? "Unknown", email: seller?.email ?? null, avatar_url: seller?.avatar_url ?? null },
    },
    escrow: {
      held_amount: Number(escrow.held_amount ?? 0),
      frozen_amount: Number(escrow.frozen_amount ?? 0),
      released_amount: Number(escrow.released_amount ?? 0),
      refunded_amount: Number(escrow.refunded_amount ?? 0),
      last_changed_at: escrow.last_changed_at,
    },
    pricing: pricingRes.data ?? null,
    ledger: (ledgerRes.data ?? []).map((l) => ({
      id: l.id, entry_type: l.entry_type, amount: Number(l.amount ?? 0),
      created_at: l.created_at, reference: (l.reference as string) ?? null,
    })),
    status_history: statusHistRes.data ?? [],
    money_history: moneyHistRes.data ?? [],
    notes: (notesRes.data ?? []).map((n) => ({
      id: n.id, note: n.note, created_at: n.created_at,
      admin_name: adminMap.get(n.admin_user_id as string) ?? null,
    })),
    dispute: disputeRes.data?.[0] ?? null,
  });
});