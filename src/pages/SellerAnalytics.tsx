import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/components/ui/use-toast";
import {
  Loader2, Download, Info, ShieldCheck, Wallet, AlertTriangle,
  PackageOpen, Plus, BadgeCheck,
} from "lucide-react";
import {
  Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { SellerNav } from "@/components/seller/SellerNav";
import { Footer } from "@/components/landing/Footer";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchSellerAnalytics,
  type AnalyticsPeriod,
  type SellerAnalyticsData,
} from "@/services/seller-analytics.service";

const NGN = (v: number | null) =>
  v === null || v === undefined
    ? "—"
    : new Intl.NumberFormat("en-NG", {
        style: "currency",
        currency: "NGN",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(v);

const PCT = (v: number | null) => (v === null || v === undefined ? "—" : `${v.toFixed(1)}%`);

function csvEscape(v: unknown) {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(data: SellerAnalyticsData) {
  const lines: string[] = [];
  lines.push("Section,Metric,Value");
  const s = data.summary;
  lines.push(`Summary,Seller Net Released,${s.seller_net_released.toFixed(2)}`);
  lines.push(`Summary,Awaiting Release,${s.funds_awaiting_release.toFixed(2)}`);
  lines.push(`Summary,Funds Held in Escrow,${s.funds_held_in_escrow.toFixed(2)}`);
  lines.push(`Summary,Gross Sales,${s.gross_sales.toFixed(2)}`);
  lines.push(`Summary,Fees Deducted,${s.fees_deducted.toFixed(2)}`);
  lines.push(`Summary,Disputed Amount,${s.disputed_amount.toFixed(2)}`);
  lines.push(`Summary,Completed,${s.completed_transactions_count}`);
  lines.push(`Summary,Active,${s.active_transactions_count}`);
  lines.push(`Summary,Open Disputes,${s.open_disputes_count}`);
  lines.push(`Summary,Failed Payouts,${s.failed_payouts_count}`);
  lines.push("");
  lines.push("Revenue Trend,Label,Start,End,Net Released,Gross Sales,Fees,Completed Tx");
  for (const b of data.revenue_trend.data) {
    lines.push([
      "Revenue Trend",
      csvEscape(b.label),
      b.start_date,
      b.end_date,
      b.seller_net_released.toFixed(2),
      b.gross_sales.toFixed(2),
      b.fees_deducted.toFixed(2),
      b.completed_transactions,
    ].join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `seller-analytics-${data.revenue_trend.period}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function SummaryCard({ title, value, helper, tooltip }: {
  title: string; value: string; helper?: string; tooltip?: string;
}) {
  return (
    <Card className="rounded-xl">
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</p>
          {tooltip && (
            <TooltipProvider><UITooltip>
              <TooltipTrigger asChild>
                <Info className="h-3.5 w-3.5 text-muted-foreground/60" />
              </TooltipTrigger>
              <TooltipContent className="max-w-[220px] text-xs">{tooltip}</TooltipContent>
            </UITooltip></TooltipProvider>
          )}
        </div>
        <p className="mt-2 text-2xl font-bold tracking-tight">{value}</p>
        {helper && <p className="mt-1 text-xs text-muted-foreground">{helper}</p>}
      </CardContent>
    </Card>
  );
}

function ProgressCard({ title, value, label, hint }:
  { title: string; value: number | null; label: string; hint?: string }) {
  return (
    <Card className="rounded-xl">
      <CardContent className="pt-5 pb-4">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</p>
        <p className="mt-2 text-xl font-bold">{label}</p>
        <Progress value={value ?? 0} className="mt-2 h-1.5" />
        {hint && <p className="mt-1.5 text-[11px] text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

const SellerAnalytics = () => {
  const { toast } = useToast();
  const [period, setPeriod] = useState<AnalyticsPeriod>("90d");
  const [seller, setSeller] = useState<{ name: string; avatar: string | null }>({ name: "Seller", avatar: null });

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: p } = await supabase
        .from("profiles")
        .select("full_name,avatar_url")
        .eq("id", user.id).maybeSingle();
      if (p) setSeller({ name: p.full_name ?? "Seller", avatar: p.avatar_url });
    })();
  }, []);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["seller-analytics", period],
    queryFn: () => fetchSellerAnalytics({ period, bucket: "weekly" }),
    staleTime: 30_000,
    retry: 1,
  });

  const hasAnyActivity = useMemo(() => {
    if (!data) return false;
    const s = data.summary;
    return (
      s.completed_transactions_count + s.active_transactions_count + s.open_disputes_count > 0 ||
      data.revenue_trend.data.length > 0
    );
  }, [data]);

  const handleExport = () => {
    if (!data) return;
    try {
      downloadCsv(data);
      toast({ title: "Exported", description: "Analytics CSV downloaded." });
    } catch (e) {
      toast({ title: "Export failed", description: "Try again in a moment.", variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SellerNav sellerName={seller.name} avatarUrl={seller.avatar} />

      <main className="flex-1">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-8 space-y-8">
          {/* Header */}
          <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Seller Analytics</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Track your sales, releases, products, and trust performance.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Select value={period} onValueChange={(v) => setPeriod(v as AnalyticsPeriod)}>
                <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="30d">Last 30 days</SelectItem>
                  <SelectItem value="90d">Last 90 days</SelectItem>
                  <SelectItem value="all">All time</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" disabled={!data} onClick={handleExport}>
                <Download className="h-4 w-4 mr-1.5" /> Export CSV
              </Button>
            </div>
          </header>

          {/* Loading */}
          {isLoading && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
              </div>
              <Skeleton className="h-72 rounded-xl" />
              <Skeleton className="h-32 rounded-xl" />
            </div>
          )}

          {/* Error */}
          {isError && !isLoading && (
            <Card className="border-destructive/40 bg-destructive/5">
              <CardContent className="pt-6 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                  <p className="text-sm font-medium">We couldn't load your analytics.</p>
                </div>
                <Button size="sm" onClick={() => refetch()}>Try again</Button>
              </CardContent>
            </Card>
          )}

          {/* Empty state */}
          {data && !isLoading && !hasAnyActivity && (
            <Card className="rounded-xl border-dashed">
              <CardContent className="py-14 flex flex-col items-center text-center gap-4">
                <PackageOpen className="h-10 w-10 text-muted-foreground" />
                <div>
                  <h2 className="text-lg font-semibold">Analytics will appear after your first protected transaction</h2>
                  <p className="mt-1 text-sm text-muted-foreground max-w-md">
                    Create a product listing or protected deal. Once buyers pay and transactions progress, your
                    sales and release insights will appear here.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button asChild><Link to="/seller/storefront/new"><Plus className="h-4 w-4 mr-1.5" /> Create product</Link></Button>
                  <Button asChild variant="outline"><Link to="/seller/transactions/new">Create protected deal</Link></Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Content */}
          {data && !isLoading && hasAnyActivity && (
            <>
              {/* Summary cards */}
              <section className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
                <SummaryCard
                  title="Seller Net Released"
                  value={NGN(data.summary.seller_net_released)}
                  helper="Paid out after fees"
                  tooltip="Total money successfully paid out to you after fees."
                />
                <SummaryCard
                  title="Awaiting Release"
                  value={NGN(data.summary.funds_awaiting_release)}
                  helper="Both parties confirmed"
                  tooltip="SafeDeal reviews releases after both parties confirm."
                />
                <SummaryCard
                  title="Funds Held in Escrow"
                  value={NGN(data.summary.funds_held_in_escrow)}
                  helper="Active protected transactions"
                  tooltip="Payments still secured for ongoing transactions."
                />
                <SummaryCard
                  title="Gross Sales"
                  value={NGN(data.summary.gross_sales)}
                  helper="Before fees"
                  tooltip="Total buyer-paid value before SafeDeal and processing fees."
                />
                <SummaryCard
                  title="Dispute Rate"
                  value={PCT(data.dispute_rate.value)}
                  helper={`${data.dispute_rate.open_disputes} open • ${data.dispute_rate.total_disputes} total`}
                  tooltip="Disputes opened across paid transactions in this window."
                />
                <SummaryCard
                  title="Average Release Time"
                  value={data.average_release_time.hours === null
                    ? data.average_release_time.label
                    : `${data.average_release_time.hours.toFixed(1)} h`}
                  helper={`${data.average_release_time.sample_size} sample${data.average_release_time.sample_size === 1 ? "" : "s"}`}
                  tooltip="Average time from buyer confirmation to successful release."
                />
              </section>

              {/* Revenue trend */}
              <Card className="rounded-xl">
                <CardHeader>
                  <CardTitle className="text-base">Revenue Trend</CardTitle>
                  <CardDescription>Seller net released over time</CardDescription>
                </CardHeader>
                <CardContent className="pl-2 pr-4">
                  {data.revenue_trend.data.length === 0 ? (
                    <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">
                      No released revenue in this window yet.
                    </div>
                  ) : (
                    <div className="h-72 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data.revenue_trend.data} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}>
                          <defs>
                            <linearGradient id="netG" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.45} />
                              <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                            </linearGradient>
                            <linearGradient id="grossG" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="hsl(var(--success))" stopOpacity={0.3} />
                              <stop offset="100%" stopColor="hsl(var(--success))" stopOpacity={0.02} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} tickMargin={6} />
                          <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11}
                            tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
                          <Tooltip
                            contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                            formatter={(v: number) => NGN(v)}
                          />
                          <Legend wrapperStyle={{ fontSize: 12 }} />
                          <Area type="monotone" dataKey="gross_sales" name="Gross Sales"
                            stroke="hsl(var(--success))" fill="url(#grossG)" strokeWidth={1.5} />
                          <Area type="monotone" dataKey="seller_net_released" name="Seller Net Released"
                            stroke="hsl(var(--primary))" fill="url(#netG)" strokeWidth={2} />
                          <Area type="monotone" dataKey="fees_deducted" name="Fees Deducted"
                            stroke="hsl(var(--muted-foreground))" fill="transparent" strokeWidth={1.25} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Transaction Health */}
              <section>
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                  Transaction Health
                </h2>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <ProgressCard
                    title="Completion Rate"
                    value={data.completion_rate.value}
                    label={PCT(data.completion_rate.value)}
                    hint={`${data.completion_rate.completed_count} of ${data.completion_rate.paid_transaction_count} paid`}
                  />
                  <ProgressCard
                    title="Dispute-Free Rate"
                    value={data.trust_metrics.dispute_free_rate * 100}
                    label={`${(data.trust_metrics.dispute_free_rate * 100).toFixed(1)}%`}
                  />
                  <ProgressCard
                    title="On-Time Dispatch"
                    value={data.trust_metrics.on_time_dispatch_rate}
                    label={data.trust_metrics.on_time_dispatch_rate === null ? "—" : `${data.trust_metrics.on_time_dispatch_rate.toFixed(1)}%`}
                  />
                  <ProgressCard
                    title="Response Time"
                    value={null}
                    label={data.trust_metrics.response_time_hours === null ? "—" : `${data.trust_metrics.response_time_hours.toFixed(1)} h`}
                  />
                </div>
              </section>

              {/* Top products */}
              <section>
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                  Top Products
                </h2>
                {data.top_products.length === 0 ? (
                  <Card className="rounded-xl border-dashed">
                    <CardContent className="py-8 text-center text-sm text-muted-foreground">
                      Top products appear once buyers complete protected transactions for your listings.
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {data.top_products.map((p) => (
                      <Card key={p.product_id} className="rounded-xl overflow-hidden">
                        <CardContent className="p-4 flex gap-3">
                          <div className="w-16 h-16 rounded-md bg-muted flex-shrink-0 overflow-hidden">
                            {p.image_url
                              ? <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                              : <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">No image</div>}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold truncate">{p.name}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {p.completed_transactions} completed
                            </p>
                            <div className="mt-1.5 text-xs grid grid-cols-2 gap-1">
                              <span className="text-muted-foreground">Gross</span>
                              <span className="text-right font-medium">{NGN(p.gross_sales)}</span>
                              <span className="text-muted-foreground">Net</span>
                              <span className="text-right font-medium">{NGN(p.seller_net_released)}</span>
                            </div>
                            <Badge variant={p.current_stock > 5 ? "secondary" : "outline"} className="mt-2 text-[10px]">
                              {p.current_stock} in stock
                            </Badge>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </section>

              {/* Release performance */}
              <Card className="rounded-xl">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Wallet className="h-4 w-4 text-primary" /> Release Performance
                  </CardTitle>
                  <CardDescription>SafeDeal reviews releases after both parties confirm.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Awaiting Release</p>
                      <p className="text-lg font-bold">{NGN(data.summary.funds_awaiting_release)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Average Release Time</p>
                      <p className="text-lg font-bold">
                        {data.average_release_time.hours === null
                          ? "—"
                          : `${data.average_release_time.hours.toFixed(1)} h`}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Paid Out</p>
                      <p className="text-lg font-bold">{data.summary.completed_transactions_count}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Failed Release</p>
                      <p className="text-lg font-bold">{data.summary.failed_payouts_count}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Trust performance */}
              <Card className="rounded-xl">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-primary" /> Seller Trust Performance
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Rating</p>
                      <p className="font-bold">
                        {data.trust_metrics.seller_rating === null ? "—" : `${data.trust_metrics.seller_rating}/5`}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Completed Deals</p>
                      <p className="font-bold">{data.trust_metrics.completed_deals}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Identity Verified</p>
                      <p className="font-bold flex items-center gap-1">
                        {data.trust_metrics.identity_verified
                          ? <><BadgeCheck className="h-4 w-4 text-success" /> Yes</>
                          : "No"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Payout Verified</p>
                      <p className="font-bold flex items-center gap-1">
                        {data.trust_metrics.payout_verified
                          ? <><BadgeCheck className="h-4 w-4 text-success" /> Yes</>
                          : "No"}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {isFetching && (
                <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin" /> Refreshing…
                </div>
              )}
            </>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default SellerAnalytics;
