import { useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ShieldCheck, Lock } from "lucide-react";
import { formatMoney } from "@/lib/format";
import type { AdminTxLockedAgreement } from "@/services/admin-transaction-detail.service";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  agreement: AdminTxLockedAgreement | null;
  transactionCode: string;
}

const titleCase = (s?: string | null) =>
  (s ?? "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export function AgreementPreviewDialog({ open, onOpenChange, agreement, transactionCode }: Props) {
  useEffect(() => {
    if (!open) return;
    const blockKeys = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "p" || e.key === "P" || e.key === "s" || e.key === "S")) {
        e.preventDefault();
      }
    };
    const blockCtx = (e: MouseEvent) => e.preventDefault();
    const origPrint = window.print;
    window.print = () => {};
    document.addEventListener("keydown", blockKeys);
    document.addEventListener("contextmenu", blockCtx);
    return () => {
      window.print = origPrint;
      document.removeEventListener("keydown", blockKeys);
      document.removeEventListener("contextmenu", blockCtx);
    };
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-3xl max-h-[85vh] overflow-hidden p-0"
        onCopy={(e) => e.preventDefault()}
        onCut={(e) => e.preventDefault()}
        onContextMenu={(e) => e.preventDefault()}
      >
        <DialogHeader className="px-6 pt-6 pb-3 border-b border-border">
          <div className="flex items-center justify-between gap-3">
            <DialogTitle className="text-base">Locked Agreement — #{transactionCode}</DialogTitle>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-400 border border-emerald-500/20">
              <ShieldCheck className="h-3.5 w-3.5" /> Read-only
            </span>
          </div>
        </DialogHeader>
        <div className="relative overflow-y-auto max-h-[70vh] select-none">
          {/* Watermark */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
            style={{
              backgroundImage:
                "repeating-linear-gradient(-30deg, transparent 0 200px, rgba(148,163,184,0.06) 200px 220px)",
            }}
          >
            <div className="rotate-[-30deg] text-center">
              <div className="text-3xl font-black uppercase tracking-widest text-muted-foreground/15">
                SafeDeal Admin Review Only
              </div>
              <div className="mt-2 text-sm font-mono text-muted-foreground/15">#{transactionCode}</div>
            </div>
          </div>

          <div className="relative p-6 space-y-5 text-sm">
            {!agreement ? (
              <div className="rounded-md border border-orange-500/30 bg-orange-500/10 p-4 text-orange-300 text-sm">
                Agreement snapshot missing. Review this transaction for data integrity.
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Lock className="h-3.5 w-3.5" />
                  Locked at {agreement.lockedAt ? new Date(agreement.lockedAt).toLocaleString("en-NG") : "—"}
                </div>

                <Section title="Parties">
                  <Row label="Buyer" value={agreement.buyerName ?? "—"} />
                  <Row label="Seller" value={agreement.sellerName ?? "—"} />
                </Section>

                <Section title="Item">
                  <Row label="Title" value={agreement.item.title ?? "—"} />
                  {agreement.item.description && <Row label="Description" value={agreement.item.description} />}
                  {agreement.item.condition && <Row label="Condition" value={titleCase(agreement.item.condition)} />}
                  {agreement.item.quantity != null && <Row label="Quantity" value={String(agreement.item.quantity)} />}
                </Section>

                <Section title="Money">
                  <Row label="Agreed Price" value={formatMoney(agreement.agreedPrice ?? 0, agreement.currency)} />
                  <Row label="Protection Fee" value={formatMoney(agreement.protectionFee ?? 0, agreement.currency)} />
                  <Row label="Total Charged" value={formatMoney(agreement.total ?? 0, agreement.currency)} bold />
                </Section>

                <Section title="Delivery">
                  <Row label="Method" value={titleCase(agreement.deliveryMethod) || "—"} />
                  <Row
                    label="Verification Window"
                    value={agreement.verificationWindowHours ? `${agreement.verificationWindowHours} hours` : "—"}
                  />
                </Section>

                {(agreement.sellerNotes || agreement.buyerNotes) && (
                  <Section title="Notes">
                    {agreement.sellerNotes && <Row label="Seller Notes" value={agreement.sellerNotes} />}
                    {agreement.buyerNotes && <Row label="Buyer Notes" value={agreement.buyerNotes} />}
                  </Section>
                )}

                {agreement.rules && (
                  <Section title="Rules">
                    <pre className="whitespace-pre-wrap text-xs text-muted-foreground bg-muted/30 rounded p-3">
                      {typeof agreement.rules === "string"
                        ? agreement.rules
                        : JSON.stringify(agreement.rules, null, 2)}
                    </pre>
                  </Section>
                )}

                {(agreement.hash || agreement.version) && (
                  <div className="text-xs text-muted-foreground border-t border-border pt-3 font-mono">
                    {agreement.version && <>v{agreement.version} · </>}
                    {agreement.hash && <>hash: {agreement.hash}</>}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{title}</h3>
      <div className="space-y-1.5 rounded-md border border-border bg-card/50 p-3">{children}</div>
    </div>
  );
}
function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={"text-foreground text-right " + (bold ? "font-semibold" : "")}>{value}</span>
    </div>
  );
}