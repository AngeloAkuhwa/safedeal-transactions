import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import {
  ArrowLeft, Loader2, AlertTriangle, Download, Scale, ShieldAlert,
  ChevronDown, ChevronUp, Snowflake, Search, Flag, MoreVertical, Copy, ExternalLink, ShieldCheck,
  Truck, Package, CreditCard, Lock, Circle, StickyNote, Plus, Pause,
} from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import {
  getAdminTransactionDetail,
  AdminAccessRequiredError,
  type AdminTxDetail,
} from "@/services/admin-transaction-actions.service";
import { formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ActionConfirmDialog } from "@/components/admin/transactions/ActionConfirmDialog";
import { InternalNoteDialog } from "@/components/admin/transactions/InternalNoteDialog";
import { freezeTransaction, addInternalNote } from "@/services/admin-transaction-actions.service";

const ngn = (v: number | string | null | undefined) => {
  if (v == null || v === "") return "—";
  const n = typeof v === "string" ? Number(v) : v;
  if (Number.isNaN(n)) return "—";
  return formatMoney(n, "NGN");
};

const fmtDate = (iso?: string | null) => {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" }); } catch { return iso; }
};

const relTime = (iso?: string | null) => {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
};

// ===== Status label + color =====
const STATUS_META: Record<string, { label: string; cls: string }> = {
  // tx status
  draft: { label: "Draft", cls: "bg-slate-500/15 text-slate-300 border-slate-500/30" },
  awaiting_buyer: { label: "Awaiting Buyer", cls: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30" },
  awaiting_payment: { label: "Awaiting Payment", cls: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30" },
  payment_secured: { label: "Payment Secured", cls: "bg-blue-500/15 text-blue-300 border-blue-500/30" },
  seller_preparing_delivery: { label: "Preparing", cls: "bg-blue-500/15 text-blue-300 border-blue-500/30" },
  seller_dispatched: { label: "Dispatched", cls: "bg-blue-500/15 text-blue-300 border-blue-500/30" },
  delivered_awaiting_verification: { label: "Awaiting Verification", cls: "bg-blue-500/15 text-blue-300 border-blue-500/30" },
  disputed: { label: "In Dispute", cls: "bg-orange-500/15 text-orange-300 border-orange-500/30" },
  resolved: { label: "Resolved", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  completed: { label: "Completed", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  cancelled: { label: "Cancelled", cls: "bg-slate-500/15 text-slate-300 border-slate-500/30" },
  timed_out: { label: "Timed Out", cls: "bg-red-500/15 text-red-300 border-red-500/30" },
  refunded: { label: "Refunded", cls: "bg-slate-500/15 text-slate-300 border-slate-500/30" },
  // money
  not_secured: { label: "Not Secured", cls: "bg-slate-500/15 text-slate-300 border-slate-500/30" },
  payment_pending: { label: "Payment Pending", cls: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30" },
  funds_held_in_escrow: { label: "Held in Escrow", cls: "bg-purple-500/15 text-purple-300 border-purple-500/30" },
  funds_pending_release: { label: "Awaiting Release", cls: "bg-blue-500/15 text-blue-300 border-blue-500/30" },
  funds_releasing: { label: "Releasing", cls: "bg-blue-500/15 text-blue-300 border-blue-500/30" },
  funds_released: { label: "Released", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  funds_frozen: { label: "Frozen", cls: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30" },
  refund_pending: { label: "Refund Pending", cls: "bg-slate-500/15 text-slate-300 border-slate-500/30" },
  refund_issued: { label: "Refunded", cls: "bg-slate-500/15 text-slate-300 border-slate-500/30" },
  // payout
  pending: { label: "Pending", cls: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30" },
  awaiting_release: { label: "Awaiting Release", cls: "bg-blue-500/15 text-blue-300 border-blue-500/30" },
  processing: { label: "Processing", cls: "bg-blue-500/15 text-blue-300 border-blue-500/30" },
  failed: { label: "Failed", cls: "bg-red-500/15 text-red-300 border-red-500/30" },
  reversed: { label: "Reversed", cls: "bg-red-500/15 text-red-300 border-red-500/30" },
  blocked: { label: "Blocked", cls: "bg-red-500/15 text-red-300 border-red-500/30" },
  // dispute
  open: { label: "Open", cls: "bg-orange-500/15 text-orange-300 border-orange-500/30" },
  under_review: { label: "Under Review", cls: "bg-orange-500/15 text-orange-300 border-orange-500/30" },
  none: { label: "None", cls: "bg-slate-500/15 text-slate-300 border-slate-500/30" },
};

function StatusBadge({ value }: { value?: string | null }) {
  if (!value) return <span className="text-muted-foreground text-xs">—</span>;
  const meta = STATUS_META[value] ?? { label: value.replace(/_/g, " "), cls: "bg-slate-500/15 text-slate-300 border-slate-500/30" };
  return (
    <span className={cn("inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium capitalize", meta.cls)}>
      {meta.label}
    </span>
  );
}

function Card({ children, className, accent }: { children: React.ReactNode; className?: string; accent?: "orange" | "red" | "none" }) {
  const accentCls = accent === "orange" ? "border-l-4 border-l-orange-500" : accent === "red" ? "border-l-4 border-l-red-500" : "";
  return (
    <section className={cn("rounded-xl border border-border bg-card", accentCls, className)}>{children}</section>
  );
}

function CardHeader({ title, subtitle, action, defaultOpen = true, collapsibleOnMobile = false, onToggle, open }: any) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3">
      <div>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2">
        {action}
        {collapsibleOnMobile && (
          <button
            type="button"
            onClick={onToggle}
            className="lg:hidden p-1 text-muted-foreground hover:text-foreground"
            aria-label="Toggle section"
          >
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, valueClass }: { label: string; value: React.ReactNode; valueClass?: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</dt>
      <dd className={cn("mt-1 text-sm font-medium text-foreground", valueClass)}>{value ?? "—"}</dd>
    </div>
  );
}

function CollapsibleCard({
  title, subtitle, accent, defaultOpenDesktop = true, defaultOpenMobile = false, action, children,
}: any) {
  const [openMobile, setOpenMobile] = useState<boolean>(defaultOpenMobile);
  return (
    <Card accent={accent}>
      <CardHeader
        title={title}
        subtitle={subtitle}
        action={action}
        collapsibleOnMobile
        open={openMobile}
        onToggle={() => setOpenMobile((v) => !v)}
      />
      <div className={cn("px-4 pb-4", !openMobile && "hidden lg:block")}>{children}</div>
    </Card>
  );
}

function Avatar({ name, src, size = 32 }: { name?: string | null; src?: string | null; size?: number }) {
  const initials = (name ?? "?").split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase();
  return src ? (
    <img src={src} alt={name ?? ""} className="rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <div className="rounded-full bg-muted text-foreground flex items-center justify-center text-xs font-semibold" style={{ width: size, height: size }}>
      {initials}
    </div>
  );
}

const copy = async (val?: string | null) => {
  if (!val) return;
  try { await navigator.clipboard.writeText(val); toast.success("Copied"); } catch { toast.error("Copy failed"); }
};

const TIMELINE_ICONS: Record<string, { Icon: any; cls: string; ring: string }> = {
  admin_action: { Icon: AlertTriangle, cls: "text-red-400", ring: "border-red-500 bg-red-500/15" },
  dispute: { Icon: Scale, cls: "text-orange-400", ring: "border-orange-500 bg-orange-500/15" },
  delivery: { Icon: Package, cls: "text-emerald-400", ring: "border-emerald-500 bg-emerald-500/15" },
  money_status: { Icon: Lock, cls: "text-purple-400", ring: "border-purple-500 bg-purple-500/15" },
  transaction_status: { Icon: Truck, cls: "text-blue-400", ring: "border-blue-500 bg-blue-500/15" },
  event: { Icon: CreditCard, cls: "text-emerald-400", ring: "border-emerald-500 bg-emerald-500/15" },
};
function timelineMeta(kind?: string) {
  return TIMELINE_ICONS[kind ?? ""] ?? { Icon: Circle, cls: "text-slate-400", ring: "border-slate-500 bg-slate-500/15" };
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
  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  const [freezeOpen, setFreezeOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const sections = useMemo(() => [
    "summary", "risk", "dispute", "linked", "items", "delivery", "agreement",
    "timeline", "ledger", "messages", "notes", "audit",
  ], []);

  useEffect(() => {
    if (!transactionId) return;
    setLoading(true); setErr(null); setDenied(false);
    getAdminTransactionDetail(transactionId, sections)
      .then(setData)
      .catch((e) => {
        if (e instanceof AdminAccessRequiredError) setDenied(true);
        else setErr((e as Error).message ?? "Failed to load transaction");
      })
      .finally(() => setLoading(false));
  }, [transactionId, sections, reloadKey]);

  const summary = data?.summary ?? null;
  const dispute = data?.dispute ?? summary?.dispute ?? null;
  const hasDispute = !!dispute && dispute.status !== "closed";
  const code = summary?.transactionCode ?? transactionId?.slice(0, 8);
  const itemTitle = summary?.itemTitle ?? "Transaction";
  const statusLabel = STATUS_META[summary?.status as string]?.label ?? summary?.status ?? "";
  const accent: "orange" | "red" | "none" =
    summary?.moneyStatus === "funds_frozen" ? "red" : hasDispute ? "orange" : "none";

  const exportData = () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `transaction-${code}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  const headerSlot = (
    <header className="sticky top-0 z-30 hidden lg:block border-b border-border bg-background/95 backdrop-blur">
      <div className="flex items-center justify-between gap-4 px-6 py-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => navigate(returnTo)}
            className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
            aria-label="Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-foreground truncate">Transaction #{code}</h1>
            <p className="text-xs text-muted-foreground truncate">
              {itemTitle} {statusLabel ? `— ${statusLabel}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportData}>
            <Download className="h-4 w-4 mr-1.5" /> Export
          </Button>
          {hasDispute && (
            <Button size="sm" className="bg-orange-500 hover:bg-orange-600 text-white" onClick={() => navigate(`/admin/disputes/${dispute.id}`)}>
              <Scale className="h-4 w-4 mr-1.5" /> View Dispute
            </Button>
          )}
        </div>
      </div>
    </header>
  );

  const mobileHeaderSlot = ({ onOpenMenu }: { onOpenMenu: () => void }) => (
    <header className="lg:hidden sticky top-0 z-30 border-b border-border bg-card">
      <div className="flex items-center justify-between px-3 py-2.5">
        <button type="button" onClick={() => navigate(returnTo)} className="p-2 text-muted-foreground" aria-label="Back">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-emerald-500 flex items-center justify-center">
          <ShieldCheck className="h-4 w-4 text-white" />
        </div>
        <button type="button" onClick={onOpenMenu} className="p-2 text-muted-foreground" aria-label="Menu">
          <MoreVertical className="h-4 w-4" />
        </button>
      </div>
    </header>
  );

  const pricing = summary?.pricing ?? {};
  const escrow = summary?.escrow ?? {};
  const buyerTotal = pricing.buyer_total_amount;
  const itemTotal = pricing.item_amount;
  const protectionFee = pricing.platform_fee_amount;
  const sellerNet = pricing.seller_net_amount;
  const heldEscrow = escrow.held_amount;
  const refundedAmt = escrow.refunded_amount;

  return (
    <AdminLayout
      title={`Transaction #${code ?? ""}`}
      subtitle={itemTitle}
      headerSlot={headerSlot}
      mobileHeaderSlot={mobileHeaderSlot}
    >
      {loading && (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-6 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading transaction…
        </div>
      )}

      {denied && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
          Admin access required.
        </div>
      )}

      {err && !denied && (
        <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
          <AlertTriangle className="mt-0.5 h-4 w-4" /> {err}
        </div>
      )}

      {!loading && !err && !denied && data && (
        <div className="space-y-4 pb-28 lg:pb-6">
          {/* Mobile mini transaction header */}
          <div className="lg:hidden px-1">
            <h1 className="text-lg font-semibold text-foreground">#{code}</h1>
            <p className="text-sm text-muted-foreground">{itemTitle}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <StatusBadge value={summary?.status} />
              <StatusBadge value={summary?.moneyStatus} />
              {hasDispute && <StatusBadge value="disputed" />}
              {summary?.deadlineOverdue && (
                <span className="inline-flex items-center rounded-md border border-red-500/30 bg-red-500/15 text-red-300 px-2 py-0.5 text-[11px] font-semibold">Overdue</span>
              )}
            </div>
          </div>

          {/* 1. Summary Header */}
          <Card accent={accent}>
            <div className="p-4 lg:p-5">
              <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                <Stat label="Transaction" value={<><div className="font-semibold">#{code}</div><div className="text-[11px] text-muted-foreground mt-0.5">Created {fmtDate(summary?.createdAt)}</div></>} />
                <Stat label="Last Activity" value={<><div className="font-semibold">{relTime(summary?.lastActivityAt)}</div><div className="text-[11px] text-muted-foreground mt-0.5">{fmtDate(summary?.lastActivityAt)}</div></>} />
                <Stat
                  label="Total Amount"
                  value={<><div className="font-semibold text-base">{ngn(buyerTotal)}</div><div className="text-[11px] text-muted-foreground mt-0.5">Fee: {ngn(protectionFee)}</div></>}
                />
                <Stat label="Payout Status" value={<StatusBadge value={summary?.payoutStatus} />} />
                <Stat label="Payment Provider" value={<><div className="font-semibold capitalize">{summary?.paymentProvider ?? "—"}</div><div className="text-[11px] text-muted-foreground font-mono truncate mt-0.5">{summary?.providerReference ?? "—"}</div></>} />
              </dl>

              <div className="my-4 border-t border-border" />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex items-center gap-3">
                  <Avatar name={summary?.buyer?.name} src={summary?.buyer?.avatarUrl} />
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase text-muted-foreground font-semibold">Buyer</div>
                    <div className="text-sm font-medium text-foreground truncate">{summary?.buyer?.name ?? "—"}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{summary?.buyer?.email ?? ""}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Avatar name={summary?.seller?.name} src={summary?.seller?.avatarUrl} />
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase text-muted-foreground font-semibold">Seller</div>
                    <div className="text-sm font-medium text-foreground truncate">{summary?.seller?.name ?? "—"}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{summary?.seller?.email ?? ""}</div>
                  </div>
                </div>
              </div>

              <div className="my-4 border-t border-border" />

              <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                <Stat label="Transaction Status" value={<StatusBadge value={summary?.status} />} />
                <Stat label="Money Status" value={<StatusBadge value={summary?.moneyStatus} />} />
                <Stat label="Item Total" value={ngn(itemTotal)} />
                <Stat label="Protection Fee" value={ngn(protectionFee)} />
                <Stat label="Total Charged" value={ngn(buyerTotal)} />
                <Stat label="Held in Escrow" value={<span className="text-purple-300 font-semibold">{ngn(heldEscrow)}</span>} />
              </dl>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-border">
                <div className="flex flex-wrap items-center gap-2">
                  {summary?.needsReleaseReview && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-orange-500/15 text-orange-300 border border-orange-500/30 px-2 py-1 text-xs">
                      <Flag className="h-3 w-3" /> {summary.releaseReviewReason ?? "Needs review"}
                    </span>
                  )}
                  {hasDispute && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-orange-500/15 text-orange-300 border border-orange-500/30 px-2 py-1 text-xs">
                      <Scale className="h-3 w-3" /> Dispute {dispute.status?.replace(/_/g, " ")}
                    </span>
                  )}
                </div>
                <div className="hidden lg:flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={exportData}><Download className="h-3.5 w-3.5 mr-1.5" /> Export Data</Button>
                  <Button variant="outline" size="sm"><Search className="h-3.5 w-3.5 mr-1.5" /> Open Investigation</Button>
                  <Button variant="outline" size="sm" onClick={() => setFreezeOpen(true)} disabled={summary?.moneyStatus !== "funds_held_in_escrow"} className="text-red-300 border-red-500/30 hover:bg-red-500/10">
                    <Snowflake className="h-3.5 w-3.5 mr-1.5" /> Freeze Funds
                  </Button>
                  {hasDispute && (
                    <Button size="sm" className="bg-orange-500 hover:bg-orange-600 text-white" onClick={() => navigate(`/admin/disputes/${dispute.id}`)}>
                      <Scale className="h-3.5 w-3.5 mr-1.5" /> Manage Dispute
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </Card>

          {/* High-Risk Banner */}
          {data.risk && (data.risk.level === "high" || data.risk.level === "escalated") && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-red-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <h4 className="text-red-300 font-semibold text-sm mb-2">High Risk{data.risk.level === "escalated" ? " – Escalated" : ""}</h4>
                  <ul className="space-y-1.5">
                    {(data.risk.signals ?? []).map((sig: any, i: number) => (
                      <li key={i} className="text-xs text-foreground/90 flex items-start gap-2">
                        <Flag className="h-3 w-3 text-orange-400 mt-0.5 flex-shrink-0" />
                        <span>{sig.label}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Mobile Quick Actions */}
          <div className="lg:hidden rounded-xl border border-border bg-card p-4">
            <h3 className="text-foreground text-sm font-semibold mb-3">Quick Actions</h3>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => toast.info("Investigation tools coming soon")} className="px-3 py-2.5 bg-blue-500/15 text-blue-300 border border-blue-500/30 rounded-lg text-xs font-medium flex items-center justify-center gap-2">
                <Search className="h-3.5 w-3.5" /> Investigate
              </button>
              <button onClick={() => setFreezeOpen(true)} disabled={summary?.moneyStatus !== "funds_held_in_escrow"} className="px-3 py-2.5 bg-red-500/15 text-red-300 border border-red-500/30 rounded-lg text-xs font-medium flex items-center justify-center gap-2 disabled:opacity-50">
                <Snowflake className="h-3.5 w-3.5" /> Freeze
              </button>
              <button onClick={exportData} className="px-3 py-2.5 bg-muted text-foreground rounded-lg text-xs font-medium flex items-center justify-center gap-2">
                <Download className="h-3.5 w-3.5" /> Export
              </button>
              <button onClick={() => hasDispute ? navigate(`/admin/disputes/${dispute.id}`) : toast.info("No dispute to manage")} className={cn("px-3 py-2.5 rounded-lg text-xs font-medium flex items-center justify-center gap-2", hasDispute ? "bg-orange-500 text-white" : "bg-muted text-muted-foreground")}>
                <Scale className="h-3.5 w-3.5" /> Manage
              </button>
            </div>
          </div>

          {/* 2. Risk & Investigation */}
          {data.risk && (
            <CollapsibleCard title="Risk & Investigation" defaultOpenMobile={data.risk.level !== "clean"}>
              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">Risk Assessment</h3>
                  <div className={cn(
                    "rounded-lg border p-3 flex items-start justify-between gap-3",
                    data.risk.level === "escalated" || data.risk.level === "high"
                      ? "border-red-500/30 bg-red-500/10 text-red-300"
                      : data.risk.level === "elevated"
                      ? "border-yellow-500/30 bg-yellow-500/10 text-yellow-300"
                      : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                  )}>
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="h-4 w-4" />
                      <span className="font-semibold capitalize">{data.risk.level} risk</span>
                    </div>
                    <span className="text-[10px] uppercase tracking-wider font-semibold">{data.risk.level}</span>
                  </div>
                  <ul className="mt-3 space-y-1.5 text-sm">
                    {data.risk.signals?.length ? data.risk.signals.map((s: any, i: number) => (
                      <li key={i} className="flex items-center gap-2 text-foreground">
                        <Flag className="h-3.5 w-3.5 text-orange-400" /> {s.label}
                      </li>
                    )) : <li className="text-muted-foreground text-sm">No risk signals.</li>}
                  </ul>
                </div>
                <div>
                  <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">Investigation Log</h3>
                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    {(data.risk.adminActions ?? []).length === 0 && (
                      <p className="text-sm text-muted-foreground">No admin actions recorded.</p>
                    )}
                    {(data.risk.adminActions ?? []).map((a: any) => (
                      <div key={a.id} className="rounded-md border border-border bg-muted/30 p-2 text-sm">
                        <div className="flex justify-between text-[11px] text-muted-foreground">
                          <span>{fmtDate(a.created_at)}</span>
                          <span className="uppercase tracking-wider">{a.action_type}</span>
                        </div>
                        {a.action_notes && <div className="mt-1 text-foreground">{a.action_notes}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              {!!data.risk.escalationHistory?.length && (
                <div className="mt-4 pt-4 border-t border-border">
                  <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">Escalation History</h3>
                  <ul className="space-y-1.5 text-sm">
                    {data.risk.escalationHistory.map((h: any, i: number) => (
                      <li key={i} className="flex items-start gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-orange-400 mt-2 flex-shrink-0" />
                        <span className="text-[11px] text-muted-foreground whitespace-nowrap">{fmtDate(h.at)}</span>
                        <span className="text-foreground capitalize">{h.label}</span>
                        {h.note && <span className="text-muted-foreground">— {h.note}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CollapsibleCard>
          )}

          {/* 3. Dispute Status (if any) */}
          {hasDispute && (
            <CollapsibleCard title="Dispute Status" defaultOpenMobile>
              <div className="grid gap-3 sm:grid-cols-3">
                <Stat label="Status" value={<StatusBadge value={dispute.status} />} />
                <Stat label="Opened" value={fmtDate(dispute.opened_at)} />
                <Stat label="Seller Response Due" value={fmtDate(dispute.seller_response_due_at)} />
              </div>
              <div className="mt-3">
                <Stat label="Reason" value={<span className="capitalize">{dispute.reason?.replace(/_/g, " ")}</span>} />
                {dispute.description && <p className="mt-1 text-sm text-foreground">{dispute.description}</p>}
              </div>
              {!!(dispute.evidence?.length) && (
                <div className="mt-3">
                  <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Evidence ({dispute.evidence.length})</h4>
                  <ul className="mt-2 grid sm:grid-cols-2 gap-2">
                    {dispute.evidence.map((ev: any) => (
                      <li key={ev.id} className="rounded-md border border-border bg-muted/30 p-2 text-xs">
                        <div className="font-medium text-foreground capitalize">{ev.evidence_type?.replace(/_/g, " ")}</div>
                        <div className="text-muted-foreground">{fmtDate(ev.created_at)} · {ev.submitted_by_role}</div>
                        {ev.notes && <div className="text-foreground mt-1">{ev.notes}</div>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CollapsibleCard>
          )}

          {/* 4. Timeline */}
          <CollapsibleCard title="Complete Transaction Timeline" subtitle="All events, status changes, and interventions">
            {(data.timeline ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No events recorded.</p>
            ) : (
              <div className="relative">
                <div className="absolute left-3 top-2 bottom-2 w-px bg-border" />
                <ul className="space-y-4">
                  {(data.timeline ?? []).map((e: any, i: number) => {
                    const m = timelineMeta(e.kind);
                    return (
                      <li key={i} className="flex gap-3 relative">
                        <div className={cn("relative z-10 flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center", m.ring)}>
                          <m.Icon className={cn("h-3 w-3", m.cls)} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <h4 className="text-sm font-medium text-foreground capitalize truncate">
                              {e.from ? <><span className="text-muted-foreground">{e.from?.replace(/_/g, " ")}</span> → </> : null}
                              {e.to?.replace(/_/g, " ")}
                            </h4>
                            <span className="text-[11px] text-muted-foreground whitespace-nowrap">{fmtDate(e.at)}</span>
                          </div>
                          <p className="text-[11px] text-muted-foreground capitalize">{e.kind?.replace(/_/g, " ")}</p>
                          {e.note && <p className="text-xs text-muted-foreground mt-0.5">{e.note}</p>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </CollapsibleCard>

          {/* 5. Linked Records */}
          {data.linked && (
            <CollapsibleCard title="Linked Records">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border border-border bg-muted/20 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Buyer Profile</div>
                  <div className="flex items-center gap-2">
                    <Avatar name={summary?.buyer?.name} src={summary?.buyer?.avatarUrl} size={28} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{summary?.buyer?.name ?? "—"}</div>
                      <div className="text-[11px] text-muted-foreground truncate">{summary?.buyer?.email ?? ""}</div>
                    </div>
                    {data.linked?.buyer?.flagged && (
                      <span className="inline-flex items-center gap-1 rounded-md border border-red-500/30 bg-red-500/15 text-red-300 px-1.5 py-0.5 text-[10px] font-semibold"><Flag className="h-3 w-3" />Flagged</span>
                    )}
                    {summary?.buyer?.id && (
                      <button onClick={() => navigate(`/admin/users/${summary.buyer.id}`)} className="text-muted-foreground hover:text-foreground"><ExternalLink className="h-3.5 w-3.5" /></button>
                    )}
                  </div>
                </div>
                <div className="rounded-md border border-border bg-muted/20 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Seller Profile</div>
                  <div className="flex items-center gap-2">
                    <Avatar name={summary?.seller?.name} src={summary?.seller?.avatarUrl} size={28} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{summary?.seller?.name ?? "—"}</div>
                      <div className="text-[11px] text-muted-foreground truncate">{summary?.seller?.email ?? ""}</div>
                    </div>
                    {data.linked?.seller?.verified && (
                      <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/15 text-emerald-300 px-1.5 py-0.5 text-[10px] font-semibold"><ShieldCheck className="h-3 w-3" />Verified</span>
                    )}
                    {summary?.seller?.id && (
                      <button onClick={() => navigate(`/admin/users/${summary.seller.id}`)} className="text-muted-foreground hover:text-foreground"><ExternalLink className="h-3.5 w-3.5" /></button>
                    )}
                  </div>
                </div>
                {(data.linked.payments ?? []).slice(0, 1).map((p: any) => (
                  <div key={p.id} className="rounded-md border border-border bg-muted/20 p-3">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Payment</div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium capitalize">{p.provider}</div>
                        <div className="text-[11px] text-muted-foreground font-mono truncate">{p.provider_reference}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold text-emerald-300">{ngn(p.amount)}</div>
                        <StatusBadge value={p.status} />
                      </div>
                    </div>
                  </div>
                ))}
                <div className="rounded-md border border-border bg-muted/20 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Escrow</div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium capitalize">{escrow.state?.replace(/_/g, " ") ?? "—"}</div>
                      <div className="text-[11px] text-muted-foreground">Held</div>
                    </div>
                    <div className="text-sm font-semibold text-purple-300">{ngn(heldEscrow)}</div>
                  </div>
                </div>
              </div>
            </CollapsibleCard>
          )}

          {/* 6. Locked Agreement */}
          {data.agreement && (
            <CollapsibleCard
              title="Locked Agreement"
              subtitle={data.agreement.lockedAt ? `Locked ${fmtDate(data.agreement.lockedAt)} — terms immutable` : "Not yet locked"}
              defaultOpenMobile={false}
            >
              <dl className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Stat label="Item Total" value={ngn(data.agreement.pricing?.item_amount)} />
                <Stat label="Protection Fee" value={ngn(data.agreement.pricing?.platform_fee_amount)} />
                <Stat label="Total Charged" value={ngn(data.agreement.pricing?.buyer_total_amount)} />
                <Stat label="Seller Net" value={ngn(data.agreement.pricing?.seller_net_amount)} />
                <Stat label="Delivery Method" value={<span className="capitalize">{data.agreement.terms?.delivery_method?.replace(/_/g, " ") ?? "—"}</span>} />
                <Stat label="Expected Delivery" value={data.agreement.terms?.expected_delivery_date ?? "—"} />
                <Stat label="Verification Window" value={data.agreement.terms?.verification_window_hours ? `${data.agreement.terms.verification_window_hours}h` : "—"} />
              </dl>
            </CollapsibleCard>
          )}

          {/* 7. Items */}
          {!!data.items?.length && (() => { const itemTotal0 = itemTotal; return (
            <CollapsibleCard title="Transaction Items">
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-muted-foreground text-xs">
                    <tr>
                      <th className="text-left p-2">Item</th>
                      <th className="text-left p-2">Condition</th>
                      <th className="text-right p-2">Qty</th>
                      <th className="text-right p-2">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((it: any) => {
                      const itemTotal = data.items.length === 1 ? itemTotal0 : (it.unit_amount ? Number(it.unit_amount) * (it.quantity ?? 1) : null);
                      return (
                      <tr key={it.id} className="border-t border-border">
                        <td className="p-2">
                          <div className="font-medium text-foreground">{it.title}</div>
                          {it.brand && <div className="text-[11px] text-muted-foreground">{it.brand} {it.model ?? ""}</div>}
                        </td>
                        <td className="p-2 capitalize">{it.condition_label?.replace(/_/g, " ")}</td>
                        <td className="p-2 text-right tabular-nums">{it.quantity}</td>
                        <td className="p-2 text-right tabular-nums font-medium">{itemTotal != null ? ngn(itemTotal) : "—"}</td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CollapsibleCard>
          ); })()}

          {/* 8. Payment & Escrow */}
          <CollapsibleCard title="Payment & Escrow">
            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">Payment</h3>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between"><dt className="text-muted-foreground">Provider</dt><dd className="capitalize">{summary?.paymentProvider ?? "—"}</dd></div>
                  <div className="flex justify-between gap-2 items-center">
                    <dt className="text-muted-foreground">Reference</dt>
                    <dd className="font-mono text-xs flex items-center gap-1 truncate">
                      {summary?.providerReference ?? "—"}
                      {summary?.providerReference && (
                        <button onClick={() => copy(summary.providerReference)} className="text-muted-foreground hover:text-foreground"><Copy className="h-3 w-3" /></button>
                      )}
                    </dd>
                  </div>
                  <div className="flex justify-between"><dt className="text-muted-foreground">Amount</dt><dd className="font-semibold">{ngn(summary?.payment?.amount)}</dd></div>
                  <div className="flex justify-between"><dt className="text-muted-foreground">Status</dt><dd><StatusBadge value={summary?.payment?.status} /></dd></div>
                </dl>
              </div>
              <div>
                <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">Escrow</h3>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between"><dt className="text-muted-foreground">State</dt><dd className="capitalize">{escrow.state?.replace(/_/g, " ") ?? "—"}</dd></div>
                  <div className="flex justify-between"><dt className="text-muted-foreground">Held</dt><dd className="font-semibold text-purple-300">{ngn(heldEscrow)}</dd></div>
                  <div className="flex justify-between"><dt className="text-muted-foreground">Released</dt><dd className="font-semibold text-emerald-300">{ngn(escrow.released_amount)}</dd></div>
                  <div className="flex justify-between"><dt className="text-muted-foreground">Refunded</dt><dd className="font-semibold">{ngn(refundedAmt)}</dd></div>
                  <div className="flex justify-between"><dt className="text-muted-foreground">Seller Net</dt><dd className="font-semibold">{ngn(sellerNet)}</dd></div>
                </dl>
              </div>
            </div>
          </CollapsibleCard>

          {/* 9. Delivery & Fulfillment */}
          {data.delivery && (
            <CollapsibleCard title="Delivery & Fulfillment">
              <dl className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Stat label="Method" value={<span className="capitalize">{data.delivery.terms?.delivery_method?.replace(/_/g, " ") ?? "—"}</span>} />
                <Stat label="Carrier" value={data.delivery.tracking?.courier_name ?? "—"} />
                <Stat label="Tracking" value={data.delivery.tracking?.tracking_number ? (
                  <span className="flex items-center gap-1 font-mono text-xs">
                    <span className="truncate">{data.delivery.tracking.tracking_number}</span>
                    <button onClick={() => copy(data.delivery.tracking.tracking_number)} className="text-muted-foreground hover:text-foreground"><Copy className="h-3 w-3" /></button>
                  </span>
                ) : "—"} />
                <Stat label="Expected" value={data.delivery.terms?.expected_delivery_date ?? "—"} />
                <Stat label="Shipped" value={fmtDate(data.delivery.tracking?.shipped_at)} />
                <Stat label="Delivered" value={fmtDate(data.delivery.deliveredAt)} />
                <Stat label="Verification Deadline" value={fmtDate(data.delivery.verificationDeadlineAt)} />
              </dl>
              {!!data.delivery.updates?.length && (
                <div className="mt-4">
                  <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Updates</h4>
                  <ul className="space-y-2 text-sm">
                    {data.delivery.updates.map((u: any) => (
                      <li key={u.id} className="rounded-md border border-border bg-muted/30 p-2">
                        <div className="flex justify-between">
                          <span className="capitalize font-medium">{u.status?.replace(/_/g, " ")}</span>
                          <span className="text-[11px] text-muted-foreground">{fmtDate(u.created_at)}</span>
                        </div>
                        {u.notes && <div className="text-xs text-muted-foreground">{u.notes}</div>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CollapsibleCard>
          )}

          {/* 10. Internal Activity (Notes + Messages) */}
          <CollapsibleCard title="Admin Notes / Internal Activity" action={
            <Button size="sm" variant="outline" onClick={() => setNoteOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add Note
            </Button>
          }>
            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">Internal Notes</h3>
                <ul className="space-y-2 text-sm">
                  {(data.notes ?? []).length === 0 && <li className="text-muted-foreground">No notes.</li>}
                  {(data.notes ?? []).map((n: any) => (
                    <li key={n.id} className="rounded-md border border-border bg-muted/30 p-2">
                      <div className="text-[11px] text-muted-foreground">
                        {fmtDate(n.created_at)} {n.author?.full_name ? `· ${n.author.full_name}` : ""}
                      </div>
                      <div className="text-foreground mt-0.5 whitespace-pre-wrap">{n.note}</div>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">Messages</h3>
                <ul className="space-y-2 text-sm">
                  {(data.messages ?? []).length === 0 && <li className="text-muted-foreground">No messages.</li>}
                  {(data.messages ?? []).map((m: any) => (
                    <li key={m.id} className="rounded-md border border-border bg-muted/30 p-2">
                      <div className="text-[11px] text-muted-foreground">{fmtDate(m.created_at)}</div>
                      <div className="text-foreground mt-0.5">{m.message_text}</div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </CollapsibleCard>

          {/* 11. Audit Trail */}
          <CollapsibleCard title="Audit Trail">
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="p-2 text-left">When</th>
                    <th className="p-2 text-left">Action</th>
                    <th className="p-2 text-left">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.audit ?? []).length === 0 && (
                    <tr><td colSpan={3} className="p-3 text-center text-muted-foreground">No audit records.</td></tr>
                  )}
                  {(data.audit ?? []).map((r: any) => (
                    <tr key={r.id} className="border-t border-border">
                      <td className="p-2 align-top whitespace-nowrap">{fmtDate(r.created_at)}</td>
                      <td className="p-2 align-top capitalize">{r.action?.replace(/_/g, " ")}</td>
                      <td className="p-2 align-top text-muted-foreground">{r.description ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CollapsibleCard>
        </div>
      )}

      {/* Mobile sticky action bar */}
      {!loading && !err && !denied && data && (
        <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-card/95 backdrop-blur px-3 py-2.5 flex items-center gap-2">
          <Button className="flex-1 bg-blue-500 hover:bg-blue-600 text-white" onClick={() => setActionSheetOpen(true)}>
            Take Action
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="More"><MoreVertical className="h-4 w-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={exportData}><Download className="h-4 w-4 mr-2" /> Export</DropdownMenuItem>
              {hasDispute && (
                <DropdownMenuItem onClick={() => navigate(`/admin/disputes/${dispute.id}`)}><Scale className="h-4 w-4 mr-2" /> View Dispute</DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => copy(summary?.transactionCode ?? "")}><Copy className="h-4 w-4 mr-2" /> Copy Code</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {/* Action sheet (mobile Take Action) */}
      <Sheet open={actionSheetOpen} onOpenChange={setActionSheetOpen}>
        <SheetContent side="bottom" className="rounded-t-xl">
          <SheetHeader><SheetTitle>Take Action</SheetTitle></SheetHeader>
          <div className="mt-4 grid gap-2">
            <Button variant="outline" className="justify-start" onClick={() => { setActionSheetOpen(false); toast.info("Investigation tools coming soon"); }}>
              <Search className="h-4 w-4 mr-2" /> Investigate
            </Button>
            <Button variant="outline" className="justify-start text-red-300 border-red-500/30" disabled={summary?.moneyStatus !== "funds_held_in_escrow"} onClick={() => { setActionSheetOpen(false); setFreezeOpen(true); }}>
              <Snowflake className="h-4 w-4 mr-2" /> Freeze Funds
            </Button>
            {hasDispute && (
              <Button variant="outline" className="justify-start" onClick={() => { setActionSheetOpen(false); navigate(`/admin/disputes/${dispute.id}`); }}>
                <Scale className="h-4 w-4 mr-2" /> Manage Dispute
              </Button>
            )}
            <Button variant="outline" className="justify-start" onClick={() => { setActionSheetOpen(false); setNoteOpen(true); }}>
              <StickyNote className="h-4 w-4 mr-2" /> Add Internal Note
            </Button>
            <Button variant="outline" className="justify-start" onClick={() => { setActionSheetOpen(false); exportData(); }}>
              <Download className="h-4 w-4 mr-2" /> Export Data
            </Button>
            <Button variant="outline" className="justify-start" onClick={() => { setActionSheetOpen(false); copy(summary?.transactionCode ?? ""); }}>
              <Copy className="h-4 w-4 mr-2" /> Copy Code
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <ActionConfirmDialog
        open={freezeOpen}
        onOpenChange={setFreezeOpen}
        title="Freeze funds"
        description={`Freeze escrow funds for #${code}. The seller payout will be paused.`}
        reasonLabel="Reason for freezing"
        confirmLabel="Freeze funds"
        confirmTone="danger"
        typeToConfirm="FREEZE"
        onConfirm={async (reason) => {
          if (!transactionId) return;
          try { await freezeTransaction(transactionId, reason); toast.success("Funds frozen"); setReloadKey(k => k+1); }
          catch (e) { toast.error((e as Error).message ?? "Freeze failed"); }
        }}
      />

      <InternalNoteDialog
        open={noteOpen}
        onOpenChange={setNoteOpen}
        transactionCode={code ?? ""}
        onSubmit={async (note) => {
          if (!transactionId) return;
          try { await addInternalNote(transactionId, note); toast.success("Note saved"); setReloadKey(k => k+1); }
          catch (e) { toast.error((e as Error).message ?? "Save failed"); }
        }}
      />
    </AdminLayout>
  );
}
