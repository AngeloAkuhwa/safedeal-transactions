import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router";
import { ArrowLeft, AlertTriangle, Download, Scale, ShieldCheck, Snowflake, MoreVertical, ExternalLink, Truck, Package, CreditCard, Lock, Circle, StickyNote, Search, Flag, MoreHorizontal, User, Wallet, Receipt, Clock, Vault, Gavel, Image as ImageIcon, Coins, Banknote, FileText, Video, ChevronDown, ChevronUp, Eye, FileSignature, Copy, ChevronRight } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import {
  getAdminTransactionDetailFull,
  AdminAccessRequiredError,
  TransactionNotFoundError,
  type AdminTxDetailResponse,
  type AdminTxEvidenceItem,
} from "@/services/admin-transaction-detail.service";
import {
  flagForReview,
  freezeTransactionDetailed, unfreezeTransactionDetailed,
  upsertInvestigation, addInternalNoteDetailed,
  exportTransactionData,
  resolveDispute, disputeRequestMoreInfo, DisputeEscalationRequiredError,
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
import { AgreementPreviewDialog } from "@/components/admin/transactions/AgreementPreviewDialog";
import { EvidencePreviewDialog } from "@/components/admin/transactions/EvidencePreviewDialog";
import { FreezeFundsDialog } from "@/components/admin/transactions/FreezeFundsDialog";
import { UnfreezeFundsDialog } from "@/components/admin/transactions/UnfreezeFundsDialog";
import { ResolveDisputeDialog } from "@/components/admin/transactions/ResolveDisputeDialog";
import { ExportDataDialog } from "@/components/admin/transactions/ExportDataDialog";
import { InvestigationDrawer } from "@/components/admin/transactions/InvestigationDrawer";
import {
  MONEY_STATUS_META, moneyStatusLabel, activeEscrowDisplay,
} from "@/components/admin/transactions/MoneyStatus";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { deriveDisputeDisplay } from "@/lib/dispute-display-status";
import { deriveActiveState, riskBannerTone, visibleRiskFlags, flagChipTone } from "@/lib/admin-active-state";
import { AdminCaseTimeline } from "@/components/admin/timeline/AdminCaseTimeline";
import { performFlaggedAction } from "@/services/admin-flagged-users.service";
import { useAdminPermissions } from "@/context/AdminPermissionsContext";
import { ProductImage } from "@/components/common/ProductImage";
import { UserAvatar } from "@/components/common/UserAvatar";
import { ADMIN_SOLID, ADMIN_TONE } from "@/components/admin/palette";

// formatMoney dashes a missing amount; the old `?? 0` here defeated that and
// stamped ₦0.00 over every absent figure on the admin detail page.
const ngn = (v: number | null | undefined) => formatMoney(v, "NGN");

// Sum of the figures that are actually recorded. Absent ones contribute
// nothing; they are never invented as 0, and a sum over nothing is 0, which
// the > 0 gates below treat as "nothing to show".
const sumRecorded = (...values: unknown[]) =>
  values.map(Number).filter((n) => !Number.isNaN(n)).reduce((a, b) => a + b, 0);

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
const titleCase = (s?: string | null) =>
  (s ?? "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const TX_STATUS_CLS: Record<string, string> = {
  draft: ADMIN_TONE.neutral.badge,
  awaiting_payment: ADMIN_TONE.warning.badge,
  payment_secured: ADMIN_TONE.info.badge,
  seller_preparing_delivery: ADMIN_TONE.info.badge,
  seller_dispatched: ADMIN_TONE.info.badge,
  delivered_awaiting_verification: ADMIN_TONE.special.badge,
  completed: ADMIN_TONE.success.badge,
  cancelled: ADMIN_TONE.neutral.badge,
  refunded: ADMIN_TONE.neutral.badge,
  disputed: ADMIN_TONE.elevated.badge,
  resolved: ADMIN_TONE.success.badge,
  timed_out: ADMIN_TONE.danger.badge,
};

function StatusPill({ value, cls }: { value?: string | null; cls?: string }) {
  if (!value) return <span className="text-xs text-muted-foreground">—</span>;
  const klass = cls ?? TX_STATUS_CLS[value] ?? ADMIN_TONE.neutral.badge;
  return (
    <span className={cn("inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold whitespace-nowrap", klass)}>
      {titleCase(value)}
    </span>
  );
}
function MoneyPill({ value }: { value?: string | null }) {
  if (!value) return <span className="text-xs text-muted-foreground">—</span>;
  const meta = MONEY_STATUS_META[value];
  return (
    <span className={cn(
      "inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold whitespace-nowrap",
      meta?.classes ?? ADMIN_TONE.neutral.badge,
    )}>
      {moneyStatusLabel(value)}
    </span>
  );
}

function Card({ children, className, accent }: { children: React.ReactNode; className?: string; accent?: "orange" | "red" | "none" }) {
  const a = accent === "orange" ? "border-l-4 border-l-orange-500" : accent === "red" ? "border-l-4 border-l-red-500" : "";
  return <section className={cn("rounded-xl border border-border bg-card", a, className)}>{children}</section>;
}
function CardHeader({ title, subtitle, action }: { title: React.ReactNode; subtitle?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 lg:px-6 py-4 border-b border-border">
      <div className="min-w-0">
        <h2 className="text-sm lg:text-base font-semibold text-foreground">{title}</h2>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {action && <div className="flex items-center gap-2 shrink-0">{action}</div>}
    </div>
  );
}
function MobileAccordion({ title, defaultOpen, action, children }: { title: string; defaultOpen?: boolean; action?: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <Card>
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between gap-3 px-4 py-3 border-b border-border lg:hidden">
        <span className="text-sm font-semibold text-foreground">{title}</span>
        <div className="flex items-center gap-2">{action}{open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}</div>
      </button>
      <div className="hidden lg:flex items-center justify-between gap-3 px-6 py-4 border-b border-border">
        <h2 className="text-sm lg:text-base font-semibold text-foreground">{title}</h2>
        {action}
      </div>
      <div className={cn("p-4 lg:p-6", !open && "hidden lg:block")}>{children}</div>
    </Card>
  );
}
function Avatar({ name, src, size = 32 }: { name?: string | null; src?: string | null; size?: number }) {
  // Sized by prop rather than class, so the box classes carry no dimensions
  // and the wrapper supplies them inline.
  return (
    <span className="inline-flex" style={{ width: size, height: size }}>
      <UserAvatar
        url={src}
        name={name}
        alt={name ?? ""}
        className="w-full h-full rounded-full object-cover"
        fallbackClassName="w-full h-full rounded-full bg-muted text-foreground flex items-center justify-center text-xs font-semibold"
      />
    </span>
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
function evidenceIcon(kind: string, mime?: string | null) {
  const m = (mime ?? "").toLowerCase();
  if (m.startsWith("image/") || kind === "image") return ImageIcon;
  if (m.startsWith("video/") || kind === "video") return Video;
  if (m === "application/pdf") return FileText;
  if (kind === "receipt") return Receipt;
  if (kind === "delivery_proof") return Truck;
  return FileText;
}

const TL_FILTERS = [
  { key: "all", label: "All" },
  { key: "payment", label: "Payment" },
  { key: "escrow_ledger", label: "Escrow" },
  { key: "delivery", label: "Delivery" },
  { key: "dispute", label: "Dispute" },
  { key: "admin_action", label: "Admin" },
  { key: "money_status", label: "Money" },
] as const;

export default function AdminTransactionDetail() {
  const { transactionId } = useParams<{ transactionId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = (location.state as { returnTo?: string } | null)?.returnTo ?? "/admin/transactions";
  const monitorRowSnapshot = (location.state as { monitorRow?: unknown } | null)?.monitorRow ?? null;

  const [data, setData] = useState<AdminTxDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  const [freezeOpen, setFreezeOpen] = useState(false);
  const [unfreezeOpen, setUnfreezeOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [flagOpen, setFlagOpen] = useState(false);
  const [flagUserTarget, setFlagUserTarget] = useState<null | { id: string; role: "buyer" | "seller"; name: string }>(null);
  const [investigateOpen, setInvestigateOpen] = useState(false);
  const [resolveDisputeOpen, setResolveDisputeOpen] = useState(false);
  const [agreementOpen, setAgreementOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [evidencePreview, setEvidencePreview] = useState<AdminTxEvidenceItem | null>(null);
  const [showFullTimeline, setShowFullTimeline] = useState(false);
  const [tlFilter, setTlFilter] = useState<string>("all");
  const [tlNewest, setTlNewest] = useState(true);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [, setSyncTick] = useState(0);
  const [liveSync, setLiveSync] = useState<"connecting" | "live" | "off">("connecting");
  const [activeAnchor, setActiveAnchor] = useState<string>("summary");
  const realtimeDebounceRef = useRef<number | null>(null);
  const lastRealtimeToastRef = useRef<number>(0);

  const motionOk = typeof window !== "undefined"
    ? !window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : true;
  const anim = (cls: string) => (motionOk ? cls : "");

  useEffect(() => {
    if (!transactionId) { setNotFound(true); setLoading(false); return; }
    setLoading(true); setErr(null); setDenied(false); setNotFound(false);
    getAdminTransactionDetailFull(transactionId)
      .then((d) => {
        setData(d);
        setLastSyncedAt(new Date());
        // Dev-only: warn if the row snapshot we navigated from disagrees with detail.
        if (import.meta.env.DEV && monitorRowSnapshot) {
          import("@/lib/admin-consistency").then((m) => {
            try { m.assertMonitorDetailConsistent(monitorRowSnapshot as never, d as never); } catch {}
          });
        }
      })
      .catch((e) => {
        if (e instanceof AdminAccessRequiredError) setDenied(true);
        else if (e instanceof TransactionNotFoundError) setNotFound(true);
        else setErr((e as Error).message ?? "Failed to load transaction");
      })
      .finally(() => setLoading(false));
  }, [transactionId, reloadKey]);

  // Tick relative "Synced …" label every 30s
  useEffect(() => {
    const id = setInterval(() => setSyncTick((n) => n + 1), 30000);
    return () => clearInterval(id);
  }, []);

  // Realtime subscription for this transaction
  useEffect(() => {
    if (!transactionId || denied) return;
    setLiveSync("connecting");
    const channel = supabase.channel(`admin-tx-detail-${transactionId}`);
    const tables = [
      { table: "transactions", filter: `id=eq.${transactionId}` },
      { table: "transaction_events", filter: `transaction_id=eq.${transactionId}` },
      { table: "money_status_history", filter: `transaction_id=eq.${transactionId}` },
      { table: "disputes", filter: `transaction_id=eq.${transactionId}` },
      { table: "dispute_responses", filter: undefined as string | undefined },
      { table: "payments", filter: `transaction_id=eq.${transactionId}` },
      { table: "payouts", filter: `transaction_id=eq.${transactionId}` },
      { table: "escrow_ledger_entries", filter: `transaction_id=eq.${transactionId}` },
      { table: "admin_actions", filter: `transaction_id=eq.${transactionId}` },
    ];
    const onChange = () => {
      if (realtimeDebounceRef.current) window.clearTimeout(realtimeDebounceRef.current);
      realtimeDebounceRef.current = window.setTimeout(() => {
        setReloadKey((k) => k + 1);
        const now = Date.now();
        if (now - lastRealtimeToastRef.current > 5000) {
          lastRealtimeToastRef.current = now;
          toast("Transaction updated", { duration: 2500 });
        }
      }, 700);
    };
    for (const t of tables) {
      channel.on(
        "postgres_changes" as any,
        t.filter
          ? { event: "*", schema: "public", table: t.table, filter: t.filter }
          : { event: "*", schema: "public", table: t.table },
        onChange,
      );
    }
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") setLiveSync("live");
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") setLiveSync("off");
    });
    return () => {
      if (realtimeDebounceRef.current) window.clearTimeout(realtimeDebounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [transactionId, denied]);

  // Active section anchor (desktop)
  useEffect(() => {
    if (!data || loading) return;
    const ids = ["summary", "risk", "timeline", "linked-records", "agreement", "escrow-ledger", "delivery", "audit"];
    const els = ids.map((id) => document.getElementById(id)).filter(Boolean) as HTMLElement[];
    if (els.length === 0) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => (a.boundingClientRect.top - b.boundingClientRect.top))[0];
        if (visible) setActiveAnchor(visible.target.id);
      },
      { rootMargin: "-160px 0px -60% 0px", threshold: 0 },
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [data, loading]);

  const tx = data?.transaction;
  const dispute = data?.dispute;
  const adminCan = data?.adminActionsAvailable ?? {};
  const { hasAny } = useAdminPermissions();
  const canResolveDispute = hasAny([
    "disputes.resolve_all",
    "disputes.resolve_assigned",
    "financial_controls.approve",
  ]);
  const evidence: AdminTxEvidenceItem[] = data?.evidence ?? [];
  const lockedAgreement = data?.lockedAgreement ?? null;

  const disputeOutcome = (dispute?.outcome ?? null) as
    | { type?: string; outcome_type?: string; refundAmount?: number; releaseAmount?: number; refund_amount?: number; release_amount?: number; summary?: string }
    | null;
  const disputeDisplay = useMemo(() => {
    if (!dispute) return null;
    return deriveDisputeDisplay({
      disputeStatus: dispute.status ?? null,
      outcome: disputeOutcome
        ? {
            outcome_type: (disputeOutcome.outcome_type ?? disputeOutcome.type ?? "") as string,
            // Absent amounts stay absent: deriveDisputeDisplay now shows a
            // split row only when its figure is actually recorded.
            refund_amount: disputeOutcome.refund_amount ?? disputeOutcome.refundAmount ?? null,
            release_amount: disputeOutcome.release_amount ?? disputeOutcome.releaseAmount ?? null,
          }
        : null,
      moneyStatus: tx?.moneyStatus ?? null,
      escrow: {
        heldAmount: (data?.escrow as any)?.heldAmount ?? null,
        frozenAmount: (data?.escrow as any)?.frozenAmount ?? null,
      },
    });
  }, [dispute, disputeOutcome, tx?.moneyStatus, data?.escrow]);
  const disputeResolved = !!disputeDisplay?.resolved;
  const disputeOpen = !!dispute && !disputeResolved && dispute.status !== "closed";

  // Centralised active-state: overrides ad-hoc `disputeOpen` / `funds_frozen`
  // checks so resolved/unfrozen cases drop their banners immediately.
  const active = useMemo(
    () =>
      deriveActiveState({
        dispute: dispute ?? null,
        investigation: (data as any)?.investigation ?? null,
        moneyStatus: tx?.moneyStatus ?? null,
        escrow: (data?.escrow as any) ?? null,
        risk: data?.risk ?? null,
        payout: (data as any)?.payout ?? null,
        needsReleaseReview: !!(data as any)?.transaction?.needsAdminReview,
      }),
    [dispute, data, tx?.moneyStatus],
  );

  const toneToClasses = (tone: string | undefined) => {
    switch (tone) {
      case "danger": return ADMIN_TONE.danger.badge;
      case "warning": return ADMIN_TONE.elevated.badge;
      case "success": return ADMIN_TONE.success.badge;
      case "info": return ADMIN_TONE.info.badge;
      default: return ADMIN_TONE.neutral.badge;
    }
  };

  const code = tx?.transactionCode ?? transactionId?.slice(0, 8) ?? "";
  const itemTitle = data?.items?.[0]?.title ?? "Transaction";

  // Accent derives strictly from *current* active blockers, never historical
  // state. Once funds are unfrozen or the dispute is resolved, the page tone
  // returns to neutral immediately.
  const accent: "red" | "orange" | "none" =
    active.isFrozen ? "red"
    : active.isDisputeActive ? "orange"
    : "none";

  const escrowDisplay = useMemo(
    () => activeEscrowDisplay(tx?.moneyStatus, data?.escrow, data?.pricing?.buyerTotal ?? null),
    [tx?.moneyStatus, data?.escrow, data?.pricing?.buyerTotal],
  );

  // Synthesize risk flags so the page never says "no activity" when state implies risk
  const synthesizedFlags = useMemo(() => {
    if (!data) return [];
    const out: { label: string; severity: "low" | "medium" | "high" }[] = [];
    if (active.isFrozen) out.push({ label: "Funds frozen", severity: "high" });
    if (active.isDisputeActive) {
      out.push({ label: "Dispute open", severity: "medium" });
    }
    if (active.isOverdue) out.push({ label: "Dispute response overdue", severity: "high" });
    if (active.isEscalated) out.push({ label: "Dispute escalated", severity: "high" });
    if (active.isInvestigationActive) out.push({ label: "Investigation open", severity: "medium" });
    // NaN >= 500000 is false, so an absent total simply raises no flag; no
    // zero is invented for money.
    const total = Number(data.pricing?.buyerTotal);
    if (total >= 500_000) out.push({ label: "High-value transaction", severity: "medium" });
    if (data.parties?.buyer?.flagged) out.push({ label: "Buyer account flagged", severity: "high" });
    return out;
  }, [data, active]);

  const allFlags = useMemo(() => {
    const seen = new Set<string>();
    const merged = [...(data?.risk?.flags ?? []), ...synthesizedFlags];
    const deduped = merged.filter((f: any) => {
      const k = (f.label ?? "").toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    // Hide flags that are purely historical now (e.g. "Dispute: Resolved",
    // stale "manual_hold" after release-review cleared, stale "frozen").
    return visibleRiskFlags(deduped, active);
  }, [data?.risk?.flags, synthesizedFlags, active]);

  const exportData = () => {
    if (!data) return;
    const payload = {
      exportedAt: new Date().toISOString(),
      transaction: (data as any).transaction ?? (data as any).summary ?? null,
      parties: (data as any).parties ?? null,
      items: (data as any).items ?? null,
      pricing: (data as any).pricing ?? null,
      payment: (data as any).payment ?? null,
      escrow: (data as any).escrow ?? null,
      escrowLedger: (data as any).escrowLedger ?? (data as any).ledger ?? null,
      payout: (data as any).payout ?? null,
      delivery: (data as any).delivery ?? null,
      timeline: (data as any).timeline ?? [],
      linkedRecords: (data as any).linkedRecords ?? null,
      agreement: (data as any).lockedAgreement ?? (data as any).agreement ?? null,
      risk: (data as any).risk ?? null,
      dispute: (() => {
        const d: any = (data as any).dispute;
        if (!d) return null;
        const ev = Array.isArray((data as any).evidence) ? (data as any).evidence : (d.evidence ?? []);
        return {
          ...d,
          evidence: (ev ?? []).map((e: any) => ({
            id: e.id, kind: e.kind ?? e.evidenceType, title: e.title,
            mimeType: e.mimeType ?? null, uploadedAt: e.uploadedAt ?? e.at ?? null,
            uploadedByRole: e.uploadedByRole ?? e.submittedByRole ?? null,
            fileHash: e.fileHash ?? null,
          })),
        };
      })(),
      adminNotes: (data as any).adminNotes ?? (data as any).notes ?? null,
      auditTrail: (data as any).auditTrail ?? (data as any).audit ?? null,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `transaction-${code}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  const scrollToId = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const filteredTimeline = useMemo(() => {
    const list = [...(data?.timeline ?? [])];
    list.sort((a, b) => {
      const t = new Date(b.at).getTime() - new Date(a.at).getTime();
      return tlNewest ? t : -t;
    });
    return tlFilter === "all" ? list : list.filter((e) => (e.type ?? "").includes(tlFilter));
  }, [data?.timeline, tlFilter, tlNewest]);

  const visibleTimeline = showFullTimeline ? filteredTimeline : filteredTimeline.slice(0, 8);
  // Banner tone is now derived from *current* blockers only: resolved
  // disputes / unfrozen funds with only a pending release no longer paint
  // the page red.
  const bannerTone = useMemo(
    () => riskBannerTone(active, data?.risk?.level),
    [active, data?.risk?.level],
  );
  const showHighRisk = bannerTone === "red";
  const showReleaseReviewBanner = bannerTone === "amber";
  // "Investigate" CTA is only meaningful when there is an active
  // investigation OR truly high/critical risk.
  const showInvestigateCTA =
    active.isInvestigationActive ||
    data?.risk?.level === "high" ||
    data?.risk?.level === "critical";
  // Seller payout amount: prefer server-provided sellerNet, fall back to
  // itemTotal. NEVER use buyerTotal (which includes protection fee + any
  // processing fee that belongs to SafeDeal, not the seller).
  const sellerPayoutAmount = useMemo(() => {
    const p: any = data?.pricing ?? {};
    const net = Number(p.sellerNet);
    if (net > 0) return net;
    // Absent pricing dashes downstream (ngn) instead of claiming ₦0.00.
    const item = Number(p.itemTotal);
    return Number.isNaN(item) ? null : item;
  }, [data?.pricing]);

  const liveDotCls =
    liveSync === "live" ? ADMIN_TONE.success.dot :
    liveSync === "connecting" ? ADMIN_TONE.warning.dot : "bg-slate-500";
  const liveDotTitle =
    liveSync === "live" ? "Live updates connected" :
    liveSync === "connecting" ? "Connecting…" : "Live updates offline";

  // Header (desktop)
  const headerSlot = (
    <header className={cn("sticky top-0 z-sticky hidden lg:block border-b border-border bg-background/95 backdrop-blur", anim("animate-fade-in"))}>
      <div className="flex items-center justify-between gap-4 px-6 pt-3 pb-3">
        <div className="flex items-center gap-3 min-w-0">
          <button type="button" onClick={() => navigate(returnTo)} className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted min-h-11 min-w-11 inline-flex items-center justify-center" aria-label="Back">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-xs text-muted-foreground mb-0.5">
              <span>Admin</span>
              <ChevronRight className="h-3 w-3" />
              <button type="button" onClick={() => navigate(returnTo)} className="hover:text-foreground transition-colors min-h-11 inline-flex items-center">Transactions</button>
              <ChevronRight className="h-3 w-3" />
              <span className="text-foreground font-medium truncate max-w-[220px]">#{code}</span>
            </nav>
            <div className="flex items-center gap-1.5 min-w-0">
              <h1 className="text-lg font-semibold text-foreground truncate">Transaction #{code}</h1>
              <button
                type="button"
                onClick={() => { navigator.clipboard.writeText(code); toast.success("Code copied"); }}
                className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted shrink-0 min-h-11 min-w-11 inline-flex items-center justify-center"
                title="Copy code"
                aria-label="Copy transaction code"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground truncate">{itemTitle} {tx?.status ? `— ${titleCase(tx.status)}` : ""}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden xl:flex items-center gap-1.5 text-xs text-muted-foreground mr-1" title={liveDotTitle}>
            <span className={cn("h-2 w-2 rounded-full", liveDotCls, liveSync === "live" && motionOk && "sd-live-dot")} />
            <span>Synced {lastSyncedAt ? relTime(lastSyncedAt.toISOString()) : "—"}</span>
          </div>
          {adminCan.canExport && (
            <Button variant="outline" size="sm" onClick={() => setExportOpen(true)}>
              <Download className="h-4 w-4 mr-1.5" /> Export
            </Button>
          )}
          {dispute && (
            <Button size="sm" className={ADMIN_SOLID.elevated} onClick={() => navigate(`/admin/disputes/${dispute.id}`)}>
              <Scale className="h-4 w-4 mr-1.5" /> View Dispute
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" aria-label="More actions"><MoreHorizontal className="h-4 w-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {adminCan.canOpenInvestigation && <DropdownMenuItem onClick={() => setInvestigateOpen(true)}><Search className="h-4 w-4 mr-2" /> {adminCan.investigationAlreadyOpen ? "Update Investigation" : "Open Investigation"}</DropdownMenuItem>}
              {adminCan.canFreeze && <DropdownMenuItem onClick={() => setFreezeOpen(true)}><Snowflake className="h-4 w-4 mr-2" /> Freeze Funds</DropdownMenuItem>}
              {adminCan.canUnfreeze && <DropdownMenuItem onClick={() => setUnfreezeOpen(true)}><Snowflake className="h-4 w-4 mr-2" /> Unfreeze Funds</DropdownMenuItem>}
              {adminCan.canAddNote && <DropdownMenuItem onClick={() => setNoteOpen(true)}><StickyNote className="h-4 w-4 mr-2" /> Add Internal Note</DropdownMenuItem>}
              {adminCan.canFlagForReview && <DropdownMenuItem onClick={() => setFlagOpen(true)}><Flag className="h-4 w-4 mr-2" /> Flag for Review</DropdownMenuItem>}
              <DropdownMenuItem
                disabled={!adminCan.canManageDispute}
                onClick={() => dispute && navigate(`/admin/disputes/${dispute.id}`)}
                title={!adminCan.canManageDispute ? "No active dispute on this transaction" : undefined}
              >
                <Scale className="h-4 w-4 mr-2" /> Manage Dispute
              </DropdownMenuItem>
              {adminCan.canViewBuyer && data?.parties?.buyer?.id && (
                <DropdownMenuItem onClick={() => navigate(`/admin/users/${data.parties.buyer!.id}`)}><User className="h-4 w-4 mr-2" /> View Buyer</DropdownMenuItem>
              )}
              {adminCan.canViewSeller && data?.parties?.seller?.id && (
                <DropdownMenuItem onClick={() => navigate(`/admin/users/${data.parties.seller!.id}`)}><User className="h-4 w-4 mr-2" /> View Seller</DropdownMenuItem>
              )}
              {data?.parties?.buyer?.id && (
                <DropdownMenuItem onClick={() => navigate(`/admin/flagged-users?u=${data.parties.buyer!.id}`)}>
                  <Flag className="h-4 w-4 mr-2" /> Review Buyer in Flagged Users
                </DropdownMenuItem>
              )}
              {data?.parties?.seller?.id && (
                <DropdownMenuItem onClick={() => navigate(`/admin/flagged-users?u=${data.parties.seller!.id}`)}>
                  <Flag className="h-4 w-4 mr-2" /> Review Seller in Flagged Users
                </DropdownMenuItem>
              )}
              {data?.parties?.buyer?.id && (
                <DropdownMenuItem onClick={() => setFlagUserTarget({ id: data.parties.buyer!.id, role: "buyer", name: data.parties.buyer!.name ?? "Buyer" })}>
                  <Flag className="h-4 w-4 mr-2 text-red-500" /> Flag Buyer for Fraud Review
                </DropdownMenuItem>
              )}
              {data?.parties?.seller?.id && (
                <DropdownMenuItem onClick={() => setFlagUserTarget({ id: data.parties.seller!.id, role: "seller", name: data.parties.seller!.name ?? "Seller" })}>
                  <Flag className="h-4 w-4 mr-2 text-red-500" /> Flag Seller for Fraud Review
                </DropdownMenuItem>
              )}
              {adminCan.canViewPayment && (
                <DropdownMenuItem onClick={() => scrollToId("linked-records")}><CreditCard className="h-4 w-4 mr-2" /> View Payment Record</DropdownMenuItem>
              )}
              {adminCan.canViewEscrow && (
                <DropdownMenuItem onClick={() => scrollToId("escrow-ledger")}><Coins className="h-4 w-4 mr-2" /> View Escrow Ledger</DropdownMenuItem>
              )}
              {adminCan.canViewPayout && (
                <DropdownMenuItem onClick={() => scrollToId("payouts")}><Banknote className="h-4 w-4 mr-2" /> View Payout Record</DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => { navigator.clipboard.writeText(code); toast.success("Code copied"); }}>
                <Receipt className="h-4 w-4 mr-2" /> Copy Code
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {/* Section anchor strip */}
      {data && (
        <div className="border-t border-border/60 px-6 py-1.5 overflow-x-auto">
          <ul className="flex items-center gap-1 text-xs">
            {[
              { id: "summary", label: "Summary" },
              { id: "risk", label: "Risk" },
              { id: "timeline", label: "Timeline" },
              { id: "linked-records", label: "Records" },
              { id: "agreement", label: "Agreement" },
              { id: "escrow-ledger", label: "Payment" },
              { id: "delivery", label: "Delivery" },
              { id: "audit", label: "Audit" },
            ].map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => scrollToId(s.id)}
                  className={cn(
                    "px-2.5 py-1 rounded-md whitespace-nowrap transition-colors min-h-11",
                    activeAnchor === s.id
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted",
                  )}
                >
                  {s.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </header>
  );

  const mobileHeaderSlot = ({ onOpenMenu }: { onOpenMenu: () => void }) => (
    <header className="lg:hidden sticky top-0 z-sticky border-b border-border bg-card">
      <div className="flex items-center justify-between px-3 py-2.5">
        <button type="button" onClick={() => navigate(returnTo)} className="p-2 text-muted-foreground min-h-11 min-w-11 inline-flex items-center justify-center" aria-label="Back"><ArrowLeft className="h-4 w-4" /></button>
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-emerald-500 flex items-center justify-center">
          <ShieldCheck className="h-4 w-4 text-white" />
        </div>
        <button type="button" onClick={onOpenMenu} className="p-2 text-muted-foreground min-h-11 min-w-11 inline-flex items-center justify-center" aria-label="Menu"><MoreVertical className="h-4 w-4" /></button>
      </div>
    </header>
  );

  return (
    <AdminLayout title={`Transaction #${code}`} subtitle={itemTitle} headerSlot={headerSlot} mobileHeaderSlot={mobileHeaderSlot}>
      {loading && (
        <div className="space-y-4 max-w-[1440px] mx-auto">
          <div className="h-10 rounded-md bg-muted/40 animate-pulse w-1/2" />
          <div className="h-48 rounded-xl border border-border bg-card animate-pulse" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="h-40 rounded-xl border border-border bg-card animate-pulse" />
            <div className="h-40 rounded-xl border border-border bg-card animate-pulse" />
          </div>
          <div className="h-64 rounded-xl border border-border bg-card animate-pulse" />
        </div>
      )}

      {denied && !loading && (
        <div className={`rounded-xl border ${ADMIN_TONE.danger.panel} p-4 text-sm text-red-300`}>
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
        <div className={`rounded-xl border ${ADMIN_TONE.danger.panel} p-4 text-sm text-red-300 flex items-start gap-2`}>
          <AlertTriangle className="mt-0.5 h-4 w-4" />
          <div className="flex-1">{err}</div>
          <Button variant="outline" size="sm" onClick={() => setReloadKey((k) => k + 1)}>Retry</Button>
        </div>
      )}

      {!loading && !denied && !notFound && !err && data && tx && (
        <div className="space-y-5 lg:space-y-6 pb-28 lg:pb-6 max-w-[1440px] mx-auto">

          {/* Mobile mini-header strip */}
          <div className="lg:hidden -mx-4 -mt-4 px-4 py-4 bg-card border-b border-border">
            <h1 className="text-lg font-semibold text-foreground">#{code}</h1>
            <p className="text-sm text-muted-foreground mt-1">{itemTitle}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <StatusPill value={tx.status} />
              <MoneyPill value={tx.moneyStatus} />
              {dispute?.overdue && (
                <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold bg-red-500/20 text-red-400">Overdue</span>
              )}
            </div>
          </div>

          {/* Risk banner: red only when there is an active blocker.
              An amber "pending release review" banner shows when the
              dispute is resolved but the seller payout still needs
              admin sign-off. */}
          {showHighRisk && (
            <div className="rounded-xl border border-red-500/40 bg-red-500/15 p-4 flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-500/20 text-red-300">
                <AlertTriangle className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-red-200">
                  {active.isFrozen ? "Funds Frozen" :
                   active.isInvestigationActive ? "Active Investigation" :
                   data.risk?.level === "escalated" ? "High Risk: Escalated" :
                   "High Risk Transaction"}
                </div>
                <div className="mt-0.5 text-xs text-red-300/90">
                  {data.risk?.adminReviewReason ?? "Manual review required before any release."}
                </div>
                {allFlags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {allFlags.slice(0, 4).map((f: any, i: number) => (
                      <span key={i} className="rounded border border-red-500/30 bg-red-500/15 px-1.5 py-0.5 text-xs text-red-200">{f.label}</span>
                    ))}
                  </div>
                )}
              </div>
              {showInvestigateCTA && adminCan.canOpenInvestigation && (
                <Button size="sm" className={`${ADMIN_SOLID.danger} shrink-0`} onClick={() => setInvestigateOpen(true)}>
                  <Search className="h-4 w-4 mr-1.5" /> Investigate
                </Button>
              )}
            </div>
          )}
          {showReleaseReviewBanner && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-amber-300">
                <Clock className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-amber-200">Pending release review</div>
                <div className="mt-0.5 text-xs text-amber-300/90">
                  Dispute resolved in favour of the seller. Seller payout is awaiting release.
                </div>
              </div>
            </div>
          )}

          {/* === Summary Card === */}
          <div id="summary" className={anim("animate-fade-in")}><Card accent={accent}>
            <div className="p-4 lg:p-6 bg-gradient-to-br from-card to-card/50 rounded-xl">
              {/* Primary Info Row */}
              <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 lg:gap-6 mb-6">
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">Transaction</div>
                  <div className="text-foreground text-base lg:text-xl font-bold truncate">#{code}</div>
                  <div className="text-muted-foreground text-xs mt-1">Created {fmtDate(tx.createdAt)}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">Last Activity</div>
                  <div className="text-foreground text-sm lg:text-lg font-semibold">{relTime(tx.lastActivityAt)}</div>
                  <div className="text-muted-foreground text-xs mt-1">{fmtDate(tx.lastActivityAt)}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">Total Charged</div>
                  <div
                    className="text-foreground text-base lg:text-xl font-bold tabular-nums"
                    title={`Item ${ngn(data.pricing?.itemTotal)} + Protection ${ngn(data.pricing?.protectionFee)} + Payment Processing ${ngn(data.pricing?.paymentProcessingFee ?? data.pricing?.processingFee)}`}
                  >
                    {ngn(data.pricing?.totalCharged ?? data.pricing?.buyerTotal)}
                  </div>
                  <div className="text-muted-foreground text-xs mt-1">
                    Protection {ngn(data.pricing?.protectionFee)}{data.pricing?.protectionFeeCapped ? " (capped)" : ""} · Processing {ngn(data.pricing?.paymentProcessingFee ?? data.pricing?.processingFee)}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">Payout Status</div>
                  <div><StatusPill value={data.payout?.status ?? "—"} /></div>
                  {data.payout?.blockedReason && <div className="text-muted-foreground text-xs mt-1 truncate">{data.payout.blockedReason}</div>}
                </div>
                <div className="min-w-0">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">Payment Provider</div>
                  <div className="text-foreground text-sm lg:text-lg font-semibold capitalize">{data.payment?.provider ?? "—"}</div>
                  <div className="text-muted-foreground text-xs mt-1 font-mono truncate">{data.payment?.providerReference ?? "—"}</div>
                </div>
              </dl>

              {/* Parties Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 lg:gap-6 mb-6 pb-6 border-b border-border">
                {(["buyer", "seller"] as const).map((k) => {
                  const p = data.parties[k];
                  return (
                    <div key={k} className="flex items-center gap-3">
                      <Avatar name={p?.name} src={p?.avatarUrl} size={48} />
                      <div className="min-w-0">
                        <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">{titleCase(k)}</div>
                        <div className="text-base font-semibold text-foreground truncate flex items-center gap-1.5">
                          {p?.name ?? "—"}
                          {p?.verification?.identity && <ShieldCheck className={`h-3.5 w-3.5 ${ADMIN_TONE.success.text}`} />}
                          {p?.flagged && <span className="text-xs rounded bg-red-500/20 text-red-300 px-1.5 py-0.5">{p.accountStatus}</span>}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">{p?.maskedEmail ?? p?.maskedPhone ?? `User #${(p?.id ?? "").slice(0, 8)}`}</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Status Grid: buyer-side reconciliation */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">Transaction Status</div>
                  <StatusPill value={tx.status} />
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">Money Status</div>
                  <MoneyPill value={tx.moneyStatus} />
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">Item Total</div>
                  <div className="text-foreground text-base lg:text-lg font-semibold tabular-nums">{ngn(data.pricing?.itemTotal)}</div>
                </div>
                <div title="SafeDeal protection/platform fee">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">Protection Fee</div>
                  <div className="text-foreground text-base lg:text-lg font-semibold tabular-nums">{ngn(data.pricing?.protectionFee)}</div>
                  {data.pricing?.protectionFeeCapped && (
                    <div className="text-xs text-muted-foreground mt-1">cap applied</div>
                  )}
                </div>
                <div title="Payment vendor fee from Paystack, Flutterwave, or the active payment provider">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">Payment Processing Fee</div>
                  <div className="text-foreground text-base lg:text-lg font-semibold tabular-nums">{ngn(data.pricing?.paymentProcessingFee ?? data.pricing?.processingFee)}</div>
                </div>
                <div title="Item Total + Protection Fee + Payment Processing Fee">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">Total Charged</div>
                  <div className="text-foreground text-base lg:text-lg font-semibold tabular-nums">{ngn(data.pricing?.totalCharged ?? data.pricing?.buyerTotal)}</div>
                </div>
              </div>

              {/* Seller-side payout row: only when money has reached escrow */}
              {(tx.moneyStatus === "funds_held_in_escrow"
                || tx.moneyStatus === "funds_pending_release"
                || tx.moneyStatus === "funds_releasing"
                || tx.moneyStatus === "funds_released"
                || tx.moneyStatus === "funds_frozen") && (
                <div className="mt-4 pt-4 border-t border-border grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div title="Seller-side amount after applicable deductions">
                    <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">
                      {tx.moneyStatus === "funds_released" ? "Released to Seller" : escrowDisplay.label}
                    </div>
                    <div className={cn(
                      "text-base lg:text-lg font-semibold tabular-nums",
                      tx.moneyStatus === "funds_frozen" ? "text-cyan-300" : "text-purple-400",
                    )}>{ngn(
                      (tx.moneyStatus === "funds_pending_release"
                        || tx.moneyStatus === "funds_releasing"
                        || tx.moneyStatus === "funds_released")
                        ? sellerPayoutAmount
                        : escrowDisplay.value,
                    )}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Seller-side amount after applicable deductions
                    </div>
                  </div>
                </div>
              )}

              {/* Action Row (desktop) */}
              <div className="hidden lg:flex items-center justify-between mt-6 pt-6 border-t border-border gap-4 flex-wrap">
                <div className="flex items-center gap-3 flex-wrap">
                  {disputeOpen && (
                    <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium bg-orange-500/20 text-orange-400 border border-orange-500/30">
                      <Flag className="h-3 w-3 mr-1.5" /> Escalated Dispute
                    </span>
                  )}
                  {disputeResolved && disputeDisplay && (
                    <span className={cn(
                      "inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium border",
                      toneToClasses(disputeDisplay.tone),
                    )}>
                      <Scale className="h-3 w-3 mr-1.5" /> {disputeDisplay.label}
                    </span>
                  )}
                  {dispute?.overdue && (() => {
                    const due = dispute.sellerResponseDueAt ? new Date(dispute.sellerResponseDueAt).getTime() : null;
                    const days = due ? Math.max(1, Math.floor((Date.now() - due) / (24 * 3600 * 1000))) : null;
                    return (
                      !disputeResolved && <span className={`${ADMIN_TONE.danger.text} text-sm font-medium inline-flex items-center`}>
                        <Clock className="h-3.5 w-3.5 mr-1" />
                        {days ? `Overdue: ${days} day${days === 1 ? "" : "s"} past resolution deadline` : "Overdue: past resolution deadline"}
                      </span>
                    );
                  })()}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {adminCan.canExport && <Button variant="outline" size="sm" onClick={() => setExportOpen(true)}><Download className="h-4 w-4 mr-1.5" /> Export Data</Button>}
                  {adminCan.canOpenInvestigation && <Button variant="outline" size="sm" onClick={() => setInvestigateOpen(true)} className="border-blue-500/40 text-blue-300 hover:text-blue-200"><Search className="h-4 w-4 mr-1.5" /> {adminCan.investigationAlreadyOpen ? "Update Investigation" : "Open Investigation"}</Button>}
                  {adminCan.canFreeze && <Button variant="outline" size="sm" onClick={() => setFreezeOpen(true)} className="border-red-500/40 text-red-300 hover:text-red-200"><Lock className="h-4 w-4 mr-1.5" /> Freeze Funds</Button>}
                  {adminCan.canUnfreeze && <Button variant="outline" size="sm" onClick={() => setUnfreezeOpen(true)} className="border-emerald-500/40 text-emerald-300 hover:text-emerald-200"><Snowflake className="h-4 w-4 mr-1.5" /> Unfreeze Funds</Button>}
                  {adminCan.canManageDispute && dispute && (
                    <>
                      <Button
                        size="sm"
                        variant={active.isDisputeResolved ? "outline" : undefined}
                        className={active.isDisputeResolved ? undefined : ADMIN_SOLID.elevated}
                        onClick={() => navigate(`/admin/disputes/${dispute.id}`)}
                      >
                        <Scale className="h-4 w-4 mr-1.5" />
                        {active.isDisputeResolved ? "View Dispute" : "Manage Dispute"}
                      </Button>
                      {!disputeResolved && dispute.status !== "closed" && canResolveDispute && (
                        <Button size="sm" variant="outline" className="border-emerald-500/40 text-emerald-300 hover:text-emerald-200" onClick={() => setResolveDisputeOpen(true)}>
                          <Scale className="h-4 w-4 mr-1.5" /> Resolve Dispute
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </Card></div>

          {/* === Risk & Investigation === */}
          <div id="risk" className={cn(anim("animate-fade-in"), showHighRisk && "ring-1 ring-red-500/30 rounded-xl")}><Card>
            <CardHeader
              title="Risk & Investigation"
              action={
                <div className="flex items-center gap-2">
                  <StatusPill value={data.risk?.level} />
                  {adminCan.canAddNote && (
                    <Button size="sm" variant="outline" onClick={() => setNoteOpen(true)}>
                      <StickyNote className="h-4 w-4 mr-1.5" /> Add note
                    </Button>
                  )}
                </div>
              }
            />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-4 lg:p-6">
              <div className="space-y-3">
                <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Risk Assessment</div>
                {showHighRisk ? (
                  <div className={`flex items-center justify-between p-3 ${ADMIN_TONE.danger.panel} border rounded-lg`}>
                    <div className="flex items-center gap-3">
                      <AlertTriangle className={`h-4 w-4 ${ADMIN_TONE.danger.text}`} />
                      <span className="text-foreground font-medium text-sm">
                        {active.isFrozen ? "Funds Frozen" :
                         active.isInvestigationActive ? "Investigation In Progress" :
                         "High Risk Transaction"}
                      </span>
                    </div>
                    <span className={`${ADMIN_TONE.danger.text} text-xs font-semibold tracking-wider`}>
                      {data.risk?.level === "escalated" ? "ESCALATED" : "HIGH"}
                    </span>
                  </div>
                ) : showReleaseReviewBanner ? (
                  <div className={`flex items-center justify-between p-3 ${ADMIN_TONE.warning.panel} border rounded-lg`}>
                    <div className="flex items-center gap-3">
                      <Clock className={`h-4 w-4 ${ADMIN_TONE.warning.text}`} />
                      <span className="text-foreground font-medium text-sm">Pending Release Review</span>
                    </div>
                    <span className={`${ADMIN_TONE.warning.text} text-xs font-semibold tracking-wider`}>REVIEW</span>
                  </div>
                ) : (
                  <div className={`flex items-center justify-between p-3 ${ADMIN_TONE.success.panel} border rounded-lg`}>
                    <div className="flex items-center gap-3">
                      <ShieldCheck className={`h-4 w-4 ${ADMIN_TONE.success.text}`} />
                      <span className="text-foreground font-medium text-sm">No active risk</span>
                    </div>
                    <span className="text-emerald-300 text-xs font-semibold tracking-wider">CLEAR</span>
                  </div>
                )}
                {allFlags.length === 0 ? (
                  <Empty>No risk flags.</Empty>
                ) : (
                  <ul className="space-y-2 mt-2">
                    {allFlags.map((f: any, i: number) => {
                      const tone = flagChipTone(String(f.label ?? ""));
                      const cls = tone === "red"
                        ? ADMIN_TONE.danger.text
                        : tone === "orange"
                          ? ADMIN_TONE.elevated.text
                          : "text-muted-foreground";
                      return (
                        <li key={i} className="flex items-center gap-2 text-sm">
                          <Flag className={cn("h-3.5 w-3.5 shrink-0", cls)} />
                          <span className="text-muted-foreground">{f.label}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              <div className="space-y-3 lg:border-l lg:border-border lg:pl-4">
                <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Investigation Log</div>
                {(data.risk?.investigationNotes ?? []).length === 0 ? (
                  <div className="text-xs text-muted-foreground">
                    {allFlags.length > 0
                      ? "No admin notes yet. Risk flags were generated automatically from transaction state."
                      : "No investigation activity yet."}
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {data.risk.investigationNotes.map((n: any) => (
                      <li key={n.id} className="rounded-md border border-border bg-muted/30 p-3 text-xs">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <span className="text-muted-foreground text-xs">{fmtDate(n.at)} {n.author?.full_name ? `· ${n.author.full_name}` : ""}</span>
                        </div>
                        <p className="text-foreground whitespace-pre-wrap">{n.note}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            {(data.risk?.escalationHistory ?? []).length > 0 && (
              <div className="px-4 lg:px-6 pb-4 lg:pb-6">
                <div className="border-t border-border pt-4">
                  <h4 className="text-sm font-medium text-foreground mb-3">Admin Action History</h4>
                  <ul className="space-y-2">
                    {data.risk.escalationHistory.map((h: any, i: number) => {
                      const dot = h.severity === "critical" ? ADMIN_TONE.danger.dot : h.severity === "warning" ? ADMIN_TONE.elevated.dot : ADMIN_TONE.neutral.dot;
                      return (
                        <li key={i} className="flex items-center gap-3 text-sm flex-wrap">
                          <div className={cn("w-2 h-2 rounded-full shrink-0", dot)} />
                          <span className="text-muted-foreground text-xs whitespace-nowrap">{fmtDate(h.at)}</span>
                          <span className="text-foreground">{titleCase(h.label)}</span>
                          {h.by && <span className="text-muted-foreground text-xs">by {h.by}</span>}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            )}
          </Card></div>

          {/* === Complete Transaction Timeline === */}
          <div id="timeline"><Card>
            <CardHeader
              title="Complete Transaction Timeline"
              subtitle="All events, status changes, and interventions"
              action={
                <Button size="sm" variant="ghost" className="lg:hidden" onClick={() => setTlNewest((v) => !v)}>
                  {tlNewest ? "Newest first" : "Oldest first"}
                </Button>
              }
            />
            <div className="p-4 lg:p-6">
              <div className="flex flex-wrap items-center gap-1.5 mb-4 lg:hidden">
                {TL_FILTERS.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setTlFilter(f.key)}
                    className={cn(
                      "rounded-full px-3 py-1 text-xs border min-h-11",
                      tlFilter === f.key
                        ? "bg-primary/15 border-primary/40 text-primary"
                        : "border-border text-muted-foreground hover:text-foreground",
                    )}
                  >{f.label}</button>
                ))}
              </div>
              {filteredTimeline.length === 0 ? (
                <Empty>No events recorded.</Empty>
              ) : (
                <AdminCaseTimeline
                  items={(showFullTimeline ? filteredTimeline : filteredTimeline.slice(0, 12)) as any}
                  disputeStatus={dispute?.status ?? null}
                  resolvedAt={dispute?.resolvedAt ?? null}
                />
              )}
              {filteredTimeline.length > 8 && (
                <div className="mt-4">
                  <Button size="sm" variant="link" className="text-muted-foreground hover:text-foreground p-0 min-h-11" onClick={() => setShowFullTimeline((v) => !v)}>
                    {showFullTimeline ? "Show less" : `Show full timeline (${filteredTimeline.length} events)`}
                  </Button>
                </div>
              )}
            </div>
          </Card></div>

          {/* === Linked Records === */}
          <div id="linked-records"><Card>
            <CardHeader title="Linked Records" />
            <div className="p-4 lg:p-6">
              <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {(() => {
                  const records = [...(data.linkedRecords ?? [])];
                  // Adjust escrow card to reflect frozen state
                  const idxEscrow = records.findIndex((r) => (r.type ?? "").toLowerCase() === "escrow");
                  if (idxEscrow >= 0 && tx.moneyStatus === "funds_frozen") {
                    records[idxEscrow] = {
                      ...records[idxEscrow],
                      label: "Escrow",
                      subtitle: "Frozen",
                      status: "funds_frozen",
                      amount: escrowDisplay.value,
                    };
                  }
                  // Synthesize No Payout placeholder if dispute open
                  const hasPayout = records.some((r) => (r.type ?? "").toLowerCase() === "payout");
                  if (!hasPayout && dispute) {
                    records.push({
                      type: "payout", label: "No payout yet", subtitle: "Pending dispute resolution",
                      status: null, amount: null, currency: null, route: null,
                    });
                  }
                  // Add Locked Agreement card
                  return records;
                })().map((r, i) => {
                  const typeKey = (r.type ?? "").toLowerCase();
                  const ICON_MAP: Record<string, { Icon: any; cls: string }> = {
                    payment: { Icon: CreditCard, cls: "bg-emerald-500/20 text-emerald-400" },
                    escrow: { Icon: Vault, cls: tx.moneyStatus === "funds_frozen" ? "bg-cyan-500/20 text-cyan-400" : "bg-purple-500/20 text-purple-400" },
                    payout: { Icon: Wallet, cls: "bg-blue-500/20 text-blue-400" },
                    dispute: { Icon: Scale, cls: "bg-orange-500/20 text-orange-400" },
                    agreement: { Icon: FileSignature, cls: "bg-slate-500/20 text-slate-300" },
                    dispute_outcome: { Icon: Gavel, cls: "bg-amber-500/20 text-amber-400" },
                    refund: { Icon: Coins, cls: "bg-rose-500/20 text-rose-400" },
                    release_queue: { Icon: Banknote, cls: "bg-indigo-500/20 text-indigo-400" },
                    escrow_ledger: { Icon: Receipt, cls: "bg-violet-500/20 text-violet-400" },
                  };
                  const isParty = typeKey === "buyer" || typeKey === "seller";
                  // `r.type` is open-ended (buyer/seller rows included): an unmapped key must
                  // not crash the record list.
                  const iconMeta = ICON_MAP[typeKey] ?? { Icon: FileSignature, cls: "bg-slate-500/20 text-slate-300" };
                  const party = isParty ? data.parties[typeKey as "buyer" | "seller"] : null;
                  const isEmptyPayout = typeKey === "payout" && r.label === "No payout yet";
                  const onClick =
                    typeKey === "agreement" ? () => setAgreementOpen(true) :
                    r.route ? () => navigate(r.route!) : undefined;
                  const inner = (
                    <div className={cn(
                      "p-4 bg-muted/30 border border-border rounded-lg hover:border-blue-500/50 transition-all h-full flex flex-col",
                      motionOk && "hover:-translate-y-0.5",
                      isEmptyPayout && "opacity-60",
                    )}>
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">{titleCase(r.type)}</span>
                        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        {isParty ? (
                          <Avatar name={party?.name ?? r.label} src={party?.avatarUrl ?? null} size={40} />
                        ) : iconMeta ? (
                          <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0", iconMeta.cls)}>
                            <iconMeta.Icon className="h-4 w-4" />
                          </div>
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0"><Circle className="h-4 w-4 text-muted-foreground" /></div>
                        )}
                        <div className="min-w-0">
                          <p className="text-foreground font-medium text-sm truncate">{r.label}</p>
                          {r.subtitle && <p className="text-muted-foreground text-xs truncate font-mono">{r.subtitle}</p>}
                        </div>
                      </div>
                      {(r.status || r.amount != null || (isParty && (party?.flagged || party?.verification?.identity))) && (
                        <div className="mt-3 pt-3 border-t border-border flex items-center justify-between gap-2">
                          {isParty ? (
                            party?.flagged ? (
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-500/20 text-red-400">
                                <Flag className="h-3 w-3 mr-1" /> Flagged
                              </span>
                            ) : party?.verification?.identity ? (
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-400">
                                <ShieldCheck className="h-3 w-3 mr-1" /> Verified
                              </span>
                            ) : <span />
                          ) : (
                            r.status ? (typeKey === "escrow" ? <MoneyPill value={r.status} /> : <StatusPill value={r.status} />) : <span />
                          )}
                          {r.amount != null && <span className="text-sm font-semibold tabular-nums text-foreground">{ngn(r.amount)}</span>}
                        </div>
                      )}
                    </div>
                  );
                  return (
                    <li key={i}>
                      {onClick ? <button type="button" onClick={onClick} className="w-full text-left h-full">{inner}</button> : inner}
                    </li>
                  );
                })}
              </ul>
            </div>
          </Card></div>

          {/* === Lower 2/1 grid === */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 lg:gap-6">
            <div className="xl:col-span-2 space-y-5 lg:space-y-6">

              {/* Locked Agreement */}
              <div id="agreement"><Card>
                <CardHeader
                  title="Locked Agreement"
                  subtitle={lockedAgreement?.lockedAt ? `Locked ${fmtDate(lockedAgreement.lockedAt)}` : "Original terms when payment was made"}
                  action={
                    <Button size="sm" variant="outline" onClick={() => setAgreementOpen(true)}>
                      <Eye className="h-4 w-4 mr-1.5" /> Preview Agreement
                    </Button>
                  }
                />
                <div className="p-4 lg:p-6">
                  {!lockedAgreement ? (
                    <div className={`rounded-md border ${ADMIN_TONE.elevated.panel} p-3 text-sm ${ADMIN_TONE.elevated.text}`}>
                      Agreement snapshot missing. Review this transaction for data integrity.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <h4 className="text-sm font-medium text-foreground mb-3">Item Details</h4>
                        <div className="space-y-1.5 text-sm">
                          <p className="text-foreground">{lockedAgreement.item.title ?? "—"}</p>
                          {lockedAgreement.item.description && <p className="text-xs text-muted-foreground">{lockedAgreement.item.description}</p>}
                          {lockedAgreement.item.condition && <p className="text-xs text-muted-foreground">Condition: {titleCase(lockedAgreement.item.condition)}</p>}
                          {lockedAgreement.item.quantity != null && <p className="text-xs text-muted-foreground">Quantity: {lockedAgreement.item.quantity}</p>}
                        </div>
                      </div>
                      <div>
                        <h4 className="text-sm font-medium text-foreground mb-3">Terms</h4>
                        <div className="space-y-2 text-sm">
                          <RowKV k="Agreed Price" v={ngn(lockedAgreement.agreedPrice)} />
                          <RowKV k="Protection Fee" v={ngn(lockedAgreement.protectionFee)} />
                          <RowKV k="Total" v={ngn(lockedAgreement.total)} bold />
                          <RowKV k="Delivery" v={titleCase(lockedAgreement.deliveryMethod) || "—"} />
                          <RowKV k="Verification Window" v={lockedAgreement.verificationWindowHours ? `${lockedAgreement.verificationWindowHours}h` : "—"} />
                        </div>
                      </div>
                      {lockedAgreement.sellerNotes && (
                        <div className="md:col-span-2 rounded-md bg-muted/30 p-3">
                          <h5 className="text-sm font-medium text-foreground mb-1">Seller Notes</h5>
                          <p className="text-sm text-muted-foreground">{lockedAgreement.sellerNotes}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </Card></div>

              {/* Transaction Items */}
              <Card>
            <CardHeader title="Transaction Items" subtitle={`${data.items.length} item${data.items.length === 1 ? "" : "s"}`} />
            <div className="p-4 lg:p-6 space-y-3">
              {data.items.length === 0 && <Empty>No items recorded.</Empty>}
              {data.items.map((it) => (
                <div key={it.id} className="flex gap-3 items-start border-t border-border pt-3 first:border-t-0 first:pt-0">
                  {it.image ? (
                    <ProductImage
                      url={it.image}
                      alt={it.title}
                      rendition="thumb"
                      sizes="64px"
                      className="w-16 h-16 rounded-md bg-muted"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-md bg-muted flex items-center justify-center text-muted-foreground"><Package className="h-5 w-5" /></div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground">{it.title}</div>
                    {it.description && <div className="text-xs text-muted-foreground line-clamp-2">{it.description}</div>}
                    <div className="text-xs text-muted-foreground mt-1">
                      {[titleCase(it.condition), it.brand, it.model].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-semibold tabular-nums">{ngn(it.lineTotal)}</div>
                    <div className="text-xs text-muted-foreground">{it.quantity} × {ngn(it.unitPrice)}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

              {/* Payment & Escrow */}
              <div id="escrow-ledger"><Card>
            <CardHeader title="Payment & Escrow" />
            <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border">
              <div className="p-4 lg:p-6">
                <h4 className="text-sm font-medium text-foreground mb-3">Payment Details</h4>
                {!data.payment ? <Empty>No payment recorded.</Empty> : (
                  <div className="space-y-2 text-sm">
                    <RowKV k="Provider" v={titleCase(data.payment.provider)} />
                    <RowKV k="Reference" v={<span className="font-mono text-xs break-all">{data.payment.providerReference ?? "—"}</span>} />
                    <RowKV k="Status" v={<StatusPill value={data.payment.status} />} />
                    <RowKV k="Processed" v={fmtDate(data.payment.paidAt)} />
                  </div>
                )}
              </div>
              <div className="p-4 lg:p-6">
                <h4 className="text-sm font-medium text-foreground mb-3">Escrow Ledger</h4>
                {!data.escrow ? <Empty>No escrow record.</Empty> : (
                  <div className="space-y-2.5 text-sm">
                    <div className="flex items-center justify-between p-3 bg-muted/30 rounded-md">
                      <div>
                        <p className="text-foreground text-sm">Funds Received</p>
                        <p className="text-xs text-muted-foreground">{fmtDate(data.payment?.paidAt)}</p>
                      </div>
                      <span className={`${ADMIN_TONE.success.text} font-semibold tabular-nums`}>+{ngn(data.payment?.amount ?? data.pricing?.buyerTotal)}</span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-muted/30 rounded-md">
                      <div>
                        <p className="text-foreground text-sm">Fee Deducted</p>
                        <p className="text-xs text-muted-foreground">{fmtDate(data.payment?.paidAt)}</p>
                      </div>
                      <span className="text-muted-foreground tabular-nums">-{ngn(data.pricing?.protectionFee)}</span>
                    </div>
                    <div className={cn(
                      "flex items-center justify-between p-3 rounded-md border",
                      tx.moneyStatus === "funds_frozen"
                        ? "bg-cyan-500/10 border-cyan-500/20"
                        : "bg-purple-500/10 border-purple-500/20",
                    )}>
                      <div>
                        <p className="text-foreground text-sm">{escrowDisplay.label}</p>
                        <p className="text-xs text-muted-foreground">{titleCase(tx.moneyStatus)}</p>
                      </div>
                      <span className={cn(
                        "font-semibold tabular-nums",
                        tx.moneyStatus === "funds_frozen" ? "text-cyan-300" : "text-purple-400",
                      )}>{ngn(escrowDisplay.value)}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Card></div>

              {/* Delivery & Fulfillment */}
              <div id="delivery"><Card>
            <CardHeader title="Delivery & Fulfillment" />
            <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border">
              <div className="p-4 lg:p-6">
                <h4 className="text-sm font-medium text-foreground mb-3">Shipping Details</h4>
                <div className="space-y-2 text-sm">
                  <RowKV k="Carrier" v={data.delivery?.courier ?? "—"} />
                  <RowKV k="Tracking" v={<span className="font-mono text-xs">{data.delivery?.trackingNumber ?? "—"}</span>} />
                  <RowKV k="Shipped" v={fmtDate(data.delivery?.shippedAt)} />
                  <RowKV k="Expected" v={fmtDate(data.delivery?.expectedDeliveryAt ?? data.delivery?.expectedDate)} />
                </div>
              </div>
              <div className="p-4 lg:p-6">
                <h4 className="text-sm font-medium text-foreground mb-3">Delivery Status</h4>
                {(() => {
                  const shippedAt = data.delivery?.shippedAt ?? null;
                  const deliveredAt = data.delivery?.deliveredAt ?? null;
                  const updates: any[] = data.delivery?.updates ?? [];
                  const inTransitUpd = updates.find((u) => {
                    const at = new Date(u.at).getTime();
                    const sa = shippedAt ? new Date(shippedAt).getTime() : 0;
                    const da = deliveredAt ? new Date(deliveredAt).getTime() : Infinity;
                    return at > sa && at < da;
                  });
                  const inTransitAt = inTransitUpd?.at ?? null;
                  const milestones = [
                    { label: "Package shipped", at: shippedAt },
                    { label: "In transit", at: inTransitAt },
                    { label: "Delivered", at: deliveredAt },
                  ];
                  if (!shippedAt && !deliveredAt) return <Empty>No delivery updates.</Empty>;
                  return (
                    <ul className="space-y-3 text-sm">
                      {milestones.map((m, i) => (
                        <li key={i} className="flex items-center gap-3">
                          <div className={cn("w-3 h-3 rounded-full shrink-0", m.at ? ADMIN_TONE.success.dot : "bg-muted")} />
                          <div className="min-w-0">
                            <p className={cn("text-foreground", !m.at && "text-muted-foreground")}>{m.label}</p>
                            <p className="text-xs text-muted-foreground">{m.at ? fmtDate(m.at) : "Pending"}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  );
                })()}
                {dispute && data.delivery?.deliveredAt && (() => {
                  const diff = new Date(dispute.openedAt).getTime() - new Date(data.delivery.deliveredAt).getTime();
                  return diff >= 0 && diff < 24 * 3600 * 1000;
                })() && (
                  <div className="mt-4 rounded-md border border-red-500/20 bg-red-500/10 p-2.5 flex items-center gap-2">
                    <AlertTriangle className={`h-4 w-4 ${ADMIN_TONE.danger.text} shrink-0`} />
                    <span className={`${ADMIN_TONE.danger.text} text-xs`}>Dispute opened within 24hrs of delivery</span>
                  </div>
                )}
              </div>
            </div>
          </Card></div>

            </div>

            {/* Right rail */}
            <aside className="space-y-5 lg:space-y-6">
              {dispute && (
                <Card accent={disputeResolved ? "none" : "orange"}>
                  <CardHeader title="Dispute Status" />
                  <div className="p-4 lg:p-6 space-y-3">
                    <DStatusRow
                      icon={Scale}
                      label="Dispute Opened"
                      value={fmtDate(dispute.openedAt)}
                      pill={
                        disputeResolved && disputeDisplay ? (
                          <span className={cn(
                            "inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold whitespace-nowrap",
                            toneToClasses(disputeDisplay.tone),
                          )}>{disputeDisplay.label}</span>
                        ) : <StatusPill value={dispute.status} />
                      }
                    />
                    {!disputeResolved && dispute.sellerResponseDueAt && (
                      <DStatusRow
                        icon={Clock}
                        label="Resolution Deadline"
                        value={fmtDate(dispute.sellerResponseDueAt)}
                        pill={dispute.overdue ? <span className={`text-xs font-bold ${ADMIN_TONE.danger.text}`}>OVERDUE</span> : null}
                      />
                    )}
                    <DStatusRow icon={User} label="Dispute Type" value={titleCase(dispute.claimType) || "—"} pill={null} />
                    {dispute.summary && <p className="text-sm text-foreground/90 pt-1">{dispute.summary}</p>}
                    {dispute.outcome && (
                      <div className="rounded-md border border-border bg-muted/30 p-3 text-xs">
                        <div className="font-semibold text-foreground">Outcome: {titleCase(dispute.outcome.type)}</div>
                        <div className="text-muted-foreground mt-1">{dispute.outcome.summary}</div>
                        {disputeDisplay?.parts ? (
                          <ul className="mt-2 space-y-0.5">
                            {disputeDisplay.parts.map((p) => (
                              <li key={p.label} className="flex justify-between gap-2">
                                <span className="text-muted-foreground">{p.label}</span>
                                <span className="tabular-nums font-medium text-foreground">{ngn(p.amount)}</span>
                              </li>
                            ))}
                            {sumRecorded((data?.escrow as any)?.heldAmount, (data?.escrow as any)?.frozenAmount) > 0 && (
                              <li className="flex justify-between gap-2 pt-1 mt-1 border-t border-border text-muted-foreground">
                                <span>Remaining escrow</span>
                                <span className="tabular-nums">{ngn(sumRecorded((data?.escrow as any)?.heldAmount, (data?.escrow as any)?.frozenAmount))}</span>
                              </li>
                            )}
                          </ul>
                        ) : (
                          <div className="text-muted-foreground mt-1">Refund {ngn(dispute.outcome.refundAmount)} · Release {ngn(dispute.outcome.releaseAmount)}</div>
                        )}
                      </div>
                    )}
                  </div>
                </Card>
              )}

              {(evidence.length > 0 || dispute) && (
                <Card>
                  <CardHeader title="Dispute Evidence" subtitle={`${evidence.length} item${evidence.length === 1 ? "" : "s"}`} />
                  <div className="p-4 lg:p-6">
                    {evidence.length === 0 ? (
                      <Empty>No evidence files uploaded yet.</Empty>
                    ) : (
                      <div className="rounded-lg bg-muted/30 p-3">
                        <div className="flex items-center gap-3 mb-3">
                          <ImageIcon className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-medium text-foreground">Photo Evidence</span>
                        </div>
                        <ul className="space-y-2">
                        {evidence.map((ev) => {
                          const Icon = evidenceIcon(ev.kind, ev.mimeType);
                          const unavailable = !ev.secureUrl;
                          return (
                            <li key={ev.id}>
                              <button
                                type="button"
                                onClick={() => !unavailable && setEvidencePreview(ev)}
                                disabled={unavailable}
                                className="w-full text-left flex items-center gap-2 rounded-md p-1.5 hover:bg-muted/50 transition-all disabled:cursor-not-allowed disabled:hover:bg-transparent min-h-11"
                              >
                                <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center shrink-0">
                                  <Icon className="h-4 w-4 text-muted-foreground" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm text-muted-foreground truncate">{ev.title}</div>
                                  <div className="text-xs text-muted-foreground truncate">
                                    {fmtDate(ev.uploadedAt)}
                                    {unavailable && <span className={`ml-2 ${ADMIN_TONE.danger.text}`}>Unavailable</span>}
                                  </div>
                                </div>
                              </button>
                            </li>
                          );
                        })}
                        </ul>
                      </div>
                    )}
                  </div>
                </Card>
              )}
            </aside>
          </div>

          {/* === Supplementary admin-only sections === */}
          <div id="audit"><Card>
            <details className="group">
              <summary className="cursor-pointer list-none flex items-center justify-between gap-3 px-4 lg:px-6 py-4 border-b border-border">
                <div>
                  <h2 className="text-sm lg:text-base font-semibold text-foreground">Admin extras</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Pricing breakdown, payout details, and full escrow ledger</p>
                </div>
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <div className="p-4 lg:p-6 space-y-6">
                <div>
                  <h3 className="text-sm font-medium text-foreground mb-3">Pricing & Fees</h3>
              {!data.pricing ? <Empty>No pricing recorded.</Empty> : (
                <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <KV label="Item Total" value={ngn(data.pricing.itemTotal)} />
                  <KV
                    label="Protection Fee"
                    value={
                      <span className="inline-flex items-center gap-1.5">
                        <span className="tabular-nums">{ngn(data.pricing.protectionFee)}</span>
                        {data.pricing.protectionFeeCapped && (
                          <span className="text-xs rounded bg-muted text-muted-foreground px-1.5 py-0.5">capped</span>
                        )}
                      </span>
                    }
                  />
                  <KV label="Payment Processing Fee" value={ngn(data.pricing.paymentProcessingFee ?? data.pricing.processingFee)} />
                  <KV label="Total Charged" value={ngn(data.pricing.totalCharged ?? data.pricing.buyerTotal)} bold />
                  <KV label="Seller Net" value={ngn(data.pricing.sellerPayoutAmount ?? data.pricing.sellerNet)} />
                  <KV label="Refunded" value={ngn(data.pricing.refundedTotal)} />
                </dl>
              )}
                </div>

                <div>
                  <h3 className="text-sm font-medium text-foreground mb-3">Delivery extras</h3>
                  <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    <KV label="Method" value={titleCase(data.delivery?.method) || "—"} />
                    <KV label="Delivered" value={fmtDate(data.delivery?.deliveredAt)} />
                    {data.delivery?.address && <KV label="Address" value={<span className="text-xs text-muted-foreground">{data.delivery.address}</span>} />}
                  </dl>
                </div>

                <div id="payouts">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-medium text-foreground">Payout</h3>
                    {data.payout?.id && (
                      <button
                        type="button"
                        onClick={() => navigate(`/admin/payouts?payout_id=${data.payout.id}`)}
                        className="text-xs text-primary hover:underline min-h-11 inline-flex items-center"
                      >
                        View Payout →
                      </button>
                    )}
                  </div>
              {!data.payout ? (
                <div className="text-sm text-muted-foreground">
                  {dispute ? "No payout yet: pending dispute resolution." : "No payout recorded."}
                </div>
              ) : (
                <dl className="grid grid-cols-2 gap-4">
                  <KV label="Status" value={<StatusPill value={data.payout.status} />} />
                  <KV label="Amount" value={ngn(data.payout.amount)} />
                  <KV label="Reference" value={<span className="font-mono text-xs break-all">{data.payout.providerReference ?? "—"}</span>} />
                  <KV label="Released At" value={fmtDate(data.payout.releasedAt ?? data.payout.completedAt)} />
                  {data.payout.failureReason && <div className="col-span-2"><KV label="Failure" value={<span className={ADMIN_TONE.danger.text}>{data.payout.failureReason}</span>} /></div>}
                  {data.payout.blocked && <div className="col-span-2"><KV label="Blocked" value={<span className={ADMIN_TONE.elevated.text}>{data.payout.blockedReason ?? "Blocked"}</span>} /></div>}
                </dl>
              )}
                </div>

                {(data.escrow?.ledger?.length ?? 0) > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-foreground mb-3">Escrow Ledger (Full History)</h3>
                    <div className="overflow-x-auto rounded-md border border-border">
                  <table className="sd-stack w-full text-xs">
                    <thead className="bg-muted/40 text-muted-foreground"><tr>
                      <th className="p-2 text-left">Date</th>
                      <th className="p-2 text-left">Type</th>
                      <th className="p-2 text-right">Amount</th>
                      <th className="p-2 text-right">Balance</th>
                      <th className="p-2 text-left">Notes</th>
                    </tr></thead>
                    <tbody>
                      {data.escrow!.ledger.map((r) => (
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
                  </div>
                )}
              </div>
            </details>
          </Card></div>

        </div>
      )}

      {/* Mobile sticky bottom bar */}
      {!loading && !denied && !notFound && data && (
        <div className="lg:hidden fixed bottom-0 inset-x-0 z-sticky border-t border-border bg-card/95 backdrop-blur px-3 py-2 flex items-center gap-2">
          <Button size="sm" className={`flex-1 ${ADMIN_SOLID.info}`} onClick={() => setActionSheetOpen(true)}>
            <Gavel className="h-4 w-4 mr-1.5" /> Take Action
          </Button>
          <Button size="sm" variant="outline" onClick={() => setActionSheetOpen(true)} aria-label="More" className="px-3 min-w-11 inline-flex items-center justify-center">
            <MoreVertical className="h-4 w-4" />
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
            <Button variant="outline" disabled={!adminCan.canManageDispute} title={!adminCan.canManageDispute ? "No active dispute on this transaction" : undefined} onClick={() => { if (!dispute) return; setActionSheetOpen(false); navigate(`/admin/disputes/${dispute.id}`); }}><Scale className="h-4 w-4 mr-1.5" /> Manage Dispute</Button>
            {adminCan.canOpenInvestigation && <Button variant="outline" onClick={() => { setActionSheetOpen(false); setInvestigateOpen(true); }}><Search className="h-4 w-4 mr-1.5" /> {adminCan.investigationAlreadyOpen ? "Update Investigation" : "Open Investigation"}</Button>}
            {adminCan.canViewPayment && <Button variant="outline" onClick={() => { setActionSheetOpen(false); scrollToId("linked-records"); }}><CreditCard className="h-4 w-4 mr-1.5" /> View Payment</Button>}
            {adminCan.canViewEscrow && <Button variant="outline" onClick={() => { setActionSheetOpen(false); scrollToId("escrow-ledger"); }}><Coins className="h-4 w-4 mr-1.5" /> Escrow Ledger</Button>}
            {adminCan.canViewPayout && <Button variant="outline" onClick={() => { setActionSheetOpen(false); scrollToId("payouts"); }}><Banknote className="h-4 w-4 mr-1.5" /> View Payout</Button>}
            {adminCan.canAddNote && <Button variant="outline" onClick={() => { setActionSheetOpen(false); setNoteOpen(true); }}><StickyNote className="h-4 w-4 mr-1.5" /> Add Note</Button>}
            {adminCan.canViewBuyer && data?.parties?.buyer?.id && <Button variant="outline" onClick={() => { setActionSheetOpen(false); navigate(`/admin/users/${data.parties.buyer!.id}`); }}><User className="h-4 w-4 mr-1.5" /> View Buyer</Button>}
            {adminCan.canViewSeller && data?.parties?.seller?.id && <Button variant="outline" onClick={() => { setActionSheetOpen(false); navigate(`/admin/users/${data.parties.seller!.id}`); }}><User className="h-4 w-4 mr-1.5" /> View Seller</Button>}
            {data?.parties?.buyer?.id && <Button variant="outline" onClick={() => { setActionSheetOpen(false); navigate(`/admin/flagged-users?u=${data.parties.buyer!.id}`); }}><Flag className="h-4 w-4 mr-1.5" /> Flagged: Buyer</Button>}
            {data?.parties?.seller?.id && <Button variant="outline" onClick={() => { setActionSheetOpen(false); navigate(`/admin/flagged-users?u=${data.parties.seller!.id}`); }}><Flag className="h-4 w-4 mr-1.5" /> Flagged: Seller</Button>}
            {adminCan.canExport && <Button variant="outline" onClick={() => { setActionSheetOpen(false); setExportOpen(true); }}><Download className="h-4 w-4 mr-1.5" /> Export</Button>}
            <Button variant="outline" onClick={() => { setActionSheetOpen(false); navigator.clipboard.writeText(code); toast.success("Code copied"); }}>
              <Receipt className="h-4 w-4 mr-1.5" /> Copy Code
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Dialogs */}
      <FreezeFundsDialog
        open={freezeOpen}
        onOpenChange={setFreezeOpen}
        onConfirm={async (p) => {
          if (!transactionId) return;
          try {
            await freezeTransactionDetailed(transactionId, p);
            toast.success("Funds frozen");
            setReloadKey((k) => k + 1);
          } catch (e) { toast.error((e as Error).message ?? "Failed to freeze funds"); throw e; }
        }}
      />
      <UnfreezeFundsDialog
        open={unfreezeOpen}
        onOpenChange={setUnfreezeOpen}
        bothPartiesConfirmed={!!(tx?.buyerConfirmedAt && tx?.sellerConfirmedAt)}
        hasActiveDispute={!!dispute && !["resolved","closed"].includes(dispute.status)}
        onConfirm={async (p) => {
          if (!transactionId) return;
          try {
            await unfreezeTransactionDetailed(transactionId, p);
            toast.success(
              p.target_money_status === "funds_held_in_escrow"
                ? "Funds returned to held escrow"
                : "Funds moved to pending release",
            );
            setReloadKey((k) => k + 1);
          } catch (e) { toast.error((e as Error).message ?? "Failed to unfreeze funds"); throw e; }
        }}
      />
      <ActionConfirmDialog
        open={flagOpen}
        onOpenChange={setFlagOpen}
        title="Flag for Review"
        description={`Transaction #${code}: current money status: ${titleCase(tx?.moneyStatus ?? "—")}. This adds the transaction to the admin review queue and marks it as needing release review.`}
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
        open={!!flagUserTarget}
        onOpenChange={(o) => { if (!o) setFlagUserTarget(null); }}
        title={`Flag ${flagUserTarget?.role === "seller" ? "Seller" : "Buyer"} for Fraud Review`}
        description={`This adds ${flagUserTarget?.name ?? "the user"} to the Flagged Users workspace with an admin flag signal. A note is required.`}
        confirmLabel="Flag User"
        confirmTone="danger"
        onConfirm={async (reason) => {
          if (!flagUserTarget) return;
          await performFlaggedAction({
            action: "flag_user",
            user_id: flagUserTarget.id,
            note: reason,
            transaction_id: transactionId ?? undefined,
          });
          toast.success("User flagged for review");
          const id = flagUserTarget.id;
          setFlagUserTarget(null);
          navigate(`/admin/flagged-users?u=${id}`);
        }}
      />
      <InvestigationDrawer
        open={investigateOpen}
        onOpenChange={setInvestigateOpen}
        transactionCode={code}
        investigation={(data as any)?.investigation ?? null}
        onSubmit={async (p) => {
          if (!transactionId) return;
          try {
            await upsertInvestigation(transactionId, p);
            toast.success(adminCan.investigationAlreadyOpen ? "Investigation updated" : "Investigation opened");
            setReloadKey((k) => k + 1);
          } catch (e) { toast.error((e as Error).message ?? "Failed to save investigation"); throw e; }
        }}
      />
      <InternalNoteDialog
        open={noteOpen}
        onOpenChange={setNoteOpen}
        transactionCode={code}
        onSubmit={async (payload) => {
          if (!transactionId) return;
          try {
            await addInternalNoteDetailed(transactionId, payload);
            toast.success("Note added");
            setReloadKey((k) => k + 1);
          } catch (e) { toast.error((e as Error).message ?? "Failed to add note"); throw e; }
        }}
      />
      <ResolveDisputeDialog
        open={resolveDisputeOpen}
        onOpenChange={setResolveDisputeOpen}
        moneyStatus={tx?.moneyStatus ?? null}
        heldAmount={(data as any)?.escrow?.heldAmount ?? null}
        frozenAmount={(data as any)?.escrow?.frozenAmount ?? null}
        currencyCode={(data as any)?.pricing?.currencyCode ?? "NGN"}
        hasActiveInvestigation={!!(data as any)?.investigation && !["resolved","dismissed"].includes(((data as any)?.investigation?.status ?? ""))}
        onResolve={async (payload) => {
          if (!transactionId) return;
          try {
            await resolveDispute(transactionId, payload);
            toast.success("Dispute resolved");
            setReloadKey((k) => k + 1);
          } catch (e) {
            if (e instanceof DisputeEscalationRequiredError) {
              toast.error("Escalation required", { description: e.reasons.join(" • ") || e.message });
            } else {
              toast.error((e as Error).message ?? "Failed to resolve dispute");
              throw e;
            }
          }
        }}
        onRequestMoreInfo={async (payload) => {
          if (!transactionId) return;
          try {
            await disputeRequestMoreInfo(transactionId, payload);
            toast.success("Request sent to seller");
            setReloadKey((k) => k + 1);
          } catch (e) { toast.error((e as Error).message ?? "Failed to send request"); }
        }}
      />
      <ExportDataDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        transactionCode={code}
        onSubmit={async (opts) => {
          if (!transactionId) return;
          try {
            const res = await exportTransactionData(transactionId, opts) as { filename?: string; payload?: unknown };
            const blob = new Blob([JSON.stringify(res?.payload ?? res, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = res?.filename ?? `transaction-${code}.json`;
            a.click();
            URL.revokeObjectURL(url);
            toast.success("Export generated");
          } catch (e) { toast.error((e as Error).message ?? "Export failed"); throw e; }
        }}
      />
      <AgreementPreviewDialog
        open={agreementOpen}
        onOpenChange={setAgreementOpen}
        agreement={lockedAgreement}
        transactionCode={code}
      />
      <EvidencePreviewDialog
        open={!!evidencePreview}
        onOpenChange={(v) => !v && setEvidencePreview(null)}
        item={evidencePreview}
        transactionCode={code}
      />
    </AdminLayout>
  );
}

function KV({ label, value, bold }: { label: string; value: React.ReactNode; bold?: boolean }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">{label}</dt>
      <dd className={cn("mt-1 text-sm tabular-nums text-foreground", bold && "font-semibold")}>{value ?? "—"}</dd>
    </div>
  );
}
function RowKV({ k, v, bold }: { k: string; v: React.ReactNode; bold?: boolean }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{k}</span>
      <span className={cn("text-foreground text-right tabular-nums", bold && "font-semibold")}>{v}</span>
    </div>
  );
}
function DStatusRow({ icon: Icon, label, value, pill }: { icon: any; label: string; value: string; pill: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 p-3 bg-muted/30 rounded-lg">
      <div className="flex items-center gap-3 min-w-0">
        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{label}</p>
          <p className="text-xs text-muted-foreground truncate">{value}</p>
        </div>
      </div>
      {pill}
    </div>
  );
}
