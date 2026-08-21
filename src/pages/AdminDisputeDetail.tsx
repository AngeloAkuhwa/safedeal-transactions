import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import {
  ArrowLeft, Printer, AlertTriangle, Loader2, Phone, Mail, User as UserIcon,
  ExternalLink, FileText, Image as ImageIcon, Video, Receipt, Truck, Scale,
  Circle, Clock, ShieldAlert, Snowflake, MessageSquare, StickyNote, Gavel,
  CheckCircle2, XCircle, ChevronRight, Flag, Wallet, CreditCard, Vault,
  Search, Send, Ban, PlayCircle, Eye, NotebookPen, Store,
  Star, Info, FilePlus2, Bell, HelpCircle, CheckCheck, Check, Paperclip,
  MessageCircle, ArrowRight, Lock, Menu,
  Percent, PieChart, RotateCcw, ArrowUp, Edit3, Users as UsersIcon,
} from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Sheet, SheetContent } from "@/components/ui/sheet";
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
  transitionDisputeStatus,
  type DisputeOutcomeType,
  DisputeEscalationRequiredError,
} from "@/services/admin-transaction-actions.service";
import { ResolveDisputeDialog } from "@/components/admin/transactions/ResolveDisputeDialog";
import { ActionConfirmDialog } from "@/components/admin/transactions/ActionConfirmDialog";
import { performFlaggedAction } from "@/services/admin-flagged-users.service";
import { InternalNoteDialog } from "@/components/admin/transactions/InternalNoteDialog";
import { EvidencePreviewDialog } from "@/components/admin/transactions/EvidencePreviewDialog";
import { AgreementPreviewDialog } from "@/components/admin/transactions/AgreementPreviewDialog";
import type { AdminTxEvidenceItem } from "@/services/admin-transaction-detail.service";
import { deriveActiveState, nextActionLabelFor } from "@/lib/admin-active-state";
import { AdminCaseTimeline } from "@/components/admin/timeline/AdminCaseTimeline";

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
    <section className={cn("rounded-[18px] border border-[#253044] bg-[#111827]/80 overflow-hidden min-w-0", className)}>
      {children}
    </section>
  );
}
function CardHeader({ title, subtitle, action }: { title: React.ReactNode; subtitle?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-2 md:px-7 md:pt-6 md:pb-3">
      <div className="min-w-0">
        <h2 className="text-[20px] md:text-[24px] xl:text-[26px] leading-[26px] md:leading-[30px] font-semibold tracking-[-0.02em] text-[#F8FAFC]">{title}</h2>
        {subtitle && <p className="mt-1 text-[13px] md:text-[14px] leading-[18px] text-[#9CA3AF]">{subtitle}</p>}
      </div>
      {action && <div className="flex items-center gap-2 shrink-0">{action}</div>}
    </div>
  );
}
function Avatar({ name, src, size = 40 }: { name?: string | null; src?: string | null; size?: number }) {
  const [failed, setFailed] = useState(false);
  const showImg = !!src && !failed;
  if (showImg) {
    return (
      <img
        src={src as string}
        alt={name ?? ""}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="rounded-full object-cover shrink-0 bg-muted"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="rounded-full bg-muted text-foreground flex items-center justify-center font-semibold shrink-0"
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.35)) }}
    >
      {initials(name)}
    </div>
  );
}
function KV({ label, value, className }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [flagUserTarget, setFlagUserTarget] = useState<null | { id: string; role: "buyer" | "seller" }>(null);
  const { dispute: row, txDetail } = data;
  const tx = txDetail.transaction ?? {};
  const dispute = txDetail.dispute ?? {};
  const parties = txDetail.parties ?? { buyer: null, seller: null };
  const items = txDetail.items ?? [];
  const pricing: any = txDetail.pricing ?? {};
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
  const paymentProcessingFee = Number(pricing?.paymentProcessingFee ?? pricing?.processingFee ?? 0);
  const totalCharged = Number(pricing?.totalCharged ?? buyerTotal ?? (itemTotal + protectionFee + paymentProcessingFee));

  const amountInDispute = Number(dispute?.amountInDispute ?? itemTotal ?? buyerTotal ?? 0);
  const eligibleRefund = Math.max(0, heldAmount + frozenAmount);
  const eligibleRelease = Math.max(0, heldAmount + frozenAmount - protectionFee);

  const txCode: string = tx.transactionCode ?? tx.transaction_code ?? "—";
  const disputeCode = `DSP-${(row.id ?? "").slice(0, 8).toUpperCase()}`;
  const itemTitle: string = items[0]?.title ?? "Transaction";

  // SLA / overdue derivation
  const dueAt = row.seller_response_due_at ?? dispute.sellerResponseDueAt ?? null;
  const resolvedAt = row.resolved_at ?? dispute.resolvedAt ?? null;

  // Derived active-state (single source of truth for badges/banners/sidebar)
  const active = useMemo(
    () =>
      deriveActiveState({
        dispute: { status: row.status, seller_response_due_at: dueAt, resolved_at: resolvedAt },
        investigation: (txDetail as any).investigation ?? null,
        moneyStatus,
        escrow,
        risk: txDetail.risk ?? null,
        payout,
        needsReleaseReview: !!tx.needsAdminReview,
      }),
    [row.status, dueAt, resolvedAt, txDetail, moneyStatus, escrow, payout, tx.needsAdminReview],
  );
  const overdue = active.isOverdue;
  const slaText = useMemo(() => {
    if (active.isDisputeResolved) return null;
    if (!dueAt) return null;
    const diff = new Date(dueAt).getTime() - Date.now();
    const days = Math.round(Math.abs(diff) / 86400000);
    if (overdue) return `${days} day${days === 1 ? "" : "s"} overdue`;
    return `Due in ${days} day${days === 1 ? "" : "s"}`;
  }, [dueAt, active.isDisputeResolved, overdue]);

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
      if (e instanceof DisputeEscalationRequiredError) {
        toast.error("Escalation required", { description: e.reasons.join(" • ") || e.message });
      } else {
        toast.error((e as Error).message ?? "Failed to resolve dispute");
      }
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
      const did = dispute?.id;
      if (!did) throw new Error("dispute not loaded");
      await transitionDisputeStatus(did, "under_review", reason);
      toast.success("Dispute moved to Under Review");
      refresh();
    } catch (e) {
      toast.error((e as Error).message ?? "Failed to transition dispute");
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
  const renderHeader = (onOpenMenu?: () => void) => (
    <div className="sticky top-0 z-sticky border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="flex items-center justify-between gap-3 px-4 py-3.5 sm:px-6 lg:px-8 lg:py-4">
        <div className="flex items-center gap-2 min-w-0">
          {onOpenMenu && (
            <button
              type="button"
              onClick={onOpenMenu}
              aria-label="Open navigation menu"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40 text-foreground hover:bg-muted lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
          )}
          <button
            onClick={() => navigate("/admin/disputes")}
            className="rounded-md p-2 text-muted-foreground hover:text-foreground hover:bg-muted min-h-11 min-w-11 inline-flex items-center justify-center"
            aria-label="Back to disputes"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight text-foreground truncate">
              Dispute #{disputeCode}
            </h1>
            <p className="text-xs text-muted-foreground truncate">
              {itemTitle} - {txCode}
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
              {overdue && <span className="h-2 w-2 rounded-full bg-red-400 sd-live-dot" />}
              {slaText}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={() => window.print()} className="gap-2 hidden sm:inline-flex">
            <Printer className="h-4 w-4" /> Print
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <AdminLayout
      title="Dispute"
      hideDefaultHeaders
      fullBleed
      fullHeight
    >
      <div className="flex flex-col lg:flex-row lg:h-full lg:min-h-0">
        <section className="flex-1 min-w-0 lg:min-h-0 lg:overflow-y-auto lg:overflow-x-hidden no-scrollbar">
          {renderHeader()}

          {/* Summary strip: scrolls under the sticky header */}
          <div className="bg-card border-b border-border">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 md:gap-x-8 gap-y-5 px-6 py-6 lg:px-8">
              {/* Col 1: Dispute ID / Transaction */}
              <div className="flex flex-col gap-5 min-w-0">
                <div className="min-w-0">
                  <div className="text-xs text-muted-foreground mb-1">Dispute ID</div>
                  <div className="text-sm font-semibold text-foreground font-mono break-all">#{disputeCode}</div>
                </div>
                <div className="min-w-0">
                  <div className="text-xs text-muted-foreground mb-1">Transaction</div>
                  <button
                    onClick={() => navigate(`/admin/transactions/${txId}`)}
                    className="block text-left text-sm font-semibold text-blue-400 hover:text-blue-300 font-mono break-all min-h-11"
                  >
                    {txCode}
                  </button>
                </div>
              </div>
              {/* Col 2: Amount in Dispute / Dispute Reason */}
              <div className="flex flex-col gap-5 min-w-0">
                <div className="min-w-0">
                  <div className="text-xs text-muted-foreground mb-1">Amount in Dispute</div>
                  <div className="text-sm font-semibold text-foreground break-words">{ngn(amountInDispute)}</div>
                </div>
                <div className="min-w-0">
                  <div className="text-xs text-muted-foreground mb-1">Dispute Reason</div>
                  <div className="text-sm font-semibold text-orange-400 break-words">
                    {titleCase(row.reason ?? dispute.claimType) || "—"}
                  </div>
                </div>
              </div>
              {/* Col 3: Created / Last Activity */}
              <div className="flex flex-col gap-5 min-w-0">
                <div className="min-w-0">
                  <div className="text-xs text-muted-foreground mb-1">Created</div>
                  <div className="text-sm font-semibold text-foreground break-words">
                    {fmtDate(row.opened_at ?? dispute.openedAt)}
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="text-xs text-muted-foreground mb-1">Last Activity</div>
                  <div className="text-sm font-semibold text-foreground break-words">
                    {fmtDate(tx.updatedAt ?? tx.updated_at)}
                  </div>
                </div>
              </div>
              {/* Col 4: Status / Assigned Agent */}
              <div className="flex flex-col gap-5 min-w-0">
                <div className="min-w-0">
                  <div className="text-xs text-muted-foreground mb-1">Status</div>
                  <div><StatusPill value={row.status} /></div>
                </div>
                <div className="min-w-0">
                  <div className="text-xs text-muted-foreground mb-1">Assigned Agent</div>
                  {dispute.assignedAgent?.name ? (
                    <div className="flex items-center gap-2 min-w-0">
                      <Avatar name={dispute.assignedAgent.name} src={dispute.assignedAgent.avatarUrl} size={20} />
                      <span className="text-sm font-semibold text-foreground break-words">{dispute.assignedAgent.name}</span>
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">Unassigned</div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="px-6 py-6 lg:px-8 lg:py-8 space-y-8">

            {/* Buyer + Seller cards */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <PartyCard role="buyer" party={parties.buyer} />
              <PartyCard role="seller" party={parties.seller} />
            </div>

            {/* Financial overview */}
            <section className="rounded-[18px] border border-[#253044] bg-[#111827]/80 overflow-hidden min-w-0">
              <div className="px-5 pt-5 pb-2 md:px-7 md:pt-6 md:pb-3">
                <h2 className="text-[20px] md:text-[24px] xl:text-[26px] leading-[26px] md:leading-[30px] font-semibold tracking-[-0.02em] text-[#F8FAFC]">
                  Financial Overview &amp; Controls
                </h2>
              </div>

              <div className="px-5 pb-6 pt-2 md:px-7 md:pb-8 md:pt-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-x-6 md:gap-x-8 gap-y-7 min-w-0">
                  <FinMetric
                    label="Total Transaction"
                    value={ngn(totalCharged)}
                    caption={`Item ${ngn(itemTotal)} + Protection ${ngn(protectionFee)} + Payment Processing ${ngn(paymentProcessingFee)}`}
                  />
                  <FinMetric label="Amount in Dispute" value={ngn(amountInDispute)} valueColor="#FB923C"
                    caption="Full amount disputed" />
                  <FinMetric
                    label="Protection Fee"
                    value={ngn(protectionFee)}
                    caption="SafeDeal protection/platform fee"
                  />
                  <FinMetric label="Funds Status"
                    valueNode={(
                      <div className="mt-1.5 flex items-center gap-2" style={{ color: "#FACC15" }}>
                        <span className="h-2 w-2 rounded-full shrink-0" style={{ background: "#FACC15" }} />
                        <span className="text-[15px] md:text-[16px] xl:text-[17px] leading-[22px] md:leading-[24px] font-semibold tracking-[-0.01em]">
                          {moneyStatusLabel(moneyStatus)}
                        </span>
                      </div>
                    )}
                    caption={tx.createdAt
                      ? `Since ${new Date(tx.createdAt).toLocaleDateString("en-NG", { month: "short", day: "numeric", year: "numeric" })}`
                      : undefined} />
                </div>

                <div className="my-7 md:my-8 h-px bg-[#253044]" />

                <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 md:gap-x-10 gap-y-7 min-w-0">
                  <FinMetric label="Eligible Refund Amount" value={ngn(eligibleRefund)} valueColor="#6EE7B7" />
                  <FinMetric label="Eligible Release Amount" value={ngn(eligibleRelease)} valueColor="#60A5FA"
                    caption="After fees" />
                  <FinMetric label="Payout Status"
                    valueNode={(
                      <div className="mt-1.5 flex items-center gap-2" style={{ color: "#F87171" }}>
                        <span className="h-2 w-2 rounded-full shrink-0" style={{ background: "#EF4444" }} />
                        <span className="text-[15px] md:text-[16px] xl:text-[17px] leading-[22px] md:leading-[24px] font-semibold tracking-[-0.01em]">
                          {payoutLabel(payout, moneyStatus, !resolvedAt)}
                        </span>
                      </div>
                    )}
                    caption={!resolvedAt ? "Pending resolution" : undefined} />
                </div>
                {payout?.id && resolvedAt && (
                  <div className="px-5 md:px-0 mt-3 text-right">
                    <a href={`/admin/payouts?payout_id=${payout.id}`} className="text-xs text-primary hover:underline">
                      View Payout →
                    </a>
                  </div>
                )}
              </div>

              {active.isDisputeActive && moneyStatus === "funds_pending_release" && (
                <div className="mx-5 md:mx-8 mb-5 md:mb-8 rounded-md border border-orange-500/30 bg-orange-500/10 p-3 text-xs text-orange-200">
                  <AlertTriangle className="inline h-4 w-4 mr-1.5" />
                  Active dispute: release is blocked until the dispute is resolved.
                </div>
              )}
              {active.isFrozen && (
                <div className="mx-5 md:mx-8 mb-5 md:mb-8 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
                  <Snowflake className="inline h-4 w-4 mr-1.5" />
                  Funds are frozen. No payouts or refunds will process automatically.
                </div>
              )}
              {refundedAmount > 0 && (
                <div className="mx-5 md:mx-8 mb-5 md:mb-8 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-200">
                  Refunded so far: <span className="font-semibold">{ngn(refundedAmount)}</span>
                </div>
              )}
            </section>

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
                <div className="p-5 md:p-6 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-x-10 gap-y-6 text-sm">
                  <KV label="Item" value={lockedAgreement.item?.title ?? "—"} />
                  <KV label="Condition" value={lockedAgreement.item?.condition ?? "—"} />
                  <KV label="Agreed Price" value={ngn(lockedAgreement.agreedPrice)} />
                  <KV label="Delivery Method" value={titleCase(lockedAgreement.deliveryMethod) || "—"} />
                  <KV label="Verification Window" value={lockedAgreement.verificationWindowHours ? `${lockedAgreement.verificationWindowHours} hrs` : "—"} />
                  <KV label="Locked At" value={fmtDate(lockedAgreement.lockedAt)} />
                  <KV label="Total" value={ngn(lockedAgreement.total)} />
                  {lockedAgreement.sellerNotes && (
                    <KV className="sm:col-span-2 xl:col-span-4" label="Seller Notes" value={<span className="text-muted-foreground">{lockedAgreement.sellerNotes}</span>} />
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
                      <div key={r.id} className="rounded-xl border border-border bg-muted/30 p-4 md:p-5">
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-4">
                          <div className="min-w-0 flex-1">
                            <div className="text-xs text-muted-foreground mb-1">Response #{r.number}</div>
                            <p className="text-[15px] text-foreground leading-relaxed whitespace-pre-wrap break-words">{r.text}</p>
                          </div>
                          <div className="text-xs text-muted-foreground shrink-0 sm:text-right">{fmtDate(r.at)}</div>
                        </div>
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
            <CaseCommunicationSection
              buyerResponded={(evidence ?? []).some((e) => (e.uploadedByRole ?? "").toLowerCase() === "buyer")}
              sellerOverdue={overdue && !(dispute.responses?.length)}
              sellerRespondedAt={dispute.responses?.[0]?.at ?? null}
              openedAt={row.opened_at ?? dispute.openedAt ?? null}
              dueAt={dueAt}
              notes={notes}
              defaultTab={dispute.responses?.length ? "internal" : (overdue ? "seller" : "buyer")}
              onAddNote={() => dialogs.setNoteOpen(true)}
              sellerName={parties.seller?.name}
              buyerName={parties.buyer?.name}
              disputeId={dispute.id}
              buyerClaim={(row.description ?? dispute.summary) ?? null}
              sellerResponses={(dispute.responses ?? []) as any[]}
              evidence={evidence ?? []}
            />

            {/* Case Timeline */}
            <Card>
              <CardHeader title="Case Timeline" />
              <div className="p-5">
                <AdminCaseTimeline
                  items={timeline as any}
                  disputeStatus={row.status}
                  resolvedAt={resolvedAt}
                  filterDisputeOnly
                />
              </div>
            </Card>

            {/* Internal notes */}
            <Card>
              <CardHeader
                title="Internal Notes & Investigation"
                action={
                  <Button
                    size="sm"
                    onClick={() => dialogs.setNoteOpen(true)}
                    className="bg-blue-600 hover:bg-blue-500 text-white"
                  >
                    <FilePlus2 className="h-4 w-4 mr-1.5" />
                    Add Note
                  </Button>
                }
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
                <LinkedTile tone="orange" icon={<Flag className="h-5 w-5" />} title="Buyer in Flagged Users"
                  subtitle={parties.buyer ? "Review fraud signals" : "—"}
                  onClick={parties.buyer ? () => navigate(`/admin/flagged-users?u=${parties.buyer!.id}`) : undefined} />
                <LinkedTile tone="orange" icon={<Flag className="h-5 w-5" />} title="Seller in Flagged Users"
                  subtitle={parties.seller ? "Review fraud signals" : "—"}
                  onClick={parties.seller ? () => navigate(`/admin/flagged-users?u=${parties.seller!.id}`) : undefined} />
                <LinkedTile tone="orange" icon={<Flag className="h-5 w-5" />} title="Flag Buyer for Fraud"
                  subtitle={parties.buyer ? "Open admin flag dialog" : "—"}
                  onClick={parties.buyer ? () => setFlagUserTarget({ id: parties.buyer!.id, role: "buyer" }) : undefined} />
                <LinkedTile tone="orange" icon={<Flag className="h-5 w-5" />} title="Flag Seller for Fraud"
                  subtitle={parties.seller ? "Open admin flag dialog" : "—"}
                  onClick={parties.seller ? () => setFlagUserTarget({ id: parties.seller!.id, role: "seller" }) : undefined} />
                <LinkedTile tone="emerald" icon={<CreditCard className="h-5 w-5" />} title="Payment Record"
                  subtitle={payment ? `${(payment.providerReference ?? "").slice(0, 20)}` : "No payment record"} />
                <LinkedTile tone="yellow" icon={<Vault className="h-5 w-5" />} title="Escrow Record"
                  subtitle={`${escrow?.ledger?.length ?? 0} ledger entries`} showDot />
                <LinkedTile tone="purple" icon={<Clock className="h-5 w-5" />} title="Audit Trail"
                  subtitle="View all activity" />
              </div>
            </Card>

            {/* Mobile action bar */}
            <div className="lg:hidden">
              <Button className="w-full" onClick={() => setSidebarOpen(true)} disabled={!adminCan.canManageDispute}>
                Take Action · Review Case
              </Button>
            </div>
          </div>
        </section>

        {/* Right resolution sidebar (desktop). Scrolls independently of main content */}
        <aside className="hidden lg:block lg:w-[380px] lg:shrink-0 lg:border-l lg:border-[#253044] lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto no-scrollbar bg-[#111827]/80">
          <ResolutionSidebar
              disputeStatus={row.status}
              overdue={overdue}
              resolvedAt={resolvedAt}
              moneyStatus={moneyStatus}
              adminCan={adminCan}
              dueAt={dueAt}
              outcome={(dispute as any).outcome ?? null}
              parties={parties}
              buyerClaim={row.description ?? dispute.summary ?? null}
              sellerResponded={!!dispute.responses?.length}
              txId={txId}
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

      {/* Right resolution sidebar (tablet/mobile drawer) */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md border-[#253044] bg-[#111827]/95 p-0 text-foreground overflow-y-auto no-scrollbar">
          <ResolutionSidebar
            disputeStatus={row.status}
            overdue={overdue}
            resolvedAt={resolvedAt}
            moneyStatus={moneyStatus}
            adminCan={adminCan}
            dueAt={dueAt}
            outcome={(dispute as any).outcome ?? null}
            parties={parties}
            buyerClaim={row.description ?? dispute.summary ?? null}
            sellerResponded={!!dispute.responses?.length}
            txId={txId}
            onResolve={() => { setSidebarOpen(false); dialogs.setResolveOpen(true); }}
            onMoveReview={() => { setSidebarOpen(false); dialogs.setMoveReviewOpen(true); }}
            onEscalate={() => { setSidebarOpen(false); dialogs.setEscalateOpen(true); }}
            onHighRisk={() => { setSidebarOpen(false); dialogs.setHighRiskOpen(true); }}
            onFraud={() => { setSidebarOpen(false); dialogs.setFraudOpen(true); }}
            onClose={() => { setSidebarOpen(false); dialogs.setCloseOpen(true); }}
            onAddNote={() => { setSidebarOpen(false); dialogs.setNoteOpen(true); }}
          />
        </SheetContent>
      </Sheet>

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
      <ActionConfirmDialog
        open={!!flagUserTarget}
        onOpenChange={(o) => { if (!o) setFlagUserTarget(null); }}
        title={`Flag ${flagUserTarget?.role === "seller" ? "Seller" : "Buyer"} for Fraud Review`}
        description="This adds the user to the Flagged Users workspace with an admin flag signal. A note is required."
        confirmLabel="Flag User"
        confirmTone="danger"
        onConfirm={async (reason) => {
          if (!flagUserTarget) return;
          await performFlaggedAction({
            action: "flag_user",
            user_id: flagUserTarget.id,
            note: reason,
            dispute_id: dispute?.id ?? undefined,
          });
          toast.success("User flagged for review");
          const id = flagUserTarget.id;
          setFlagUserTarget(null);
          navigate(`/admin/flagged-users?u=${id}`);
        }}
      />
    </AdminLayout>
  );
}

// ---------- party card ----------
function PartyCard({ role, party }: { role: "buyer" | "seller"; party: any }) {
  const navigate = useNavigate();
  if (!party) {
    return (
      <Card>
        <div className="p-6">
          <h2 className="text-[20px] md:text-[24px] xl:text-[26px] leading-[26px] md:leading-[30px] font-semibold tracking-[-0.02em] text-[#F8FAFC] mb-4">
            {role === "buyer" ? "Buyer Information" : "Seller Information"}
          </h2>
          <div className="text-sm text-muted-foreground">No {role} on this transaction.</div>
        </div>
      </Card>
    );
  }
  const ver = party.verification ?? {};
  const isBuyer = role === "buyer";
  const roleChipCls = isBuyer
    ? "bg-blue-500/15 text-blue-400"
    : "bg-orange-500/15 text-orange-400";
  const callBtnCls = isBuyer
    ? "bg-blue-600 hover:bg-blue-500 text-white border-transparent"
    : "bg-orange-600 hover:bg-orange-500 text-white border-transparent";
  const sellerTier: string | null = !isBuyer && party.sellerTier ? party.sellerTier : null;
  const accountStatusValue = isBuyer
    ? <span className={cn(party.accountStatus === "good_standing" ? "text-emerald-400" : "text-foreground")}>{titleCase(party.accountStatus) || "—"}</span>
    : (party.payoutStatus === "blocked"
        ? <span className="text-red-400">Blocked</span>
        : <span className="text-foreground">{titleCase(party.payoutStatus) || "—"}</span>);
  const Field = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="min-w-0">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="text-sm text-foreground mt-1 break-words">{value}</div>
    </div>
  );
  return (
    <Card>
      <div className="p-6">
        {/* Title row: no border */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[20px] md:text-[24px] xl:text-[26px] leading-[26px] md:leading-[30px] font-semibold tracking-[-0.02em] text-[#F8FAFC]">
            {isBuyer ? "Buyer Information" : "Seller Information"}
          </h2>
          <span className={cn(
            "inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold uppercase tracking-wider",
            roleChipCls,
          )}>
            {isBuyer ? "Buyer" : "Seller"}
          </span>
        </div>

        {/* Identity row */}
        <div className="flex items-center gap-3 mb-5">
          <Avatar name={party.name} src={party.avatarUrl} size={48} />
          <div className="min-w-0 flex-1">
            <div className="text-base font-semibold text-foreground truncate">{party.name ?? "—"}</div>
            <div className="text-sm text-muted-foreground truncate">User ID: {party.id?.slice(0, 16) ?? "—"}</div>
          </div>
          {!isBuyer && sellerTier ? (
            <span className="inline-flex items-center gap-1 text-sm text-yellow-400 shrink-0">
              <Star className="h-4 w-4 fill-yellow-400" /> {titleCase(sellerTier)} Seller
            </span>
          ) : ver.identity ? (
            <span className="inline-flex items-center gap-1 text-sm text-emerald-400 shrink-0">
              <CheckCircle2 className="h-4 w-4" /> Verified
            </span>
          ) : null}
        </div>

        {/* Details grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
          <Field label="Email" value={party.maskedEmail ?? "—"} />
          <Field label="Phone" value={party.maskedPhone ?? "—"} />
          <Field label="Prior Disputes" value={party.priorDisputes != null ? `${party.priorDisputes} ${isBuyer ? "filed" : "received"}` : "—"} />
          <Field label={isBuyer ? "Account Status" : "Payout Status"} value={accountStatusValue} />
        </div>

        {/* Primary action row */}
        <div className="grid grid-cols-[1fr_1fr_48px] gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="sm" disabled className={cn("w-full gap-2 h-11 rounded-lg whitespace-nowrap", callBtnCls, "opacity-100 disabled:opacity-100")}>
                <Phone className="h-4 w-4" /> Call
              </Button>
            </TooltipTrigger>
            <TooltipContent>Direct calling not connected yet</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="sm" variant="outline" disabled className="w-full gap-2 h-11 rounded-lg whitespace-nowrap">
                <Mail className="h-4 w-4" /> Email
              </Button>
            </TooltipTrigger>
            <TooltipContent>Direct email not connected yet</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="sm" variant="outline" className="h-11 w-12 p-0 rounded-lg" onClick={() => navigate(`/admin/users/${party.id}`)} aria-label="Profile">
                <UserIcon className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Open profile</TooltipContent>
          </Tooltip>
        </div>

        {/* Only internal divider, then secondary action row */}
        <div className="mt-5 pt-5 border-t border-border">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Button size="sm" variant="outline" className="gap-2 h-11 rounded-lg whitespace-nowrap text-xs sm:text-sm" onClick={() => navigate(`/admin/users/${party.id}`)}>
              <UserIcon className="h-3.5 w-3.5 shrink-0" /> View Profile
            </Button>
            <Button size="sm" variant="outline" className="gap-2 h-11 rounded-lg whitespace-nowrap text-xs sm:text-sm" onClick={() => navigate(`/admin/disputes?q=${party.id}`)}>
              <Scale className="h-3.5 w-3.5 shrink-0" /> Dispute History
            </Button>
            <Button size="sm" variant="outline" className="gap-2 h-11 rounded-lg whitespace-nowrap text-xs sm:text-sm" onClick={() => navigate(`/admin/transactions?q=${party.id}`)}>
              <Receipt className="h-3.5 w-3.5 shrink-0" /> Transactions
            </Button>
          </div>
        </div>
      </div>
    </Card>
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
  return <span className={cn("inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-semibold", map[tone])}>{children}</span>;
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
      <div className={cn("mt-1 text-[22px] md:text-[24px] font-semibold leading-8 break-words", toneCls)}>{value}</div>
      {caption && <div className="mt-1 text-xs text-muted-foreground break-words">{caption}</div>}
    </div>
  );
}

function FinMetric({
  label,
  value,
  valueNode,
  valueColor,
  caption,
}: {
  label: string;
  value?: React.ReactNode;
  valueNode?: React.ReactNode;
  valueColor?: string;
  caption?: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[13px] md:text-[14px] leading-[18px] text-[#9CA3AF] font-normal">
        {label}
      </p>
      {valueNode ?? (
        <p
          className="mt-1.5 text-[15px] md:text-[16px] xl:text-[17px] leading-[22px] md:leading-[24px] font-semibold tracking-[-0.01em] tabular-nums"
          style={{ color: valueColor ?? "#F8FAFC" }}
        >
          {value}
        </p>
      )}
      {caption && (
        <p className="mt-1.5 text-xs leading-[16px] text-[#9CA3AF]">
          {caption}
        </p>
      )}
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
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-5">
      {items.map((ev) => {
        const Icon = evidenceIcon(ev.kind, ev.mimeType);
        const isImage = (ev.mimeType ?? "").startsWith("image/") || ev.kind === "image";
        return (
          <button
            key={ev.id}
            type="button"
            onClick={() => onPreview(ev)}
            className="group flex flex-col rounded-xl border border-border bg-muted/20 hover:border-blue-500/40 hover:bg-muted/40 overflow-hidden text-left min-w-0 min-h-11"
          >
            <div className="aspect-[4/3] bg-muted/40 flex items-center justify-center overflow-hidden">
              {isImage && ev.secureUrl ? (
                <img
                  src={ev.secureUrl}
                  alt={ev.title}
                  className="h-full w-full object-cover"
                  loading="lazy"
                  onError={(e) => {
                    const img = e.currentTarget;
                    img.style.display = "none";
                  }}
                />
              ) : (
                <Icon className="h-10 w-10 text-muted-foreground" />
              )}
            </div>
            <div className="p-3 border-t border-border min-w-0">
              <div className="text-sm font-medium text-foreground truncate" title={ev.title}>{ev.title}</div>
              <div className="text-xs text-muted-foreground truncate">
                {titleCase(ev.uploadedByRole)} · {relTime(ev.uploadedAt)}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ---------- case communication (matches Dispute_Details_2.html lines 533–901) ----------
type CommTab = "buyer" | "seller" | "internal";
type MsgKind = "deadline" | "reminder" | "seller_reply" | "buyer_reply" | "evidence_request" | "general" | "internal";

interface CommMessage {
  id: string;
  kind: MsgKind;
  senderName: string;
  senderRole: "admin" | "seller" | "buyer";
  recipientName: string;
  recipientRole: "admin" | "seller" | "buyer" | "internal";
  timestamp: string;
  topic?: string;
  body: React.ReactNode;
  msgRef?: string;
  avatarUrl?: string | null;
  footerMeta?: React.ReactNode;
  attachments?: { name: string; size?: string }[];
}

function CaseCommunicationSection(props: {
  buyerResponded: boolean;
  sellerOverdue: boolean;
  sellerRespondedAt: string | null;
  openedAt: string | null;
  dueAt: string | null;
  notes: any[];
  defaultTab: CommTab | string;
  onAddNote: () => void;
  sellerName?: string | null;
  buyerName?: string | null;
  disputeId: string;
  buyerClaim: string | null;
  sellerResponses: Array<{ id: string; number: number; text: string; at: string }>;
  evidence: AdminTxEvidenceItem[];
}) {
  const {
    buyerResponded, sellerOverdue, sellerRespondedAt, openedAt, dueAt,
    notes, defaultTab, onAddNote, sellerName, buyerName,
    disputeId, buyerClaim, sellerResponses, evidence,
  } = props;
  const [activeTab, setActiveTab] = useState<CommTab>((defaultTab as CommTab) ?? "seller");
  const [msgType, setMsgType] = useState("general_reply");
  const [draft, setDraft] = useState("");

  const dayLabel = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleDateString("en-NG", { month: "short", day: "numeric" }) : "—";

  // ---------- status chips (derived from real data only) ----------
  const buyerEvidence = (evidence ?? []).filter((e) => (e.uploadedByRole ?? "").toLowerCase() === "buyer");
  const sellerEvidence = (evidence ?? []).filter((e) => (e.uploadedByRole ?? "").toLowerCase() === "seller");
  const hasSellerResponse = (sellerResponses ?? []).length > 0;
  const allChips = [
    {
      key: "buyer-responded",
      tone: "emerald" as const,
      label: "Buyer Responded",
      meta: buyerResponded ? dayLabel(openedAt) : "—",
      leading: <span className="w-2 h-2 bg-emerald-400 rounded-full" />,
      show: buyerResponded || !!buyerClaim,
    },
    {
      key: "seller-overdue",
      tone: "red" as const,
      label: "Seller Response Overdue",
      meta: sellerOverdue ? (dueAt ? relTime(dueAt) : "—") : "resolved",
      leading: <span className={cn("w-2 h-2 bg-red-400 rounded-full", sellerOverdue && "sd-live-dot")} />,
      show: sellerOverdue || hasSellerResponse,
    },
    {
      key: "evidence-requested",
      tone: "orange" as const,
      label: "Evidence Requested",
      meta: dayLabel(openedAt),
      leading: <FilePlus2 className="w-3 h-3 text-orange-400" />,
      show: (evidence ?? []).length > 0,
    },
  ];
  const statusChips = allChips.filter((c) => c.show);
  const chipTone: Record<string, string> = {
    emerald: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400",
    red: "bg-red-500/10 border-red-500/30 text-red-400",
    orange: "bg-orange-500/10 border-orange-500/30 text-orange-400",
    yellow: "bg-yellow-500/10 border-yellow-500/30 text-yellow-400",
  };
  const chipMeta: Record<string, string> = {
    emerald: "text-emerald-400/60",
    red: "text-red-400/60",
    orange: "text-orange-400/60",
    yellow: "text-yellow-400/60",
  };

  // ---------- per-tab data ----------
  const internalMessages: CommMessage[] = (notes ?? []).map((n: any) => ({
    id: n.id,
    kind: "internal",
    senderName: n.author?.full_name ?? "Admin",
    senderRole: "admin",
    recipientName: "Internal",
    recipientRole: "internal",
    timestamp: fmtDate(n.at),
    topic: "Internal Note",
    body: n.note,
    msgRef: `NOTE-${String(n.id ?? "").slice(0, 4).toUpperCase()}`,
    footerMeta: (
      <div className="flex items-center gap-1 text-slate-500">
        <Lock className="w-3 h-3" /> <span>Visible to admins only</span>
      </div>
    ),
  }));

  const tabAccent: Record<CommTab, { border: string; focus: string; send: string; label: string; placeholder: string }> = {
    buyer: {
      border: "border-blue-500",
      focus: "focus:border-blue-500",
      send: "bg-blue-500 hover:bg-blue-600",
      label: "New Message to Buyer",
      placeholder: `Type your message to ${buyerName ?? "buyer"}...`,
    },
    seller: {
      border: "border-orange-500",
      focus: "focus:border-orange-500",
      send: "bg-orange-500 hover:bg-orange-600",
      label: "New Message to Seller",
      placeholder: `Type your message to ${sellerName ?? "seller"}...`,
    },
    internal: {
      border: "border-purple-500",
      focus: "focus:border-purple-500",
      send: "bg-purple-500 hover:bg-purple-600",
      label: "New Internal Note",
      placeholder: "Write an internal note...",
    },
  };
  const accent = tabAccent[activeTab];

  // ---------- buyer messages (real records only) ----------
  const buyerMessages: CommMessage[] = [];
  // Group buyer evidence by (uploader, minute) so multiple files uploaded together
  // become attachment chips on a single card instead of N separate cards.
  const groupEvidence = (rows: AdminTxEvidenceItem[]) => {
    const buckets = new Map<string, AdminTxEvidenceItem[]>();
    for (const r of rows) {
      const minute = r.uploadedAt ? new Date(r.uploadedAt).toISOString().slice(0, 16) : "unknown";
      const key = `${r.uploadedByName ?? ""}|${minute}`;
      const arr = buckets.get(key) ?? [];
      arr.push(r);
      buckets.set(key, arr);
    }
    return Array.from(buckets.values()).map((items) => {
      const sorted = [...items].sort((a, b) => (a.uploadedAt < b.uploadedAt ? -1 : 1));
      return {
        items: sorted,
        earliestAt: sorted[0].uploadedAt,
        uploader: sorted[0].uploadedByName ?? null,
      };
    });
  };
  const within = (aIso?: string | null, bIso?: string | null, minutes = 2) => {
    if (!aIso || !bIso) return false;
    const diff = Math.abs(new Date(aIso).getTime() - new Date(bIso).getTime());
    return diff <= minutes * 60_000;
  };
  const evidenceChips = (items: AdminTxEvidenceItem[]) =>
    items.filter((e) => e.title).map((e) => ({ name: e.title as string }));
  const evidenceNotes = (items: AdminTxEvidenceItem[], excludeBody?: string) =>
    items
      .map((e) => (e.note ?? "").trim())
      .filter((n) => n.length > 0 && n !== (excludeBody ?? "").trim());

  const buyerGroups = groupEvidence(buyerEvidence);
  const claimGroupIdx = buyerClaim
    ? buyerGroups.findIndex((g) => within(g.earliestAt, openedAt))
    : -1;
  const claimAttachedGroup = claimGroupIdx >= 0 ? buyerGroups[claimGroupIdx] : null;

  if (buyerClaim && buyerName) {
    const extraNotes = claimAttachedGroup ? evidenceNotes(claimAttachedGroup.items, buyerClaim) : [];
    const claimBody =
      extraNotes.length > 0
        ? `${buyerClaim}\n\n${extraNotes.map((n) => `Note: ${n}`).join("\n")}`
        : buyerClaim;
    buyerMessages.push({
      id: `claim-${disputeId}`,
      kind: "buyer_reply",
      senderName: buyerName,
      senderRole: "buyer",
      recipientName: "SafeDeal Admin",
      recipientRole: "admin",
      timestamp: fmtDate(openedAt ?? ""),
      topic: "Buyer claim",
      body: claimBody,
      msgRef: `CLAIM-${disputeId.slice(0, 4).toUpperCase()}`,
      attachments: claimAttachedGroup ? evidenceChips(claimAttachedGroup.items) : undefined,
      footerMeta: (
        <div className="flex items-center gap-1 text-slate-500">
          <Check className="w-3 h-3" /> <span>Filed via dispute form</span>
        </div>
      ),
    });
  }
  buyerGroups.forEach((g, idx) => {
    if (idx === claimGroupIdx) return; // already merged into the claim card
    const chips = evidenceChips(g.items);
    const notes = evidenceNotes(g.items);
    if (chips.length === 0 && notes.length === 0) return;
    const titles = g.items.map((e) => e.title).filter(Boolean) as string[];
    const headline =
      titles.length === 1
        ? `Uploaded evidence: ${titles[0]}`
        : `Uploaded ${titles.length} evidence file${titles.length === 1 ? "" : "s"}`;
    const body =
      notes.length > 0 ? `${headline}\n\n${notes.map((n) => `Note: ${n}`).join("\n")}` : headline;
    const firstId = g.items[0].id;
    buyerMessages.push({
      id: `ev-${firstId}`,
      kind: "buyer_reply",
      senderName: g.uploader ?? buyerName ?? "Buyer",
      senderRole: "buyer",
      recipientName: "SafeDeal Admin",
      recipientRole: "admin",
      timestamp: fmtDate(g.earliestAt),
      topic: "Evidence uploaded",
      body,
      msgRef: `EV-${firstId.slice(0, 4).toUpperCase()}`,
      attachments: chips.length > 0 ? chips : undefined,
      footerMeta: (
        <div className="flex items-center gap-1 text-slate-500">
          <Check className="w-3 h-3" /> <span>Attached to dispute</span>
        </div>
      ),
    });
  });
  buyerMessages.sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1));

  // ---------- seller messages (real records only) ----------
  const sellerMessages: CommMessage[] = [];
  const sellerGroups = groupEvidence(sellerEvidence);
  const sortedResponses = [...(sellerResponses ?? [])].sort((a, b) => (a.at < b.at ? -1 : 1));
  // Decide which response (if any) each seller-evidence group attaches to.
  // Rule: group attaches to a response whose `at` is within ±2 minutes of the
  // group's earliest upload, OR whose window [at, nextAt) contains the upload.
  const groupToResponse = new Map<number, number>(); // groupIdx -> responseIdx
  sellerGroups.forEach((g, gi) => {
    for (let i = 0; i < sortedResponses.length; i++) {
      const r = sortedResponses[i];
      const next = sortedResponses[i + 1];
      const inWindow =
        g.earliestAt &&
        new Date(g.earliestAt).getTime() >= new Date(r.at).getTime() &&
        (!next || new Date(g.earliestAt).getTime() < new Date(next.at).getTime());
      if (within(g.earliestAt, r.at) || inWindow) {
        groupToResponse.set(gi, i);
        break;
      }
    }
  });
  const groupsByResponse = new Map<number, number[]>();
  groupToResponse.forEach((respIdx, grpIdx) => {
    const arr = groupsByResponse.get(respIdx) ?? [];
    arr.push(grpIdx);
    groupsByResponse.set(respIdx, arr);
  });

  sortedResponses.forEach((r, ri) => {
    const groupIdxs = groupsByResponse.get(ri) ?? [];
    const attachedItems = groupIdxs.flatMap((gi) => sellerGroups[gi].items);
    const chips = evidenceChips(attachedItems);
    const extraNotes = evidenceNotes(attachedItems, r.text);
    const body =
      extraNotes.length > 0
        ? `${r.text}\n\n${extraNotes.map((n) => `Note: ${n}`).join("\n")}`
        : r.text;
    sellerMessages.push({
      id: `res-${r.id}`,
      kind: "seller_reply",
      senderName: sellerName ?? "Seller",
      senderRole: "seller",
      recipientName: "SafeDeal Admin",
      recipientRole: "admin",
      timestamp: fmtDate(r.at),
      topic: `Response #${r.number}`,
      body,
      msgRef: `RES-${r.number}`,
      attachments: chips.length > 0 ? chips : undefined,
      footerMeta: (
        <div className="flex items-center gap-1 text-slate-500">
          <Check className="w-3 h-3" /> <span>Submitted via dispute response</span>
        </div>
      ),
    });
  });
  sellerGroups.forEach((g, gi) => {
    if (groupToResponse.has(gi)) return; // already merged into a response card
    const chips = evidenceChips(g.items);
    const notes = evidenceNotes(g.items);
    if (chips.length === 0 && notes.length === 0) return;
    const titles = g.items.map((e) => e.title).filter(Boolean) as string[];
    const headline =
      titles.length === 1
        ? `Uploaded evidence: ${titles[0]}`
        : `Uploaded ${titles.length} evidence file${titles.length === 1 ? "" : "s"}`;
    const body =
      notes.length > 0 ? `${headline}\n\n${notes.map((n) => `Note: ${n}`).join("\n")}` : headline;
    const firstId = g.items[0].id;
    sellerMessages.push({
      id: `ev-${firstId}`,
      kind: "seller_reply",
      senderName: g.uploader ?? sellerName ?? "Seller",
      senderRole: "seller",
      recipientName: "SafeDeal Admin",
      recipientRole: "admin",
      timestamp: fmtDate(g.earliestAt),
      topic: "Evidence uploaded",
      body,
      msgRef: `EV-${firstId.slice(0, 4).toUpperCase()}`,
      attachments: chips.length > 0 ? chips : undefined,
      footerMeta: (
        <div className="flex items-center gap-1 text-slate-500">
          <Check className="w-3 h-3" /> <span>Attached to dispute</span>
        </div>
      ),
    });
  });
  sellerMessages.sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1));

  const activeMessages: CommMessage[] =
    activeTab === "internal" ? internalMessages
    : activeTab === "seller" ? sellerMessages
    : buyerMessages;
  const emptyText =
    activeTab === "buyer" ? "No buyer messages yet for this dispute."
    : activeTab === "seller" ? "No seller messages yet for this dispute."
    : "No internal notes yet.";

  const handleSend = () => {
    if (activeTab === "internal") {
      onAddNote();
    }
    // buyer/seller messaging not wired yet: visual-only per plan.
  };

  return (
    <section className="p-0 md:p-2">
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-slate-800">
          <h3 className="text-white text-lg font-semibold">Case Communication</h3>
          <p className="text-slate-400 text-sm mt-1">
            Structured dispute communication workspace - all messages are logged and auditable
          </p>
        </div>

        {/* Status row */}
        <div className="px-6 py-4 bg-slate-800/30 border-b border-slate-800">
          <div className="flex items-center gap-2 mb-3">
            <Info className="w-4 h-4 text-blue-400" />
            <span className="text-slate-300 text-xs font-semibold uppercase tracking-wider">
              Communication Status
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {statusChips.map((c) => (
              <div
                key={c.key}
                className={cn("flex items-center gap-2 px-3 py-1.5 rounded-lg border", chipTone[c.tone])}
              >
                {c.leading}
                <span className="text-xs font-medium">{c.label}</span>
                <span className={cn("text-xs", chipMeta[c.tone])}>{c.meta}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-slate-800">
          <div className="flex gap-1 px-6 overflow-x-auto">
            {([
              { id: "buyer" as CommTab, label: "Buyer Messages", icon: <UserIcon className="w-3.5 h-3.5 mr-2 text-blue-400" />, border: "border-blue-500" },
              { id: "seller" as CommTab, label: "Seller Messages", icon: <Store className="w-3.5 h-3.5 mr-2 text-orange-400" />, border: "border-orange-500" },
              { id: "internal" as CommTab, label: "Internal Notes", icon: <StickyNote className="w-3.5 h-3.5 mr-2 text-purple-400" />, border: "border-purple-500" },
            ]).map((t) => {
              const isActive = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  className={cn(
                    "px-4 py-3 text-sm font-medium transition-all inline-flex items-center whitespace-nowrap",
                    isActive
                      ? cn("text-white bg-slate-800 border-b-2", t.border)
                      : "text-slate-400 hover:text-white hover:bg-slate-800/50"
                  )}
                >
                  {t.icon}{t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab content */}
        <div className="p-6">
          {/* Thread (only scroll container) */}
          <div className="space-y-4 mb-6 max-h-[600px] overflow-y-auto pr-2">
            {activeMessages.length === 0 ? (
              <div className="text-slate-400 text-sm py-6 text-center">{emptyText}</div>
            ) : (
              activeMessages.map((m) => <MessageItem key={m.id} m={m} />)
            )}
          </div>

          {/* Quick Actions */}
          <div className="mb-4 pb-4 border-b border-slate-800">
            <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-3">Quick Actions</p>
            <div className="flex flex-wrap gap-2">
              <QuickActionChip disabled icon={<HelpCircle className="w-3 h-3 mr-1" />} label="Request Clarification" hoverClass="hover:border-orange-500 hover:text-orange-400" title="Outbound messaging not yet wired" />
              <QuickActionChip disabled icon={<FilePlus2 className="w-3 h-3 mr-1" />} label="Request Evidence" hoverClass="hover:border-orange-500 hover:text-orange-400" title="Outbound messaging not yet wired" />
              <QuickActionChip disabled icon={<Bell className="w-3 h-3 mr-1" />} label="Send Reminder" hoverClass="hover:border-yellow-500 hover:text-yellow-400" title="Outbound messaging not yet wired" />
              <QuickActionChip disabled icon={<Clock className="w-3 h-3 mr-1" />} label="Send Deadline Notice" hoverClass="hover:border-red-500 hover:text-red-400" title="Outbound messaging not yet wired" />
            </div>
          </div>

          {/* Composer */}
          <div className="bg-slate-800/30 border border-slate-700 rounded-lg p-4">
            <div className="mb-3">
              <label className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2 block">
                {accent.label}
              </label>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={4}
                placeholder={accent.placeholder}
                className={cn(
                  "w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-slate-300 text-sm placeholder-slate-500 focus:outline-none resize-none",
                  accent.focus
                )}
              />
            </div>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={msgType}
                  onChange={(e) => setMsgType(e.target.value)}
                  className={cn(
                    "px-3 py-2 bg-slate-800 border border-slate-700 text-slate-300 rounded-lg focus:outline-none text-xs font-medium min-h-11",
                    accent.focus
                  )}
                >
                  <option value="general_reply">General Reply</option>
                  <option value="clarification">Clarification Request</option>
                  <option value="evidence_request">Evidence Request</option>
                  <option value="reminder">Reminder</option>
                  <option value="deadline">Deadline Notice</option>
                  <option value="resolution">Resolution Update</option>
                </select>
              </div>
              <button
                onClick={handleSend}
                disabled={activeTab !== "internal"}
                title={activeTab !== "internal" ? "Outbound messaging not yet wired" : undefined}
                className={cn(
                  "px-5 py-2 text-white rounded-lg transition-all text-sm font-medium inline-flex items-center min-h-11",
                  accent.send,
                  activeTab !== "internal" && "opacity-50 cursor-not-allowed"
                )}
              >
                <Send className="w-3.5 h-3.5 mr-2" />
                {activeTab === "internal" ? "Save Note" : `Send to ${activeTab === "seller" ? "Seller" : "Buyer"}`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function QuickActionChip({ icon, label, hoverClass, onClick, disabled, title }: {
  icon: React.ReactNode; label: string; hoverClass: string; onClick?: () => void; disabled?: boolean; title?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "px-3 py-1.5 bg-slate-800 border border-slate-700 text-slate-300 rounded-lg transition-all text-xs font-medium inline-flex items-center min-h-11",
        disabled ? "opacity-50 cursor-not-allowed" : hoverClass
      )}
    >
      {icon}{label}
    </button>
  );
}

function MessageItem({ m }: { m: CommMessage }) {
  const kindStyle: Record<MsgKind, { border: string; bg: string; body: string; badgeBg: string; badgeText: string; badgeIcon: React.ReactNode; badgeLabel: string; accentText: string }> = {
    deadline: {
      border: "border-red-500", bg: "bg-slate-800/50", body: "bg-slate-900/50",
      badgeBg: "bg-red-500/20", badgeText: "text-red-400",
      badgeIcon: <AlertTriangle className="w-3 h-3" />, badgeLabel: "Deadline Notice",
      accentText: "text-red-400",
    },
    reminder: {
      border: "border-yellow-500", bg: "bg-slate-800/50", body: "bg-slate-900/50",
      badgeBg: "bg-yellow-500/20", badgeText: "text-yellow-400",
      badgeIcon: <Bell className="w-3 h-3" />, badgeLabel: "Reminder",
      accentText: "text-yellow-400",
    },
    seller_reply: {
      border: "border-orange-500", bg: "bg-orange-500/5", body: "bg-slate-900/70 border border-orange-500/10",
      badgeBg: "bg-orange-500/20", badgeText: "text-orange-400",
      badgeIcon: <MessageCircle className="w-3 h-3" />, badgeLabel: "General Reply",
      accentText: "text-orange-400",
    },
    buyer_reply: {
      border: "border-blue-500", bg: "bg-blue-500/5", body: "bg-slate-900/70 border border-blue-500/10",
      badgeBg: "bg-blue-500/20", badgeText: "text-blue-400",
      badgeIcon: <MessageCircle className="w-3 h-3" />, badgeLabel: "General Reply",
      accentText: "text-blue-400",
    },
    evidence_request: {
      border: "border-slate-500", bg: "bg-slate-800/50", body: "bg-slate-900/50",
      badgeBg: "bg-slate-700", badgeText: "text-slate-300",
      badgeIcon: <FilePlus2 className="w-3 h-3" />, badgeLabel: "Evidence Request",
      accentText: "text-slate-300",
    },
    general: {
      border: "border-slate-500", bg: "bg-slate-800/50", body: "bg-slate-900/50",
      badgeBg: "bg-slate-700", badgeText: "text-slate-300",
      badgeIcon: <MessageCircle className="w-3 h-3" />, badgeLabel: "Message",
      accentText: "text-slate-300",
    },
    internal: {
      border: "border-purple-500", bg: "bg-slate-800/50", body: "bg-slate-900/50",
      badgeBg: "bg-purple-500/20", badgeText: "text-purple-400",
      badgeIcon: <StickyNote className="w-3 h-3" />, badgeLabel: "Internal Note",
      accentText: "text-purple-400",
    },
  };
  const s = kindStyle[m.kind];

  const roleColor = (role: CommMessage["senderRole"] | CommMessage["recipientRole"]) =>
    role === "seller" ? "text-orange-400"
    : role === "buyer" ? "text-blue-400"
    : role === "internal" ? "text-purple-400"
    : "text-white";

  const rolePillClass = (() => {
    if (m.senderRole === "seller") return "bg-orange-500/20 text-orange-400";
    if (m.senderRole === "buyer") return "bg-blue-500/20 text-blue-400";
    if (m.recipientRole === "internal") return "bg-purple-500/20 text-purple-400";
    return "bg-slate-700 text-slate-400";
  })();
  const rolePillLabel = `${cap(m.senderRole)} → ${cap(m.recipientRole)}`;

  return (
    <div className={cn("border-l-4 rounded-lg p-4", s.border, s.bg)}>
      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
        <div className="flex items-start gap-3 min-w-0">
          {m.avatarUrl ? (
            <img src={m.avatarUrl} alt="" className="w-9 h-9 rounded-full ring-2 ring-slate-700 object-cover" />
          ) : (
            <div className="w-9 h-9 rounded-full ring-2 ring-slate-700 bg-slate-700 flex items-center justify-center text-xs font-semibold text-slate-200">
              {initials(m.senderName)}
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className={cn("font-semibold text-sm", roleColor(m.senderRole))}>{m.senderName}</span>
              <ArrowRight className="w-3 h-3 text-slate-600" />
              <span className={cn("font-medium text-sm", roleColor(m.recipientRole))}>{m.recipientName}</span>
              <span className={cn("px-2 py-0.5 text-xs rounded", rolePillClass)}>{rolePillLabel}</span>
            </div>
            <p className="text-slate-400 text-xs">
              {m.timestamp}{m.topic ? <> • {m.topic}</> : null}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className={cn("px-2 py-1 text-xs font-semibold rounded flex items-center gap-1", s.badgeBg, s.badgeText)}>
            {s.badgeIcon}{s.badgeLabel}
          </span>
          {m.msgRef && <span className="text-slate-500 text-xs">#{m.msgRef}</span>}
        </div>
      </div>

      <div className={cn("rounded-lg p-3 mb-3", s.body)}>
        <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">{m.body}</p>
      </div>

      {m.attachments && m.attachments.length > 0 && (
        <div className="flex gap-2 mb-3 flex-wrap">
          {m.attachments.map((a, i) => (
            <div key={i} className="bg-slate-800 border border-slate-700 rounded-lg p-2 flex items-center gap-2 hover:border-orange-500 transition-all cursor-pointer text-xs">
              <Paperclip className={cn("w-3 h-3", s.accentText)} />
              <span className="text-slate-300">{a.name}</span>
              {a.size && <span className="text-slate-500">{a.size}</span>}
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-slate-700 gap-2 flex-wrap">
        <div className="flex items-center gap-3 text-xs">
          {m.footerMeta ?? (
            <div className="flex items-center gap-1 text-slate-500">
              <Check className="w-3 h-3" /> <span>Logged</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }

// ---------- notes ----------
function NotesList({ notes, compact }: { notes: any[]; compact?: boolean }) {
  if (!notes || notes.length === 0) {
    return <div className="text-xs text-muted-foreground">No internal notes yet.</div>;
  }
  return (
    <div className="space-y-3">
      {notes.map((n) => {
        const author = n.author?.full_name ?? "SafeDeal Admin";
        const rawBody: string = n.note ?? "";
        const { pill, cleanBody } = parseInternalNoteTag(rawBody, n);
        const typeLabel = noteTypeLabel(n);
        return (
          <div key={n.id} className="rounded-lg border border-border bg-background p-4">
            <div className="flex items-start gap-3">
              <div className="h-8 w-8 shrink-0 rounded-full bg-blue-500/20 text-blue-300 grid place-items-center text-xs font-semibold">
                {initials(author)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-foreground">{author}</div>
                <div className="text-xs text-muted-foreground">
                  {typeLabel}{typeLabel ? " • " : ""}{fmtDate(n.at)}
                </div>
              </div>
              {pill && (
                <span className={cn(
                  "shrink-0 rounded-md px-2.5 py-1 text-xs font-bold uppercase tracking-wide",
                  pill.cls,
                )}>
                  {pill.label}
                </span>
              )}
            </div>
            <p className={cn("text-sm text-foreground/90 whitespace-pre-wrap mt-3", compact && "line-clamp-3")}>{cleanBody}</p>
          </div>
        );
      })}
    </div>
  );
}

function noteTypeLabel(n: any): string {
  const t: string = (n.noteType ?? n.note_type ?? n.topic ?? "").toString();
  if (!t) return "Internal note";
  return titleCase(t);
}

function parseInternalNoteTag(body: string, n: any): { pill: { label: string; cls: string } | null; cleanBody: string } {
  const text = (body ?? "").trim();
  // Match patterns like [tag/priority] or [tag] at the start
  const m = text.match(/^\[([a-z_]+)(?:\/([a-z_]+))?\]\s*/i);
  let tag = "";
  let clean = text;
  if (m) { tag = m[1].toLowerCase(); clean = text.slice(m[0].length); }
  else if (n.noteType || n.note_type) tag = String(n.noteType ?? n.note_type).toLowerCase();

  const pillMap: Record<string, { label: string; cls: string }> = {
    escalation: { label: "Escalation", cls: "bg-red-500/15 text-red-300 border border-red-500/30" },
    escalate_case: { label: "Escalation", cls: "bg-red-500/15 text-red-300 border border-red-500/30" },
    investigation: { label: "Investigation", cls: "bg-purple-500/15 text-purple-300 border border-purple-500/30" },
    manual_admin_review: { label: "Investigation", cls: "bg-purple-500/15 text-purple-300 border border-purple-500/30" },
    follow_up: { label: "Follow-up", cls: "bg-amber-500/15 text-amber-300 border border-amber-500/30" },
    agent_note: { label: "Agent note", cls: "bg-slate-500/15 text-slate-300 border border-slate-500/30" },
    internal_note: { label: "Agent note", cls: "bg-slate-500/15 text-slate-300 border border-slate-500/30" },
  };
  const pill = tag && pillMap[tag] ? pillMap[tag] : null;
  return { pill, cleanBody: clean || text };
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

// ---- timeline humanizer / dedupe helpers ----
const TIMELINE_TONE: Record<string, string> = {
  green: "bg-emerald-500",
  red: "bg-red-500",
  orange: "bg-orange-500",
  blue: "bg-blue-500",
  muted: "bg-muted-foreground/60",
};

function humanizeTimelineEntry(e: any): { title: string; description: string; tone: string; actor: string | null; sortKey: string } {
  const t: string = e.type ?? "";
  const rawTitle: string = e.title ?? "";
  const rawDesc: string = e.description ?? "";
  let title = rawTitle;
  let tone: string = "blue";
  let description = parseRawTokens(rawDesc);
  const actor: string | null = e.actorName ?? null;

  const lowerTitle = rawTitle.toLowerCase().trim();

  if (t === "dispute_opened" || lowerTitle === "dispute opened") {
    title = "Dispute opened"; tone = "red";
  } else if (t === "dispute_resolved" || lowerTitle.includes("resolved")) {
    title = "Dispute resolved"; tone = "green";
  } else if (lowerTitle.includes("under review") || t === "dispute_under_review") {
    title = "Dispute: under review"; tone = "blue";
  } else if (lowerTitle.includes("seller response pending") || lowerTitle.includes("seller_response_pending")) {
    title = "Dispute: seller response pending"; tone = "blue";
  } else if (lowerTitle === "escalate case" || lowerTitle.includes("escalate")) {
    title = "Case escalated"; tone = "red";
  } else if (lowerTitle === "update investigation" || lowerTitle.includes("investigation update") || lowerTitle.includes("update_investigation")) {
    title = "Investigation updated"; tone = "blue";
  } else if (lowerTitle === "add internal note" || lowerTitle.includes("internal note")) {
    title = "Internal note added"; tone = "blue";
  } else if (lowerTitle.includes("freeze transaction") || lowerTitle.includes("freeze_transaction")) {
    title = "Funds frozen by admin"; tone = "red";
  } else if (lowerTitle.includes("unfreeze")) {
    title = "Funds released by admin"; tone = "green";
  } else if (t === "seller_response_submitted") {
    title = "Seller response submitted"; tone = "blue";
  } else if (t === "buyer_evidence_uploaded") {
    title = "Evidence uploaded by buyer"; tone = "blue";
  } else if (t === "dispute_evidence_uploaded") {
    title = `Evidence uploaded${actor ? ` by ${actor}` : ""}`; tone = "blue";
  } else if (t === "money_status") {
    title = `Money: ${rawTitle.replace(/^Money[:\s-]*/i, "").trim() || titleCase(e.subtype ?? "")}`;
    tone = "blue";
  } else if (t === "escrow_ledger") {
    title = "Escrow adjustment"; tone = "blue";
  } else if (t === "payment") {
    tone = "blue";
  } else if (t === "delivery") {
    tone = "blue";
  }

  if (e.severity === "success") tone = "green";
  if (e.severity === "critical" && tone === "blue") tone = "red";

  return { title, description, tone, actor, sortKey: e.at ?? "" };
}

function parseRawTokens(desc: string): string {
  if (!desc) return "";
  let out = desc;
  // [target=foo_bar] => Target: Foo bar
  out = out.replace(/\[target=([a-z0-9_]+)\]\s*/gi, (_m, v) => `Target: ${titleCase(v)} · `);
  // [source/priority] e.g. [manual_admin_review/medium]
  out = out.replace(/\[([a-z_]+)\/([a-z_]+)\]\s*/gi, (_m, src, pri) =>
    `Source: ${titleCase(src)} · Priority: ${titleCase(pri)} · `);
  // follow_up:urgent
  out = out.replace(/follow_up:([a-z_]+)\s*/gi, (_m, lvl) => `Follow-up (${lvl}): `);
  // standalone status/priority pair like "resolved/medium"
  out = out.replace(/\b([a-z_]+)\/([a-z_]+)\b/g, (m, a, b) => {
    const stat = ["resolved", "open", "under_review", "escalated", "closed", "pending"].includes(a);
    const pri = ["low", "medium", "high", "urgent", "critical"].includes(b);
    return stat && pri ? `Status: ${titleCase(a)} · Priority: ${titleCase(b)}` : m;
  });
  return out.replace(/\s*·\s*$/, "").trim();
}

// Collapse admin_action freeze/unfreeze with same-instant money_status + escrow_ledger
function collapseAdminTriplets(items: any[]): any[] {
  const sorted = [...items].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  const used = new Set<string>();
  const out: any[] = [];
  for (const it of sorted) {
    if (used.has(it.id)) continue;
    const isFreeze = it.type === "admin_action" &&
      /freeze|unfreeze/i.test(it.title ?? "");
    if (!isFreeze) { out.push(it); continue; }
    const tMs = new Date(it.at).getTime();
    const companions = sorted.filter((x) =>
      !used.has(x.id) && x.id !== it.id &&
      (x.type === "money_status" || x.type === "escrow_ledger") &&
      Math.abs(new Date(x.at).getTime() - tMs) <= 5000
    );
    companions.forEach((c) => used.add(c.id));
    const extra = companions.length ? " · Escrow adjustment recorded" : "";
    out.push({ ...it, description: `${(it.description ?? "").trim()}${extra}`.trim() });
  }
  return out;
}

function statusPillColor(status: string, resolvedAt: string | null): { label: string; tone: string } {
  if (resolvedAt || status === "resolved" || status === "closed" || status === "dismissed") {
    return { label: "Resolved", tone: "green" };
  }
  if (status === "escalated") return { label: "Escalated", tone: "orange" };
  if (status === "under_review") return { label: "Under review", tone: "orange" };
  if (status === "open") return { label: "Open", tone: "red" };
  return { label: titleCase(status) || "Active", tone: "blue" };
}

function Timeline({ items, disputeStatus, resolvedAt }: {
  items: any[];
  disputeStatus?: string;
  resolvedAt?: string | null;
}) {
  const collapsed = useMemo(() => collapseAdminTriplets(items), [items]);
  const rows = useMemo(
    () =>
      collapsed
        .map((e) => ({ raw: e, ...humanizeTimelineEntry(e) }))
        .sort((a, b) => new Date(b.sortKey).getTime() - new Date(a.sortKey).getTime()),
    [collapsed],
  );

  const header = disputeStatus
    ? statusPillColor(disputeStatus, resolvedAt ?? null)
    : null;

  if (rows.length === 0 && !header) {
    return <div className="text-xs text-muted-foreground">No timeline events yet.</div>;
  }

  return (
    <div className="space-y-4">
      {header && (
        <div className="flex items-center gap-2">
          <span className={cn(
            "h-2.5 w-2.5 rounded-full shrink-0",
            TIMELINE_TONE[header.tone],
          )} />
          <span className={cn(
            "text-sm font-semibold",
            header.tone === "green" && "text-emerald-300",
            header.tone === "orange" && "text-orange-300",
            header.tone === "red" && "text-red-300",
            header.tone === "blue" && "text-blue-300",
          )}>
            {header.label}
          </span>
        </div>
      )}
      {rows.map((r) => (
        <div key={r.raw.id} className="border-l-2 border-border/60 pl-4 py-0.5">
          <div className="text-sm font-semibold text-foreground">{r.title}</div>
          {r.description && (
            <div className="text-xs text-muted-foreground mt-1">{r.description}</div>
          )}
          <div className="text-xs text-muted-foreground mt-1.5">
            {fmtDate(r.raw.at)}
            {r.raw.type === "admin_action" && (
              <> · by {r.actor ?? "SafeDeal Admin"}</>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------- linked tile ----------
function LinkedTile({ icon, title, subtitle, onClick, tone = "blue", showDot = false }: {
  icon: React.ReactNode; title: string; subtitle: string; onClick?: () => void;
  tone?: "blue" | "emerald" | "orange" | "purple" | "yellow";
  showDot?: boolean;
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
        "group flex min-h-[112px] flex-col justify-between rounded-xl border border-border/60 bg-muted/20 p-4 text-left transition-colors",
        disabled ? "opacity-60 cursor-not-allowed" : "hover:border-blue-500/40 hover:bg-muted/40",
      )}
    >
      <div className="flex items-start justify-between">
        <span className="relative inline-flex">
          <span className={cn("grid h-11 w-11 place-items-center rounded-lg", toneCls[tone])}>{icon}</span>
          {showDot && (
            <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-background" />
          )}
        </span>
        <ArrowRight className={cn("h-4 w-4 text-muted-foreground/70", !disabled && "group-hover:text-foreground")} />
      </div>
      <div className="mt-3 min-w-0">
        <div className="text-sm font-semibold text-foreground truncate">{title}</div>
        <div className="mt-0.5 text-xs text-muted-foreground truncate">{subtitle}</div>
      </div>
    </button>
  );
}

// ---------- resolution sidebar ----------
function ResolutionSidebar({
  disputeStatus, overdue, resolvedAt, moneyStatus, adminCan, dueAt, outcome,
  parties, buyerClaim, sellerResponded, txId,
  onResolve, onMoveReview, onEscalate, onHighRisk, onFraud, onClose, onAddNote,
}: {
  disputeStatus: string;
  overdue: boolean;
  resolvedAt: string | null;
  moneyStatus: string | null;
  adminCan: Record<string, boolean>;
  dueAt: string | null;
  outcome?: { type?: string | null; summary?: string | null; refundAmount?: number | null; releaseAmount?: number | null; resolvedAt?: string | null } | null;
  parties: { buyer: any; seller: any };
  buyerClaim: string | null;
  sellerResponded: boolean;
  txId: string;
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
  const navigate = useNavigate();
  const outcomeLabelMap: Record<string, { label: string; tone: string }> = {
    refund_buyer: { label: "Refund to Buyer", tone: "text-emerald-300" },
    release_funds_to_seller: { label: "Release to Seller", tone: "text-blue-300" },
    partial_refund_release: { label: "Partial Refund + Release", tone: "text-purple-300" },
    close_case_without_resolution: { label: "Closed Without Resolution", tone: "text-muted-foreground" },
  };
  const outcomeMeta = outcome?.type ? outcomeLabelMap[outcome.type] : null;
  const nextActionText = nextActionLabelFor(outcome?.type ?? null);

  return (
    <div className="p-5 space-y-6">
      {/* Post-resolution panel: shows ONLY when the case is resolved. */}
      {isResolved && (
        <div>
          <div className="text-base font-semibold text-foreground mb-3">Resolution Summary</div>
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Resolved
              </span>
              {resolvedAt && (
                <span className="text-xs text-muted-foreground">{fmtDate(resolvedAt)}</span>
              )}
            </div>
            {outcomeMeta && (
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Outcome</div>
                <div className={cn("mt-0.5 text-sm font-semibold", outcomeMeta.tone)}>{outcomeMeta.label}</div>
              </div>
            )}
            {outcome?.summary && (
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Decision summary</div>
                <p className="mt-0.5 text-sm text-foreground/90 whitespace-pre-wrap">{outcome.summary}</p>
              </div>
            )}
            {(Number(outcome?.refundAmount ?? 0) > 0 || Number(outcome?.releaseAmount ?? 0) > 0) && (
              <div className="flex flex-wrap gap-3 text-xs">
                {Number(outcome?.refundAmount ?? 0) > 0 && (
                  <span className="text-muted-foreground">Refund: <span className="text-foreground font-semibold tabular-nums">{ngn(outcome?.refundAmount)}</span></span>
                )}
                {Number(outcome?.releaseAmount ?? 0) > 0 && (
                  <span className="text-muted-foreground">Release: <span className="text-foreground font-semibold tabular-nums">{ngn(outcome?.releaseAmount)}</span></span>
                )}
              </div>
            )}
            <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Next action</div>
              <div className="mt-0.5 text-sm text-foreground">{nextActionText}</div>
            </div>
          </div>
        </div>
      )}

      {/* Resolution Status */}
      <div>
        <div className="text-base font-semibold text-foreground mb-3">Resolution Status</div>
        <div className={cn("rounded-xl border p-4", statusMeta.cls)}>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider">
            <span className={cn("h-1.5 w-1.5 rounded-full", statusMeta.dotCls)} />
            {statusMeta.label}
          </div>
          <p className="mt-2 text-sm leading-snug">{statusMeta.message}</p>
        </div>
        <div className="mt-4 space-y-3 text-sm">
          <div>
            <div className="text-xs text-muted-foreground">Current Workflow Stage</div>
            <div className="mt-1 flex items-center gap-2 text-foreground font-medium">
              <span className={cn("h-2 w-2 rounded-full", statusMeta.dotCls)} />
              {titleCase(disputeStatus)}
            </div>
          </div>
          {dueAt && !isResolved && (
            <div>
              <div className="text-xs text-muted-foreground">Last Activity</div>
              <div className="mt-1 text-foreground font-medium">{fmtDate(dueAt)}</div>
            </div>
          )}
          <div>
            <div className="text-xs text-muted-foreground">Next Action</div>
            <div className="mt-1 text-foreground">{statusMeta.next}</div>
          </div>
        </div>
      </div>

      {/* Resolution Actions header */}
      <div className="text-base font-semibold text-foreground -mb-2">Resolution Actions</div>

      {/* Case Control */}
      <SidebarGroup title="Case Control">
        <SidebarBtn icon={<Search />} label="Move to Under Review"
          onClick={onMoveReview}
          disabled={isResolved}
          iconColor="text-blue-400" iconBg="bg-blue-500/10"
          tip={isResolved ? "Case already resolved" : undefined} />
        <SidebarBtn icon={<MessageSquare />} label="Request More Evidence"
          onClick={onResolve} disabled={isResolved}
          iconColor="text-purple-400" iconBg="bg-purple-500/10"
          tip={isResolved ? "Case already resolved" : "Opens dispute action panel"} />
        <SidebarBtn icon={<UsersIcon />} label="Assign / Reassign Agent"
          iconColor="text-emerald-400" iconBg="bg-emerald-500/10"
          disabled tip="Agent assignment not connected yet" />
        <SidebarBtn icon={<ArrowUp />} label="Escalate Further"
          onClick={onEscalate} disabled={isResolved}
          iconColor="text-orange-400" iconBg="bg-orange-500/10" />
        <SidebarBtn icon={<AlertTriangle />} label="Mark High Risk"
          onClick={onHighRisk}
          disabled={isResolved}
          tip={isResolved ? "Case already resolved" : undefined}
          iconColor="text-red-400" iconBg="bg-red-500/10" />
        <SidebarBtn icon={<ShieldAlert />} label="Mark Fraud Watch"
          onClick={onFraud}
          disabled={isResolved}
          tip={isResolved ? "Case already resolved" : undefined}
          iconColor="text-red-400" iconBg="bg-red-500/10" />
      </SidebarGroup>

      {/* Resolution Actions (solid + outlined) */}
      <SidebarGroup title="Resolution Actions" gapClass="space-y-2">
        <SidebarBtn icon={<RotateCcw />} label="Refund Buyer"
          onClick={onResolve} disabled={!canManage || isResolved}
          variant="solid" solidClass="bg-emerald-600 hover:bg-emerald-700 text-white border-transparent"
          tip={!canManage ? "Not available for this transaction" : (isResolved ? "Case already resolved" : undefined)} />
        <SidebarBtn icon={<Wallet />} label="Release Funds to Seller"
          onClick={onResolve} disabled={!canManage || isResolved}
          variant="solid" solidClass="bg-blue-600 hover:bg-blue-700 text-white border-transparent"
          tip={!canManage ? "Not available for this transaction" : (isResolved ? "Case already resolved" : undefined)} />
        <SidebarBtn icon={<Percent />} label="Partial Refund"
          onClick={onResolve} disabled={!canManage || isResolved}
          iconColor="text-muted-foreground" iconBg="bg-muted/40"
          tip={!canManage ? "Not available" : undefined} />
        <SidebarBtn icon={<PieChart />} label="Partial Release"
          onClick={onResolve} disabled={!canManage || isResolved}
          iconColor="text-muted-foreground" iconBg="bg-muted/40"
          tip={!canManage ? "Not available" : undefined} />
        <SidebarBtn icon={<XCircle />} label="Close Without Resolution"
          onClick={onClose} disabled={isResolved}
          iconColor="text-muted-foreground" iconBg="bg-muted/40" />
        <div className="mt-3 pt-3 border-t border-[#253044]/70 space-y-2">
          <SidebarBtn icon={<Ban />} label="Block Payout"
            disabled
            variant="solid" solidClass="bg-red-600 hover:bg-red-700 text-white border-transparent"
            tip="Payout block control not connected yet" />
          <SidebarBtn icon={<PlayCircle />} label="Resume Payout"
            disabled
            variant="solid" solidClass="bg-emerald-600 hover:bg-emerald-700 text-white border-transparent"
            tip="Payout resume control not connected yet" />
        </div>
      </SidebarGroup>

      {/* Investigation Actions */}
      <SidebarGroup title="Investigation Actions">
        <SidebarBtn icon={<NotebookPen />} label="Add Review Note" onClick={onAddNote}
          iconColor="text-yellow-400" iconBg="bg-yellow-500/10" />
        <SidebarBtn icon={<Edit3 />} label="Add Internal Note" onClick={onAddNote}
          iconColor="text-purple-400" iconBg="bg-purple-500/10" />
        <SidebarBtn icon={<Search />} label="Open Investigation" disabled
          iconColor="text-orange-400" iconBg="bg-orange-500/10"
          tip={isResolved ? "Case already resolved" : "Investigation workflow not connected yet"} />
        <SidebarBtn icon={<CreditCard />} label="View Linked Transaction"
          onClick={() => navigate(`/admin/transactions/${txId}`)}
          iconColor="text-blue-400" iconBg="bg-blue-500/10" />
        <SidebarBtn icon={<CreditCard />} label="View Payment Record" disabled
          iconColor="text-emerald-400" iconBg="bg-emerald-500/10" tip="Coming soon" />
        <SidebarBtn icon={<Vault />} label="View Escrow Record" disabled
          iconColor="text-orange-400" iconBg="bg-orange-500/10" tip="Coming soon" />
        <SidebarBtn icon={<Wallet />} label="View Payout Record" disabled
          iconColor="text-purple-400" iconBg="bg-purple-500/10" tip="Coming soon" />
      </SidebarGroup>

      {/* Resolution Summary */}
      <div className="border-t border-border pt-5">
        <div className="text-base font-semibold text-foreground mb-3">Resolution Summary</div>
        <div className="space-y-3">
          <SummaryPartyCard
            role="buyer"
            name={parties.buyer?.name ?? "—"}
            statusLabel={buyerClaim ? "Refund Requested" : "—"}
            statusTone="emerald"
            summary={buyerClaim ?? "No buyer claim provided."}
          />
          <SummaryPartyCard
            role="seller"
            name={parties.seller?.name ?? "—"}
            statusLabel={sellerResponded ? "Responded" : "Response Missing"}
            statusTone={sellerResponded ? "emerald" : "red"}
            summary={sellerResponded ? "Seller has submitted a response." : "Seller has not responded yet."}
          />
        </div>
      </div>
    </div>
  );
}

function SummaryPartyCard({ role, name, statusLabel, statusTone, summary }: {
  role: "buyer" | "seller"; name: string; statusLabel: string;
  statusTone: "emerald" | "red" | "yellow"; summary: string;
}) {
  const toneCls = statusTone === "emerald" ? "text-emerald-400"
    : statusTone === "red" ? "text-red-400"
    : "text-yellow-400";
  const dotCls = statusTone === "emerald" ? "bg-emerald-400"
    : statusTone === "red" ? "bg-red-400"
    : "bg-yellow-400";
  return (
    <div className="rounded-lg border border-[#253044] bg-[#0F172A]/60 p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn(
            "h-7 w-7 rounded-full flex items-center justify-center shrink-0",
            role === "buyer" ? "bg-blue-500/15 text-blue-400" : "bg-orange-500/15 text-orange-400",
          )}>
            {role === "buyer" ? <UserIcon className="h-4 w-4" /> : <Store className="h-4 w-4" />}
          </span>
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">{role}</div>
            <div className="text-sm font-medium text-foreground truncate">{name}</div>
          </div>
        </div>
        <span className={cn("inline-flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap", toneCls)}>
          <span className={cn("h-1.5 w-1.5 rounded-full", dotCls)} />
          {statusLabel}
        </span>
      </div>
      <p className="text-xs text-muted-foreground line-clamp-3">{summary}</p>
    </div>
  );
}

function SidebarGroup({ title, children, gapClass = "space-y-1.5" }: { title: string; children: React.ReactNode; gapClass?: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2 px-1">{title}</div>
      <div className={gapClass}>{children}</div>
    </div>
  );
}
function SidebarBtn({
  icon, label, onClick, disabled, tip,
  iconColor, iconBg,
  variant = "outline", solidClass,
}: {
  icon: React.ReactNode; label: string; onClick?: () => void;
  disabled?: boolean; tip?: string;
  iconColor?: string; iconBg?: string;
  variant?: "outline" | "solid"; solidClass?: string;
}) {
  const isSolid = variant === "solid";
  const base = cn(
    "w-full min-h-11 flex items-center rounded-md border px-3 text-sm font-medium transition-colors text-left",
    isSolid ? "gap-2.5 py-3" : "gap-3 py-2.5",
  );
  const outlineCls = "border-[#253044] bg-[#0F172A]/40 text-foreground hover:bg-[#0F172A]/70";
  const solidCls = solidClass ?? "bg-primary text-primary-foreground border-transparent hover:opacity-90";
  const btn = (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || !onClick}
      className={cn(
        base,
        isSolid ? solidCls : outlineCls,
        (disabled || !onClick) && "opacity-60 cursor-not-allowed",
      )}
    >
      <span className={cn(
        "shrink-0 inline-flex items-center justify-center",
        isSolid
          ? "h-[18px] w-[18px] [&_svg]:h-[18px] [&_svg]:w-[18px] [&_svg]:stroke-[2.25]"
          : cn("h-4 w-4 [&_svg]:h-4 [&_svg]:w-4", iconColor ?? "text-muted-foreground"),
      )}>
        {icon}
      </span>
      <span className="flex-1 truncate">{label}</span>
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
  label: string; message: string; next: string; cls: string; dotCls: string; Icon?: any;
} {
  if (resolvedAt || status === "resolved") return {
    label: "Resolved", message: "Case has a recorded resolution outcome.",
    next: "View outcome and money movement.",
    cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-100",
    dotCls: "bg-emerald-400",
    Icon: CheckCircle2,
  };
  if (status === "dismissed" || status === "closed") return {
    label: "Closed", message: "Case closed without payout or refund.",
    next: "Review audit trail.",
    cls: "border-slate-500/30 bg-slate-500/10 text-slate-100",
    dotCls: "bg-slate-400",
    Icon: XCircle,
  };
  if (status === "escalated") return {
    label: "Escalated", message: "Case escalated: requires immediate admin review.",
    next: "Review evidence and determine outcome.",
    cls: "border-red-500/40 bg-red-500/10 text-red-100",
    dotCls: "bg-red-400",
    Icon: AlertTriangle,
  };
  if (status === "under_review") return {
    label: "Under Review", message: "Admin review in progress.",
    next: "Review evidence and decide the outcome.",
    cls: "border-purple-500/30 bg-purple-500/10 text-purple-100",
    dotCls: "bg-purple-400",
    Icon: Gavel,
  };
  if (status === "awaiting_seller_response") return {
    label: overdue ? "Awaiting Seller (Overdue)" : "Awaiting Seller",
    message: overdue ? "Seller response is overdue." : "Seller response pending.",
    next: overdue ? "Send reminder or escalate." : "Wait for seller response or send reminder.",
    cls: overdue
      ? "border-red-500/40 bg-red-500/10 text-red-100"
      : "border-yellow-500/30 bg-yellow-500/10 text-yellow-100",
    dotCls: overdue ? "bg-red-400" : "bg-yellow-400",
    Icon: Clock,
  };
  return {
    label: "Open", message: "Case waiting for triage.",
    next: "Move to under review or request seller response.",
    cls: "border-blue-500/30 bg-blue-500/10 text-blue-100",
    dotCls: "bg-blue-400",
    Icon: Gavel,
  };
}