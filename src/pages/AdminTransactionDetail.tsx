import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import {
  ArrowLeft, Loader2, AlertTriangle, Download, Scale, ShieldCheck,
  ChevronDown, ChevronUp, Snowflake, MoreVertical, ExternalLink,
  Truck, Package, CreditCard, Lock, Circle, StickyNote, RefreshCcw,
  Search, Flag, Eye, MoreHorizontal, User, Wallet, Receipt, BookOpen,
} from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import {
  getAdminTransactionDetailFull,
  AdminAccessRequiredError,
  TransactionNotFoundError,
  type AdminTxDetailResponse,
} from "@/services/admin-transaction-detail.service";
import {
  freezeTransaction,
  unfreezeTransaction,
  flagForReview,
  openInvestigation,
  addInternalNoteTyped,
} from "@/services/admin-transaction-actions.service";
import { formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ActionConfirmDialog } from "@/components/admin/transactions/ActionConfirmDialog";
import { InternalNoteDialog } from "@/components/admin/transactions/InternalNoteDialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const ngn = (v: number | null | undefined) => {
  if (v == null || Number.isNaN(Number(v))) return "—";
  return formatMoney(Number(v), "NGN");
};
const fmtDate = (iso?: string | null) => {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" }); } catch { return iso; }
};
const relTime = (iso?: string | null) => {
  if (!iso) return "—";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
};
const titleCase = (s?: string | null) => (s ?? "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const STATUS_CLS: Record<string, string> = {
  draft: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  awaiting_payment: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
  payment_secured: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  funds_held_in_escrow: "bg-purple-500/15 text-purple-300 border-purple-500/30",
  funds_pending_release: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  funds_released: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  funds_frozen: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
  completed: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  cancelled: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  failed: "bg-red-500/15 text-red-300 border-red-500/30",
  open: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  under_review: "bg-orange-500/15 text-orange-300 border-orange-500/30",
};

function StatusBadge({ value }: { value?: string | null }) {
  if (!value) return <span className="text-xs text-muted-foreground">—</span>;
  const cls = STATUS_CLS[value] ?? "bg-slate-500/15 text-slate-300 border-slate-500/30";
  return (
    <span className={cn("inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold whitespace-nowrap", cls)}>
      {titleCase(value)}
    </span>
  );
}

function Card({ children, className, accent }: { children: React.ReactNode; className?: string; accent?: "orange" | "red" | "none" }) {
  const a = accent === "orange" ? "border-l-4 border-l-orange-500" : accent === "red" ? "border-l-4 border-l-red-500" : "";
  return <section className={cn("rounded-xl border border-border bg-card", a, className)}>{children}</section>;
}

function CardHeader({ title, subtitle, action, collapsible, open, onToggle }: any) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3">
      <div>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2">
        {action}
        {collapsible && (
          <button type="button" onClick={onToggle} className="lg:hidden p-1 text-muted-foreground" aria-label="Toggle">
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        )}
      </div>
    </div>
  );
}
function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-foreground">{value ?? "—"}</dd>
    </div>
  );
}
function CollapsibleCard({ title, subtitle, accent, action, children }: any) {
  const [open, setOpen] = useState(false);
  return (
    <Card accent={accent}>
      <CardHeader title={title} subtitle={subtitle} action={action} collapsible open={open} onToggle={() => setOpen(v => !v)} />
      <div className={cn("px-4 pb-4", !open && "hidden lg:block")}>{children}</div>
    </Card>
  );
}
function Avatar({ name, src, size = 32 }: { name?: string | null; src?: string | null; size?: number }) {
  const initials = (name ?? "?").split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase();
  return src ? (
    <img src={src} alt={name ?? ""} className="rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <div className="rounded-full bg-muted text-foreground flex items-center justify-center text-xs font-semibold" style={{ width: size, height: size }}>{initials}</div>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return <div className="text-xs text-muted-foreground py-2">{children}</div>;
}

const TIMELINE_ICONS: Record<string, { Icon: any; cls: string }> = {
  truck: { Icon: Truck, cls: "border-blue-500 bg-blue-500/15 text-blue-400" },
  package: { Icon: Package, cls: "border-emerald-500 bg-emerald-500/15 text-emerald-400" },
  lock: { Icon: Lock, cls: "border-purple-500 bg-purple-500/15 text-purple-400" },
  "credit-card": { Icon: CreditCard, cls: "border-emerald-500 bg-emerald-500/15 text-emerald-400" },
  scale: { Icon: Scale, cls: "border-orange-500 bg-orange-500/15 text-orange-400" },
  "alert-triangle": { Icon: AlertTriangle, cls: "border-red-500 bg-red-500/15 text-red-400" },
};
function timelineMeta(icon?: string, severity?: string) {
  const base = TIMELINE_ICONS[icon ?? ""] ?? { Icon: Circle, cls: "border-slate-500 bg-slate-500/15 text-slate-400" };
  if (severity === "critical") return { ...base, cls: "border-red-500 bg-red-500/15 text-red-400" };
  if (severity === "warning") return { ...base, cls: "border-orange-500 bg-orange-500/15 text-orange-400" };
  if (severity === "success") return { ...base, cls: "border-emerald-500 bg-emerald-500/15 text-emerald-400" };
  return base;
}

export default function AdminTransactionDetail() {
  const { transactionId } = useParams<{ transactionId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = (location.state as { returnTo?: string } | null)?.returnTo ?? "/admin/transactions";

  const [data, setData] = useState<AdminTxDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  const [freezeOpen, setFreezeOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [unfreezeOpen, setUnfreezeOpen] = useState(false);
  const [flagOpen, setFlagOpen] = useState(false);
  const [investigateOpen, setInvestigateOpen] = useState(false);

  useEffect(() => {
    if (!transactionId) { setNotFound(true); setLoading(false); return; }
    setLoading(true); setErr(null); setDenied(false); setNotFound(false);
    getAdminTransactionDetailFull(transactionId)
      .then(setData)
      .catch((e) => {
        if (e instanceof AdminAccessRequiredError) setDenied(true);
        else if (e instanceof TransactionNotFoundError) setNotFound(true);
        else setErr((e as Error).message ?? "Failed to load transaction");
      })
      .finally(() => setLoading(false));
  }, [transactionId, reloadKey]);

  const tx = data?.transaction;
  const dispute = data?.dispute;
  const adminCan = data?.adminActionsAvailable ?? {};
  const accent: "red" | "orange" | "none" =
    tx?.moneyStatus === "funds_frozen" ? "red" : (dispute && dispute.status !== "resolved" && dispute.status !== "closed") ? "orange" : "none";
  const code = tx?.transactionCode ?? transactionId?.slice(0, 8) ?? "";
  const itemTitle = data?.items?.[0]?.title ?? "Transaction";

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
          <button type="button" onClick={() => navigate(returnTo)} className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted" aria-label="Back">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-foreground truncate">Transaction #{code}</h1>
            <p className="text-xs text-muted-foreground truncate">{itemTitle} {tx?.status ? `— ${titleCase(tx.status)}` : ""}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {adminCan.canOpenInvestigation && (
            <Button variant="outline" size="sm" onClick={() => setInvestigateOpen(true)} className="border-red-500/40 text-red-300 hover:text-red-200">
              <Search className="h-4 w-4 mr-1.5" /> Investigate
            </Button>
          )}
          {adminCan.canFreeze && (
            <Button variant="outline" size="sm" onClick={() => setFreezeOpen(true)} className="border-cyan-500/40 text-cyan-300 hover:text-cyan-200">
              <Snowflake className="h-4 w-4 mr-1.5" /> Freeze Funds
            </Button>
          )}
          {adminCan.canUnfreeze && (
            <Button variant="outline" size="sm" onClick={() => setUnfreezeOpen(true)} className="border-emerald-500/40 text-emerald-300 hover:text-emerald-200">
              <Snowflake className="h-4 w-4 mr-1.5" /> Unfreeze
            </Button>
          )}
          {adminCan.canManageDispute && dispute && (
            <Button size="sm" className="bg-orange-500 hover:bg-orange-600 text-white" onClick={() => navigate(`/admin/disputes/${dispute.id}`)}>
              <Scale className="h-4 w-4 mr-1.5" /> Manage Dispute
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" aria-label="More actions"><MoreHorizontal className="h-4 w-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {adminCan.canAddNote && <DropdownMenuItem onClick={() => setNoteOpen(true)}><StickyNote className="h-4 w-4 mr-2" /> Add Internal Note</DropdownMenuItem>}
              {adminCan.canFlagForReview && <DropdownMenuItem onClick={() => setFlagOpen(true)}><Flag className="h-4 w-4 mr-2" /> Flag for Review</DropdownMenuItem>}
              {adminCan.canViewBuyer && data?.parties?.buyer?.id && (
                <DropdownMenuItem onClick={() => navigate(`/admin/users/${data.parties.buyer!.id}`)}><User className="h-4 w-4 mr-2" /> View Buyer Profile</DropdownMenuItem>
              )}
              {adminCan.canViewSeller && data?.parties?.seller?.id && (
                <DropdownMenuItem onClick={() => navigate(`/admin/users/${data.parties.seller!.id}`)}><User className="h-4 w-4 mr-2" /> View Seller Profile</DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              {adminCan.canExport && <DropdownMenuItem onClick={exportData}><Download className="h-4 w-4 mr-2" /> Export Data</DropdownMenuItem>}
              <DropdownMenuItem onClick={() => { navigator.clipboard.writeText(code); toast.success("Code copied"); }}>
                <Receipt className="h-4 w-4 mr-2" /> Copy Transaction Code
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );

  const mobileHeaderSlot = ({ onOpenMenu }: { onOpenMenu: () => void }) => (
    <header className="lg:hidden sticky top-0 z-30 border-b border-border bg-card">
      <div className="flex items-center justify-between px-3 py-2.5">
        <button type="button" onClick={() => navigate(returnTo)} className="p-2 text-muted-foreground" aria-label="Back"><ArrowLeft className="h-4 w-4" /></button>
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-emerald-500 flex items-center justify-center">
          <ShieldCheck className="h-4 w-4 text-white" />
        </div>
        <button type="button" onClick={onOpenMenu} className="p-2 text-muted-foreground" aria-label="Menu"><MoreVertical className="h-4 w-4" /></button>
      </div>
    </header>
  );

  return (
    <AdminLayout title={`Transaction #${code}`} subtitle={itemTitle} headerSlot={headerSlot} mobileHeaderSlot={mobileHeaderSlot}>
      {loading && (
        <div className="space-y-3">
          {[0,1,2].map(i => <div key={i} className="h-32 rounded-xl border border-border bg-card animate-pulse" />)}
        </div>
      )}

      {denied && !loading && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
          Admin access required to view this transaction.
        </div>
      )}

      {notFound && !loading && !denied && (
        <div className="rounded-xl border border-border bg-card p-6 text-sm">
          <div className="font-semibold text-foreground mb-1">Transaction not found</div>
          <p className="text-muted-foreground mb-3">This transaction does not exist or was removed.</p>
          <Button variant="outline" size="sm" onClick={() => navigate(returnTo)}><ArrowLeft className="h-4 w-4 mr-1.5" /> Back</Button>
        </div>
      )}

      {err && !loading && !denied && !notFound && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300 flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4" />
          <div className="flex-1">{err}</div>
          <Button variant="outline" size="sm" onClick={() => setReloadKey(k => k + 1)}>Retry</Button>
        </div>
      )}

      {!loading && !denied && !notFound && !err && data && tx && (
        <div className="space-y-4 pb-28 lg:pb-6">
          {/* High-risk banner */}
          {(data.risk?.level === "high" || data.risk?.level === "escalated") && (
            <div className="rounded-xl border border-red-500/40 bg-red-500/15 p-4 flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-500/20 text-red-300">
                <AlertTriangle className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-red-200">
                  {data.risk?.level === "escalated" ? "High Risk — Escalated" : "High Risk Transaction"}
                </div>
                <div className="mt-0.5 text-xs text-red-300/90">
                  {data.risk?.adminReviewReason ?? "Manual review required before any release."}
                </div>
                {(data.risk?.flags ?? []).length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {data.risk.flags.slice(0, 4).map((f: any, i: number) => (
                      <span key={i} className="rounded border border-red-500/30 bg-red-500/15 px-1.5 py-0.5 text-[10px] text-red-200">{f.label}</span>
                    ))}
                  </div>
                )}
              </div>
              {adminCan.canOpenInvestigation && (
                <Button size="sm" className="bg-red-500 hover:bg-red-600 text-white" onClick={() => setInvestigateOpen(true)}>
                  <Search className="h-4 w-4 mr-1.5" /> Investigate
                </Button>
              )}
            </div>
          )}

          {/* Mobile mini header */}
          <div className="lg:hidden px-1">
            <h1 className="text-lg font-semibold text-foreground">#{code}</h1>
            <p className="text-sm text-muted-foreground">{itemTitle}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <StatusBadge value={tx.status} />
              <StatusBadge value={tx.moneyStatus} />
              {dispute && <StatusBadge value={dispute.status} />}
            </div>
          </div>

          {/* Summary */}
          <Card accent={accent}>
            <div className="p-4 lg:p-5">
              <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                <Stat label="Transaction" value={<><div className="font-semibold">#{code}</div><div className="text-[11px] text-muted-foreground mt-0.5">Created {fmtDate(tx.createdAt)}</div></>} />
                <Stat label="Last Activity" value={<><div className="font-semibold">{relTime(tx.lastActivityAt)}</div><div className="text-[11px] text-muted-foreground mt-0.5">{fmtDate(tx.lastActivityAt)}</div></>} />
                <Stat label="Total Amount" value={<><div className="font-semibold text-base">{ngn(data.pricing?.buyerTotal)}</div><div className="text-[11px] text-muted-foreground mt-0.5">Fee: {ngn(data.pricing?.protectionFee)}</div></>} />
                <Stat label="Payout Status" value={<StatusBadge value={data.payout?.status} />} />
                <Stat label="Payment Provider" value={<><div className="font-semibold capitalize">{data.payment?.provider ?? "—"}</div><div className="text-[11px] text-muted-foreground font-mono truncate mt-0.5">{data.payment?.providerReference ?? "—"}</div></>} />
              </dl>
              <div className="my-4 border-t border-border" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {(["buyer","seller"] as const).map((k) => {
                  const p = data.parties[k];
                  return (
                    <div key={k} className="flex items-center gap-3">
                      <Avatar name={p?.name} src={p?.avatarUrl} />
                      <div className="min-w-0">
                        <div className="text-[10px] uppercase text-muted-foreground font-semibold">{titleCase(k)}</div>
                        <div className="text-sm font-medium text-foreground truncate flex items-center gap-1.5">
                          {p?.name ?? "—"}
                          {p?.verification?.identity && <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />}
                          {p?.flagged && <span className="text-[10px] rounded bg-red-500/20 text-red-300 px-1.5 py-0.5">{p.accountStatus}</span>}
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate">{p?.maskedEmail ?? p?.maskedPhone ?? ""}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>

          {/* Quick actions (mobile grid) */}
          <div className="lg:hidden grid grid-cols-2 gap-2">
            {adminCan.canOpenInvestigation && (
              <Button variant="outline" size="sm" onClick={() => setInvestigateOpen(true)} className="border-red-500/40 text-red-300">
                <Search className="h-4 w-4 mr-1.5" /> Investigate
              </Button>
            )}
            {adminCan.canFreeze && (
              <Button variant="outline" size="sm" onClick={() => setFreezeOpen(true)} className="border-cyan-500/40 text-cyan-300">
                <Snowflake className="h-4 w-4 mr-1.5" /> Freeze
              </Button>
            )}
            {adminCan.canUnfreeze && (
              <Button variant="outline" size="sm" onClick={() => setUnfreezeOpen(true)} className="border-emerald-500/40 text-emerald-300">
                <Snowflake className="h-4 w-4 mr-1.5" /> Unfreeze
              </Button>
            )}
            {adminCan.canFlagForReview && (
              <Button variant="outline" size="sm" onClick={() => setFlagOpen(true)} className="border-yellow-500/40 text-yellow-300">
                <Flag className="h-4 w-4 mr-1.5" /> Flag
              </Button>
            )}
            {adminCan.canAddNote && (
              <Button variant="outline" size="sm" onClick={() => setNoteOpen(true)}>
                <StickyNote className="h-4 w-4 mr-1.5" /> Add Note
              </Button>
            )}
            {adminCan.canExport && (
              <Button variant="outline" size="sm" onClick={exportData}><Download className="h-4 w-4 mr-1.5" /> Export</Button>
            )}
            {adminCan.canManageDispute && dispute && (
              <Button variant="outline" size="sm" onClick={() => navigate(`/admin/disputes/${dispute.id}`)} className="border-orange-500/40 text-orange-300">
                <Scale className="h-4 w-4 mr-1.5" /> Dispute
              </Button>
            )}
          </div>

          {/* Items */}
          <Card>
            <CardHeader title="Items" subtitle={`${data.items.length} item${data.items.length === 1 ? "" : "s"}`} />
            <div className="px-4 pb-4 space-y-3">
              {data.items.length === 0 && <Empty>No items recorded.</Empty>}
              {data.items.map((it) => (
                <div key={it.id} className="flex gap-3 items-start border-t border-border pt-3 first:border-t-0 first:pt-0">
                  {it.image ? (
                    <img src={it.image} alt={it.title} className="w-16 h-16 rounded-md object-cover bg-muted" />
                  ) : (
                    <div className="w-16 h-16 rounded-md bg-muted flex items-center justify-center text-muted-foreground"><Package className="h-5 w-5" /></div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground">{it.title}</div>
                    {it.description && <div className="text-xs text-muted-foreground line-clamp-2">{it.description}</div>}
                    <div className="text-[11px] text-muted-foreground mt-1">
                      {[titleCase(it.condition), it.brand, it.model].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-semibold tabular-nums">{ngn(it.lineTotal)}</div>
                    <div className="text-[11px] text-muted-foreground">{it.quantity} × {ngn(it.unitPrice)}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Pricing */}
          <Card>
            <CardHeader title="Pricing & Fees" />
            <div className="px-4 pb-4">
              {!data.pricing && <Empty>No pricing recorded.</Empty>}
              {data.pricing && (
                <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <Stat label="Item Total" value={<span className="tabular-nums">{ngn(data.pricing.itemTotal)}</span>} />
                  <Stat label="Protection Fee" value={<span className="tabular-nums">{ngn(data.pricing.protectionFee)}</span>} />
                  <Stat label="Processing Fee" value={<span className="tabular-nums">{ngn(data.pricing.processingFee)}</span>} />
                  <Stat label="Refunded" value={<span className="tabular-nums">{ngn(data.pricing.refundedTotal)}</span>} />
                  <Stat label="Seller Net" value={<span className="tabular-nums">{ngn(data.pricing.sellerNet)}</span>} />
                  <Stat label="Buyer Total" value={<span className="tabular-nums font-semibold">{ngn(data.pricing.buyerTotal)}</span>} />
                </dl>
              )}
            </div>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Payment */}
            <Card>
              <CardHeader title="Payment" />
              <div className="px-4 pb-4">
                {!data.payment && <Empty>No payment recorded.</Empty>}
                {data.payment && (
                  <dl className="grid grid-cols-2 gap-4">
                    <Stat label="Provider" value={<span className="capitalize">{data.payment.provider}</span>} />
                    <Stat label="Status" value={<StatusBadge value={data.payment.status} />} />
                    <Stat label="Amount" value={<span className="tabular-nums">{ngn(data.payment.amount)}</span>} />
                    <Stat label="Method" value={titleCase(data.payment.paymentMethodType)} />
                    <Stat label="Reference" value={<span className="font-mono text-xs break-all">{data.payment.providerReference}</span>} />
                    <Stat label="Paid At" value={fmtDate(data.payment.paidAt)} />
                    {data.payment.failureReason && <div className="col-span-2"><Stat label="Failure" value={<span className="text-red-300">{data.payment.failureReason}</span>} /></div>}
                  </dl>
                )}
              </div>
            </Card>

            {/* Escrow */}
            <Card>
              <CardHeader title="Escrow" />
              <div className="px-4 pb-4">
                {!data.escrow && <Empty>No escrow record.</Empty>}
                {data.escrow && (
                  <dl className="grid grid-cols-2 gap-4">
                    <Stat label="State" value={<StatusBadge value={data.escrow.state} />} />
                    <Stat label="Held" value={<span className="tabular-nums">{ngn(data.escrow.heldAmount)}</span>} />
                    <Stat label="Frozen" value={<span className="tabular-nums">{ngn(data.escrow.frozenAmount)}</span>} />
                    <Stat label="Released" value={<span className="tabular-nums">{ngn(data.escrow.releasedAmount)}</span>} />
                    <Stat label="Refunded" value={<span className="tabular-nums">{ngn(data.escrow.refundedAmount)}</span>} />
                    <Stat label="Last Changed" value={fmtDate(data.escrow.lastChangedAt)} />
                  </dl>
                )}
              </div>
            </Card>

            {/* Payout */}
            <Card>
              <CardHeader title="Payout" />
              <div className="px-4 pb-4">
                {!data.payout && <Empty>No payout recorded.</Empty>}
                {data.payout && (
                  <dl className="grid grid-cols-2 gap-4">
                    <Stat label="Status" value={<StatusBadge value={data.payout.status} />} />
                    <Stat label="Amount" value={<span className="tabular-nums">{ngn(data.payout.amount)}</span>} />
                    <Stat label="Reference" value={<span className="font-mono text-xs break-all">{data.payout.providerReference ?? "—"}</span>} />
                    <Stat label="Released At" value={fmtDate(data.payout.releasedAt ?? data.payout.completedAt)} />
                    {data.payout.failureReason && <div className="col-span-2"><Stat label="Failure" value={<span className="text-red-300">{data.payout.failureReason}</span>} /></div>}
                    {data.payout.blocked && <div className="col-span-2"><Stat label="Blocked" value={<span className="text-orange-300">{data.payout.blockedReason ?? "Blocked"}</span>} /></div>}
                    {data.payout.retryAllowed && (
                      <div className="col-span-2"><Button size="sm" variant="outline"><RefreshCcw className="h-3.5 w-3.5 mr-1.5" /> Retry available</Button></div>
                    )}
                  </dl>
                )}
              </div>
            </Card>

            {/* Delivery */}
            <Card>
              <CardHeader title="Delivery" />
              <div className="px-4 pb-4">
                <dl className="grid grid-cols-2 gap-4">
                  <Stat label="Method" value={titleCase(data.delivery?.method)} />
                  <Stat label="Courier" value={data.delivery?.courier ?? "—"} />
                  <Stat label="Tracking #" value={data.delivery?.trackingNumber ?? "—"} />
                  <Stat label="Tracking URL" value={data.delivery?.trackingUrl ? (
                    <a href={data.delivery.trackingUrl} target="_blank" rel="noreferrer" className="text-blue-400 inline-flex items-center gap-1">Open <ExternalLink className="h-3 w-3" /></a>
                  ) : "—"} />
                  <Stat label="Shipped" value={fmtDate(data.delivery?.shippedAt)} />
                  <Stat label="Delivered" value={fmtDate(data.delivery?.deliveredAt)} />
                  <Stat label="Expected" value={fmtDate(data.delivery?.expectedDeliveryAt ?? data.delivery?.expectedDate)} />
                  <Stat label="Verification Window" value={data.delivery?.verificationWindowHours ? `${data.delivery.verificationWindowHours}h` : "—"} />
                </dl>
                {data.delivery?.address && (
                  <div className="mt-3 text-xs text-muted-foreground">{data.delivery.address}</div>
                )}
                {(data.delivery?.updates ?? []).length > 0 && (
                  <div className="mt-4">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Updates</div>
                    <ul className="space-y-1.5">
                      {data.delivery.updates.map((u: any) => (
                        <li key={u.id} className="text-xs text-muted-foreground">
                          <span className="text-foreground">{titleCase(u.status)}</span> · {fmtDate(u.at)}
                          {u.notes && <span> — {u.notes}</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* Dispute */}
          {dispute && (
            <Card accent="orange">
              <CardHeader title="Dispute" subtitle={titleCase(dispute.claimType)} action={<StatusBadge value={dispute.status} />} />
              <div className="px-4 pb-4 space-y-3">
                <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <Stat label="Opened" value={fmtDate(dispute.openedAt)} />
                  <Stat label="Seller Response Due" value={<><span>{fmtDate(dispute.sellerResponseDueAt)}</span>{dispute.overdue && <span className="ml-1.5 text-[10px] rounded bg-red-500/20 text-red-300 px-1.5 py-0.5">Overdue</span>}</>} />
                  <Stat label="Resolved" value={fmtDate(dispute.resolvedAt)} />
                </dl>
                {dispute.summary && <div className="text-sm text-foreground/90">{dispute.summary}</div>}
                {dispute.outcome && (
                  <div className="rounded-md border border-border bg-muted/30 p-3 text-xs">
                    <div className="font-semibold text-foreground">Outcome: {titleCase(dispute.outcome.type)}</div>
                    <div className="text-muted-foreground mt-1">{dispute.outcome.summary}</div>
                    <div className="text-muted-foreground mt-1">Refund {ngn(dispute.outcome.refundAmount)} · Release {ngn(dispute.outcome.releaseAmount)}</div>
                  </div>
                )}
                {(dispute.evidence ?? []).length > 0 && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Evidence ({dispute.evidence.length})</div>
                    <ul className="text-xs text-muted-foreground space-y-1">
                      {dispute.evidence.map((e: any) => (
                        <li key={e.id}>· {titleCase(e.evidenceType)} by {e.submittedByRole} — {fmtDate(e.at)}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Timeline */}
          <CollapsibleCard title="Timeline" subtitle={`${data.timeline.length} events`}>
            {data.timeline.length === 0 && <Empty>No events recorded.</Empty>}
            <ol className="relative space-y-4">
              {data.timeline.map((e) => {
                const m = timelineMeta(e.icon, e.severity);
                const Icon = m.Icon;
                return (
                  <li key={e.id} className="flex gap-3">
                    <div className={cn("h-8 w-8 rounded-full border flex items-center justify-center shrink-0", m.cls)}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-foreground">{titleCase(e.title)}</div>
                      {e.description && <div className="text-xs text-muted-foreground line-clamp-2">{e.description}</div>}
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {fmtDate(e.at)} {e.actorName ? `· ${e.actorName}` : (e.actorType ? `· ${e.actorType}` : "")}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </CollapsibleCard>

          {/* Escrow Ledger */}
          <CollapsibleCard title="Escrow Ledger" subtitle={`${data.escrow?.ledger?.length ?? 0} entries`}>
            {(!data.escrow?.ledger || data.escrow.ledger.length === 0) && <Empty>No ledger entries.</Empty>}
            {data.escrow && data.escrow.ledger.length > 0 && (
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40 text-muted-foreground"><tr>
                    <th className="p-2 text-left">Date</th><th className="p-2 text-left">Type</th>
                    <th className="p-2 text-right">Amount</th><th className="p-2 text-right">Balance</th>
                    <th className="p-2 text-left">Notes</th>
                  </tr></thead>
                  <tbody>
                    {data.escrow.ledger.map((r) => (
                      <tr key={r.id} className="border-t border-border">
                        <td className="p-2 align-top whitespace-nowrap">{fmtDate(r.at)}</td>
                        <td className="p-2 align-top">{titleCase(r.entryType)}</td>
                        <td className="p-2 text-right tabular-nums align-top">{ngn(r.amount)}</td>
                        <td className="p-2 text-right tabular-nums align-top">{ngn(r.balanceAfter)}</td>
                        <td className="p-2 align-top text-muted-foreground">{r.notes ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CollapsibleCard>

          {/* Risk & Investigation — split into Assessment + Log */}
          <Card>
            <CardHeader
              title="Risk & Investigation"
              action={
                <div className="flex items-center gap-2">
                  <StatusBadge value={data.risk?.level} />
                  {adminCan.canOpenInvestigation && (
                    <Button variant="outline" size="sm" onClick={() => setInvestigateOpen(true)}>
                      <Search className="h-3.5 w-3.5 mr-1.5" /> Investigate
                    </Button>
                  )}
                </div>
              }
            />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 px-4 pb-4">
              {/* Assessment */}
              <div className="space-y-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Risk Assessment</div>
                {(data.risk?.flags ?? []).length === 0 && <Empty>No risk flags raised.</Empty>}
                {(data.risk?.flags ?? []).length > 0 && (
                  <ul className="space-y-1.5">
                    {data.risk.flags.map((f: any, i: number) => (
                      <li key={i} className={cn("flex items-start gap-2 rounded-md border px-2.5 py-1.5 text-[11px]",
                        f.severity === "high" ? "border-red-500/30 bg-red-500/10 text-red-300" :
                        f.severity === "medium" ? "border-orange-500/30 bg-orange-500/10 text-orange-300" :
                        "border-yellow-500/30 bg-yellow-500/10 text-yellow-300")}>
                        <Flag className="h-3 w-3 mt-0.5 shrink-0" />
                        <div className="min-w-0">
                          <div className="font-medium">{f.label}</div>
                          {f.detail && <div className="text-[10px] opacity-80 truncate">{f.detail}</div>}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {data.risk?.adminReviewReason && (
                  <div className="rounded-md border border-border bg-muted/30 p-2 text-[11px] text-muted-foreground">
                    <span className="text-foreground font-medium">Reason:</span> {data.risk.adminReviewReason}
                  </div>
                )}
              </div>
              {/* Investigation Log */}
              <div className="space-y-3 lg:border-l lg:border-border lg:pl-4">
                <div className="flex items-center justify-between">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Investigation Log</div>
                  {adminCan.canAddNote && (
                    <button type="button" onClick={() => setNoteOpen(true)} className="text-[11px] text-primary hover:underline">+ Add note</button>
                  )}
                </div>
                {(data.risk?.escalationHistory ?? []).length > 0 && (
                  <ul className="text-xs space-y-1">
                    {data.risk.escalationHistory.map((h: any, i: number) => (
                      <li key={i} className="text-muted-foreground"><span className="text-foreground">{titleCase(h.label)}</span> · {fmtDate(h.at)}{h.by ? ` · ${h.by}` : ""}{h.note ? ` — ${h.note}` : ""}</li>
                    ))}
                  </ul>
                )}
                {(data.risk?.investigationNotes ?? []).length === 0 && (data.risk?.escalationHistory ?? []).length === 0 && (
                  <Empty>No investigation activity yet.</Empty>
                )}
                {(data.risk?.investigationNotes ?? []).length > 0 && (
                  <ul className="space-y-2">
                    {data.risk.investigationNotes.map((n: any) => (
                      <li key={n.id} className="rounded-md border border-border bg-muted/30 p-2 text-xs">
                        <div className="text-muted-foreground">{fmtDate(n.at)} {n.author?.full_name ? `· ${n.author.full_name}` : ""}</div>
                        <div className="text-foreground mt-0.5 whitespace-pre-wrap">{n.note}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </Card>

          {/* Linked Records */}
          <Card>
            <CardHeader title="Linked Records" />
            <div className="px-4 pb-4">
              {data.linkedRecords.length === 0 && <Empty>No linked records.</Empty>}
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {data.linkedRecords.map((r, i) => {
                  const inner = (
                    <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/30 p-3 hover:bg-muted/60 transition-colors">
                      <div className="min-w-0">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{titleCase(r.type)}</div>
                        <div className="text-sm font-medium text-foreground truncate">{r.label}</div>
                        {r.subtitle && <div className="text-[11px] text-muted-foreground truncate">{r.subtitle}</div>}
                      </div>
                      <div className="text-right shrink-0">
                        {r.amount != null && <div className="text-sm tabular-nums font-semibold">{ngn(r.amount)}</div>}
                        {r.status && <StatusBadge value={r.status} />}
                      </div>
                    </div>
                  );
                  return (
                    <li key={i}>
                      {r.route ? <button type="button" onClick={() => navigate(r.route!)} className="w-full text-left">{inner}</button> : inner}
                    </li>
                  );
                })}
              </ul>
            </div>
          </Card>
        </div>
      )}

      {/* Mobile sticky action bar */}
      {!loading && !denied && !notFound && data && (
        <div className="lg:hidden fixed bottom-0 inset-x-0 z-30 border-t border-border bg-card/95 backdrop-blur px-3 py-2 flex items-center gap-2">
          {adminCan.canOpenInvestigation ? (
            <Button size="sm" className="flex-1 bg-red-500 hover:bg-red-600 text-white" onClick={() => setInvestigateOpen(true)}>
              <Search className="h-4 w-4 mr-1.5" /> Investigate
            </Button>
          ) : adminCan.canManageDispute && dispute ? (
            <Button size="sm" className="flex-1 bg-orange-500 hover:bg-orange-600 text-white" onClick={() => navigate(`/admin/disputes/${dispute.id}`)}>
              <Scale className="h-4 w-4 mr-1.5" /> Manage Dispute
            </Button>
          ) : (
            <Button size="sm" variant="outline" className="flex-1" onClick={() => setNoteOpen(true)}>
              <StickyNote className="h-4 w-4 mr-1.5" /> Add Note
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setActionSheetOpen(true)} aria-label="More">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Mobile actions sheet */}
      <Sheet open={actionSheetOpen} onOpenChange={setActionSheetOpen}>
        <SheetContent side="bottom" className="rounded-t-xl">
          <SheetHeader><SheetTitle>Actions</SheetTitle></SheetHeader>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {adminCan.canFreeze && <Button variant="outline" onClick={() => { setActionSheetOpen(false); setFreezeOpen(true); }}><Snowflake className="h-4 w-4 mr-1.5" /> Freeze Funds</Button>}
            {adminCan.canUnfreeze && <Button variant="outline" onClick={() => { setActionSheetOpen(false); setUnfreezeOpen(true); }}><Snowflake className="h-4 w-4 mr-1.5" /> Unfreeze</Button>}
            {adminCan.canFlagForReview && <Button variant="outline" onClick={() => { setActionSheetOpen(false); setFlagOpen(true); }}><Flag className="h-4 w-4 mr-1.5" /> Flag for Review</Button>}
            {adminCan.canManageDispute && dispute && <Button variant="outline" onClick={() => { setActionSheetOpen(false); navigate(`/admin/disputes/${dispute.id}`); }}><Scale className="h-4 w-4 mr-1.5" /> Manage Dispute</Button>}
            {adminCan.canAddNote && <Button variant="outline" onClick={() => { setActionSheetOpen(false); setNoteOpen(true); }}><StickyNote className="h-4 w-4 mr-1.5" /> Add Note</Button>}
            {adminCan.canViewBuyer && data?.parties?.buyer?.id && <Button variant="outline" onClick={() => { setActionSheetOpen(false); navigate(`/admin/users/${data.parties.buyer!.id}`); }}><User className="h-4 w-4 mr-1.5" /> View Buyer</Button>}
            {adminCan.canViewSeller && data?.parties?.seller?.id && <Button variant="outline" onClick={() => { setActionSheetOpen(false); navigate(`/admin/users/${data.parties.seller!.id}`); }}><User className="h-4 w-4 mr-1.5" /> View Seller</Button>}
            {adminCan.canExport && <Button variant="outline" onClick={() => { setActionSheetOpen(false); exportData(); }}><Download className="h-4 w-4 mr-1.5" /> Export</Button>}
            <Button variant="outline" onClick={() => { setActionSheetOpen(false); navigator.clipboard.writeText(code); toast.success("Code copied"); }}>
              <Receipt className="h-4 w-4 mr-1.5" /> Copy Code
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <ActionConfirmDialog
        open={freezeOpen}
        onOpenChange={setFreezeOpen}
        title="Freeze Funds"
        description="Type FREEZE to confirm freezing the escrow funds for this transaction."
        typeToConfirm="FREEZE"
        confirmLabel="Freeze Funds"
        confirmTone="danger"
        onConfirm={async (reason) => {
          if (!transactionId) return;
          await freezeTransaction(transactionId, reason ?? "manual_hold");
          toast.success("Funds frozen");
          setReloadKey((k) => k + 1);
        }}
      />
      <ActionConfirmDialog
        open={unfreezeOpen}
        onOpenChange={setUnfreezeOpen}
        title="Unfreeze Funds"
        description={`Move funds for #${code} back to pending release. No money is moved out yet.`}
        confirmLabel="Unfreeze"
        confirmTone="primary"
        onConfirm={async (reason) => {
          if (!transactionId) return;
          await unfreezeTransaction(transactionId, reason);
          toast.success("Funds unfrozen");
          setReloadKey((k) => k + 1);
        }}
      />
      <ActionConfirmDialog
        open={flagOpen}
        onOpenChange={setFlagOpen}
        title="Flag for Review"
        description={`Flag #${code} for the admin review queue. Provide a reason.`}
        confirmLabel="Flag for Review"
        confirmTone="danger"
        onConfirm={async (reason) => {
          if (!transactionId) return;
          await flagForReview(transactionId, reason);
          toast.success("Flagged for review");
          setReloadKey((k) => k + 1);
        }}
      />
      <ActionConfirmDialog
        open={investigateOpen}
        onOpenChange={setInvestigateOpen}
        title="Open Investigation"
        description={`Create an investigation record for #${code}. This is logged in the audit trail.`}
        reasonMin={1}
        confirmLabel="Open Investigation"
        confirmTone="primary"
        onConfirm={async (reason) => {
          if (!transactionId) return;
          await openInvestigation(transactionId, reason);
          toast.success("Investigation opened");
          setReloadKey((k) => k + 1);
        }}
      />
      <InternalNoteDialog
        open={noteOpen}
        onOpenChange={setNoteOpen}
        transactionCode={code}
        onSubmit={async (note, noteType) => {
          if (!transactionId) return;
          await addInternalNoteTyped(transactionId, note, noteType);
          toast.success("Note added");
          setReloadKey((k) => k + 1);
        }}
      />
    </AdminLayout>
  );
}
