import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { getAdminTransactionDetail, type AdminTxDetail } from "@/services/admin-transaction-actions.service";
import { formatMoney } from "@/lib/format";

type Section = "timeline" | "ledger" | "messages";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transactionId: string | null;
  transactionCode: string;
  section: Section;
}

const TITLES: Record<Section, string> = {
  timeline: "Transaction Timeline",
  ledger: "Escrow Ledger",
  messages: "Transaction Messages",
};

function fmtDate(iso: string) { try { return new Date(iso).toLocaleString("en-NG"); } catch { return iso; } }

export function DetailDrawer({ open, onOpenChange, transactionId, transactionCode, section }: Props) {
  const [data, setData] = useState<AdminTxDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !transactionId) return;
    setLoading(true); setErr(null);
    getAdminTransactionDetail(transactionId, [section])
      .then(setData)
      .catch((e) => setErr((e as Error).message ?? "Failed to load"))
      .finally(() => setLoading(false));
  }, [open, transactionId, section]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{TITLES[section]} <span className="text-muted-foreground">· #{transactionCode}</span></SheetTitle>
        </SheetHeader>
        <div className="mt-4 text-sm">
          {loading && (<div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>)}
          {err && <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-red-400">{err}</div>}
          {!loading && !err && data && section === "timeline" && (
            <ul className="space-y-3">
              {(data.timeline ?? []).length === 0 && (<li className="text-muted-foreground">No events recorded.</li>)}
              {(data.timeline ?? []).map((e: any, i: number) => (
                <li key={e.id ?? i} className="border-l-2 border-border pl-3">
                  <div className="text-xs text-muted-foreground">{fmtDate(e.at)} · {e.type ?? e.kind}</div>
                  <div className="text-foreground"><span className="font-medium">{e.title ?? e.to}</span></div>
                  {(e.description ?? e.note) && <div className="text-xs text-muted-foreground">{e.description ?? e.note}</div>}
                </li>
              ))}
            </ul>
          )}
          {!loading && !err && data && section === "ledger" && (
            <div className="space-y-2">
              {(((data as any).escrow?.ledger ?? data.ledger) ?? []).length === 0 && (<div className="text-muted-foreground">No ledger entries.</div>)}
              <div className="rounded-md border border-border">
                <table className="w-full text-xs sd-stack">
                  <thead className="bg-muted/40 text-muted-foreground"><tr><th className="p-2 text-left">Date</th><th className="p-2 text-left">Type</th><th className="p-2 text-right">Amount</th><th className="p-2 text-left">Notes</th></tr></thead>
                  <tbody>
                    {(((data as any).escrow?.ledger ?? data.ledger) ?? []).map((r: any) => (
                      <tr key={r.id} className="border-t border-border">
                        <td className="p-2 align-top">{fmtDate(r.at ?? r.created_at)}</td>
                        <td className="p-2 align-top">{r.entryType ?? r.entry_type}</td>
                        <td className="p-2 text-right align-top tabular-nums">{formatMoney(Number(r.amount), r.currency ?? r.currency_code)}</td>
                        <td className="p-2 align-top text-muted-foreground">{r.notes ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground">Read-only on the monitor screen.</p>
            </div>
          )}
          {!loading && !err && data && section === "messages" && (
            <ul className="space-y-2">
              {(data.messages ?? []).length === 0 && (<li className="text-muted-foreground">No messages.</li>)}
              {(data.messages ?? []).map((m: any) => (
                <li key={m.id} className="rounded-md border border-border bg-muted/30 p-2">
                  <div className="text-xs text-muted-foreground">{fmtDate(m.created_at)}</div>
                  <div className="text-foreground">{m.message_text}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}