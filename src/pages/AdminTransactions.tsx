import { useMemo, useState } from "react";
import {
  RefreshCw,
  Download,
  Search,
  SlidersHorizontal,
  Eye,
  MoreVertical,
  Snowflake,
  Flame,
  Flag,
  ShieldAlert,
  MessageSquare,
  ArrowLeftRight,
  Receipt,
  Banknote,
  Landmark,
  Scale,
  Clock,
  LineChart,
  User,
  Home,
  Menu,
  ShieldCheck,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AdminReadingModeControl } from "@/components/admin/AdminReadingModeControl";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatMoney, formatMoneyCompact } from "@/lib/format";
import { toast } from "@/hooks/use-toast";

/* ---------------- Mock data (temporary; structured for future API) ---------------- */

type TxStatus =
  | "completed"
  | "awaiting_payment"
  | "in_dispute"
  | "pending_verification"
  | "frozen"
  | "pending_review"
  | "refunded"
  | "failed"
  | "overdue";

type EscrowState = "released" | "held" | "refunded" | "frozen" | "pending";
type FlagKind = "clean" | "escalated" | "high_risk" | "fraud_watch";

interface AdminTxRow {
  id: string;
  code: string;
  date_iso: string;
  item_name: string;
  item_category: string;
  buyer_name: string;
  seller_name: string;
  amount: number;
  protection_fee: number;
  currency: "NGN";
  status: TxStatus;
  status_sub?: string;
  escrow: EscrowState;
  flag: FlagKind;
  last_activity_label: string;
  last_activity_tone?: "muted" | "warn" | "danger";
}

const MOCK_TXS: AdminTxRow[] = [
  {
    id: "1",
    code: "TXN-2024-001247",
    date_iso: "2024-01-15",
    item_name: 'MacBook Pro 16" M2',
    item_category: "Electronics",
    buyer_name: "John Smith",
    seller_name: "TechStore Inc",
    amount: 2_499_000,
    protection_fee: 74_970,
    currency: "NGN",
    status: "completed",
    status_sub: "Payment Confirmed",
    escrow: "released",
    flag: "clean",
    last_activity_label: "2 hours ago",
    last_activity_tone: "muted",
  },
  {
    id: "2",
    code: "TXN-2024-001246",
    date_iso: "2024-01-15",
    item_name: "Vintage Guitar Collection",
    item_category: "Musical Instruments",
    buyer_name: "Mike Johnson",
    seller_name: "MusicMaster",
    amount: 5_200_000,
    protection_fee: 156_000,
    currency: "NGN",
    status: "in_dispute",
    status_sub: "Buyer Claim Filed",
    escrow: "held",
    flag: "escalated",
    last_activity_label: "45 min ago",
    last_activity_tone: "warn",
  },
  {
    id: "3",
    code: "TXN-2024-001245",
    date_iso: "2024-01-14",
    item_name: "Luxury Watch - Rolex",
    item_category: "Luxury Goods",
    buyer_name: "Sarah Chen",
    seller_name: "WatchDealer99",
    amount: 12_500_000,
    protection_fee: 375_000,
    currency: "NGN",
    status: "pending_verification",
    status_sub: "Awaiting Seller Action",
    escrow: "held",
    flag: "high_risk",
    last_activity_label: "3 days overdue",
    last_activity_tone: "danger",
  },
  {
    id: "4",
    code: "TXN-2024-001244",
    date_iso: "2024-01-14",
    item_name: "Gaming Console Bundle",
    item_category: "Electronics",
    buyer_name: "Alex Turner",
    seller_name: "GameZone Pro",
    amount: 850_000,
    protection_fee: 25_500,
    currency: "NGN",
    status: "frozen",
    status_sub: "Payout Blocked",
    escrow: "held",
    flag: "fraud_watch",
    last_activity_label: "5 hours ago",
    last_activity_tone: "muted",
  },
  {
    id: "5",
    code: "TXN-2024-001243",
    date_iso: "2024-01-14",
    item_name: "iPhone 15 Pro Max",
    item_category: "Electronics",
    buyer_name: "Emma Davis",
    seller_name: "MobileMart",
    amount: 1_199_000,
    protection_fee: 35_970,
    currency: "NGN",
    status: "pending_review",
    escrow: "released",
    flag: "clean",
    last_activity_label: "1 day ago",
    last_activity_tone: "muted",
  },
  {
    id: "6",
    code: "TXN-2024-001242",
    date_iso: "2024-01-13",
    item_name: "Designer Handbag - LV",
    item_category: "Fashion",
    buyer_name: "Lisa Park",
    seller_name: "LuxBags",
    amount: 3_400_000,
    protection_fee: 102_000,
    currency: "NGN",
    status: "refunded",
    status_sub: "Buyer Refunded",
    escrow: "refunded",
    flag: "clean",
    last_activity_label: "2 days ago",
    last_activity_tone: "muted",
  },
  {
    id: "7",
    code: "TXN-2024-001241",
    date_iso: "2024-01-13",
    item_name: "Camera DSLR Kit",
    item_category: "Photography",
    buyer_name: "Tom Wilson",
    seller_name: "PhotoPro",
    amount: 1_850_000,
    protection_fee: 55_500,
    currency: "NGN",
    status: "failed",
    status_sub: "Card Declined",
    escrow: "pending",
    flag: "clean",
    last_activity_label: "3 days ago",
    last_activity_tone: "muted",
  },
];

const SUMMARY_TILES = [
  { key: "total_tx", icon: Receipt, label: "Total Transactions", value: "24,583", subtitle: null, iconCls: "bg-blue-500/15 text-blue-400" },
  { key: "total_amount", icon: Banknote, label: "Total Amount", value: formatMoneyCompact(2_400_000_000), exact: formatMoney(2_400_000_000), iconCls: "bg-emerald-500/15 text-emerald-400" },
  { key: "in_escrow", icon: Landmark, label: "In Escrow", value: formatMoneyCompact(124_000_000), exact: formatMoney(124_000_000), iconCls: "bg-purple-500/15 text-purple-400" },
  { key: "in_dispute", icon: Scale, label: "In Dispute", value: "23", subtitle: null, iconCls: "bg-orange-500/15 text-orange-400" },
  { key: "awaiting", icon: Clock, label: "Awaiting Action", value: "47", subtitle: null, iconCls: "bg-yellow-500/15 text-yellow-400" },
  { key: "flagged", icon: Flag, label: "Flagged", value: "12", subtitle: null, iconCls: "bg-red-500/15 text-red-400" },
];

const QUICK_FILTERS = [
  { key: "all", label: "All" },
  { key: "awaiting_payment", label: "Awaiting Payment" },
  { key: "funds_held", label: "Funds Held" },
  { key: "in_dispute", label: "In Dispute" },
  { key: "overdue", label: "Overdue" },
  { key: "refunded", label: "Refunded" },
  { key: "failed", label: "Failed" },
];

/* ---------------- Visual helpers ---------------- */

const STATUS_BADGE: Record<TxStatus, { label: string; cls: string }> = {
  completed: { label: "Completed", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  awaiting_payment: { label: "Awaiting Payment", cls: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30" },
  in_dispute: { label: "In Dispute", cls: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
  pending_verification: { label: "Pending Verification", cls: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30" },
  frozen: { label: "Frozen", cls: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30" },
  pending_review: { label: "Pending Review", cls: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30" },
  refunded: { label: "Refunded", cls: "bg-muted text-muted-foreground border-border" },
  failed: { label: "Failed", cls: "bg-red-500/15 text-red-400 border-red-500/30" },
  overdue: { label: "Overdue", cls: "bg-red-500/15 text-red-400 border-red-500/30" },
};

const ESCROW_BADGE: Record<EscrowState, { label: string; cls: string }> = {
  released: { label: "Released", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  held: { label: "Held", cls: "bg-purple-500/15 text-purple-300 border-purple-500/30" },
  refunded: { label: "Refunded", cls: "bg-muted text-muted-foreground border-border" },
  frozen: { label: "Frozen", cls: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30" },
  pending: { label: "Pending", cls: "bg-muted text-muted-foreground border-border" },
};

const FLAG_BADGE: Record<FlagKind, { label: string; cls: string; icon?: typeof Flag }> = {
  clean: { label: "Clean", cls: "bg-muted text-muted-foreground border-border" },
  escalated: { label: "Escalated", cls: "bg-orange-500/15 text-orange-300 border-orange-500/30", icon: Flag },
  high_risk: { label: "High Risk", cls: "bg-red-500/15 text-red-400 border-red-500/30", icon: ShieldAlert },
  fraud_watch: { label: "Fraud Watch", cls: "bg-red-500/15 text-red-400 border-red-500/30", icon: Flame },
};

function Badge({ label, cls, Icon }: { label: string; cls: string; Icon?: typeof Flag }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-semibold ${cls}`}>
      {Icon ? <Icon className="h-3 w-3" /> : null}
      {label}
    </span>
  );
}

/* ---------------- Page ---------------- */

const SIDEBAR_BADGES = {
  disputes: 12,
  identity: 8,
  payouts: 3,
  flagged_users: 0,
  exports: 0,
} as const;

export default function AdminTransactions() {
  const navigate = useNavigate();
  const [activeQuick, setActiveQuick] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return MOCK_TXS.filter((t) => {
      if (q) {
        const hay = `${t.code} ${t.item_name} ${t.buyer_name} ${t.seller_name}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      switch (activeQuick) {
        case "all":
          return true;
        case "awaiting_payment":
          return t.status === "awaiting_payment";
        case "funds_held":
          return t.escrow === "held";
        case "in_dispute":
          return t.status === "in_dispute";
        case "overdue":
          return t.last_activity_tone === "danger";
        case "refunded":
          return t.status === "refunded";
        case "failed":
          return t.status === "failed";
        default:
          return true;
      }
    });
  }, [activeQuick, search]);

  const handleRefresh = () => toast({ title: "Refreshed", description: "Transaction monitor reloaded." });
  const handleExport = () => toast({ title: "Export queued", description: "Your export will appear in /admin/exports when ready." });
  const handleRowAction = (label: string, code: string) =>
    toast({ title: label, description: `${code} — coming soon` });

  return (
    <AdminLayout
      title="Transaction Monitor"
      subtitle="Monitor and investigate all platform transactions"
      badges={SIDEBAR_BADGES}
      headerSlot={
        <div className="sticky top-0 z-30 hidden border-b border-border bg-background/85 backdrop-blur lg:block">
          <div className="flex items-center justify-between gap-4 px-8 py-4">
            <div className="flex min-w-0 items-center gap-4">
              <div>
                <h1 className="text-xl font-semibold leading-tight text-foreground">Transaction Monitor</h1>
                <p className="text-xs text-muted-foreground">Monitor and investigate all platform transactions</p>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-400">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                Live
              </span>
            </div>
            <div className="flex items-center gap-2">
              <AdminReadingModeControl variant="desktop" />
              <ThemeToggle />
              <button
                type="button"
                onClick={handleExport}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-muted/60 px-3.5 py-2 text-sm text-foreground transition-colors hover:bg-muted"
              >
                <Download className="h-4 w-4" />
                Export
              </button>
              <button
                type="button"
                onClick={handleRefresh}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-500"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </button>
            </div>
          </div>
        </div>
      }
      mobileHeaderSlot={({ onOpenMenu }) => (
        <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur lg:hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <button
              type="button"
              onClick={onOpenMenu}
              aria-label="Open menu"
              className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-foreground/90 hover:bg-muted/70"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1 text-center">
              <div className="truncate text-sm font-semibold leading-tight text-foreground">Transaction Monitor</div>
              <div className="inline-flex items-center gap-1.5 text-[10px] font-medium text-emerald-400">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                Live
              </div>
            </div>
            <button
              type="button"
              onClick={handleRefresh}
              aria-label="Refresh"
              className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-foreground/90 hover:bg-muted/70"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </header>
      )}
    >

      {/* Summary KPI cards */}
      <TooltipProvider delayDuration={150}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {SUMMARY_TILES.map((t, i) => {
            const Icon = t.icon;
            const card = (
              <div
                key={t.key}
                className={`sd-fade-in-stagger sd-delay-${Math.min(i + 1, 6)} rounded-xl border border-border bg-card p-3 transition-all hover:-translate-y-0.5 hover:border-foreground/10`}
              >
                <div className={`mb-2 flex h-9 w-9 items-center justify-center rounded-lg ${t.iconCls}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="text-[11px] text-muted-foreground">{t.label}</div>
                <div className="mt-0.5 truncate text-lg font-semibold tracking-tight text-foreground">{t.value}</div>
              </div>
            );
            if ("exact" in t && t.exact) {
              return (
                <Tooltip key={t.key}>
                  <TooltipTrigger asChild>{card}</TooltipTrigger>
                  <TooltipContent>{t.exact}</TooltipContent>
                </Tooltip>
              );
            }
            return card;
          })}
        </div>
      </TooltipProvider>

      {/* Quick filter chips */}
      <div className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1 animate-fade-in">
        {QUICK_FILTERS.map((f) => {
          const active = activeQuick === f.key;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setActiveQuick(f.key)}
              className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                active
                  ? "border-blue-500/40 bg-blue-500/15 text-blue-300"
                  : "border-border bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Search + filters panel */}
      <div className="rounded-xl border border-border bg-card p-3 animate-fade-in">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search transaction code, buyer, seller, or item..."
              className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-blue-500/40"
            />
          </div>

          <div className="hidden gap-2 lg:flex">
            <Select label="All Statuses" />
            <Select label="All Amounts" />
          </div>

          <button
            type="button"
            onClick={() => setFiltersOpen((s) => !s)}
            className="inline-flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/60 px-3 py-2 text-sm text-foreground hover:bg-muted lg:hidden"
          >
            <span className="inline-flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4" /> Filters
            </span>
          </button>
        </div>

        <div
          className={`mt-3 flex-wrap gap-2 ${filtersOpen ? "flex" : "hidden"} lg:flex`}
        >
          <Select label="Money Status" />
          <Select label="Dispute Status" />
          <Select label="Risk Level" />
          <input
            type="date"
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
          />
          <button
            type="button"
            onClick={() => {
              setActiveQuick("all");
              setSearch("");
            }}
            className="ml-auto rounded-lg border border-border bg-muted/60 px-3 py-2 text-sm text-foreground hover:bg-muted"
          >
            Clear Filters
          </button>
        </div>
      </div>

      {/* Desktop table */}
      <div className="hidden rounded-xl border border-border bg-card lg:block">
        <div className="flex items-center justify-between border-b border-border p-3">
          <h3 className="text-sm font-semibold text-foreground">Transactions</h3>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span>Last updated: 2 minutes ago</span>
            <span className="inline-flex items-center gap-1.5 text-emerald-400">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> Live sync
            </span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2 text-left font-semibold">Transaction</th>
                <th className="px-3 py-2 text-left font-semibold">Item</th>
                <th className="px-3 py-2 text-left font-semibold">Parties</th>
                <th className="px-3 py-2 text-left font-semibold">Amount</th>
                <th className="px-3 py-2 text-left font-semibold">Status</th>
                <th className="px-3 py-2 text-left font-semibold">Escrow</th>
                <th className="px-3 py-2 text-left font-semibold">Flags</th>
                <th className="px-3 py-2 text-left font-semibold">Last Activity</th>
                <th className="px-3 py-2 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-10 text-center text-sm text-muted-foreground">
                    No transactions match the current filters.
                  </td>
                </tr>
              ) : (
                filtered.map((t, i) => (
                  <tr
                    key={t.id}
                    className={`sd-fade-in-stagger sd-delay-${Math.min(i + 1, 6)} border-b border-border/60 transition-colors hover:bg-muted/40`}
                  >
                    <td className="px-3 py-3 align-top">
                      <div className="flex items-start gap-2">
                        {t.flag === "fraud_watch" || t.status === "frozen" ? (
                          <Snowflake className="mt-0.5 h-3.5 w-3.5 text-cyan-400" />
                        ) : null}
                        <div>
                          <div className="font-medium text-foreground">#{t.code}</div>
                          <div className="text-xs text-muted-foreground">{formatDate(t.date_iso)}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div className="font-medium text-foreground">{t.item_name}</div>
                      <div className="text-xs text-muted-foreground">{t.item_category}</div>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div className="text-xs">
                        <span className="text-muted-foreground">Buyer:</span>{" "}
                        <span className="text-foreground">{t.buyer_name}</span>
                      </div>
                      <div className="text-xs">
                        <span className="text-muted-foreground">Seller:</span>{" "}
                        <span className="text-foreground">{t.seller_name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div className="font-semibold text-foreground tabular-nums">{formatMoney(t.amount, t.currency)}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {t.status === "completed" ? "Fee:" : "Protection Fee:"} {formatMoney(t.protection_fee, t.currency)}
                      </div>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <Badge label={STATUS_BADGE[t.status].label} cls={STATUS_BADGE[t.status].cls} />
                      {t.status_sub ? (
                        <div className="mt-1 text-[11px] text-muted-foreground">{t.status_sub}</div>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 align-top">
                      <Badge label={ESCROW_BADGE[t.escrow].label} cls={ESCROW_BADGE[t.escrow].cls} />
                    </td>
                    <td className="px-3 py-3 align-top">
                      <Badge label={FLAG_BADGE[t.flag].label} cls={FLAG_BADGE[t.flag].cls} Icon={FLAG_BADGE[t.flag].icon} />
                    </td>
                    <td className="px-3 py-3 align-top">
                      <span
                        className={`text-xs ${
                          t.last_activity_tone === "danger"
                            ? "text-red-400"
                            : t.last_activity_tone === "warn"
                              ? "text-orange-300"
                              : "text-muted-foreground"
                        }`}
                      >
                        {t.last_activity_label}
                      </span>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div className="flex items-center justify-end gap-1.5 text-muted-foreground">
                        <IconBtn label="View" onClick={() => handleRowAction("View transaction", t.code)}>
                          <Eye className="h-4 w-4" />
                        </IconBtn>
                        {t.flag !== "clean" || t.status === "in_dispute" ? (
                          <>
                            <IconBtn label="Notes" onClick={() => handleRowAction("Open notes", t.code)}>
                              <MessageSquare className="h-4 w-4" />
                            </IconBtn>
                            <IconBtn label="Trace funds" onClick={() => handleRowAction("Trace funds", t.code)}>
                              <ArrowLeftRight className="h-4 w-4" />
                            </IconBtn>
                            <IconBtn label="Freeze" onClick={() => handleRowAction("Freeze transaction", t.code)}>
                              <Snowflake className="h-4 w-4" />
                            </IconBtn>
                          </>
                        ) : null}
                        <IconBtn label="More" onClick={() => handleRowAction("More actions", t.code)}>
                          <MoreVertical className="h-4 w-4" />
                        </IconBtn>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile card list */}
      <div className="space-y-3 lg:hidden pb-20">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-sm font-semibold text-foreground">Recent Transactions</h3>
          <span className="text-[11px] text-muted-foreground">Updated 2m ago</span>
        </div>
        {filtered.length === 0 ? (
          <div className="rounded-xl border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
            No transactions match.
          </div>
        ) : (
          filtered.map((t, i) => (
            <article
              key={t.id}
              className={`sd-fade-in-stagger sd-delay-${Math.min(i + 1, 6)} rounded-xl border border-border bg-card p-3`}
            >
              <header className="flex items-start justify-between">
                <div className="flex items-start gap-2">
                  {t.flag === "fraud_watch" || t.status === "frozen" ? (
                    <Snowflake className="mt-0.5 h-3.5 w-3.5 text-cyan-400" />
                  ) : null}
                  <div>
                    <div className="text-sm font-semibold text-foreground">#{t.code}</div>
                    <div className="text-[11px] text-muted-foreground">{formatDate(t.date_iso)}</div>
                  </div>
                </div>
                <Badge label={STATUS_BADGE[t.status].label} cls={STATUS_BADGE[t.status].cls} />
              </header>

              <div className="mt-2">
                <div className="text-sm font-medium text-foreground">{t.item_name}</div>
                <div className="text-[11px] text-muted-foreground">{t.item_category}</div>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2 border-t border-border pt-2 text-[11px]">
                <div>
                  <div className="text-muted-foreground">Buyer</div>
                  <div className="truncate text-foreground">{t.buyer_name}</div>
                </div>
                <div className="text-right">
                  <div className="text-muted-foreground">Seller</div>
                  <div className="truncate text-foreground">{t.seller_name}</div>
                </div>
              </div>

              {(t.flag !== "clean" || t.escrow === "held" || t.escrow === "frozen") && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-border pt-2">
                  {t.escrow !== "pending" && t.escrow !== "released" && (
                    <Badge label={ESCROW_BADGE[t.escrow].label} cls={ESCROW_BADGE[t.escrow].cls} />
                  )}
                  {t.flag !== "clean" && (
                    <Badge label={FLAG_BADGE[t.flag].label} cls={FLAG_BADGE[t.flag].cls} Icon={FLAG_BADGE[t.flag].icon} />
                  )}
                </div>
              )}

              <div className="mt-2 flex items-end justify-between border-t border-border pt-2">
                <div>
                  <div className="text-base font-semibold text-foreground tabular-nums">
                    {formatMoney(t.amount, t.currency)}
                  </div>
                  <div className={`text-[11px] ${t.last_activity_tone === "danger" ? "text-red-400" : "text-muted-foreground"}`}>
                    {t.status === "completed" ? "Fee" : "Protection"}: {formatMoney(t.protection_fee, t.currency)}
                  </div>
                  {t.last_activity_tone === "danger" ? (
                    <div className="mt-0.5 text-[11px] text-red-400">{t.last_activity_label}</div>
                  ) : null}
                </div>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <IconBtn label="View" onClick={() => handleRowAction("View transaction", t.code)}>
                    <Eye className="h-4 w-4 text-blue-400" />
                  </IconBtn>
                  <IconBtn label="More" onClick={() => handleRowAction("More actions", t.code)}>
                    <MoreVertical className="h-4 w-4" />
                  </IconBtn>
                </div>
              </div>
            </article>
          ))
        )}
      </div>

      {/* Mobile bottom navigation */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 backdrop-blur lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="grid grid-cols-4">
          <BottomNav active label="Transactions" Icon={Receipt} onClick={() => {}} />
          <BottomNav label="Disputes" Icon={Scale} badge={SIDEBAR_BADGES.disputes} onClick={() => navigate("/admin/dashboard")} />
          <BottomNav label="Dashboard" Icon={LineChart} onClick={() => navigate("/admin/dashboard")} />
          <BottomNav label="Profile" Icon={User} onClick={() => toast({ title: "Profile", description: "Coming soon" })} />
        </div>
      </nav>
    </AdminLayout>
  );
}

/* ---------------- Tiny inline subcomponents ---------------- */

function Select({ label }: { label: string }) {
  return (
    <select
      defaultValue=""
      className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-blue-500/50 focus:outline-none"
    >
      <option value="">{label}</option>
    </select>
  );
}

function IconBtn({ children, onClick, label }: { children: React.ReactNode; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="rounded-md p-1.5 transition-colors hover:bg-muted hover:text-foreground"
    >
      {children}
    </button>
  );
}

function BottomNav({
  Icon,
  label,
  active,
  badge,
  onClick,
}: {
  Icon: typeof Home;
  label: string;
  active?: boolean;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors ${
        active ? "text-blue-400" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      <Icon className="h-5 w-5" />
      {label}
      {badge && badge > 0 ? (
        <span className="absolute right-[28%] top-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-orange-500 px-1 text-[9px] font-bold text-white">
          {badge}
        </span>
      ) : null}
    </button>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-NG", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return iso;
  }
}
