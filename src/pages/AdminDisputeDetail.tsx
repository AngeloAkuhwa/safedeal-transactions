import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, Printer, AlertTriangle, Loader2, Phone, Mail, User as UserIcon,
  ExternalLink, FileText, Image as ImageIcon, Video, Receipt, Truck, Scale,
  Circle, Clock, ShieldAlert, Snowflake, MessageSquare, StickyNote, Gavel,
  CheckCircle2, XCircle, ChevronRight, Flag, Wallet, CreditCard, Vault,
  Search, Send, Ban, Play, Eye, NotebookPen, Store,
} from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import {
  getAdminDisputeFull,
  AdminAccessRequiredError,
  DisputeNotFoundError,
  type AdminDisputeFull,
} from "@/services/admin-dispute-detail.service";
import {
  resolveDispute,
  disputeRequestMoreInfo,
  escalateDispute,
  flagForReview,
  addInternalNoteDetailed,
  type DisputeOutcomeType,
} from "@/services/admin-transaction-actions.service";
import { ResolveDisputeDialog } from "@/components/admin/transactions/ResolveDisputeDialog";
import { ActionConfirmDialog } from "@/components/admin/transactions/ActionConfirmDialog";
import { InternalNoteDialog } from "@/components/admin/transactions/InternalNoteDialog";
import { EvidencePreviewDialog } from "@/components/admin/transactions/EvidencePreviewDialog";
import { AgreementPreviewDialog } from "@/components/admin/transactions/AgreementPreviewDialog";
import type { AdminTxEvidenceItem } from "@/services/admin-transaction-detail.service";

// ---------- helpers ----------
const ngn = (v: number | null | undefined) => formatMoney(Number(v ?? 0), "NGN");

const fmtDate = (iso?: string | null) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-NG", {
      dateStyle: "medium", timeStyle: "short",
    });
  } catch { return iso; }
};
const relTime = (iso?: string | null) => {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.round(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
};
const titleCase = (s?: string | null) =>
  (s ?? "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const initials = (name?: string | null) =>
  (name ?? "?").split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();

// ---------- atoms ----------
function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-xl border border-border bg-card", className)}>
      {children}
    </section>
  );
}
function CardHeader({ title, subtitle, action }: { title: React.ReactNode; subtitle?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-border">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {action && <div className="flex items-center gap-2 shrink-0">{action}</div>}
    </div>
  );
}
function Avatar({ name, src, size = 40 }: { name?: string | null; src?: string | null; size?: number }) {
  return src ? (
    <img src={src} alt={name ?? ""} className="rounded-full object-cover shrink-0"
         style={{ width: size, height: size }} />
  ) : (
    <div className="rounded-full bg-muted text-foreground flex items-center justify-center text-xs font-semibold shrink-0"
         style={{ width: size, height: size }}>{initials(name)}</div>
  );
}
function KV({ label, value, className }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm text-foreground mt-1 truncate">{value}</div>
    </div>
  );
}

const STATUS_TONE: Record<string, string> = {
  open: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  awaiting_seller_response: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
  under_review: "bg-purple-500/15 text-purple-300 border-purple-500/30",
  escalated: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  resolved: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  closed: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  dismissed: "bg-slate-500/15 text-slate-300 border-slate-500/30",
};
function StatusPill({ value }: { value?: string | null }) {
  if (!value) return <span className="text-xs text-muted-foreground">—</span>;
  const cls = STATUS_TONE[value] ?? "bg-slate-500/15 text-slate-300 border-slate-500/30";
  return (
    <span className={cn("inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold whitespace-nowrap", cls)}>
      {titleCase(value)}
    </span>
  );
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

// ---------- page ----------
export default function AdminDisputeDetail() {
  const { id: disputeId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [data, setData] = useState<AdminDisputeFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // dialogs
  const [resolveOpen, setResolveOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [escalateOpen, setEscalateOpen] = useState(false);
  const [moveReviewOpen, setMoveReviewOpen] = useState(false);
  const [highRiskOpen, setHighRiskOpen] = useState(false);
  const [fraudOpen, setFraudOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [evidencePreview, setEvidencePreview] = useState<AdminTxEvidenceItem | null>(null);
  const [agreementOpen, setAgreementOpen] = useState(false);

  useEffect(() => {
    if (!disputeId) { setNotFound(true); setLoading(false); return; }
    setLoading(true); setErr(null); setDenied(false); setNotFound(false);
    getAdminDisputeFull(disputeId)
      .then(setData)
      .catch((e) => {
        if (e instanceof AdminAccessRequiredError) setDenied(true);
        else if (e instanceof DisputeNotFoundError) setNotFound(true);
        else setErr((e as Error).message ?? "Failed to load dispute");
      })
      .finally(() => setLoading(false));
  }, [disputeId, reloadKey]);

  const refresh = () => setReloadKey((k) => k + 1);

  // ---------- loading / error gates ----------
  if (loading) {
    return (
      <AdminLayout title="Dispute" hideDefaultHeaders fullBleed>
        <div className="flex h-[60vh] items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading dispute…
        </div>
      </AdminLayout>
    );
  }
  if (denied) {
    return (
      <AdminLayout title="Dispute" hideDefaultHeaders fullBleed>
        <ErrorPanel
          icon={<ShieldAlert className="h-8 w-8 text-red-400" />}
          title="Admin access required"
          message="You don't have permission to view this dispute."
          onBack={() => navigate("/admin/disputes")}
        />
      </AdminLayout>
    );
  }
  if (notFound || !data) {
    return (
      <AdminLayout title="Dispute" hideDefaultHeaders fullBleed>
        <ErrorPanel
          icon={<Search className="h-8 w-8 text-muted-foreground" />}
          title="Dispute not found"
          message="This dispute may have been removed or the link is invalid."
          onBack={() => navigate("/admin/disputes")}
        />
      </AdminLayout>
    );
  }
  if (err) {
    return (
      <AdminLayout title="Dispute" hideDefaultHeaders fullBleed>
        <ErrorPanel
          icon={<AlertTriangle className="h-8 w-8 text-orange-400" />}
          title="Couldn't load dispute"
          message={err}
          onBack={() => navigate("/admin/disputes")}
          onRetry={refresh}
        />
      </AdminLayout>
    );
  }

  return (
    <DisputePage data={data} refresh={refresh}
      dialogs={{
        resolveOpen, setResolveOpen,
        noteOpen, setNoteOpen,
        escalateOpen, setEscalateOpen,
        moveReviewOpen, setMoveReviewOpen,
        highRiskOpen, setHighRiskOpen,
        fraudOpen, setFraudOpen,
        closeOpen, setCloseOpen,
        evidencePreview, setEvidencePreview,
        agreementOpen, setAgreementOpen,
      }}
    />
  );
}

function ErrorPanel({ icon, title, message, onBack, onRetry }: {
  icon: React.ReactNode; title: string; message: string;
  onBack: () => void; onRetry?: () => void;
}) {
  return (
    <div className="flex h-[60vh] items-center justify-center px-6">
      <Card className="max-w-md w-full">
        <div className="p-6 text-center">
          <div className="flex justify-center mb-3">{icon}</div>
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <p className="text-sm text-muted-foreground mt-2">{message}</p>
          <div className="flex justify-center gap-2 mt-5">
            {onRetry && (
              <Button variant="outline" onClick={onRetry}>Retry</Button>
            )}
            <Button onClick={onBack}>Back to Disputes</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

// =====================================================================
// Main rendered page
// =====================================================================

type DialogState = {
  resolveOpen: boolean; setResolveOpen: (v: boolean) => void;
  noteOpen: boolean; setNoteOpen: (v: boolean) => void;
  escalateOpen: boolean; setEscalateOpen: (v: boolean) => void;
  moveReviewOpen: boolean; setMoveReviewOpen: (v: boolean) => void;
  highRiskOpen: boolean; setHighRiskOpen: (v: boolean) => void;
  fraudOpen: boolean; setFraudOpen: (v: boolean) => void;
  closeOpen: boolean; setCloseOpen: (v: boolean) => void;
  evidencePreview: AdminTxEvidenceItem | null; setEvidencePreview: (v: AdminTxEvidenceItem | null) => void;
  agreementOpen: boolean; setAgreementOpen: (v: boolean) => void;
};

function DisputePage({ data, refresh, dialogs }: { data: AdminDisputeFull; refresh: () => void; dialogs: DialogState }) {
  const navigate = useNavigate();
  const { dispute: row, txDetail } = data;
  const tx = txDetail.transaction ?? {};
  const dispute = txDetail.dispute ?? {};
  const parties = txDetail.parties ?? { buyer: null, seller: null };
  const items = txDetail.items ?? [];
  const pricing = txDetail.pricing ?? {};
  const escrow: any = txDetail.escrow ?? {};
  const payment = txDetail.payment ?? null;
  const payout = txDetail.payout ?? null;
  const evidence = txDetail.evidence ?? [];
  const timeline = txDetail.timeline ?? [];
  const notes: any[] = (txDetail.risk?.investigationNotes ?? []) as any[];
  const lockedAgreement = txDetail.lockedAgreement ?? null;
  const adminCan = txDetail.adminActionsAvailable ?? {};

  const moneyStatus: string | null = tx.moneyStatus ?? null;
  const heldAmount = Number(escrow?.heldAmount ?? 0);
  const frozenAmount = Number(escrow?.frozenAmount ?? 0);
  const releasedAmount = Number(escrow?.releasedAmount ?? 0);
  const refundedAmount = Number(escrow?.refundedAmount ?? 0);
  const buyerTotal = Number(pricing?.buyerTotal ?? 0);
  const protectionFee = Number(pricing?.protectionFee ?? 0);
  const sellerNet = Number(pricing?.sellerNet ?? pricing?.sellerNetAmount ?? 0);
  const itemTotal = Number(pricing?.itemTotal ?? items[0]?.lineTotal ?? 0);

  const amountInDispute = Number(dispute?.amountInDispute ?? itemTotal ?? buyerTotal ?? 0);
  const eligibleRefund = Math.max(0, heldAmount + frozenAmount);
  const eligibleRelease = Math.max(0, heldAmount + frozenAmount - protectionFee);

  const txCode: string = tx.transactionCode ?? tx.transaction_code ?? "—";
  const disputeCode = `DSP-${(row.id ?? "").slice(0, 8).toUpperCase()}`;
  const itemTitle: string = items[0]?.title ?? "Transaction";

  // SLA / overdue derivation
  const dueAt = row.seller_response_due_at ?? dispute.sellerResponseDueAt ?? null;
  const resolvedAt = row.resolved_at ?? dispute.resolvedAt ?? null;
  const overdue = !!(dueAt && !resolvedAt && new Date(dueAt).getTime() < Date.now());
  const slaText = useMemo(() => {
    if (resolvedAt) return null;
    if (!dueAt) return null;
    const diff = new Date(dueAt).getTime() - Date.now();
    const days = Math.round(Math.abs(diff) / 86400000);
    if (overdue) return `${days} day${days === 1 ? "" : "s"} overdue`;
    return `Due in ${days} day${days === 1 ? "" : "s"}`;
  }, [dueAt, resolvedAt, overdue]);

  // ---------- action handlers ----------
  const txId: string = tx.id ?? row.transaction_id;
  const handleResolve = async (payload: {
    outcome_type: DisputeOutcomeType; decision_summary: string;
    refund_amount: number; release_amount: number;
    internal_note?: string; notify_parties?: boolean;
    also_close_investigation?: boolean; acknowledge_frozen_funds?: boolean;
  }) => {
    try {
      await resolveDispute(txId, payload);
      toast.success("Dispute resolution recorded");
      refresh();
    } catch (e) {
      toast.error((e as Error).message ?? "Failed to resolve dispute");
    }
  };
  const handleRequestMoreInfo = async (payload: { message: string; new_due_at: string; notify_seller?: boolean }) => {
    try {
      await disputeRequestMoreInfo(txId, payload);
      toast.success("Information request sent");
      refresh();
    } catch (e) {
      toast.error((e as Error).message ?? "Failed to send request");
    }
  };
  const handleEscalate = async (reason: string) => {
    try {
      await escalateDispute(txId, reason);
      toast.success("Dispute escalated");
      refresh();
    } catch (e) {
      toast.error((e as Error).message ?? "Failed to escalate");
    }
  };
  const handleMoveReview = async (reason: string) => {
    try {
      // No dedicated "move to under review" backend action exists yet; record
      // as an internal note tagged as dispute so the audit trail is preserved.
      // TODO: replace with a dedicated dispute state transition endpoint when available.
      await addInternalNoteDetailed(txId, { note: `[Move to Under Review] ${reason}`, category: "dispute", follow_up_required: true, follow_up_priority: "high" });
      toast.success("Logged — moved to under review");
      refresh();
    } catch (e) {
      toast.error((e as Error).message ?? "Failed to log");
    }
  };
  const handleHighRisk = async (reason: string) => {
    try {
      await flagForReview(txId, `[HIGH RISK] ${reason}`);
      toast.success("Marked as high risk");
      refresh();
    } catch (e) {
      toast.error((e as Error).message ?? "Failed to flag");
    }
  };
  const handleFraudWatch = async (reason: string) => {
    try {
      await flagForReview(txId, `[FRAUD WATCH] ${reason}`);
      toast.success("Added to fraud watch");
      refresh();
    } catch (e) {
      toast.error((e as Error).message ?? "Failed to flag");
    }
  };
  const handleClose = async (reason: string) => {
    try {
      await resolveDispute(txId, {
        outcome_type: "close_case_without_resolution",
        decision_summary: reason,
        refund_amount: 0,
        release_amount: 0,
        notify_parties: true,
      });
      toast.success("Dispute closed");
      refresh();
    } catch (e) {
      toast.error((e as Error).message ?? "Failed to close dispute");
    }
  };
  const handleAddNote = async (payload: { note: string; category: any; follow_up_required?: boolean; follow_up_priority?: any }) => {
    try {
      await addInternalNoteDetailed(txId, payload);
      toast.success("Note added");
      refresh();
    } catch (e) {
      toast.error((e as Error).message ?? "Failed to add note");
    }
  };

  // ---------- sticky header ----------
  const header = (
    <div className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="flex items-center justify-between gap-3 px-6 py-4 lg:px-8 lg:py-5">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate("/admin/disputes")}
            className="rounded-md border border-border bg-background p-2 text-muted-foreground hover:text-foreground hover:bg-muted"
            aria-label="Back to disputes"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-foreground truncate">
              Dispute #{disputeCode}
            </h1>
            <p className="text-xs text-muted-foreground truncate">
              {itemTitle} · {txCode}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {slaText && (
            <span className={cn(
              "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-bold",
              overdue
                ? "border-red-500/40 bg-red-500/15 text-red-300"
                : "border-emerald-500/30 bg-emerald-500/15 text-emerald-300",
            )}>
              {overdue && <span className="h-2 w-2 rounded-full bg-red-400 animate-pulse" />}
              {slaText}
            </span>
          )}
          {!slaText && !resolvedAt && (
            <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/15 text-emerald-300 px-3 py-1 text-xs font-bold">
              Within SLA
            </span>
          )}
          <Button variant="outline" size="sm" onClick={() => window.print()} className="gap-2">
            <Printer className="h-4 w-4" /> Print
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <AdminLayout title="Dispute" hideDefaultHeaders fullBleed fullHeight>
      <div className="flex h-full min-h-0">
        <section className="flex-1 min-w-0 h-full overflow-y-auto">
          {header}

          {/* Summary strip — scrolls under the sticky header */}
          <div className="bg-card border-b border-border">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-5 px-6 py-6 lg:px-8">
                <div>
                  <KV label="Dispute ID" value={<span className="font-mono">{disputeCode}</span>} />
                  <button
                    className="mt-2 inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
                    onClick={() => navigate(`/admin/transactions/${txId}`)}
                  >
                    {txCode} <ExternalLink className="h-3 w-3" />
                  </button>
                </div>
                <div>
                  <KV label="Amount in Dispute" value={<span className="font-semibold">{ngn(amountInDispute)}</span>} />
                  <div className="mt-2 text-xs text-muted-foreground truncate">
                    {titleCase(row.reason ?? dispute.claimType) || "—"}
                  </div>
                </div>
                <div>
                  <KV label="Created" value={fmtDate(row.opened_at ?? dispute.openedAt)} />
                  <div className="mt-2 text-xs text-muted-foreground">
                    Last activity {relTime(tx.updatedAt ?? tx.updated_at)}
                  </div>
                </div>
                <div className="flex flex-col gap-2 min-w-0">
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Status</div>
                    <div className="mt-1"><StatusPill value={row.status} /></div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Assigned Agent</div>
                    {dispute.assignedAgent?.name ? (
                      <div className="mt-1 flex items-center gap-2 min-w-0">
                        <Avatar name={dispute.assignedAgent.name} src={dispute.assignedAgent.avatarUrl} size={20} />
                        <span className="text-sm text-foreground truncate">{dispute.assignedAgent.name}</span>
                      </div>
                    ) : (
                      <div className="mt-1 text-sm text-muted-foreground">Unassigned</div>
                    )}
                  </div>
                </div>
            </div>
          </div>

          <div className="px-6 py-6 lg:px-8 lg:py-8 space-y-8">

            {/* Buyer + Seller cards */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <PartyCard role="buyer" party={parties.buyer} />
              <PartyCard role="seller" party={parties.seller} />
            </div>

            {/* Financial overview */}
            <Card>
              <CardHeader title="Financial Overview & Controls" subtitle="Money state and payout controls for this dispute" />
              <div className="p-6 space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  <FinStat label="Total Transaction" value={ngn(buyerTotal)} caption={payment?.method ? `Paid via ${titleCase(payment.method)}` : undefined} />
                  <FinStat label="Amount in Dispute" value={ngn(amountInDispute)} tone="orange" caption="Full amount disputed" />
                  <FinStat label="Protection Fee" value={ngn(protectionFee)} caption={protectionFee > 0 && buyerTotal > 0 ? `${((protectionFee / buyerTotal) * 100).toFixed(1)}% escrow fee` : undefined} />
                  <FinStat
                    label="Funds Status"
                    value={
                      <span className="inline-flex items-center gap-2">
                        <span className={cn("h-2 w-2 rounded-full", moneyDotColor(moneyStatus))} />
                        <span className={cn(moneyTextColor(moneyStatus))}>{moneyStatusLabel(moneyStatus)}</span>
                      </span>
                    }
                    caption={tx.createdAt ? `Since ${new Date(tx.createdAt).toLocaleDateString("en-NG", { month: "short", day: "numeric", year: "numeric" })}` : undefined}
                  />
                </div>
                <div className="h-px bg-border" />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <FinStat label="Eligible Refund Amount" value={ngn(eligibleRefund)} tone="success" />
                  <FinStat label="Eligible Release Amount" value={ngn(eligibleRelease)} tone="info" caption="After fees" />
                  <FinStat
                    label="Payout Status"
                    value={
                      <span className="inline-flex items-center gap-2">
                        <span className={cn("h-2 w-2 rounded-full", payoutDotColor(payout, !resolvedAt))} />
                        <span className={cn(payoutTextColor(payout, !resolvedAt))}>{payoutLabel(payout, moneyStatus, !resolvedAt)}</span>
                      </span>
                    }
                    caption={!resolvedAt ? "Pending resolution" : undefined}
                  />
                </div>
              </div>
              {!resolvedAt && moneyStatus === "funds_pending_release" && (
                <div className="mx-5 mb-5 rounded-md border border-orange-500/30 bg-orange-500/10 p-3 text-xs text-orange-200">
                  <AlertTriangle className="inline h-4 w-4 mr-1.5" />
                  Active dispute — release is blocked until the dispute is resolved.
                </div>
              )}
              {moneyStatus === "funds_frozen" && (
                <div className="mx-5 mb-5 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
                  <Snowflake className="inline h-4 w-4 mr-1.5" />
                  Funds are frozen. No payouts or refunds will process automatically.
                </div>
              )}
              {refundedAmount > 0 && (
                <div className="mx-5 mb-5 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-200">
                  Refunded so far: <span className="font-semibold">{ngn(refundedAmount)}</span>
                </div>
              )}
            </Card>

            {/* Locked agreement (read-only preview) */}
            {lockedAgreement && (
              <Card>
                <CardHeader
                  title="Locked Agreement"
                  subtitle="Original terms when payment was made"
                  action={
                    <Button size="sm" variant="outline" onClick={() => dialogs.setAgreementOpen(true)}>
                      View full agreement
                    </Button>
                  }
                />
                <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <KV label="Item" value={lockedAgreement.item?.title ?? "—"} />
                  <KV label="Condition" value={lockedAgreement.item?.condition ?? "—"} />
                  <KV label="Agreed Price" value={ngn(lockedAgreement.agreedPrice)} />
                  <KV label="Delivery Method" value={titleCase(lockedAgreement.deliveryMethod) || "—"} />
                  <KV label="Verification Window" value={lockedAgreement.verificationWindowHours ? `${lockedAgreement.verificationWindowHours} hrs` : "—"} />
                  <KV label="Locked At" value={fmtDate(lockedAgreement.lockedAt)} />
                  <KV label="Total" value={ngn(lockedAgreement.total)} />
                  {lockedAgreement.sellerNotes && (
                    <KV className="col-span-2 md:col-span-4" label="Seller Notes" value={<span className="text-muted-foreground">{lockedAgreement.sellerNotes}</span>} />
                  )}
                </div>
              </Card>
            )}

            {/* Buyer Claim */}
            <Card>
              <CardHeader title="Buyer Claim" subtitle={titleCase(row.reason ?? dispute.claimType)} />
              <div className="p-5 space-y-4">
                <p className="text-sm text-foreground/90 whitespace-pre-wrap">
                  {row.description ?? dispute.summary ?? <span className="text-muted-foreground">No claim description provided.</span>}
                </p>
                <EvidenceGrid
                  items={evidence.filter((e) => (e.uploadedByRole ?? "").toLowerCase() === "buyer")}
                  onPreview={dialogs.setEvidencePreview}
                  emptyText="Buyer hasn't uploaded any evidence yet."
                />
              </div>
            </Card>

            {/* Seller Response */}
            <Card>
              <CardHeader
                title="Seller Response"
                subtitle={dispute.responses?.length ? `${dispute.responses.length} response${dispute.responses.length === 1 ? "" : "s"}` : "Awaiting"}
              />
              <div className="p-5 space-y-4">
                {(dispute.responses ?? []).length === 0 ? (
                  <div className="rounded-md border border-dashed border-border bg-muted/30 p-5 text-center">
                    <Clock className="mx-auto h-6 w-6 text-muted-foreground" />
                    <div className="mt-2 text-sm font-medium text-foreground">
                      {overdue ? "Seller response overdue" : "Awaiting seller response"}
                    </div>
                    {dueAt && (
                      <div className="text-xs text-muted-foreground mt-1">
                        Due {fmtDate(dueAt)} · {relTime(dueAt)}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {(dispute.responses as any[]).map((r) => (
                      <div key={r.id} className="rounded-md border border-border bg-background p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-xs text-muted-foreground">Response #{r.number}</div>
                          <div className="text-xs text-muted-foreground">{fmtDate(r.at)}</div>
                        </div>
                        <p className="text-sm text-foreground/90 whitespace-pre-wrap">{r.text}</p>
                      </div>
                    ))}
                  </div>
                )}
                <EvidenceGrid
                  items={evidence.filter((e) => (e.uploadedByRole ?? "").toLowerCase() === "seller")}
                  onPreview={dialogs.setEvidencePreview}
                  emptyText="Seller hasn't uploaded any evidence yet."
                />
              </div>
            </Card>

            {/* Case Communication */}
            <Card>
              <CardHeader title="Case Communication" subtitle="Structured dispute communication workspace — all messages are logged and auditable" />
              <div className="p-6 space-y-5">
                <CommunicationStatusRow
                  buyerResponded={(evidence ?? []).some((e) => (e.uploadedByRole ?? "").toLowerCase() === "buyer")}
                  sellerOverdue={overdue && !(dispute.responses?.length)}
                  sellerRespondedAt={dispute.responses?.[0]?.at ?? null}
                  openedAt={row.opened_at ?? dispute.openedAt ?? null}
                  dueAt={dueAt}
                />
                <CommunicationTabs
                  notes={notes}
                  defaultTab={dispute.responses?.length ? "internal" : (overdue ? "seller" : "buyer")}
                  onAddNote={() => dialogs.setNoteOpen(true)}
                  sellerName={parties.seller?.name}
                  buyerName={parties.buyer?.name}
                />
              </div>
            </Card>

            {/* Case Timeline */}
            <Card>
              <CardHeader title="Case Timeline" subtitle="Dispute-relevant events" />
              <div className="p-5">
                <Timeline items={dedupeTimeline(filterDisputeTimeline(timeline))} />
              </div>
            </Card>

            {/* Internal notes */}
            <Card>
              <CardHeader
                title="Internal Notes & Investigation"
                action={<Button size="sm" onClick={() => dialogs.setNoteOpen(true)}>Add note</Button>}
              />
              <div className="p-5">
                <NotesList notes={notes} />
              </div>
            </Card>

            {/* Linked records */}
            <Card>
              <CardHeader title="Linked Records & Quick Actions" />
              <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <LinkedTile tone="blue" icon={<Scale className="h-5 w-5" />} title="Transaction Detail" subtitle={txCode}
                  onClick={() => navigate(`/admin/transactions/${txId}`)} />
                <LinkedTile tone="emerald" icon={<UserIcon className="h-5 w-5" />} title="Buyer Profile"
                  subtitle={parties.buyer?.id?.slice(0, 16) ?? "—"}
                  onClick={parties.buyer ? () => navigate(`/admin/users/${parties.buyer!.id}`) : undefined} />
                <LinkedTile tone="orange" icon={<Store className="h-5 w-5" />} title="Seller Profile"
                  subtitle={parties.seller?.id?.slice(0, 16) ?? "—"}
                  onClick={parties.seller ? () => navigate(`/admin/users/${parties.seller!.id}`) : undefined} />
                <LinkedTile tone="emerald" icon={<CreditCard className="h-5 w-5" />} title="Payment Record"
                  subtitle={payment ? `${(payment.providerReference ?? "").slice(0, 20)}` : "No payment record"} />
                <LinkedTile tone="blue" icon={<Vault className="h-5 w-5" />} title="Escrow Record"
                  subtitle={`${escrow?.ledger?.length ?? 0} ledger entries`} />
                <LinkedTile tone="purple" icon={<Clock className="h-5 w-5" />} title="Audit Trail"
                  subtitle="View all activity" />
              </div>
            </Card>

            {/* Mobile action bar */}
            <div className="xl:hidden">
              <Button className="w-full" onClick={() => dialogs.setResolveOpen(true)} disabled={!adminCan.canManageDispute}>
                Take Action · Review Case
              </Button>
            </div>
          </div>
        </section>

        {/* Right resolution sidebar */}
        <aside className="hidden xl:block w-[380px] shrink-0 h-full overflow-y-auto border-l border-border bg-card">
          <ResolutionSidebar
              disputeStatus={row.status}
              overdue={overdue}
              resolvedAt={resolvedAt}
              moneyStatus={moneyStatus}
              adminCan={adminCan}
              dueAt={dueAt}
              onResolve={() => dialogs.setResolveOpen(true)}
              onMoveReview={() => dialogs.setMoveReviewOpen(true)}
              onEscalate={() => dialogs.setEscalateOpen(true)}
              onHighRisk={() => dialogs.setHighRiskOpen(true)}
              onFraud={() => dialogs.setFraudOpen(true)}
              onClose={() => dialogs.setCloseOpen(true)}
              onAddNote={() => dialogs.setNoteOpen(true)}
          />
        </aside>
      </div>

      {/* Dialogs */}
      <ResolveDisputeDialog
        open={dialogs.resolveOpen}
        onOpenChange={dialogs.setResolveOpen}
        moneyStatus={moneyStatus}
        heldAmount={heldAmount}
        frozenAmount={frozenAmount}
        currencyCode={tx.currency ?? "NGN"}
        hasActiveInvestigation={!!txDetail.risk?.investigationNotes?.length}
        onResolve={handleResolve}
        onRequestMoreInfo={handleRequestMoreInfo}
      />
      <InternalNoteDialog
        open={dialogs.noteOpen}
        onOpenChange={dialogs.setNoteOpen}
        transactionCode={txCode}
        onSubmit={handleAddNote}
      />
      <ActionConfirmDialog
        open={dialogs.escalateOpen}
        onOpenChange={dialogs.setEscalateOpen}
        title="Escalate dispute"
        description="Escalates this case for senior review. Add a clear reason."
        confirmLabel="Escalate"
        confirmTone="danger"
        onConfirm={handleEscalate}
      />
      <ActionConfirmDialog
        open={dialogs.moveReviewOpen}
        onOpenChange={dialogs.setMoveReviewOpen}
        title="Move to Under Review"
        description="Logs that this dispute is now being actively reviewed by admin."
        confirmLabel="Move to review"
        onConfirm={handleMoveReview}
      />
      <ActionConfirmDialog
        open={dialogs.highRiskOpen}
        onOpenChange={dialogs.setHighRiskOpen}
        title="Mark High Risk"
        description="Flags the transaction for high-risk review."
        confirmLabel="Flag high risk"
        confirmTone="danger"
        onConfirm={handleHighRisk}
      />
      <ActionConfirmDialog
        open={dialogs.fraudOpen}
        onOpenChange={dialogs.setFraudOpen}
        title="Add to Fraud Watch"
        description="Flags the transaction with a fraud watch note. Does not freeze funds automatically."
        confirmLabel="Flag fraud watch"
        confirmTone="danger"
        onConfirm={handleFraudWatch}
      />
      <ActionConfirmDialog
        open={dialogs.closeOpen}
        onOpenChange={dialogs.setCloseOpen}
        title="Close without resolution"
        description="Closes the dispute without moving money. Adds an audit reason."
        confirmLabel="Close case"
        typeToConfirm="CLOSE"
        onConfirm={handleClose}
      />
      <EvidencePreviewDialog
        open={!!dialogs.evidencePreview}
        onOpenChange={(v) => !v && dialogs.setEvidencePreview(null)}
        item={dialogs.evidencePreview}
        transactionCode={txCode}
      />
      {lockedAgreement && (
        <AgreementPreviewDialog
          open={dialogs.agreementOpen}
          onOpenChange={dialogs.setAgreementOpen}
          agreement={lockedAgreement}
          transactionCode={txCode}
        />
      )}
    </AdminLayout>
  );
}

// ---------- party card ----------
function PartyCard({ role, party }: { role: "buyer" | "seller"; party: any }) {
  const navigate = useNavigate();
  if (!party) {
    return (
      <Card>
        <CardHeader title={role === "buyer" ? "Buyer Information" : "Seller Information"} />
        <div className="p-5 text-sm text-muted-foreground">No {role} on this transaction.</div>
      </Card>
    );
  }
  const ver = party.verification ?? {};
  const isBuyer = role === "buyer";
  const roleChipCls = isBuyer
    ? "bg-blue-500/15 text-blue-300 border-blue-500/30"
    : "bg-orange-500/15 text-orange-300 border-orange-500/30";
  const callBtnCls = isBuyer
    ? "bg-blue-600 hover:bg-blue-500 text-white border-transparent"
    : "bg-orange-600 hover:bg-orange-500 text-white border-transparent";
  const sellerTier: string | null = !isBuyer && party.sellerTier ? party.sellerTier : null;
  return (
    <Card>
      <CardHeader
        title={isBuyer ? "Buyer Information" : "Seller Information"}
        action={
          <span className={cn("inline-flex items-center rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider", roleChipCls)}>
            {isBuyer ? "Buyer" : "Seller"}
          </span>
        }
      />
      <div className="p-6 space-y-5">
        <div className="flex items-start gap-3">
          <Avatar name={party.name} src={party.avatarUrl} size={48} />
          <div className="min-w-0 flex-1">
            <div className="text-base font-semibold text-foreground truncate">{party.name ?? "—"}</div>
            <div className="text-xs text-muted-foreground font-mono truncate">User ID: {party.id?.slice(0, 16) ?? "—"}</div>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            {ver.identity && (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5" /> Verified
              </span>
            )}
            {sellerTier && (
              <span className="inline-flex items-center gap-1 text-xs text-yellow-400">
                <Flag className="h-3.5 w-3.5" /> {titleCase(sellerTier)} Seller
              </span>
            )}
            {party.flagged && (
              <span className="inline-flex items-center gap-1 text-xs text-red-400">
                <AlertTriangle className="h-3.5 w-3.5" /> Flagged
              </span>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <KV label="Email" value={<span className="font-mono text-xs">{party.maskedEmail ?? "—"}</span>} />
          <KV label="Phone" value={<span className="font-mono text-xs">{party.maskedPhone ?? "—"}</span>} />
          <KV label="Prior Disputes" value={party.priorDisputes != null ? `${party.priorDisputes} ${isBuyer ? "filed" : "received"}` : "—"} />
          <KV
            label={isBuyer ? "Account Status" : "Payout Status"}
            value={
              isBuyer
                ? <span className={cn(party.accountStatus === "good_standing" ? "text-emerald-400" : "text-foreground")}>{titleCase(party.accountStatus) || "—"}</span>
                : <span className="text-red-400">Blocked</span>
            }
          />
        </div>
        <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button size="sm" disabled className={cn("w-full gap-1.5", callBtnCls, "opacity-100")}>
                  <Phone className="h-3.5 w-3.5" /> Call
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>Direct calling not connected yet</TooltipContent>
          </Tooltip>
          <ContactBtn icon={<Mail className="h-3.5 w-3.5" />} label="Email" disabled tip="Direct email not connected yet" />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="sm" variant="outline" className="px-2.5" onClick={() => navigate(`/admin/users/${party.id}`)} aria-label="Profile">
                <UserIcon className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Open profile</TooltipContent>
          </Tooltip>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => navigate(`/admin/users/${party.id}`)}>
            <UserIcon className="h-3.5 w-3.5" /> View Profile
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => navigate(`/admin/disputes?user=${party.id}`)}>
            <Scale className="h-3.5 w-3.5" /> Dispute History
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => navigate(`/admin/transactions?user=${party.id}`)}>
            <Receipt className="h-3.5 w-3.5" /> Transactions
          </Button>
        </div>
      </div>
    </Card>
  );
}

function ContactBtn({ icon, label, disabled, tip }: { icon: React.ReactNode; label: string; disabled?: boolean; tip?: string }) {
  const btn = (
    <Button size="sm" variant="outline" disabled={disabled} className="gap-1.5">
      {icon} {label}
    </Button>
  );
  if (!disabled || !tip) return btn;
  return (
    <Tooltip>
      <TooltipTrigger asChild><span>{btn}</span></TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  );
}

function Tag({ children, tone }: { children: React.ReactNode; tone: "emerald" | "blue" | "red" | "orange" | "slate" }) {
  const map = {
    emerald: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    blue: "bg-blue-500/15 text-blue-300 border-blue-500/30",
    red: "bg-red-500/15 text-red-300 border-red-500/30",
    orange: "bg-orange-500/15 text-orange-300 border-orange-500/30",
    slate: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  };
  return <span className={cn("inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold", map[tone])}>{children}</span>;
}

// ---------- financial helpers ----------
function moneyStatusLabel(v?: string | null) {
  if (!v) return "—";
  const map: Record<string, string> = {
    funds_held_in_escrow: "Held in Escrow",
    funds_pending_release: "Pending Release",
    funds_released: "Released",
    funds_frozen: "Funds Frozen",
    funds_refunded: "Refunded",
    funds_partially_refunded: "Partially Refunded",
    no_funds: "No Funds",
  };
  return map[v] ?? titleCase(v);
}
function moneyTone(v?: string | null): "info" | "warning" | "success" | "danger" | undefined {
  if (!v) return undefined;
  if (v === "funds_frozen") return "danger";
  if (v === "funds_released") return "success";
  if (v === "funds_pending_release") return "warning";
  if (v === "funds_held_in_escrow") return "info";
  return undefined;
}
function payoutLabel(payout: any, moneyStatus: string | null, disputeActive: boolean) {
  if (!payout) return disputeActive ? "Blocked (dispute active)" : "No payout yet";
  if (disputeActive) return "Blocked (dispute active)";
  return titleCase(payout.status) || "—";
}

function FinStat({ label, value, caption, tone }: {
  label: string; value: React.ReactNode; caption?: React.ReactNode;
  tone?: "info" | "warning" | "success" | "danger" | "orange";
}) {
  const toneCls = tone === "danger" ? "text-red-400"
    : tone === "warning" ? "text-orange-400"
    : tone === "success" ? "text-emerald-400"
    : tone === "info" ? "text-blue-400"
    : tone === "orange" ? "text-orange-400"
    : "text-foreground";
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-xl font-bold truncate", toneCls)}>{value}</div>
      {caption && <div className="mt-1 text-xs text-muted-foreground truncate">{caption}</div>}
    </div>
  );
}
function moneyDotColor(v?: string | null) {
  if (v === "funds_frozen") return "bg-red-500";
  if (v === "funds_released") return "bg-emerald-500";
  if (v === "funds_refunded" || v === "funds_partially_refunded") return "bg-emerald-500";
  if (v === "funds_pending_release") return "bg-orange-500";
  if (v === "funds_held_in_escrow") return "bg-yellow-500";
  return "bg-muted-foreground";
}
function moneyTextColor(v?: string | null) {
  if (v === "funds_frozen") return "text-red-400";
  if (v === "funds_released" || v === "funds_refunded" || v === "funds_partially_refunded") return "text-emerald-400";
  if (v === "funds_pending_release") return "text-orange-400";
  if (v === "funds_held_in_escrow") return "text-yellow-400";
  return "text-foreground";
}
function payoutDotColor(payout: any, disputeActive: boolean) {
  if (disputeActive) return "bg-red-500";
  if (payout?.status === "completed") return "bg-emerald-500";
  if (payout?.status === "pending") return "bg-yellow-500";
  return "bg-muted-foreground";
}
function payoutTextColor(payout: any, disputeActive: boolean) {
  if (disputeActive) return "text-red-400";
  if (payout?.status === "completed") return "text-emerald-400";
  if (payout?.status === "pending") return "text-yellow-400";
  return "text-foreground";
}

// ---------- evidence ----------
function EvidenceGrid({ items, onPreview, emptyText }: {
  items: AdminTxEvidenceItem[];
  onPreview: (i: AdminTxEvidenceItem) => void;
  emptyText: string;
}) {
  if (items.length === 0) {
    return <div className="text-xs text-muted-foreground">{emptyText}</div>;
  }
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
      {items.map((ev) => {
        const Icon = evidenceIcon(ev.kind, ev.mimeType);
        const isImage = (ev.mimeType ?? "").startsWith("image/") || ev.kind === "image";
        return (
          <button
            key={ev.id}
            type="button"
            onClick={() => onPreview(ev)}
            className="group rounded-md border border-border bg-background hover:border-blue-500/40 hover:bg-muted/40 overflow-hidden text-left"
          >
            <div className="aspect-square bg-muted/40 flex items-center justify-center overflow-hidden">
              {isImage && ev.secureUrl ? (
                <img src={ev.secureUrl} alt={ev.title} className="h-full w-full object-cover" loading="lazy" />
              ) : (
                <Icon className="h-8 w-8 text-muted-foreground" />
              )}
            </div>
            <div className="px-2 py-2 text-[11px] leading-tight">
              <div className="font-medium text-foreground truncate">{ev.title}</div>
              <div className="text-muted-foreground truncate">
                {titleCase(ev.uploadedByRole)} · {relTime(ev.uploadedAt)}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ---------- communication ----------
function CommunicationStatusRow({
  buyerResponded, sellerOverdue, sellerRespondedAt, openedAt, dueAt,
}: {
  buyerResponded: boolean;
  sellerOverdue: boolean;
  sellerRespondedAt: string | null;
  openedAt: string | null;
  dueAt: string | null;
}) {
  const dayLabel = (iso?: string | null) => iso ? new Date(iso).toLocaleDateString("en-NG", { month: "short", day: "numeric" }) : "—";
  const chips: Array<{ tone: "emerald" | "red" | "orange" | "yellow" | "slate"; label: string; meta: string }> = [];
  if (buyerResponded) chips.push({ tone: "emerald", label: "Buyer Responded", meta: dayLabel(openedAt) });
  if (sellerRespondedAt) chips.push({ tone: "emerald", label: "Seller Responded", meta: dayLabel(sellerRespondedAt) });
  else if (sellerOverdue) chips.push({ tone: "red", label: "Seller Response Overdue", meta: dueAt ? relTime(dueAt) : "—" });
  else if (dueAt) chips.push({ tone: "yellow", label: "Seller Response Pending", meta: dayLabel(dueAt) });
  if (chips.length === 0) return null;
  const toneMap: Record<string, string> = {
    emerald: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    red: "border-red-500/40 bg-red-500/10 text-red-300",
    orange: "border-orange-500/30 bg-orange-500/10 text-orange-300",
    yellow: "border-yellow-500/30 bg-yellow-500/10 text-yellow-200",
    slate: "border-border bg-muted/30 text-muted-foreground",
  };
  const dotMap: Record<string, string> = {
    emerald: "bg-emerald-400", red: "bg-red-400", orange: "bg-orange-400", yellow: "bg-yellow-400", slate: "bg-muted-foreground",
  };
  return (
    <div className="rounded-md border border-border bg-background/40 p-3">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Communication Status</div>
      <div className="flex flex-wrap gap-2">
        {chips.map((c, i) => (
          <span key={i} className={cn("inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold", toneMap[c.tone])}>
            <span className={cn("h-1.5 w-1.5 rounded-full", dotMap[c.tone])} />
            {c.label}
            <span className="text-muted-foreground font-normal">{c.meta}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
function CommunicationTabs({ notes, defaultTab, onAddNote, sellerName, buyerName }: {
  notes: any[]; defaultTab: string; onAddNote: () => void;
  sellerName?: string | null; buyerName?: string | null;
}) {
  const [msgType, setMsgType] = useState("general_reply");
  const [activeTab, setActiveTab] = useState(defaultTab);
  const recipient = activeTab === "seller" ? (sellerName ?? "seller")
    : activeTab === "buyer" ? (buyerName ?? "buyer")
    : "internal note";
  return (
    <Tabs value={activeTab} onValueChange={setActiveTab}>
      <TabsList className="bg-muted/40">
        <TabsTrigger value="buyer" className="gap-1.5"><UserIcon className="h-3.5 w-3.5 text-blue-400" />Buyer Messages</TabsTrigger>
        <TabsTrigger value="seller" className="gap-1.5"><Store className="h-3.5 w-3.5 text-orange-400" />Seller Messages</TabsTrigger>
        <TabsTrigger value="internal" className="gap-1.5"><StickyNote className="h-3.5 w-3.5 text-purple-400" />Internal Notes</TabsTrigger>
      </TabsList>
      <div className="mt-4 max-h-[600px] overflow-y-auto pr-1 space-y-3">
        <TabsContent value="buyer" forceMount={activeTab === "buyer" ? true : undefined} className="m-0">
          {activeTab === "buyer" && <CommEmpty label="No buyer messages available yet" />}
        </TabsContent>
        <TabsContent value="seller" forceMount={activeTab === "seller" ? true : undefined} className="m-0">
          {activeTab === "seller" && <CommEmpty label="No seller messages available yet" />}
        </TabsContent>
        <TabsContent value="internal" forceMount={activeTab === "internal" ? true : undefined} className="m-0">
          {activeTab === "internal" && <NotesList notes={notes} compact />}
        </TabsContent>
      </div>
      <div className="mt-4 pt-4 border-t border-border space-y-3">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Quick Actions</div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={onAddNote}><MessageSquare className="h-3.5 w-3.5" />Request Clarification</Button>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={onAddNote}><FileText className="h-3.5 w-3.5" />Request Evidence</Button>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={onAddNote}><Clock className="h-3.5 w-3.5" />Send Reminder</Button>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={onAddNote}><AlertTriangle className="h-3.5 w-3.5" />Send Deadline Notice</Button>
        </div>
        <div className="rounded-md border border-border bg-background/40 p-3 space-y-2">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
            New message to {recipient}
          </div>
          <textarea
            placeholder={`Type your message to ${recipient}…`}
            rows={3}
            className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:border-blue-500/40"
            onFocus={(e) => { e.preventDefault(); e.currentTarget.blur(); onAddNote(); }}
          />
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" className="gap-1.5" disabled>
                <FileText className="h-3.5 w-3.5" /> Attach File
              </Button>
              <select value={msgType} onChange={(e) => setMsgType(e.target.value)}
                className="text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground">
                <option value="general_reply">General Reply</option>
                <option value="clarification">Clarification Request</option>
                <option value="evidence_request">Evidence Request</option>
                <option value="reminder">Reminder</option>
                <option value="deadline">Deadline Notice</option>
                <option value="resolution">Resolution Update</option>
              </select>
            </div>
            <Button
              size="sm"
              onClick={onAddNote}
              className={cn(
                "gap-1.5",
                activeTab === "seller" && "bg-orange-600 hover:bg-orange-500 text-white",
                activeTab === "buyer" && "bg-blue-600 hover:bg-blue-500 text-white",
                activeTab === "internal" && "bg-purple-600 hover:bg-purple-500 text-white",
              )}
            >
              <Send className="h-3.5 w-3.5" />
              Send {activeTab === "internal" ? "Note" : `to ${activeTab === "seller" ? "Seller" : "Buyer"}`}
            </Button>
          </div>
        </div>
      </div>
    </Tabs>
  );
}
function CommEmpty({ label }: { label: string }) {
  return (
    <div className="rounded-md border border-dashed border-border bg-muted/20 p-6 text-center">
      <MessageSquare className="mx-auto h-6 w-6 text-muted-foreground" />
      <div className="mt-2 text-sm text-foreground">{label}</div>
      <div className="text-xs text-muted-foreground mt-1">
        Direct dispute messaging is not connected yet. Use Internal Notes to log activity.
      </div>
    </div>
  );
}

// ---------- notes ----------
function NotesList({ notes, compact }: { notes: any[]; compact?: boolean }) {
  if (!notes || notes.length === 0) {
    return <div className="text-xs text-muted-foreground">No internal notes yet.</div>;
  }
  return (
    <div className="space-y-3">
      {notes.map((n) => (
        <div key={n.id} className="rounded-md border border-border bg-background p-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
            <span className="text-foreground font-medium">{n.author?.full_name ?? "Admin"}</span>
            <span>{fmtDate(n.at)}</span>
          </div>
          <p className={cn("text-sm text-foreground/90 whitespace-pre-wrap", compact && "line-clamp-3")}>{n.note}</p>
        </div>
      ))}
    </div>
  );
}

// ---------- timeline ----------
const DISPUTE_RELEVANT_TYPES = new Set([
  "dispute", "dispute_opened", "dispute_under_review", "dispute_escalated",
  "dispute_resolved", "dispute_evidence_uploaded", "seller_response_submitted",
  "buyer_evidence_uploaded", "admin_action", "money_status", "payment", "payout",
  "escrow_ledger", "delivery",
]);
function filterDisputeTimeline(items: any[]) {
  return items.filter((i) => DISPUTE_RELEVANT_TYPES.has(i.type));
}
function dedupeTimeline(items: any[]) {
  const seen = new Set<string>();
  return items.filter((i) => {
    const key = `${i.type}|${i.at}|${i.actorName ?? ""}|${i.title}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}
function Timeline({ items }: { items: any[] }) {
  if (items.length === 0) {
    return <div className="text-xs text-muted-foreground">No timeline events yet.</div>;
  }
  return (
    <ol className="relative border-l border-border pl-5 space-y-4">
      {items.map((e) => (
        <li key={e.id} className="relative">
          <span className={cn(
            "absolute -left-[27px] top-1 grid h-4 w-4 place-items-center rounded-full border",
            e.severity === "critical" ? "border-red-500 bg-red-500/20"
              : e.severity === "warning" ? "border-orange-500 bg-orange-500/20"
              : e.severity === "success" ? "border-emerald-500 bg-emerald-500/20"
              : "border-blue-500 bg-blue-500/20",
          )}>
            <Circle className="h-2 w-2 fill-current text-foreground" />
          </span>
          <div className="flex items-baseline justify-between gap-3">
            <div className="text-sm font-medium text-foreground">{e.title}</div>
            <div className="text-xs text-muted-foreground shrink-0">{fmtDate(e.at)}</div>
          </div>
          {e.description && <div className="text-xs text-muted-foreground mt-0.5">{e.description}</div>}
          {e.actorName && <div className="text-[11px] text-muted-foreground mt-0.5">by {e.actorName}</div>}
        </li>
      ))}
    </ol>
  );
}

// ---------- linked tile ----------
function LinkedTile({ icon, title, subtitle, onClick, tone = "blue" }: {
  icon: React.ReactNode; title: string; subtitle: string; onClick?: () => void;
  tone?: "blue" | "emerald" | "orange" | "purple" | "yellow";
}) {
  const disabled = !onClick;
  const toneCls: Record<string, string> = {
    blue: "bg-blue-500/15 text-blue-300",
    emerald: "bg-emerald-500/15 text-emerald-300",
    orange: "bg-orange-500/15 text-orange-300",
    purple: "bg-purple-500/15 text-purple-300",
    yellow: "bg-yellow-500/15 text-yellow-300",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center gap-3 rounded-lg border border-border bg-background p-4 text-left transition-colors",
        disabled ? "opacity-60 cursor-not-allowed" : "hover:border-blue-500/40 hover:bg-muted/30",
      )}
    >
      <span className={cn("grid h-10 w-10 place-items-center rounded-md", toneCls[tone])}>{icon}</span>
      <span className="min-w-0 flex-1">
        <div className="text-sm font-medium text-foreground truncate">{title}</div>
        <div className="text-xs text-muted-foreground truncate font-mono">{subtitle}</div>
      </span>
      {!disabled && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
    </button>
  );
}

// ---------- resolution sidebar ----------
function ResolutionSidebar({
  disputeStatus, overdue, resolvedAt, moneyStatus, adminCan, dueAt,
  onResolve, onMoveReview, onEscalate, onHighRisk, onFraud, onClose, onAddNote,
}: {
  disputeStatus: string;
  overdue: boolean;
  resolvedAt: string | null;
  moneyStatus: string | null;
  adminCan: Record<string, boolean>;
  dueAt: string | null;
  onResolve: () => void;
  onMoveReview: () => void;
  onEscalate: () => void;
  onHighRisk: () => void;
  onFraud: () => void;
  onClose: () => void;
  onAddNote: () => void;
}) {
  const statusMeta = resolutionMeta(disputeStatus, overdue, resolvedAt);
  const canManage = !!adminCan.canManageDispute;
  const isResolved = !!resolvedAt || disputeStatus === "resolved" || disputeStatus === "closed" || disputeStatus === "dismissed";

  return (
    <div className="p-5 space-y-5">
      {/* Resolution Status */}
      <div className={cn("rounded-xl border p-4", statusMeta.cls)}>
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide">
          {statusMeta.Icon && <statusMeta.Icon className="h-4 w-4" />}
          {statusMeta.label}
        </div>
        <p className="mt-1 text-sm">{statusMeta.message}</p>
        <div className="mt-3 space-y-1.5 text-xs">
          <div>
            <span className="text-muted-foreground">Workflow stage:</span>{" "}
            <span className="text-foreground font-medium">{titleCase(disputeStatus)}</span>
          </div>
          {dueAt && !isResolved && (
            <div>
              <span className="text-muted-foreground">SLA deadline:</span>{" "}
              <span className="text-foreground font-medium">{fmtDate(dueAt)}</span>
            </div>
          )}
          <div>
            <span className="text-muted-foreground">Next action:</span>{" "}
            <span className="text-foreground">{statusMeta.next}</span>
          </div>
        </div>
      </div>

      {/* Case Control */}
      <SidebarGroup title="Case Control">
        <SidebarBtn icon={<Gavel />} label="Move to Under Review"
          onClick={onMoveReview}
          disabled={isResolved}
          tip={isResolved ? "Case already resolved" : undefined} />
        <SidebarBtn icon={<MessageSquare />} label="Request More Evidence"
          onClick={onResolve} disabled={isResolved}
          tip={isResolved ? "Case already resolved" : "Opens dispute action panel"} />
        <SidebarBtn icon={<UserIcon />} label="Assign / Reassign Agent"
          disabled tip="Agent assignment not connected yet" />
        <SidebarBtn icon={<AlertTriangle />} label="Escalate Further"
          onClick={onEscalate} disabled={isResolved} tone="warning" />
        <SidebarBtn icon={<Flag />} label="Mark High Risk"
          onClick={onHighRisk} tone="danger" />
        <SidebarBtn icon={<ShieldAlert />} label="Mark Fraud Watch"
          onClick={onFraud} tone="danger" />
      </SidebarGroup>

      {/* Resolution Actions */}
      <SidebarGroup title="Resolution Actions">
        <SidebarBtn icon={<Wallet />} label="Refund Buyer"
          onClick={onResolve} disabled={!canManage || isResolved}
          tone="success"
          tip={!canManage ? "Not available for this transaction" : (isResolved ? "Case already resolved" : undefined)} />
        <SidebarBtn icon={<CheckCircle2 />} label="Release Funds to Seller"
          onClick={onResolve} disabled={!canManage || isResolved}
          tone="success"
          tip={!canManage ? "Not available for this transaction" : (isResolved ? "Case already resolved" : undefined)} />
        <SidebarBtn icon={<Scale />} label="Partial Refund / Release"
          onClick={onResolve} disabled={!canManage || isResolved}
          tip={!canManage ? "Not available" : undefined} />
        <SidebarBtn icon={<XCircle />} label="Close Without Resolution"
          onClick={onClose} disabled={isResolved} tone="muted" />
      </SidebarGroup>

      <SidebarGroup title="Notes">
        <SidebarBtn icon={<StickyNote />} label="Add Internal Note" onClick={onAddNote} />
      </SidebarGroup>
    </div>
  );
}

function SidebarGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2 px-1">{title}</div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}
function SidebarBtn({ icon, label, onClick, disabled, tone, tip }: {
  icon: React.ReactNode; label: string; onClick?: () => void;
  disabled?: boolean; tone?: "success" | "warning" | "danger" | "muted"; tip?: string;
}) {
  const toneCls = tone === "danger" ? "hover:border-red-500/40 hover:bg-red-500/5"
    : tone === "warning" ? "hover:border-orange-500/40 hover:bg-orange-500/5"
    : tone === "success" ? "hover:border-emerald-500/40 hover:bg-emerald-500/5"
    : "hover:border-blue-500/40 hover:bg-blue-500/5";
  const btn = (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || !onClick}
      className={cn(
        "w-full flex items-center gap-2.5 rounded-md border border-border bg-background px-3 py-2.5 text-sm text-foreground transition-colors text-left",
        disabled || !onClick ? "opacity-50 cursor-not-allowed" : toneCls,
      )}
    >
      <span className="h-4 w-4 text-muted-foreground">{icon}</span>
      <span className="flex-1">{label}</span>
    </button>
  );
  if ((disabled || !onClick) && tip) {
    return (
      <Tooltip>
        <TooltipTrigger asChild><span>{btn}</span></TooltipTrigger>
        <TooltipContent>{tip}</TooltipContent>
      </Tooltip>
    );
  }
  return btn;
}

function resolutionMeta(status: string, overdue: boolean, resolvedAt: string | null): {
  label: string; message: string; next: string; cls: string; Icon?: any;
} {
  if (resolvedAt || status === "resolved") return {
    label: "Resolved", message: "Case has a recorded resolution outcome.",
    next: "View outcome and money movement.",
    cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-100",
    Icon: CheckCircle2,
  };
  if (status === "dismissed" || status === "closed") return {
    label: "Closed", message: "Case closed without payout or refund.",
    next: "Review audit trail.",
    cls: "border-slate-500/30 bg-slate-500/10 text-slate-100",
    Icon: XCircle,
  };
  if (status === "escalated") return {
    label: "Escalated", message: "Case escalated — requires immediate admin review.",
    next: "Review evidence and determine outcome.",
    cls: "border-red-500/40 bg-red-500/10 text-red-100",
    Icon: AlertTriangle,
  };
  if (status === "under_review") return {
    label: "Under Review", message: "Admin review in progress.",
    next: "Review evidence and decide the outcome.",
    cls: "border-purple-500/30 bg-purple-500/10 text-purple-100",
    Icon: Gavel,
  };
  if (status === "awaiting_seller_response") return {
    label: overdue ? "Awaiting Seller (Overdue)" : "Awaiting Seller",
    message: overdue ? "Seller response is overdue." : "Seller response pending.",
    next: overdue ? "Send reminder or escalate." : "Wait for seller response or send reminder.",
    cls: overdue
      ? "border-red-500/40 bg-red-500/10 text-red-100"
      : "border-yellow-500/30 bg-yellow-500/10 text-yellow-100",
    Icon: Clock,
  };
  return {
    label: "Open", message: "Case waiting for triage.",
    next: "Move to under review or request seller response.",
    cls: "border-blue-500/30 bg-blue-500/10 text-blue-100",
    Icon: Gavel,
  };
}