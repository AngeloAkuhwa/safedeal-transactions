import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { Play, RefreshCw } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { formatMoneyOrDash } from "@/lib/payment/money-format";
import { formatMoney } from "@/lib/format";
import { FinancialRemediationTable } from "@/components/admin/reconciliation/FinancialRemediationTable";
import {
  fetchReconciliationOverview,
  triggerReconciliationRun,
  type ReconciliationOverview,
  type CoverageRow,
} from "@/services/admin-reconciliation.service";

function coverageFor(rows: CoverageRow[], state: CoverageRow["snapshot_state"], field: keyof CoverageRow): number {
  const r = rows.find((x) => x.snapshot_state === state);
  return r ? Number(r[field] ?? 0) : 0;
}

function totalCount(rows: CoverageRow[], field: keyof CoverageRow): number {
  return rows.reduce((acc, r) => acc + Number(r[field] ?? 0), 0);
}

function pct(n: number, d: number): string {
  if (!d) return "—";
  return `${((n / d) * 100).toFixed(1)}%`;
}

export default function AdminReconciliation() {
  const navigate = useNavigate();
  const [data, setData] = useState<ReconciliationOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchReconciliationOverview();
      setData(res);
    } catch (e) {
      toast({ title: "Failed to load", description: String(e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const runNow = async () => {
    setRunning(true);
    try {
      const r = await triggerReconciliationRun(24);
      toast({ title: "Reconciliation run", description: `Considered ${r.considered}, drift ${r.drift_count}` });
      await load();
    } catch (e) {
      toast({ title: "Run failed", description: String(e), variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  const coverage = data?.coverage ?? [];
  const total30 = totalCount(coverage, "last_30d_count");
  const complete30 = coverageFor(coverage, "snapshot_complete", "last_30d_count");
  const missing30 = coverageFor(coverage, "snapshot_missing", "last_30d_count");
  const totalAll = totalCount(coverage, "total_count");
  const completeAll = coverageFor(coverage, "snapshot_complete", "total_count");

  const phase7Ready = totalAll > 0 && completeAll === totalAll;

  const drift = data?.drift ?? [];
  const audit = data?.pricing_audit ?? [];

  const statusBadge = (s: string) => {
    if (s === "drift") return <Badge variant="destructive">Drift</Badge>;
    if (s === "missing_ledger") return <Badge variant="destructive">Missing ledger</Badge>;
    if (s === "missing_pricing") return <Badge variant="secondary">Missing pricing</Badge>;
    return <Badge variant="outline">OK</Badge>;
  };

  const snapshotBadge = (s: string) => {
    if (s === "snapshot_complete") return <Badge variant="outline">Complete</Badge>;
    return <Badge variant="destructive">Missing</Badge>;
  };

  return (
    <AdminLayout title="Reconciliation & Pricing Audit" subtitle="Escrow drift + snapshot coverage">
      <div className="space-y-6 p-4 md:p-6">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold">Reconciliation &amp; Pricing Audit</h1>
            <p className="text-sm text-muted-foreground">
              Hourly job compares Paystack collected / paid-out / refunded with the internal escrow ledger.
              {data?.latest_run ? ` Latest run ${new Date(data.latest_run.run_at).toLocaleString()}.` : " No runs yet."}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
            </Button>
            <Button size="sm" onClick={runNow} disabled={running}>
              <Play className="mr-2 h-4 w-4" /> {running ? "Running…" : "Run now (24h)"}
            </Button>
          </div>
        </div>

        <Card className={`p-4 border-l-4 ${phase7Ready ? "border-l-green-500" : "border-l-amber-500"}`}>
          <div className="text-sm font-medium">Canonical snapshot status</div>
          <div className="text-sm text-muted-foreground mt-1">
            {phase7Ready
              ? `Phase 7 complete — canonical snapshot enforced on all ${totalAll} post-payment transactions.`
              : `${completeAll}/${totalAll} post-payment transactions on canonical snapshot. ${missing30 > 0 ? `${missing30} missing in last 30d.` : ""}`}
          </div>
        </Card>

        <Tabs defaultValue="drift">
          <TabsList>
            <TabsTrigger value="remediation">
              Financial remediation ({data?.remediation?.rows.length ?? 0})
            </TabsTrigger>
            <TabsTrigger value="drift">Escrow drift ({drift.length})</TabsTrigger>
            <TabsTrigger value="coverage">Pricing coverage ({audit.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="remediation" className="mt-4">
            <FinancialRemediationTable report={data?.remediation} loading={loading} />
          </TabsContent>

          <TabsContent value="drift" className="mt-4">
            <Card className="p-0 overflow-hidden">
              {loading ? (
                <div className="p-8 text-sm text-muted-foreground">Loading…</div>
              ) : drift.length === 0 ? (
                <div className="p-8 text-sm text-muted-foreground">
                  No drift in the latest run. {data?.latest_run ? "Ledger and Paystack agree." : "Trigger a run to populate."}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm sd-stack">
                    <thead className="bg-muted/50 text-left">
                      <tr>
                        <th className="p-2">Tx</th>
                        <th className="p-2">Status</th>
                        <th className="p-2 text-right">Collected</th>
                        <th className="p-2 text-right">Paid out</th>
                        <th className="p-2 text-right">Refunded</th>
                        <th className="p-2 text-right">Ledger</th>
                        <th className="p-2 text-right">Expected</th>
                        <th className="p-2 text-right">Delta</th>
                        <th className="p-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {drift.map((r) => (
                        <tr key={r.id} className="border-t">
                          <td className="p-2 font-mono text-xs">{r.transaction_code ?? r.transaction_id.slice(0, 8)}</td>
                          <td className="p-2">{statusBadge(r.status)}</td>
                          <td className="p-2 text-right">{formatMoneyOrDash(r.paystack_collected, r.currency_code)}</td>
                          <td className="p-2 text-right">{formatMoneyOrDash(r.paystack_paid_out, r.currency_code)}</td>
                          <td className="p-2 text-right">{formatMoneyOrDash(r.paystack_refunded, r.currency_code)}</td>
                          <td className="p-2 text-right">{formatMoneyOrDash(r.ledger_balance, r.currency_code)}</td>
                          <td className="p-2 text-right">{formatMoneyOrDash(r.expected_ledger_balance, r.currency_code)}</td>
                          <td className={`p-2 text-right font-medium ${Math.abs(r.delta) >= 0.01 ? "text-destructive" : ""}`}>
                            {formatMoneyOrDash(r.delta, r.currency_code)}
                          </td>
                          <td className="p-2 text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => navigate(`/admin/transactions/${r.transaction_id}`)}
                            >
                              Open
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="coverage" className="mt-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Card className="p-4">
                <div className="text-xs text-muted-foreground">Complete (all-time)</div>
                <div className="text-2xl font-semibold">{completeAll}</div>
                <div className="text-xs text-muted-foreground">{pct(completeAll, totalAll)} of {totalAll}</div>
              </Card>
              <Card className="p-4">
                <div className="text-xs text-muted-foreground">Complete (30d)</div>
                <div className="text-2xl font-semibold">{complete30}</div>
                <div className="text-xs text-muted-foreground">{pct(complete30, total30)} of {total30}</div>
              </Card>
              <Card className="p-4">
                <div className="text-xs text-muted-foreground">Missing (30d)</div>
                <div className="text-2xl font-semibold">{missing30}</div>
              </Card>
            </div>

            <Card className="p-0 overflow-hidden">
              {loading ? (
                <div className="p-8 text-sm text-muted-foreground">Loading…</div>
              ) : audit.length === 0 ? (
                <div className="p-8 text-sm text-muted-foreground">All post-payment transactions have a complete canonical snapshot.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm sd-stack">
                    <thead className="bg-muted/50 text-left">
                      <tr>
                        <th className="p-2">Tx</th>
                        <th className="p-2">Money status</th>
                        <th className="p-2">Snapshot</th>
                        <th className="p-2">Model version</th>
                        <th className="p-2">Created</th>
                        <th className="p-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {audit.map((r) => (
                        <tr key={r.transaction_id} className="border-t">
                          <td className="p-2 font-mono text-xs">{r.transaction_code}</td>
                          <td className="p-2">{r.money_status}</td>
                          <td className="p-2">{snapshotBadge(r.snapshot_state)}</td>
                          <td className="p-2 text-xs">{r.pricing_model_version ?? "—"}</td>
                          <td className="p-2 text-xs">{new Date(r.created_at).toLocaleDateString()}</td>
                          <td className="p-2 text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => navigate(`/admin/transactions/${r.transaction_id}`)}
                            >
                              Open
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}