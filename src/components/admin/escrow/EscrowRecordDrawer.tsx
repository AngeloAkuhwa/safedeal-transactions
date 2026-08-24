import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { ExternalLink, FileText, X, AlertCircle } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatMoney } from "@/lib/format";
import { formatMoneyOrDash } from "@/lib/payment/money-format";
import { formatRelative } from "@/components/admin/dashboard/relative";
import { fetchEscrowDetail, type EscrowDetail } from "@/services/admin-escrow.service";
import { BlockSkeleton } from "@/components/common/PageSkeleton";
import { ADMIN_TONE } from "@/components/admin/palette";

function Row({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-800 last:border-0">
      <span className="text-slate-400 text-xs">{label}</span>
      <span className={`text-sm font-medium ${accent ?? "text-white"}`}>{value}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-4">
      <h4 className="text-white text-sm font-semibold mb-3">{title}</h4>
      {children}
    </div>
  );
}

/**
 * Explicit pricing field list. A generic `Object.entries` dump rendered every
 * numeric column as money, so a rate like 0.03 printed as ₦0.03. Each field
 * declares how it is rendered; unknown columns are not shown at all.
 */
const PRICING_MONEY_FIELDS: Array<{ key: string; label: string }> = [
  { key: "item_amount", label: "Item amount" },
  { key: "platform_fee_amount", label: "Protection fee" },
  { key: "payment_processing_fee_amount", label: "Payment processing fee" },
  { key: "buyer_total_amount", label: "Buyer total" },
  { key: "seller_payout_amount", label: "Seller payout" },
];

function Body({ d }: { d: EscrowDetail }) {
  const nav = useNavigate();
  const pricing = (d.pricing ?? {}) as Record<string, unknown>;
  const pricingCurrency = typeof pricing.currency_code === "string" ? pricing.currency_code : null;
  const num = (v: unknown): number | null => (typeof v === "number" ? v : null);
  return (
    <div className="space-y-4 pb-8">
      <Section title="Transaction">
        <Row label="Code" value={`#${d.transaction.code}`} />
        <Row label="Created" value={new Date(d.transaction.created_at).toLocaleString("en-NG")} />
        <Row label="Transaction status" value={d.transaction.transaction_status} />
        <Row label="Money status" value={d.transaction.money_status} />
        <Row label="Buyer" value={d.transaction.buyer.name} />
        <Row label="Seller" value={d.transaction.seller.name} />
      </Section>

      <Section title="Escrow position">
        <Row label="Held" value={formatMoney(d.escrow.held_amount, "NGN")} accent="text-emerald-400" />
        <Row label="Frozen" value={formatMoney(d.escrow.frozen_amount, "NGN")} accent="text-red-400" />
        <Row label="Released" value={formatMoney(d.escrow.released_amount, "NGN")} accent="text-cyan-400" />
        <Row label="Refunded" value={formatMoney(d.escrow.refunded_amount, "NGN")} accent="text-purple-400" />
        <Row label="Last changed" value={formatRelative(d.escrow.last_changed_at)} />
      </Section>

      {d.pricing && (
        <Section title="Pricing snapshot">
          <Row label="Currency" value={pricingCurrency ?? "—"} />
          {PRICING_MONEY_FIELDS.map((f) => (
            <Row
              key={f.key}
              label={f.label}
              value={formatMoneyOrDash(num(pricing[f.key]), pricingCurrency)}
            />
          ))}
          <Row
            label="Total service fee capped"
            value={typeof pricing.is_total_service_fee_capped === "boolean"
              ? (pricing.is_total_service_fee_capped ? "Yes" : "No")
              : "—"}
          />
          <Row
            label="Pricing model version"
            value={typeof pricing.pricing_model_version === "string" ? pricing.pricing_model_version : "—"}
          />
        </Section>
      )}

      <Section title={`Ledger (${d.ledger.length})`}>
        {d.ledger.length === 0 ? (
          <p className="text-slate-500 text-xs italic">No ledger entries.</p>
        ) : (
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {d.ledger.map((e) => (
              <div key={e.id} className="flex items-center justify-between text-xs">
                <div className="min-w-0">
                  <p className="text-slate-200 font-medium">{e.entry_type}</p>
                  <p className="text-slate-500">{new Date(e.created_at).toLocaleString("en-NG")}</p>
                </div>
                <span className={e.entry_type.endsWith("_credit") ? "text-emerald-400 font-semibold" : "text-red-400 font-semibold"}>
                  {e.entry_type.endsWith("_credit") ? "+" : "−"}{formatMoney(e.amount, "NGN")}
                </span>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Money status history">
        {d.money_history.length === 0 ? (
          <p className="text-slate-500 text-xs italic">No history.</p>
        ) : (
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {d.money_history.map((h) => (
              <div key={h.id} className="flex items-center justify-between text-xs">
                <span className="text-slate-200">{h.from_status ?? "∅"} → {h.to_status}</span>
                <span className="text-slate-500">{formatRelative(h.changed_at)}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      {d.dispute && (
        <Section title="Linked dispute">
          <Row label="Status" value={d.dispute.status} accent="text-red-400" />
          <Row label="Opened" value={formatRelative(d.dispute.opened_at)} />
          <button
            onClick={() => nav(`/admin/disputes/${d.dispute!.id}`)}
            className="mt-2 w-full px-3 py-2 bg-red-500/15 text-red-300 border border-red-500/30 rounded text-xs font-semibold inline-flex items-center justify-center gap-2 min-h-11"
          >
            <AlertCircle className="h-3 w-3" /> Open dispute case
          </button>
        </Section>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => nav(`/admin/transactions/${d.transaction.id}`)}
          className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-semibold inline-flex items-center justify-center gap-2 min-h-11"
        >
          <FileText className="h-4 w-4" /> Full transaction
          <ExternalLink className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

export function EscrowRecordDrawer({
  txId, open, onClose,
}: { txId: string | null; open: boolean; onClose: () => void }) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["admin-escrow-detail", txId],
    queryFn: () => fetchEscrowDetail(txId!),
    enabled: !!txId && open,
    staleTime: 30_000,
  });

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-xl bg-slate-950 border-slate-800 text-slate-100 overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle className="text-white flex items-center justify-between">
            <span>Escrow record</span>
            <button onClick={onClose} className="text-slate-400 hover:text-white relative inline-flex items-center justify-center before:absolute before:-inset-3.5 before:content-[''] min-h-11 min-w-11"><X className="h-4 w-4" /></button>
          </SheetTitle>
        </SheetHeader>
        {isLoading || !txId ? (
          <BlockSkeleton label="Loading the escrow record" lines={6} className="py-2" />
        ) : isError ? (
          <div className={`${ADMIN_TONE.danger.text} text-sm`}>{(error as Error).message}</div>
        ) : data ? (
          <Body d={data} />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}