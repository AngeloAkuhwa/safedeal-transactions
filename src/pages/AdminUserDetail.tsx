import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Download, StickyNote, Search,
  Flag, FlagOff, ShieldCheck, Mail, Phone, IdCard, Calendar,
  UserCircle, Wallet, ShoppingCart, Store, Scale, Star,
  History, ListChecks, Eye, EyeOff, Clock, CheckCircle2,
  Building2, MapPin, Plus, Loader2, ChevronDown, Home, Ban,
  RotateCcw, ArrowDown, ArrowUp, AlertCircle, Info,
} from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { useAdminNav } from "@/components/admin/useAdminNav";
import { fetchUserDirectoryDetail, exportUserDetail, revealUserSensitiveField, type UserExportType } from "@/services/admin-users-directory.service";
import { performFlaggedAction } from "@/services/admin-flagged-users.service";
import { setVendorStatus } from "@/services/admin-settings.service";
import { supabase } from "@/integrations/supabase/client";
import { formatMoney, maskEmail, maskPhone } from "@/lib/format";
import { formatMoneyOrDash } from "@/lib/payment/money-format";
import { toast } from "@/hooks/use-toast";
import { ActionConfirmDialog } from "@/components/admin/transactions/ActionConfirmDialog";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-NG", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-NG", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function relative(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

type PendingAction = { kind: "flag" | "clear_flag" | "suspend" | "unsuspend" | "add_note" } | null;
type ComplianceExportPrompt = { open: boolean };

export default function AdminUserDetail() {
  const { id: userId = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { go } = useAdminNav();
  const qc = useQueryClient();
  const [revealedEmail, setRevealedEmail] = useState<string | null>(null);
  const [revealedPhone, setRevealedPhone] = useState<string | null>(null);
  const [revealingEmail, setRevealingEmail] = useState(false);
  const [revealingPhone, setRevealingPhone] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [complianceExport, setComplianceExport] = useState<ComplianceExportPrompt>({ open: false });
  const [complianceReason, setComplianceReason] = useState("");
  const [exporting, setExporting] = useState<UserExportType | null>(null);
  const [vendorStatusModal, setVendorStatusModal] = useState<{ open: boolean; target: "active" | "disabled" | "suspended" }>({ open: false, target: "active" });
  const [vendorStatusReason, setVendorStatusReason] = useState("");
  const [vendorStatusSaving, setVendorStatusSaving] = useState(false);

  const vendorStatusQuery = useQuery({
    queryKey: ["admin-vendor-status", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("vendor_status, vendor_status_reason, vendor_status_changed_at")
        .eq("id", userId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: Boolean(userId),
  });

  async function submitVendorStatus() {
    const target = vendorStatusModal.target;
    if (target !== "active" && vendorStatusReason.trim().length < 3) {
      toast({ title: "Reason required", description: "Enter at least 3 characters." });
      return;
    }
    setVendorStatusSaving(true);
    try {
      await setVendorStatus({ vendor_id: userId, status: target, reason: vendorStatusReason.trim() });
      toast({ title: `Vendor set to ${target}` });
      setVendorStatusModal({ open: false, target: "active" });
      setVendorStatusReason("");
      qc.invalidateQueries({ queryKey: ["admin-vendor-status", userId] });
    } catch (e: any) {
      toast({ title: "Update failed", description: e?.message ?? String(e) });
    } finally {
      setVendorStatusSaving(false);
    }
  }

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-user-detail", userId],
    queryFn: () => fetchUserDirectoryDetail(userId),
    enabled: !!userId,
    staleTime: 15_000,
  });

  const onConfirmAction = async (reason: string) => {
    if (!pendingAction || !data) return;
    const action = pendingAction.kind === "flag" ? "flag_user"
      : pendingAction.kind === "clear_flag" ? "clear_flag"
      : pendingAction.kind === "add_note" ? "add_note"
      : pendingAction.kind === "unsuspend" ? "unsuspend_user"
      : "suspend_user";
    try {
      await performFlaggedAction({ action, user_id: data.user.user_id, note: reason });
      toast({ title: "Action recorded", description: `${pendingAction.kind.replace(/_/g, " ")} on ${data.user.full_name}` });
    } catch (e) {
      toast({ title: "Action failed", description: (e as Error).message, variant: "destructive" });
      return;
    }
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["admin-user-detail", userId] }),
      qc.invalidateQueries({ queryKey: ["admin-users-directory"] }),
      qc.invalidateQueries({ queryKey: ["admin-flagged-users"] }),
    ]);
    setPendingAction(null);
  };

  const runExport = async (kind: UserExportType, reason?: string) => {
    if (!data) return;
    setExporting(kind);
    try {
      const blob = await exportUserDetail(data.user.user_id, kind, reason);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `user-${data.user.display_id}-${kind}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({ title: `${kind} export ready`, description: "CSV downloaded." });
    } catch (e) {
      toast({ title: "Export failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setExporting(null);
    }
  };

  const toggleRevealEmail = async () => {
    if (revealedEmail !== null) { setRevealedEmail(null); return; }
    if (!data) return;
    setRevealingEmail(true);
    try {
      const { value } = await revealUserSensitiveField(data.user.user_id, "email");
      setRevealedEmail(value ?? "—");
    } catch (e) {
      toast({ title: "Reveal failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setRevealingEmail(false);
    }
  };

  const toggleRevealPhone = async () => {
    if (revealedPhone !== null) { setRevealedPhone(null); return; }
    if (!data) return;
    setRevealingPhone(true);
    try {
      const { value } = await revealUserSensitiveField(data.user.user_id, "phone");
      setRevealedPhone(value ?? "—");
    } catch (e) {
      toast({ title: "Reveal failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setRevealingPhone(false);
    }
  };

  const stats = data?.stats;
  const payout = data?.payout_account ?? null;
  const extra = data?.profile_extra ?? null;
  const verif = data?.verification_detail;
  const notes = data?.admin_notes ?? [];
  const recent = data?.recent_transactions ?? [];
  const timeline = data?.timeline ?? [];
  const verifPct = verif?.progress_percent ?? 0;
  const actions = data?.available_actions;

  return (
    <AdminLayout title="User Investigation Hub" hideDefaultHeaders fullBleed>
      <div className="bg-slate-950 text-slate-200 min-h-[100dvh] flex flex-col">
        {/* Sticky page header — pins to viewport while body scrolls under it */}
        <header className="bg-slate-900 border-b border-slate-800 px-4 sm:px-6 lg:px-8 py-4 sm:py-6 sticky top-0 z-40 shadow-md shadow-black/20">
          <div className="flex items-start lg:items-center justify-between mb-4 flex-col lg:flex-row gap-3">
            <div className="flex items-center gap-3 lg:gap-4">
              <button
                onClick={() => navigate(-1)}
                aria-label="Back"
                className="w-10 h-10 bg-slate-800 hover:bg-slate-700 rounded-lg flex items-center justify-center transition-all relative before:absolute before:-inset-2 before:content-['']"
              >
                <ArrowLeft className="h-4 w-4 text-slate-300" />
              </button>
              <div>
                <h2 className="text-white text-xl sm:text-2xl font-bold">User Investigation Hub</h2>
                <p className="text-slate-400 text-sm mt-0.5">Complete user investigation and support center</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button disabled={!data || !!exporting} className="px-3 sm:px-4 py-2 sm:py-2.5 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 transition-all flex items-center gap-2 text-xs sm:text-sm font-medium border border-slate-700 disabled:opacity-50 min-h-11">
                    {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    Export <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem onClick={() => runExport("sanitized")}>Sanitized User Export</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => runExport("activity")}>Activity Timeline Export</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => runExport("transactions")}>Transactions Export</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => runExport("disputes")}>Disputes Export</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => { setComplianceReason(""); setComplianceExport({ open: true }); }}>
                    Compliance Export…
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <button onClick={() => data && setPendingAction({ kind: "add_note" })} disabled={!data} className="px-3 sm:px-4 py-2 sm:py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition-all flex items-center gap-2 text-xs sm:text-sm font-medium shadow-lg shadow-orange-600/20 disabled:opacity-50 min-h-11">
                <StickyNote className="h-4 w-4" /> Add Note
              </button>
              <button onClick={() => userId && navigate(`/admin/transactions?q=${userId}`)} className="px-3 sm:px-4 py-2 sm:py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all flex items-center gap-2 text-xs sm:text-sm font-medium shadow-lg shadow-blue-600/20 min-h-11">
                <Search className="h-4 w-4" /> View Transactions
              </button>
            </div>
          </div>

          {/* User summary card */}
          {data && (
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 sm:p-6">
              <div className="flex items-start justify-between gap-4 flex-col lg:flex-row">
                <div className="flex items-start gap-4 sm:gap-5 min-w-0">
                  {data.user.avatar_url
                    ? <img src={data.user.avatar_url} className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl border-2 border-slate-600 object-cover shrink-0" alt={data.user.full_name} />
                    : <span className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl border-2 border-slate-600 bg-slate-700 text-white text-2xl font-bold inline-flex items-center justify-center shrink-0">{(data.user.full_name || "?").slice(0, 1).toUpperCase()}</span>}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <h3 className="text-white text-lg sm:text-xl font-bold truncate">{data.user.full_name || "Unnamed"}</h3>
                      {data.user.is_flagged && (
                        <span className="px-2.5 py-1 bg-red-500/20 border border-red-500/40 text-red-400 rounded-full text-xs font-semibold flex items-center gap-1.5">
                          <Flag className="h-3 w-3" /> FLAGGED
                        </span>
                      )}
                      {(data.user.verification.level === "fully" || data.user.verification.id) && (
                        <span className="px-2.5 py-1 bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 rounded-full text-xs font-semibold flex items-center gap-1.5">
                          <ShieldCheck className="h-3 w-3" /> VERIFIED
                        </span>
                      )}
                      {data.user.is_suspended && (
                        <span className="px-2.5 py-1 bg-purple-500/20 border border-purple-500/40 text-purple-400 rounded-full text-xs font-semibold">SUSPENDED</span>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 mb-3">
                      <div className="flex items-center gap-2 text-sm min-w-0">
                        <Mail className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <span className="text-slate-300 truncate">{revealedEmail !== null ? revealedEmail : maskEmail(data.user.email)}</span>
                        {data.user.email && (
                          <button onClick={toggleRevealEmail} disabled={revealingEmail} className="text-blue-400 hover:text-blue-300 text-xs disabled:opacity-50 min-h-11 inline-flex items-center" aria-label="Toggle email">
                            {revealingEmail ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : revealedEmail !== null ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Phone className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <span className="text-slate-300">{revealedPhone !== null ? revealedPhone : maskPhone(data.user.phone)}</span>
                        {data.user.phone && (
                          <button onClick={toggleRevealPhone} disabled={revealingPhone} className="text-blue-400 hover:text-blue-300 text-xs disabled:opacity-50 min-h-11 inline-flex items-center" aria-label="Toggle phone">
                            {revealingPhone ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : revealedPhone !== null ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <IdCard className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <span className="text-slate-300">User ID: {data.user.display_id}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <span className="text-slate-300">Joined: {fmtDate(data.user.joined_at)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {data.user.roles.includes("buyer") && <span className="px-3 py-1 bg-blue-500/20 border border-blue-500/30 text-blue-400 rounded-lg text-xs font-semibold capitalize">Buyer</span>}
                      {data.user.roles.includes("seller") && <span className="px-3 py-1 bg-purple-500/20 border border-purple-500/30 text-purple-400 rounded-lg text-xs font-semibold capitalize">Seller</span>}
                      {data.user.roles.includes("business") && <span className="px-3 py-1 bg-orange-500/20 border border-orange-500/30 text-orange-400 rounded-lg text-xs font-semibold capitalize">Business</span>}
                      {data.user.roles.includes("admin") && <span className="px-3 py-1 bg-amber-500/20 border border-amber-500/30 text-amber-400 rounded-lg text-xs font-semibold capitalize">Admin</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {data.user.is_flagged ? (
                    <button onClick={() => setPendingAction({ kind: "clear_flag" })} className="px-4 py-2 bg-red-500/20 border border-red-500/40 text-red-400 rounded-lg hover:bg-red-500/30 transition-all text-sm font-medium inline-flex items-center gap-2 min-h-11">
                      <FlagOff className="h-4 w-4" /> Unflag User
                    </button>
                  ) : (
                    <button onClick={() => setPendingAction({ kind: "flag" })} className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg transition-all text-sm font-medium inline-flex items-center gap-2 min-h-11">
                      <Flag className="h-4 w-4" /> Flag User
                    </button>
                  )}
                  <button onClick={() => setPendingAction({ kind: "add_note" })} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-all text-sm font-medium inline-flex items-center gap-2 min-h-11">
                    <StickyNote className="h-4 w-4" /> Add Note
                  </button>
                  {data.user.is_suspended ? (
                    <button onClick={() => setPendingAction({ kind: "unsuspend" })} className="px-4 py-2 bg-purple-500/20 border border-purple-500/40 text-purple-300 rounded-lg hover:bg-purple-500/30 transition-all text-sm font-medium inline-flex items-center gap-2 min-h-11">
                      <ShieldCheck className="h-4 w-4" /> Unsuspend
                    </button>
                  ) : (
                    <button onClick={() => setPendingAction({ kind: "suspend" })} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-all text-sm font-medium inline-flex items-center gap-2 min-h-11">
                      <Ban className="h-4 w-4" /> Suspend
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </header>

        {/* Content */}
        <div className="p-4 sm:p-6 lg:p-8 space-y-6">
          {isLoading && (
            <div className="p-12 text-center text-slate-400">
              <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" /> Loading user…
            </div>
          )}
          {error && (
            <div className="p-6 text-red-400 text-sm bg-slate-900 border border-red-500/30 rounded-xl">{(error as Error).message}</div>
          )}

          {data && (
            <>
              {/* Row 1 — 3 cards */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Profile Information */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl">
                  <div className="p-6 border-b border-slate-800">
                    <h3 className="text-white text-lg font-semibold flex items-center gap-2">
                      <UserCircle className="h-5 w-5 text-blue-400" /> Profile Information
                    </h3>
                  </div>
                  <div className="p-6 space-y-4">
                    <div>
                      <p className="text-slate-400 text-xs font-semibold mb-1">Full Name</p>
                      <p className="text-white font-medium">{data.user.full_name || "—"}</p>
                    </div>
                    <div>
                      <p className="text-slate-400 text-xs font-semibold mb-1">Location</p>
                      <p className="text-white font-medium">
                        {[verif?.address_city, verif?.address_state, verif?.address_country].filter(Boolean).join(", ") || "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-400 text-xs font-semibold mb-1">Account Status</p>
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-sm font-semibold border ${
                        data.user.is_suspended ? "bg-purple-500/20 border-purple-500/30 text-purple-400"
                        : data.user.is_flagged ? "bg-red-500/20 border-red-500/30 text-red-400"
                        : "bg-emerald-500/20 border-emerald-500/30 text-emerald-400"
                      }`}>
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {data.user.is_suspended ? "Suspended" : data.user.is_flagged ? "Flagged" : "Active"}
                      </span>
                    </div>
                    <div>
                      <p className="text-slate-400 text-xs font-semibold mb-1">Last Login</p>
                      <p className="text-white font-medium">{extra?.last_login_at ? relative(extra.last_login_at) : "—"}</p>
                      {extra?.last_login_ip && (
                        <p className="text-slate-500 text-xs flex items-center gap-1 mt-0.5">
                          <MapPin className="h-3 w-3" />
                          IP: {String(extra.last_login_ip)}
                          {extra.last_login_city ? ` (${extra.last_login_city}${extra.last_login_state ? ", " + extra.last_login_state : ""})` : ""}
                        </p>
                      )}
                    </div>
                    <div>
                      <p className="text-slate-400 text-xs font-semibold mb-1">Last Active</p>
                      <p className="text-white font-medium">{data.user.last_active_at ? relative(data.user.last_active_at) : "—"}</p>
                    </div>
                  </div>
                </div>

                {/* Verification Status */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl">
                  <div className="p-6 border-b border-slate-800">
                    <h3 className="text-white text-lg font-semibold flex items-center gap-2">
                      <ShieldCheck className="h-5 w-5 text-emerald-400" /> Verification Status
                    </h3>
                  </div>
                  <div className="p-6 space-y-4">
                    <VerifRow icon={<Mail className="h-4 w-4" />} label="Email" ok={!!verif?.email} okLabel="Verified" />
                    <VerifRow icon={<Phone className="h-4 w-4" />} label="Phone" ok={!!verif?.phone} okLabel="Verified" />
                    <VerifRow
                      icon={<IdCard className="h-4 w-4" />}
                      label="Identity (KYC)"
                      ok={(verif?.identity_level ?? 0) >= 2}
                      okLabel={`Level ${verif?.identity_level ?? 0}`}
                      pending={verif?.identity_level === 1}
                      pendingLabel="Pending"
                    />
                    <VerifRow
                      icon={<Building2 className="h-4 w-4" />}
                      label="Bank Account"
                      ok={verif?.bank_status === "verified"}
                      okLabel="Verified"
                      pending={verif?.bank_status === "pending"}
                      pendingLabel="Pending"
                    />
                    <VerifRow
                      icon={<Home className="h-4 w-4" />}
                      label="Address"
                      ok={verif?.address_status === "provided"}
                      okLabel="Provided"
                    />
                    <div className="pt-3 border-t border-slate-800">
                      <p className="text-slate-400 text-xs mb-2">Verification Level</p>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-emerald-500 to-blue-500" style={{ width: `${verifPct}%` }} />
                        </div>
                        <span className="text-white text-sm font-bold">Level {verif?.identity_level ?? 0}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Payout Account */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl">
                  <div className="p-6 border-b border-slate-800">
                    <h3 className="text-white text-lg font-semibold flex items-center gap-2">
                      <Wallet className="h-5 w-5 text-purple-400" /> Payout Account
                    </h3>
                  </div>
                  <div className="p-6 space-y-4">
                    {payout ? (
                      <>
                        <div>
                          <p className="text-slate-400 text-xs font-semibold mb-1">Bank Name</p>
                          <p className="text-white font-medium">{payout.bank_name ?? "—"}</p>
                        </div>
                        <div>
                          <p className="text-slate-400 text-xs font-semibold mb-1">Account Name</p>
                          <p className="text-white font-medium">{payout.account_name ?? "—"}</p>
                        </div>
                        <div>
                          <p className="text-slate-400 text-xs font-semibold mb-1">Account Number</p>
                          <p className="text-white font-medium font-mono">{payout.masked_account_number ?? "—"}</p>
                        </div>
                        <div>
                          <p className="text-slate-400 text-xs font-semibold mb-1">Status</p>
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-sm font-semibold border ${
                            payout.status === "verified" ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-400"
                            : "bg-orange-500/20 border-orange-500/30 text-orange-400"
                          }`}>
                            <Clock className="h-3.5 w-3.5" />
                            {payout.status === "verified" ? "Verified" : "Pending Verification"}
                          </span>
                        </div>
                        <div>
                          <p className="text-slate-400 text-xs font-semibold mb-1">Added On</p>
                          <p className="text-white font-medium">{fmtDate(payout.added_on)}</p>
                        </div>
                      </>
                    ) : (
                      <div className="text-slate-500 text-sm text-center py-6">No payout account added yet.</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Row 2 — 4 stats */}
              {data.user.roles.includes("seller") && (() => {
                const vs = (vendorStatusQuery.data?.vendor_status as string | undefined) ?? "active";
                const reason = vendorStatusQuery.data?.vendor_status_reason as string | null | undefined;
                const changedAt = vendorStatusQuery.data?.vendor_status_changed_at as string | null | undefined;
                const tone =
                  vs === "active" ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                  : vs === "disabled" ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
                  : "bg-red-500/10 border-red-500/30 text-red-300";
                return (
                  <div className="bg-slate-900 border border-slate-800 rounded-xl">
                    <div className="p-5 border-b border-slate-800 flex items-center justify-between flex-wrap gap-3">
                      <div>
                        <h3 className="text-white text-base font-semibold flex items-center gap-2">
                          <Store className="h-5 w-5 text-purple-400" /> Vendor Commerce Status
                        </h3>
                        <p className="text-slate-400 text-xs mt-1">
                          Controls whether this vendor's storefront, cart, and checkout are available to buyers.
                        </p>
                      </div>
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold border capitalize ${tone}`}>
                        {vs === "active" ? <CheckCircle2 className="h-3.5 w-3.5" /> : vs === "disabled" ? <Ban className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
                        {vs}
                      </span>
                    </div>
                    <div className="p-5 space-y-3">
                      {(reason || changedAt) && (
                        <div className="text-xs text-slate-400">
                          {reason && <p className="italic">"{reason}"</p>}
                          {changedAt && <p className="mt-1">Changed {relative(changedAt)}</p>}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <button
                          disabled={vs === "active"}
                          onClick={() => { setVendorStatusReason(""); setVendorStatusModal({ open: true, target: "active" }); }}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5 min-h-11"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" /> Set Active
                        </button>
                        <button
                          disabled={vs === "disabled"}
                          onClick={() => { setVendorStatusReason(""); setVendorStatusModal({ open: true, target: "disabled" }); }}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 hover:bg-amber-500/25 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5 min-h-11"
                        >
                          <Ban className="h-3.5 w-3.5" /> Disable Vendor
                        </button>
                        <button
                          disabled={vs === "suspended"}
                          onClick={() => { setVendorStatusReason(""); setVendorStatusModal({ open: true, target: "suspended" }); }}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-500/15 border border-red-500/30 text-red-300 hover:bg-red-500/25 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5 min-h-11"
                        >
                          <AlertCircle className="h-3.5 w-3.5" /> Suspend Vendor
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })()}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                <StatCard
                  icon={<ShoppingCart className="h-6 w-6 text-blue-400" />}
                  label="Total as Buyer"
                  value={stats ? formatMoneyOrDash(stats.as_buyer.volume, stats.currency_code) : "—"}
                  sub={stats ? `${stats.as_buyer.count} transactions` : ""}
                />
                <StatCard
                  icon={<Store className="h-6 w-6 text-purple-400" />}
                  label="Total as Seller"
                  value={stats ? formatMoneyOrDash(stats.as_seller.volume, stats.currency_code) : "—"}
                  sub={stats ? `${stats.as_seller.count} transactions` : ""}
                />
                <StatCard
                  icon={<Scale className="h-6 w-6 text-orange-400" />}
                  label="Disputes"
                  value={stats ? `${stats.disputes.total} Total` : "—"}
                  sub={stats ? `${stats.disputes.filed} filed, ${stats.disputes.received} received` : ""}
                  pill={stats && stats.disputes.active > 0 ? { text: `${stats.disputes.active} Active`, tone: "red" } : undefined}
                  onClick={() => userId && navigate(`/admin/disputes?q=${userId}`)}
                />
              </div>

              {/* Row 3 — 2 cards */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Recent Transactions */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl">
                  <div className="p-6 border-b border-slate-800 flex items-center justify-between">
                    <h3 className="text-white text-lg font-semibold flex items-center gap-2">
                      <RotateCcw className="h-5 w-5 text-blue-400" /> Recent Transactions
                    </h3>
                    <button onClick={() => navigate(`/admin/transactions?q=${userId}`)} className="text-blue-400 hover:text-blue-300 text-sm font-medium min-h-11 inline-flex items-center">View All</button>
                  </div>
                  <div className="divide-y divide-slate-800">
                    {recent.length === 0 && <div className="p-8 text-center text-slate-500 text-sm">No recent transactions.</div>}
                    {recent.map((t) => {
                      const isBuyer = t.counterparty === "as_buyer";
                      const inDispute = String(t.status).toLowerCase().includes("dispute");
                      const cls = inDispute ? "bg-orange-500/20 text-orange-400"
                        : isBuyer ? "bg-emerald-500/20 text-emerald-400"
                        : "bg-purple-500/20 text-purple-400";
                      const RowIcon = inDispute ? AlertCircle : isBuyer ? ArrowDown : ArrowUp;
                      return (
                        <button
                          key={t.transaction_id}
                          onClick={() => navigate(`/admin/transactions/${t.transaction_id}`)}
                          className="w-full text-left p-6 hover:bg-slate-800/50 transition-all"
                        >
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${cls}`}>
                                <RowIcon className="h-4 w-4" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-white font-medium truncate">{t.transaction_code}</p>
                                <p className="text-slate-400 text-xs capitalize">{String(t.status).replace(/_/g, " ")}</p>
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-white font-bold">{formatMoneyOrDash(t.amount, t.currency_code)}</p>
                              <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold capitalize ${inDispute ? "bg-orange-500/20 text-orange-400" : "bg-emerald-500/20 text-emerald-400"}`}>
                                {String(t.status).replace(/_/g, " ")}
                              </span>
                            </div>
                          </div>
                          <p className="text-slate-500 text-xs">{isBuyer ? "As Buyer" : "As Seller"} · {fmtDate(t.created_at)}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Activity Log */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl">
                  <div className="p-6 border-b border-slate-800 flex items-center justify-between">
                    <h3 className="text-white text-lg font-semibold flex items-center gap-2">
                      <ListChecks className="h-5 w-5 text-purple-400" /> Activity Log
                    </h3>
                  </div>
                  <div className="p-6 space-y-4">
                    {timeline.length === 0 && <p className="text-slate-500 text-sm text-center py-6">No admin activity recorded.</p>}
                    {timeline.map((a) => {
                      const t = String(a.type ?? "");
                      const item = a as typeof a & { title?: string; context?: string | null; source?: string; severity?: string };
                      const title = item.title || t.replace(/_/g, " ");
                      const sev = item.severity ?? "neutral";
                      const dot = sev === "high" ? "bg-red-400"
                        : sev === "warning" ? "bg-yellow-400"
                        : sev === "success" ? "bg-emerald-400"
                        : sev === "info" ? "bg-blue-400"
                        : "bg-slate-500";
                      const src = item.source;
                      const srcMeta: Record<string, { label: string; cls: string }> = {
                        admin_action: { label: "Admin", cls: "bg-purple-500/15 text-purple-300 border-purple-500/30" },
                        audit: { label: "Audit", cls: "bg-slate-700 text-slate-300 border-slate-600" },
                        transaction_event: { label: "System", cls: "bg-slate-700 text-slate-300 border-slate-600" },
                        session: { label: "Security", cls: "bg-red-500/15 text-red-300 border-red-500/30" },
                        payout: { label: "Account", cls: "bg-blue-500/15 text-blue-300 border-blue-500/30" },
                        identity: { label: "Account", cls: "bg-blue-500/15 text-blue-300 border-blue-500/30" },
                      };
                      const srcInfo = src ? srcMeta[src] : null;
                      return (
                        <div key={a.id} className="flex gap-3">
                          <div className={`w-2 h-2 ${dot} rounded-full mt-1.5 shrink-0`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-white text-sm font-medium">{title}</p>
                              {srcInfo && (
                                <span className={`px-1.5 py-0.5 rounded border text-xs font-semibold uppercase tracking-wide ${srcInfo.cls}`}>
                                  {srcInfo.label}
                                </span>
                              )}
                            </div>
                            {item.context && <p className="text-slate-400 text-xs mt-0.5">{item.context}</p>}
                            {a.note && <p className="text-slate-400 text-xs mt-0.5">{a.note}</p>}
                            <p className="text-slate-500 text-xs mt-1">{relative(a.created_at)}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Row 4 — Admin Notes & Flags */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl">
                <div className="p-6 border-b border-slate-800 flex items-center justify-between">
                  <h3 className="text-white text-lg font-semibold flex items-center gap-2">
                    <StickyNote className="h-5 w-5 text-yellow-400" /> Admin Notes &amp; Flags
                  </h3>
                  <div className="flex items-center gap-2">
                    <button onClick={() => navigate(`/admin/flagged-users?u=${userId}`)} className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium border border-slate-700 min-h-11">
                      Open in Flagged Users
                    </button>
                    <button onClick={() => setPendingAction({ kind: "add_note" })} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all text-sm font-medium inline-flex items-center gap-2 min-h-11">
                      <Plus className="h-4 w-4" /> Add Note
                    </button>
                  </div>
                </div>
                <div className="p-6 space-y-4">
                  {notes.length === 0 && <p className="text-slate-500 text-sm text-center py-6">No notes or flags recorded.</p>}
                  {notes.map((n) => {
                    const high = n.priority === "high";
                    return (
                      <div key={n.id} className={`rounded-lg p-4 border ${high ? "bg-red-500/10 border-red-500/30" : "bg-slate-800/40 border-slate-700"}`}>
                        <div className="flex items-start justify-between mb-2 gap-2">
                          <div className="flex items-center gap-2">
                            {high ? <Flag className="h-4 w-4 text-red-400" /> : <Info className="h-4 w-4 text-blue-400" />}
                            <span className={`font-semibold text-sm ${high ? "text-red-400" : "text-blue-400"}`}>
                              {high ? "HIGH PRIORITY FLAG" : String(n.type).replace(/_/g, " ").toUpperCase()}
                            </span>
                          </div>
                          <span className="text-slate-400 text-xs whitespace-nowrap">{fmtDateTime(n.created_at)}</span>
                        </div>
                        {n.note && <p className="text-white text-sm mb-2">{n.note}</p>}
                        <p className="text-slate-400 text-xs">Added by: {n.admin_name}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <ActionConfirmDialog
        open={!!pendingAction}
        onOpenChange={(o) => { if (!o) setPendingAction(null); }}
        title={
          pendingAction?.kind === "flag" ? `Flag ${data?.user.full_name ?? "user"} for fraud review`
            : pendingAction?.kind === "clear_flag" ? `Clear flag on ${data?.user.full_name ?? "user"}`
            : pendingAction?.kind === "add_note" ? `Add note for ${data?.user.full_name ?? "user"}`
            : pendingAction?.kind === "unsuspend" ? `Unsuspend ${data?.user.full_name ?? "user"}`
            : pendingAction ? `Suspend ${data?.user.full_name ?? "user"}` : ""
        }
        description="A note is required and will appear in the audit timeline."
        reasonLabel="Note"
        reasonPlaceholder="Explain why this action is being taken…"
        confirmLabel={
          pendingAction?.kind === "clear_flag" ? "Clear flag"
          : pendingAction?.kind === "suspend" ? "Suspend user"
          : pendingAction?.kind === "unsuspend" ? "Unsuspend user"
          : pendingAction?.kind === "add_note" ? "Save note"
          : "Flag user"
        }
        confirmTone={pendingAction?.kind === "clear_flag" || pendingAction?.kind === "add_note" || pendingAction?.kind === "unsuspend" ? "primary" : "danger"}
        onConfirm={onConfirmAction}
      />

      {/* Compliance export reason modal */}
      <Dialog open={complianceExport.open} onOpenChange={(o) => setComplianceExport({ open: o })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Compliance export</DialogTitle>
            <DialogDescription>
              A reason is required. The export and reason will be recorded in the audit log. This export includes unmasked compliance-sensitive fields and is restricted to admins.
            </DialogDescription>
          </DialogHeader>
          <textarea
            value={complianceReason}
            onChange={(e) => setComplianceReason(e.target.value)}
            placeholder="Reason for compliance export…"
            className="w-full min-h-24 rounded-md border bg-background p-3 text-sm"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setComplianceExport({ open: false })}>Cancel</Button>
            <Button
              disabled={!complianceReason.trim() || exporting === "compliance"}
              onClick={async () => {
                const r = complianceReason.trim();
                setComplianceExport({ open: false });
                await runExport("compliance", r);
              }}
            >
              {exporting === "compliance" ? "Exporting…" : "Download"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Vendor status change modal */}
      <Dialog open={vendorStatusModal.open} onOpenChange={(o) => setVendorStatusModal({ open: o, target: vendorStatusModal.target })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {vendorStatusModal.target === "active" ? "Re-enable vendor" : vendorStatusModal.target === "disabled" ? "Disable vendor" : "Suspend vendor"}
            </DialogTitle>
            <DialogDescription>
              {vendorStatusModal.target === "active"
                ? "The vendor's storefront and checkout will be available again."
                : "The vendor's storefront will be hidden. Buyers cannot add products to cart or check out. The reason will be recorded in the audit log."}
            </DialogDescription>
          </DialogHeader>
          <textarea
            value={vendorStatusReason}
            onChange={(e) => setVendorStatusReason(e.target.value)}
            placeholder={vendorStatusModal.target === "active" ? "Optional note…" : "Reason (required)…"}
            className="w-full min-h-24 rounded-md border bg-background p-3 text-sm"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setVendorStatusModal({ open: false, target: "active" })}>Cancel</Button>
            <Button
              disabled={vendorStatusSaving || (vendorStatusModal.target !== "active" && vendorStatusReason.trim().length < 3)}
              onClick={submitVendorStatus}
            >
              {vendorStatusSaving ? "Saving…" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}

function VerifRow({
  icon, label, ok, okLabel, pending, pendingLabel,
}: {
  icon: React.ReactNode; label: string; ok: boolean; okLabel: string;
  pending?: boolean; pendingLabel?: string;
}) {
  const tone = ok ? "emerald" : pending ? "orange" : "slate";
  const text = ok ? okLabel : pending ? (pendingLabel ?? "Pending") : "Not Verified";
  const iconColor = ok ? "text-emerald-400" : pending ? "text-orange-400" : "text-slate-500";
  const pillClass = tone === "emerald"
    ? "bg-emerald-500/20 text-emerald-400"
    : tone === "orange"
      ? "bg-orange-500/20 text-orange-400"
      : "bg-slate-700 text-slate-400";
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className={iconColor}>{icon}</span>
        <span className="text-white text-sm font-medium">{label}</span>
      </div>
      <span className={`px-2.5 py-1 rounded text-xs font-bold ${pillClass}`}>{text}</span>
    </div>
  );
}

function StatCard({
  icon, label, value, sub, pill, onClick,
}: {
  icon: React.ReactNode; label: string; value: string; sub?: string;
  pill?: { text: string; tone: "red" | "emerald" };
  onClick?: () => void;
}) {
  const Comp: any = onClick ? "button" : "div";
  return (
    <Comp onClick={onClick} className={`text-left bg-slate-900 border border-slate-800 rounded-xl p-6 ${onClick ? "hover:border-slate-700 hover:bg-slate-800/40 transition-all w-full" : ""}`}>
      <div className="flex items-center justify-between mb-2">
        {icon}
        {pill && (
          <span className={`text-xs font-semibold ${pill.tone === "red" ? "text-red-400" : "text-emerald-400"}`}>{pill.text}</span>
        )}
      </div>
      <h3 className="text-slate-400 text-sm font-medium mb-1">{label}</h3>
      <p className="text-white text-2xl font-bold">{value}</p>
      {sub && <p className="text-slate-500 text-xs mt-1">{sub}</p>}
    </Comp>
  );
}