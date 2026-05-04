import { useEffect, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { ArrowLeft, Loader2, AlertTriangle } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import {
  getAdminTransactionDetail,
  AdminAccessRequiredError,
  type AdminTxDetail,
} from "@/services/admin-transaction-actions.service";
import { formatMoney } from "@/lib/format";

function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("en-NG"); } catch { return iso; }
}

export default function AdminTransactionDetail() {
  const { transactionId } = useParams<{ transactionId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = (location.state as { returnTo?: string } | null)?.returnTo ?? "/admin/transactions";

  const [data, setData] = useState<AdminTxDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    if (!transactionId) return;
    setLoading(true); setErr(null); setDenied(false);
    getAdminTransactionDetail(transactionId, ["summary", "timeline", "ledger", "messages", "notes"])
      .then(setData)
      .catch((e) => {
        if (e instanceof AdminAccessRequiredError) setDenied(true);
        else setErr((e as Error).message ?? "Failed to load transaction");
      })
      .finally(() => setLoading(false));
  }, [transactionId]);

  const summary = data?.summary ?? null;
  const code = summary?.transaction_code ?? summary?.code ?? transactionId?.slice(0, 8);

  return (
    <AdminLayout title={`Transaction #${code ?? ""}`} subtitle="Admin transaction detail">
      <div className="mx-auto max-w-6xl space-y-4 p-4">
        <header className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => navigate(returnTo)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
            aria-label="Back to transactions"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <div className="text-right">
            <h1 className="text-lg font-semibold text-foreground">Transaction #{code}</h1>
            {summary?.created_at && (
              <div className="text-xs text-muted-foreground">Created {fmtDate(summary.created_at)}</div>
            )}
          </div>
        </header>

        {loading && (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-6 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading transaction…
          </div>
        )}

        {denied && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
            Admin access required.
          </div>
        )}

        {err && !denied && (
          <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
            <AlertTriangle className="mt-0.5 h-4 w-4" /> {err}
          </div>
        )}

        {!loading && !err && !denied && data && (
          <div className="grid gap-4 lg:grid-cols-3">
            <section className="lg:col-span-2 space-y-4">
              {summary && (
                <div className="rounded-lg border border-border bg-card p-4">
                  <h2 className="text-sm font-semibold text-foreground">Summary</h2>
                  <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                    <Stat label="Status" value={summary.status ?? "—"} />
                    <Stat label="Money" value={summary.money_status ?? "—"} />
                    <Stat label="Dispute" value={summary.dispute_status ?? "—"} />
                    <Stat
                      label="Amount"
                      value={
                        summary.amount != null
                          ? formatMoney(Number(summary.amount), summary.currency_code ?? "NGN")
                          : "—"
                      }
                    />
                    <Stat label="Buyer" value={summary.buyer_name ?? "—"} />
                    <Stat label="Seller" value={summary.seller_name ?? "—"} />
                  </dl>
                </div>
              )}

              <div className="rounded-lg border border-border bg-card p-4">
                <h2 className="text-sm font-semibold text-foreground">Timeline</h2>
                <ul className="mt-3 space-y-3 text-sm">
                  {(data.timeline ?? []).length === 0 && (
                    <li className="text-muted-foreground">No events recorded.</li>
                  )}
                  {(data.timeline ?? []).map((e: any, i: number) => (
                    <li key={i} className="border-l-2 border-border pl-3">
                      <div className="text-[11px] text-muted-foreground">
                        {fmtDate(e.at)} · {e.kind}
                      </div>
                      <div className="text-foreground">
                        {e.from ? <><span className="text-muted-foreground">{e.from}</span> → </> : null}
                        <span className="font-medium">{e.to}</span>
                      </div>
                      {e.note && <div className="text-xs text-muted-foreground">{e.note}</div>}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-lg border border-border bg-card p-4">
                <h2 className="text-sm font-semibold text-foreground">Escrow Ledger</h2>
                <div className="mt-3 overflow-x-auto rounded-md border border-border">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/40 text-muted-foreground">
                      <tr>
                        <th className="p-2 text-left">Date</th>
                        <th className="p-2 text-left">Type</th>
                        <th className="p-2 text-right">Amount</th>
                        <th className="p-2 text-left">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data.ledger ?? []).length === 0 && (
                        <tr><td colSpan={4} className="p-3 text-center text-muted-foreground">No ledger entries.</td></tr>
                      )}
                      {(data.ledger ?? []).map((r: any) => (
                        <tr key={r.id} className="border-t border-border">
                          <td className="p-2 align-top">{fmtDate(r.created_at)}</td>
                          <td className="p-2 align-top">{r.entry_type}</td>
                          <td className="p-2 text-right align-top tabular-nums">
                            {formatMoney(Number(r.amount), r.currency_code)}
                          </td>
                          <td className="p-2 align-top text-muted-foreground">{r.notes ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            <aside className="space-y-4">
              <div className="rounded-lg border border-border bg-card p-4">
                <h2 className="text-sm font-semibold text-foreground">Messages</h2>
                <ul className="mt-3 space-y-2 text-sm">
                  {(data.messages ?? []).length === 0 && (
                    <li className="text-muted-foreground">No messages.</li>
                  )}
                  {(data.messages ?? []).map((m: any) => (
                    <li key={m.id} className="rounded-md border border-border bg-muted/30 p-2">
                      <div className="text-[11px] text-muted-foreground">{fmtDate(m.created_at)}</div>
                      <div className="text-foreground">{m.message_text}</div>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-lg border border-border bg-card p-4">
                <h2 className="text-sm font-semibold text-foreground">Internal Notes</h2>
                <ul className="mt-3 space-y-2 text-sm">
                  {(data.notes ?? []).length === 0 && (
                    <li className="text-muted-foreground">No notes.</li>
                  )}
                  {(data.notes ?? []).map((n: any) => (
                    <li key={n.id} className="rounded-md border border-border bg-muted/30 p-2">
                      <div className="text-[11px] text-muted-foreground">{fmtDate(n.created_at)}</div>
                      <div className="text-foreground">{n.note ?? n.body ?? n.text}</div>
                    </li>
                  ))}
                </ul>
              </div>
            </aside>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-foreground">{value}</dd>
    </div>
  );
}