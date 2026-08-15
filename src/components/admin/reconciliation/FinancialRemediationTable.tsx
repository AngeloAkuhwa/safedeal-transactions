import { Fragment, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/format";
import type { RemediationReport, RemediationRow } from "@/services/admin-reconciliation.service";

/**
 * Financial remediation report — current value vs calculated value vs
 * difference, with the cause and the recommended action for every finding.
 * Read-only: remediation is performed through the existing escrow tools so
 * every correction stays audited.
 */
export function FinancialRemediationTable({
  report,
  loading,
}: {
  report: RemediationReport | undefined;
  loading: boolean;
}) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState<string | null>(null);

  const rows = useMemo<RemediationRow[]>(() => report?.rows ?? [], [report]);
  const summary = report?.summary;

  if (loading) {
    return <Card className="p-8 text-sm text-muted-foreground">Loading remediation report…</Card>;
  }

  return (
    <div className="space-y-4">
      {summary && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <SummaryTile label="Reconciled" value={summary.reconciled} tone="ok" />
          <SummaryTile label="Pending settlement" value={summary.pending_settlement} tone="muted" />
          <SummaryTile label="Mismatch" value={summary.mismatch} tone="bad" />
          <SummaryTile label="Requires review" value={summary.requires_review} tone="warn" />
        </div>
      )}

      <Card className="p-0 overflow-hidden">
        {rows.length === 0 ? (
          <div className="p-8 text-sm text-muted-foreground">
            No financial discrepancies. Every transaction's ledger balance matches its calculated balance.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm sd-stack">
              <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-3 w-8" />
                  <th className="p-3">Transaction</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Current (ledger)</th>
                  <th className="p-3 text-right">Calculated</th>
                  <th className="p-3 text-right">Difference</th>
                  <th className="p-3">Findings</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const open = expanded === r.transaction_id;
                  return (
                    <Fragment key={r.transaction_id}>
                      <tr className="border-t border-border/60">
                        <td className="p-3 align-top">
                          <button
                            type="button"
                            aria-label={open ? "Collapse findings" : "Expand findings"}
                            onClick={() => setExpanded(open ? null : r.transaction_id)}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </button>
                        </td>
                        <td className="p-3 font-mono text-xs align-top">{r.transaction_code}</td>
                        <td className="p-3 align-top">
                          {r.status === "mismatch"
                            ? <Badge variant="destructive">Mismatch</Badge>
                            : <Badge variant="secondary">Requires review</Badge>}
                        </td>
                        <td className="p-3 text-right align-top">{formatMoney(r.ledger_balance, r.currency)}</td>
                        <td className="p-3 text-right align-top">{formatMoney(r.expected_balance, r.currency)}</td>
                        <td className={`p-3 text-right align-top font-medium ${r.difference === 0 ? "" : "text-destructive"}`}>
                          {formatMoney(r.difference, r.currency)}
                        </td>
                        <td className="p-3 align-top text-xs text-muted-foreground">
                          {r.findings.length} finding{r.findings.length === 1 ? "" : "s"}
                        </td>
                        <td className="p-3 align-top">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate(`/admin/transactions/${r.transaction_id}`)}
                          >
                            <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Open
                          </Button>
                        </td>
                      </tr>
                      {open && (
                        <tr className="bg-muted/20">
                          <td />
                          <td colSpan={7} className="p-3">
                            <div className="space-y-3">
                              <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-5">
                                <Metric label="Captured" value={formatMoney(r.captured, r.currency)} />
                                <Metric label="Escrowed" value={formatMoney(r.escrowed, r.currency)} />
                                <Metric label="Released" value={formatMoney(r.released, r.currency)} />
                                <Metric label="Refunded" value={formatMoney(r.refunded, r.currency)} />
                                <Metric label="Remaining" value={formatMoney(r.remaining, r.currency)} />
                              </div>
                              {r.findings.map((f) => (
                                <div key={f.key} className="rounded-md border border-border/60 p-3">
                                  <p className="text-sm font-medium">{f.label}</p>
                                  <p className="text-xs text-muted-foreground mt-1">Cause: {f.cause}</p>
                                  <p className="text-xs text-muted-foreground mt-0.5">Recommended action: {f.action}</p>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function SummaryTile({ label, value, tone }: { label: string; value: number; tone: "ok" | "bad" | "warn" | "muted" }) {
  const toneClass =
    tone === "bad" ? "text-destructive"
      : tone === "warn" ? "text-amber-500"
      : tone === "ok" ? "text-emerald-500"
      : "text-muted-foreground";
  return (
    <Card className="p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-xl font-semibold mt-1 ${toneClass}`}>{value}</p>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}