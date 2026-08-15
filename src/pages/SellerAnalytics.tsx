import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/components/ui/use-toast";
import {
  Loader2, Download, Info, ShieldCheck, AlertTriangle, PackageOpen, Plus,
  CheckCircle2, Truck, Clock, Star, ArrowUp, ArrowDown, CreditCard, XCircle,
  Hourglass, ChevronRight, LineChart as LineChartIcon, Package,
} from "lucide-react";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
  type AnalyticsBucket,
  type SellerAnalyticsData,
} from "@/services/seller-analytics.service";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";

/* ---------- Helpers ---------- */

const NGN = (v: number | null) =>
  v === null || v === undefined ? "—" : formatMoney(v, "NGN");

const PCT = (v: number | null, d = 1) =>
  v === null || v === undefined ? "—" : `${v.toFixed(d)}%`;

const bucketForPeriod = (p: AnalyticsPeriod): AnalyticsBucket =>
  p === "30d" ? "daily" : p === "90d" ? "weekly" : "monthly";

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduced;
}

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
      "Revenue Trend", csvEscape(b.label), b.start_date, b.end_date,
      b.seller_net_released.toFixed(2), b.gross_sales.toFixed(2),
      b.fees_deducted.toFixed(2), b.completed_transactions,
    ].join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `seller-analytics-${data.revenue_trend.period}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

/* ---------- Sub-components ---------- */

type ChipTone = "success" | "warning" | "danger" | "info" | "muted";
const chipToneClass: Record<ChipTone, string> = {
  success: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  warning: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  danger: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300",
  info: "bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300",
  muted: "bg-muted text-muted-foreground",
};

function TrendChip({ tone, icon, children }: { tone: ChipTone; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1 rounded-full px-1.5 py-px text-xs font-semibold leading-tight",
      chipToneClass[tone],
    )}>
      {icon}
      {children}
    </span>
  );
}

function KpiCard({
  to, ariaLabel, title, value, valueClass, helper, tooltip, chip,
  index, animate,
}: {
  to: string; ariaLabel: string;
  title: string; value: string; valueClass?: string;
  helper?: string; tooltip: string; chip?: React.ReactNode;
  index: number; animate: boolean;
}) {
  return (
    <div
      className={cn("group relative h-full", animate && "animate-fade-in")}
      style={animate ? { animationDelay: `${index * 50}ms`, animationFillMode: "both" } : undefined}
    >
      {/* Plain container + stretched link: one tab stop for the card, and the
          "More info" button stays a valid, reachable sibling; a button
          nested inside an anchor is invalid HTML and doubles every tab stop. */}
      <Card className="relative rounded-lg h-full transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-primary/40 group-hover:shadow-sm">
        <CardContent className="p-2.5 sm:p-3">
          <div className="flex items-start justify-between gap-1.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide leading-tight">
              <Link
                to={to}
                aria-label={ariaLabel}
                className="after:absolute after:inset-0 after:content-[''] rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {title}
              </Link>
            </p>
            <div className="flex items-center gap-0.5 shrink-0">
              <TooltipProvider delayDuration={150}><UITooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label="More info"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    className="relative z-10 text-muted-foreground/60 hover:text-foreground transition-colors inline-flex items-center justify-center before:absolute before:-inset-4 before:content-[''] min-h-11 min-w-11"
                  >
                    <Info className="h-3 w-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[240px] text-xs leading-snug">
                  {tooltip}
                </TooltipContent>
              </UITooltip></TooltipProvider>
              <ChevronRight className="h-3 w-3 text-muted-foreground/40" />
            </div>
          </div>
          <p className={cn("mt-1 text-base sm:text-lg lg:text-xl font-bold tracking-tight tabular-nums break-words leading-tight", valueClass)}>
            {value}
          </p>
          <div className="mt-0.5 flex items-center justify-between gap-1.5 min-h-[14px]">
            {helper ? (
              <p className="text-xs text-muted-foreground leading-snug truncate">{helper}</p>
            ) : <span />}
            {chip}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function HealthCard({
  title, value, tone, icon, barClass, progress, animate, index,
}: {
  title: string; value: string; tone: ChipTone; icon: React.ReactNode;
  barClass: string; progress: number | null;
  animate: boolean; index: number;
}) {
  const valueColor =
    tone === "success" ? "text-emerald-600 dark:text-emerald-400" :
    tone === "info" ? "text-sky-600 dark:text-sky-400" :
    tone === "warning" ? "text-amber-600 dark:text-amber-400" :
    "text-foreground";

  const [width, setWidth] = useState(animate ? 0 : (progress ?? 100));
  useEffect(() => {
    if (!animate) { setWidth(progress ?? 100); return; }
    const t = window.setTimeout(() => setWidth(progress ?? 100), 80 + index * 70);
    return () => window.clearTimeout(t);
  }, [animate, progress, index]);

  return (
    <div
      className={cn(animate && "animate-fade-in")}
      style={animate ? { animationDelay: `${index * 70}ms`, animationFillMode: "both" } : undefined}
    >
      <Card className="rounded-lg">
        <CardContent className="p-2.5 sm:p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold leading-tight">{title}</p>
            <span className={cn("shrink-0", valueColor)}>{icon}</span>
          </div>
          <p className={cn("mt-1.5 text-xl sm:text-2xl font-bold tracking-tight tabular-nums leading-tight", valueColor)}>{value}</p>
          <div className="mt-1.5 h-1 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-[width] duration-700 ease-out", barClass)}
              style={{ width: `${Math.max(0, Math.min(100, width))}%` }}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ReleaseRow({ to, ariaLabel, tone, icon, label, count }: {
  to: string; ariaLabel: string;
  tone: ChipTone; icon: React.ReactNode; label: string; count: number;
}) {
  const bg =
    tone === "warning" ? "bg-amber-50 dark:bg-amber-950/30" :
    tone === "info" ? "bg-sky-50 dark:bg-sky-950/30" :
    tone === "success" ? "bg-emerald-50 dark:bg-emerald-950/30" :
    "bg-muted";
  const fg =
    tone === "warning" ? "text-amber-600 dark:text-amber-400" :
    tone === "info" ? "text-sky-600 dark:text-sky-400" :
    tone === "success" ? "text-emerald-600 dark:text-emerald-400" :
    "text-muted-foreground";
  return (
    <Link
      to={to}
      aria-label={ariaLabel}
      className={cn(
        "flex items-center justify-between rounded-md px-2.5 py-1.5 group transition-all min-h-11",
        "hover:brightness-95 dark:hover:brightness-110 hover:shadow-sm",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        bg,
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className={cn("shrink-0", fg)}>{icon}</span>
        <span className="text-[13px] font-medium truncate leading-tight">{label}</span>
      </div>
      <div className="flex items-center gap-1 shrink-0 ml-2">
        <span className="text-[13px] font-semibold tabular-nums">
          {count} {count === 1 ? "tx" : "tx"}
        </span>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
      </div>
    </Link>
  );
}

function StarRow({ rating }: { rating: number | null }) {
  const r = rating ?? 0;
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex">
        {[1, 2, 3, 4, 5].map((i) => (
          <Star
            key={i}
            className={cn(
              "h-3.5 w-3.5",
              i <= Math.round(r)
                ? "fill-amber-400 text-amber-400"
                : "fill-muted text-muted-foreground/40",
            )}
          />
        ))}
      </div>
      <span className="text-xs font-bold tabular-nums">
        {rating === null ? "—" : `${rating.toFixed(1)}/5`}
      </span>
    </div>
  );
}

function YesNoPill({ ok }: { ok: boolean }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1 rounded-full px-1.5 py-px text-xs font-semibold",
      ok
        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
        : "bg-muted text-muted-foreground",
    )}>
      {ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
      {ok ? "Yes" : "No"}
    </span>
  );
}

/* ---------- Tooltip copy ---------- */

const TT = {
  net: "Total amount successfully paid out to you after SafeDeal and processing fees.",
  awaiting: "Transactions where both sides have confirmed and SafeDeal is preparing release.",
  escrow: "Money currently protected by SafeDeal for active transactions.",
  gross: "Total buyer-paid value before platform and processing fees.",
  dispute: "Percentage of paid transactions that entered dispute.",
  release: "Average time from buyer confirmation to successful release.",
  exportDisabled: "Export becomes available when analytics data exists.",
};

/* ---------- Page ---------- */

const SellerAnalytics = () => {
  const { toast } = useToast();
  const reducedMotion = useReducedMotion();
  const animate = !reducedMotion;
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

  const bucket = bucketForPeriod(period);

  const { data, isLoading, isError, refetch, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ["seller-analytics", period, bucket],
    queryFn: () => fetchSellerAnalytics({ period, bucket }),
    staleTime: 30_000,
    retry: 1,
  });

  const lastUpdatedLabel = useMemo(() => {
    if (!dataUpdatedAt) return null;
    const d = new Date(dataUpdatedAt);
    const today = new Date();
    const sameDay = d.toDateString() === today.toDateString();
    const time = new Intl.DateTimeFormat("en-NG", { hour: "numeric", minute: "2-digit" }).format(d);
    return sameDay
      ? `Last updated: Today, ${time}`
      : `Last updated: ${new Intl.DateTimeFormat("en-NG", { month: "short", day: "numeric" }).format(d)}, ${time}`;
  }, [dataUpdatedAt]);

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
    } catch {
      toast({ title: "Export failed", description: "Try again in a moment.", variant: "destructive" });
    }
  };

  const disputeFreePct = data ? data.trust_metrics.dispute_free_rate * 100 : null;
  const completionPct = data?.completion_rate.value ?? null;
  const onTimePct = data?.trust_metrics.on_time_dispatch_rate ?? null;
  const responseHrs = data?.trust_metrics.response_time_hours ?? null;
  const responseProgress = responseHrs === null ? null : Math.max(0, 100 - Math.min(100, (responseHrs / 24) * 100));

  const showTrustEmpty = data
    ? data.trust_metrics.seller_rating === null && data.trust_metrics.completed_deals < 1
    : false;

  const exportDisabled = !data;

  return (
    <div className="min-h-[100dvh] bg-muted/30 flex flex-col">
      <SellerNav sellerName={seller.name} avatarUrl={seller.avatar} />

      <main className="flex-1">
        <div className="mx-auto w-full max-w-[1400px] px-4 sm:px-6 lg:px-8 py-3 sm:py-4 space-y-3 sm:space-y-3.5">
          {/* Header */}
          <header className={cn("flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between", animate && "animate-fade-in")}>
            <div>
              <h1 className="text-lg sm:text-xl font-bold tracking-tight">Seller Analytics</h1>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Track your sales, releases, products, and trust performance.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              {lastUpdatedLabel && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <span>{lastUpdatedLabel}</span>
                </div>
              )}
              <div className="flex gap-2">
                <Select value={period} onValueChange={(v) => setPeriod(v as AnalyticsPeriod)}>
                  <SelectTrigger className="w-full sm:w-[150px] h-11 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30d">Last 30 days</SelectItem>
                    <SelectItem value="90d">Last 90 days</SelectItem>
                    <SelectItem value="all">All time</SelectItem>
                  </SelectContent>
                </Select>
                <TooltipProvider delayDuration={150}>
                  <UITooltip>
                    <TooltipTrigger asChild>
                      <span
                        role={exportDisabled ? "button" : undefined}
                        aria-disabled={exportDisabled || undefined}
                        aria-label={exportDisabled ? "Export CSV unavailable" : undefined}
                        tabIndex={exportDisabled ? 0 : -1}
                      >
                        <Button
                          size="sm"
                          disabled={exportDisabled}
                          onClick={handleExport}
                          className="shrink-0 h-11 text-xs"
                          aria-label="Export analytics as CSV"
                        >
                          <Download className="h-3.5 w-3.5 mr-1.5" /> Export CSV
                        </Button>
                      </span>
                    </TooltipTrigger>
                    {exportDisabled && (
                      <TooltipContent side="bottom" className="text-xs max-w-[220px]">
                        {TT.exportDisabled}
                      </TooltipContent>
                    )}
                  </UITooltip>
                </TooltipProvider>
              </div>
            </div>
          </header>

          {/* Loading */}
          {isLoading && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[110px] rounded-lg" />)}
              </div>
              <Skeleton className="h-60 rounded-lg" />
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[105px] rounded-lg" />)}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Skeleton className="h-48 rounded-lg" />
                <Skeleton className="h-48 rounded-lg" />
              </div>
            </div>
          )}

          {/* Error */}
          {isError && !isLoading && (
            <Card className="border-destructive/40 bg-destructive/5">
              <CardContent className="py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold">We couldn't load analytics</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Please refresh the page or try again later.
                    </p>
                  </div>
                </div>
                <Button size="sm" onClick={() => refetch()} className="self-start sm:self-auto">Retry</Button>
              </CardContent>
            </Card>
          )}

          {/* Empty */}
          {data && !isLoading && !hasAnyActivity && (
            <Card className="rounded-lg border-dashed">
              <CardContent className="py-10 flex flex-col items-center text-center gap-3">
                <PackageOpen className="h-9 w-9 text-muted-foreground" />
                <div>
                  <h2 className="text-base font-semibold">Analytics will appear after your first protected transaction</h2>
                  <p className="mt-1 text-xs text-muted-foreground max-w-md">
                    Create a product listing or protected deal. Once buyers pay and transactions progress, your
                    sales and release insights will appear here.
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button size="sm" asChild><Link to="/seller/storefront/new"><Plus className="h-4 w-4 mr-1.5" /> Create Product</Link></Button>
                  <Button size="sm" asChild variant="outline"><Link to="/seller/transactions/new">Create Protected Deal</Link></Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Content */}
          {data && !isLoading && hasAnyActivity && (
            <>
              {/* KPI cards: 2 / 3 / 6 columns. Compact ~110-130px. */}
              <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                <KpiCard
                  index={0} animate={animate}
                  to="/seller/payouts?status=completed"
                  ariaLabel="Open payout history"
                  title="Net Released"
                  value={NGN(data.summary.seller_net_released)}
                  helper="After fees"
                  tooltip={TT.net}
                  chip={
                    data.summary.completed_transactions_count > 0 ? (
                      <TrendChip tone="success" icon={<ArrowUp className="h-2.5 w-2.5" />}>
                        {data.summary.completed_transactions_count}
                      </TrendChip>
                    ) : undefined
                  }
                />
                <KpiCard
                  index={1} animate={animate}
                  to="/seller/transactions?filter=awaiting-buyer-review"
                  ariaLabel="Open Awaiting Release transactions"
                  title="Awaiting Release"
                  value={NGN(data.summary.funds_awaiting_release)}
                  valueClass="text-amber-600 dark:text-amber-400"
                  helper="Reviewing"
                  tooltip={TT.awaiting}
                  chip={
                    data.summary.funds_awaiting_release > 0 ? (
                      <TrendChip tone="warning" icon={<Hourglass className="h-2.5 w-2.5" />}>pending</TrendChip>
                    ) : undefined
                  }
                />
                <KpiCard
                  index={2} animate={animate}
                  to="/seller/transactions?filter=processing"
                  ariaLabel="Open active escrow transactions"
                  title="In Escrow"
                  value={NGN(data.summary.funds_held_in_escrow)}
                  valueClass="text-sky-600 dark:text-sky-400"
                  helper="Active protected"
                  tooltip={TT.escrow}
                  chip={
                    data.summary.active_transactions_count > 0 ? (
                      <TrendChip tone="info" icon={<ShieldCheck className="h-2.5 w-2.5" />}>
                        {data.summary.active_transactions_count}
                      </TrendChip>
                    ) : undefined
                  }
                />
                <KpiCard
                  index={3} animate={animate}
                  to="/seller/transactions"
                  ariaLabel="Open all transactions"
                  title="Gross Sales"
                  value={NGN(data.summary.gross_sales)}
                  helper="Before fees"
                  tooltip={TT.gross}
                />
                <KpiCard
                  index={4} animate={animate}
                  to="/seller/disputes"
                  ariaLabel="Open seller disputes"
                  title="Dispute Rate"
                  value={PCT(data.dispute_rate.value)}
                  valueClass="text-red-600 dark:text-red-400"
                  helper={`${data.dispute_rate.open_disputes} open`}
                  tooltip={TT.dispute}
                  chip={
                    data.dispute_rate.open_disputes > 0 ? (
                      <TrendChip tone="danger" icon={<ArrowDown className="h-2.5 w-2.5" />}>watch</TrendChip>
                    ) : undefined
                  }
                />
                <KpiCard
                  index={5} animate={animate}
                  to="/seller/payouts"
                  ariaLabel="Open release performance detail"
                  title="Avg Release"
                  value={data.average_release_time.hours === null
                    ? data.average_release_time.label
                    : `${data.average_release_time.hours.toFixed(1)}h`}
                  helper="Confirm → release"
                  tooltip={TT.release}
                />
              </section>

              {/* Revenue trend */}
              <Card
                className={cn("rounded-lg", animate && "animate-fade-in")}
                style={animate ? { animationDelay: "300ms", animationFillMode: "both" } : undefined}
              >
                <CardContent className="p-3 sm:p-4">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-2.5">
                    <div>
                      <h2 className="text-sm font-semibold leading-tight">Revenue Trend</h2>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Seller net released over time
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2.5 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-sky-500" /> Net Released
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-muted-foreground/50" /> Gross Sales
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-amber-500" /> Fees
                      </span>
                    </div>
                  </div>
                  {data.revenue_trend.data.length === 0 ? (
                    <div className="h-40 sm:h-44 rounded-md border border-dashed bg-muted/20 flex flex-col items-center justify-center text-center gap-1.5 px-4">
                      <LineChartIcon className="h-6 w-6 text-muted-foreground/60" />
                      <div>
                        <p className="text-xs font-medium">No released revenue in this window yet.</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Completed payouts will appear here once funds are released.
                        </p>
                      </div>
                      <Button asChild size="sm" variant="outline" className="mt-1 h-11 text-xs">
                        <Link to="/seller/transactions">View transactions</Link>
                      </Button>
                    </div>
                  ) : (
                    <div className="h-48 sm:h-56 lg:h-60 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data.revenue_trend.data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                          <defs>
                            <linearGradient id="netG" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                              <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                          <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={12} tickMargin={6} />
                          <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12}
                            tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
                          <Tooltip
                            contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                            formatter={(v: number) => NGN(v)}
                          />
                          <Area type="monotone" dataKey="seller_net_released" name="Seller Net Released"
                            stroke="hsl(var(--primary))" fill="url(#netG)" strokeWidth={2.25}
                            isAnimationActive={animate} animationDuration={900} />
                          <Area type="monotone" dataKey="gross_sales" name="Gross Sales"
                            stroke="hsl(var(--muted-foreground))" fill="transparent" strokeWidth={1.25}
                            strokeDasharray="4 4"
                            isAnimationActive={animate} animationDuration={900} />
                          <Area type="monotone" dataKey="fees_deducted" name="Fees Deducted"
                            stroke="#f59e0b" fill="transparent" strokeWidth={1.25}
                            isAnimationActive={animate} animationDuration={900} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Health */}
              <section className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                <HealthCard
                  index={0} animate={animate}
                  title="Completion Rate"
                  value={PCT(completionPct)}
                  tone="success"
                  icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                  barClass="bg-emerald-500"
                  progress={completionPct}
                />
                <HealthCard
                  index={1} animate={animate}
                  title="Dispute-Free"
                  value={`${(data.trust_metrics.dispute_free_rate * 100).toFixed(1)}%`}
                  tone="info"
                  icon={<ShieldCheck className="h-3.5 w-3.5" />}
                  barClass="bg-sky-500"
                  progress={disputeFreePct}
                />
                <HealthCard
                  index={2} animate={animate}
                  title="On-Time Dispatch"
                  value={onTimePct === null ? "—" : `${onTimePct.toFixed(1)}%`}
                  tone="warning"
                  icon={<Truck className="h-3.5 w-3.5" />}
                  barClass="bg-amber-500"
                  progress={onTimePct}
                />
                <HealthCard
                  index={3} animate={animate}
                  title="Response Time"
                  value={responseHrs === null ? "—" : `${responseHrs.toFixed(1)}h`}
                  tone="muted"
                  icon={<Clock className="h-3.5 w-3.5" />}
                  barClass="bg-foreground/70"
                  progress={responseProgress}
                />
              </section>

              {/* Top Products + Release Performance */}
              <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Top Products */}
                <Card className="rounded-lg">
                  <CardContent className="p-3 sm:p-4">
                    <h2 className="text-sm font-semibold mb-2">Top Products</h2>
                    {data.top_products.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-5 text-center">
                        Top products appear once buyers complete protected transactions.
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        {data.top_products.map((p, i) => {
                          const stockTone: ChipTone =
                            p.current_stock === 0 ? "danger" :
                            p.current_stock <= 5 ? "warning" : "success";
                          const stockLabel =
                            p.current_stock === 0 ? "Out" :
                            p.current_stock <= 5 ? `${p.current_stock} left` :
                            `${p.current_stock} in stock`;
                          return (
                            <Link
                              key={p.product_id}
                              to={`/seller/storefront/${p.product_id}`}
                              aria-label={`View analytics for ${p.name}`}
                              className={cn(
                                "flex gap-2 rounded-md border bg-card p-2 group transition-all min-h-11",
                                "hover:bg-muted/40 hover:border-primary/30 hover:shadow-sm",
                                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                animate && "animate-fade-in",
                              )}
                              style={animate ? { animationDelay: `${i * 50}ms`, animationFillMode: "both" } : undefined}
                            >
                              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded bg-muted shrink-0 overflow-hidden flex items-center justify-center">
                                {p.image_url ? (
                                  <img
                                    src={p.image_url}
                                    alt={p.name}
                                    loading="lazy"
                                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                                  />
                                ) : (
                                  <Package className="h-4 w-4 text-muted-foreground/60" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-2">
                                  <p className="text-[13px] font-semibold truncate leading-tight">{p.name}</p>
                                  <TrendChip tone={stockTone}>{stockLabel}</TrendChip>
                                </div>
                                <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0 text-xs leading-snug">
                                  <span className="text-muted-foreground">
                                    {p.completed_transactions} completed
                                  </span>
                                  <span className="text-muted-foreground">
                                    Gross <span className="text-foreground tabular-nums">{NGN(p.gross_sales)}</span>
                                  </span>
                                  <span className="text-muted-foreground">
                                    Net <span className="font-semibold text-sky-600 dark:text-sky-400 tabular-nums">{NGN(p.seller_net_released)}</span>
                                  </span>
                                </div>
                              </div>
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Release Performance */}
                <Card className="rounded-lg">
                  <CardContent className="p-3 sm:p-4">
                    <h2 className="text-sm font-semibold mb-2">Release Performance</h2>
                    <div className="space-y-1.5">
                      <ReleaseRow
                        to="/seller/transactions?filter=awaiting-buyer-review"
                        ariaLabel="Open Awaiting Release transactions"
                        tone="warning"
                        icon={<Hourglass className="h-3.5 w-3.5" />}
                        label="Awaiting Release"
                        count={data.summary.funds_awaiting_release > 0 ? Math.max(1, Math.round(data.summary.active_transactions_count / 2)) : 0}
                      />
                      <ReleaseRow
                        to="/seller/transactions?filter=payment-pending"
                        ariaLabel="Open Payment Processing transactions"
                        tone="info"
                        icon={<CreditCard className="h-3.5 w-3.5" />}
                        label="Payment Processing"
                        count={data.summary.active_transactions_count}
                      />
                      <ReleaseRow
                        to="/seller/payouts?status=completed"
                        ariaLabel="Open payout history"
                        tone="success"
                        icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                        label="Paid Out"
                        count={data.summary.completed_transactions_count}
                      />
                      <ReleaseRow
                        to="/seller/payouts?status=failed"
                        ariaLabel="Open failed payout issues"
                        tone="muted"
                        icon={<XCircle className="h-3.5 w-3.5" />}
                        label="Failed Release"
                        count={data.summary.failed_payouts_count}
                      />
                    </div>
                    <div className="mt-2.5 flex items-start gap-1.5 rounded-md bg-primary/5 border border-primary/20 px-2.5 py-1.5">
                      <Info className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                      <p className="text-xs text-muted-foreground leading-snug">
                        Releases process only after both confirmations or SafeDeal review.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </section>

              {/* Trust Performance */}
              <Card className="rounded-lg">
                <CardContent className="p-3 sm:p-4">
                  <h2 className="text-sm font-semibold mb-2">Seller Trust Performance</h2>
                  <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 items-center">
                    <div className="divide-y divide-border">
                      <div className="flex items-center justify-between py-1.5">
                        <span className="text-xs text-muted-foreground">Rating</span>
                        <StarRow rating={data.trust_metrics.seller_rating} />
                      </div>
                      <div className="flex items-center justify-between py-1.5">
                        <span className="text-xs text-muted-foreground">Completed Deals</span>
                        <span className="text-xs font-bold tabular-nums">{data.trust_metrics.completed_deals}</span>
                      </div>
                      <div className="flex items-center justify-between py-1.5">
                        <span className="text-xs text-muted-foreground">Identity Verified</span>
                        <YesNoPill ok={data.trust_metrics.identity_verified} />
                      </div>
                      <div className="flex items-center justify-between py-1.5">
                        <span className="text-xs text-muted-foreground">Payout Verified</span>
                        <YesNoPill ok={data.trust_metrics.payout_verified} />
                      </div>
                      <div className="flex items-center justify-between py-1.5">
                        <span className="text-xs text-muted-foreground">Dispute-Free Rate</span>
                        <span className="text-xs font-bold text-sky-600 dark:text-sky-400 tabular-nums">
                          {(data.trust_metrics.dispute_free_rate * 100).toFixed(1)}%
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-center md:justify-end">
                      {showTrustEmpty ? (
                        <div className="rounded-lg border bg-muted/30 px-4 py-3 text-center min-w-[120px]">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Trust Score</p>
                          <p className="mt-0.5 text-xs font-medium">Not enough data yet</p>
                        </div>
                      ) : (
                        <div
                          className={cn(
                            "relative flex flex-col items-center justify-center w-20 h-20 sm:w-24 sm:h-24 rounded-full border-[3px] border-sky-200 dark:border-sky-900 bg-sky-50/50 dark:bg-sky-950/20 transition-all duration-700",
                            animate && "animate-scale-in",
                          )}
                        >
                          <span className="text-2xl font-bold text-sky-600 dark:text-sky-400 tabular-nums leading-none">
                            {data.trust_metrics.seller_rating === null ? "—" : data.trust_metrics.seller_rating.toFixed(1)}
                          </span>
                          <span className="text-xs text-muted-foreground mt-1">Trust Score</span>
                          {data.trust_metrics.identity_verified && data.trust_metrics.payout_verified && (
                            <span className="absolute -bottom-2 inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-xs font-semibold px-1.5 py-px border border-emerald-200 dark:border-emerald-900">
                              <ShieldCheck className="h-2.5 w-2.5" /> Verified
                            </span>
                          )}
                        </div>
                      )}
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
