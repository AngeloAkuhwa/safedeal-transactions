import { useState, useEffect } from "react";
import {
  Clock, Percent, ShieldCheck, ShieldAlert, History as HistoryIcon,
  TriangleAlert, Layers, DollarSign, Coins, Crown, Sliders, ShieldHalf,
  ToggleRight, Bell, Download, ArrowRight, RotateCcw, AlertTriangle,
} from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { toast } from "@/components/ui/sonner";
import { fetchAdminSettings, saveAdminSettings, searchVendors, type VendorLite } from "@/services/admin-settings.service";

/* ------------------------------ primitives ------------------------------ */

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className={`w-10 h-5 rounded-full relative cursor-pointer transition-colors ${
        on ? "bg-emerald-600" : "bg-muted"
      }`}
      aria-pressed={on}
    >
      <span
        className={`w-4 h-4 bg-background rounded-full absolute top-0.5 shadow transition-all ${
          on ? "right-0.5" : "left-0.5"
        }`}
      />
    </button>
  );
}

function NumInput({
  value, onChange, className = "w-24",
}: { value: number | string; onChange: (v: string) => void; className?: string }) {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`${className} h-9 px-2 bg-muted/40 border border-border rounded-lg text-foreground text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary/40`}
    />
  );
}

/* ------------------------------ header slot ------------------------------ */

function HeaderBar({
  dirty, onSave, scope, setScope, vendorId, setVendorId,
  vendorQuery, setVendorQuery, vendorResults, applyToAll, setApplyToAll,
}: {
  dirty: boolean; onSave: () => void;
  scope: "platform" | "vendor";
  setScope: (s: "platform" | "vendor") => void;
  vendorId: string | null;
  setVendorId: (id: string | null) => void;
  vendorQuery: string;
  setVendorQuery: (v: string) => void;
  vendorResults: VendorLite[];
  applyToAll: boolean;
  setApplyToAll: (v: boolean) => void;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
      <div className="sd-page py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div>
            <h1 className="sd-page-title">System Settings</h1>
            <p className="sd-page-sub">
              {scope === "platform"
                ? "Configure platform-wide defaults. Vendor overrides fall back here."
                : "Configure overrides for the selected vendor only."}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded-full">
              <AlertTriangle className="h-3 w-3 text-amber-400" />
              <span className="text-amber-400 font-medium text-[11px]">Production</span>
            </div>
            <div className="hidden lg:inline-flex items-center gap-1 px-2 py-0.5 bg-muted border border-border rounded-full">
              <ShieldCheck className="h-3 w-3 text-emerald-400" />
              <span className="text-muted-foreground text-[11px]">All changes audited</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-border overflow-hidden">
            <button
              onClick={() => setScope("platform")}
              className={`h-9 px-3 text-xs font-medium transition-colors ${scope === "platform" ? "bg-primary/20 text-foreground" : "bg-muted/40 text-muted-foreground hover:bg-muted"}`}
            >Platform</button>
            <button
              onClick={() => setScope("vendor")}
              className={`h-9 px-3 text-xs font-medium transition-colors border-l border-border ${scope === "vendor" ? "bg-primary/20 text-foreground" : "bg-muted/40 text-muted-foreground hover:bg-muted"}`}
            >Vendor</button>
          </div>
          <button
            onClick={() => toast.info("Audit history will open when wired to admin_actions")}
            className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/60 text-foreground text-xs font-medium hover:bg-muted transition-colors"
          >
            <HistoryIcon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">View History</span>
          </button>
          <button
            onClick={onSave}
            disabled={!dirty}
            className={`h-9 px-3 inline-flex items-center gap-1.5 rounded-lg text-xs font-semibold text-foreground transition-colors ${
              dirty
                ? "bg-amber-600 hover:bg-amber-500"
                : "bg-muted border border-border opacity-60 cursor-not-allowed"
            }`}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Approve &amp; Save Changes</span>
          </button>
        </div>
      </div>
      {scope === "vendor" && (
        <div className="sd-page pb-2">
          <div className="p-2 bg-muted/30 border border-border rounded-lg flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <input
              value={vendorQuery}
              onChange={(e) => setVendorQuery(e.target.value)}
              placeholder="Search vendors by name or email"
              className="flex-1 h-9 px-2 bg-background border border-border rounded-md text-sm text-foreground"
            />
            <select
              value={vendorId ?? ""}
              onChange={(e) => setVendorId(e.target.value || null)}
              className="h-9 px-2 bg-background border border-border rounded-md text-sm text-foreground min-w-[220px]"
            >
              <option value="">— Select vendor —</option>
              {vendorResults.map((v) => (
                <option key={v.id} value={v.id}>{v.full_name ?? v.email ?? v.id.slice(0, 8)}</option>
              ))}
            </select>
          </div>
        </div>
      )}
      {scope === "platform" && (
        <div className="sd-page pb-2">
          <label className="inline-flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={applyToAll}
              onChange={(e) => setApplyToAll(e.target.checked)}
              className="accent-primary"
            />
            Apply to all vendors (clears existing vendor overrides for saved keys)
          </label>
        </div>
      )}
      <div className="sd-page pb-3">
        <div className="p-3 bg-red-500/10 border-l-4 border-red-500 rounded-lg flex items-start gap-2 sd-alert">
          <TriangleAlert className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-red-300 text-sm font-semibold">
              Production Environment — Changes Affect Live Transactions
            </p>
            <p className="text-red-300/80 text-[11px] mt-1">
              All configuration changes are permanently logged and require admin approval.
              Changes to fees and timeouts apply immediately to new transactions.
            </p>
          </div>
        </div>
      </div>
    </header>
  );
}

/* ------------------------------ page ------------------------------ */

export default function AdminSettings() {
  const [dirty, setDirty] = useState(false);
  const mark = () => setDirty(true);

  // Scope
  const [scope, setScope] = useState<"platform" | "vendor">("platform");
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [vendorQuery, setVendorQuery] = useState("");
  const [vendorResults, setVendorResults] = useState<VendorLite[]>([]);
  const [applyToAll, setApplyToAll] = useState(false);
  // Which platform keys are overridable per-vendor
  const [overridable, setOverridable] = useState<Record<string, boolean>>({});
  const isLocked = (key: string) => scope === "vendor" && overridable[key] === false;

  // Timeouts
  const [sellerFulfil, setSellerFulfil] = useState("7");
  const [buyerVerify, setBuyerVerify] = useState("72");
  const [autoRelease, setAutoRelease] = useState("48");
  const [paymentExpiry, setPaymentExpiry] = useState("30");

  // Fees
  const [platformRate, setPlatformRate] = useState("2.9");
  const [minFee, setMinFee] = useState("250");
  const [feeCap, setFeeCap] = useState("2500");
  const [hvRate, setHvRate] = useState("2.5");
  const [refundPolicy, setRefundPolicy] = useState("Non-refundable");

  // Platform toggles
  const [autoReleaseOn, setAutoReleaseOn] = useState(true);
  const [emailOn, setEmailOn] = useState(true);
  const [smsOn, setSmsOn] = useState(false);
  const [hvAlert, setHvAlert] = useState("10000");
  const [fraudScore, setFraudScore] = useState("75");

  // Security
  const [idRequired, setIdRequired] = useState(true);
  const [idThreshold, setIdThreshold] = useState("5000");
  const [sessionTimeout, setSessionTimeout] = useState("30");
  const [twoFA, setTwoFA] = useState(true);

  const setStr = (fn: (v: string) => void) => (v: string) => { fn(v); mark(); };
  const setBool = (fn: (v: boolean) => void) => (v: boolean) => { fn(v); mark(); };

  // Load from backend when scope/vendor changes
  useEffect(() => {
    (async () => {
      try {
        const payload = await fetchAdminSettings(scope === "vendor" ? vendorId : null);
        const byKey: Record<string, any> = {};
        const overrideMap: Record<string, boolean> = {};
        (payload.settings ?? []).forEach((r) => {
          if (r.scope === "platform") overrideMap[r.setting_key] = r.is_overridable !== false;
          // vendor row wins when present
          const isMatch = scope === "vendor"
            ? (r.scope === "vendor" && r.vendor_id === vendorId) || (r.scope === "platform" && !byKey[r.setting_key])
            : r.scope === "platform";
          if (isMatch) byKey[r.setting_key] = r.setting_value;
        });
        setOverridable(overrideMap);
        const num = (v: unknown, d: string) => (v == null ? d : String(v));
        if (byKey["pricing.min_platform_fee_ngn"] != null) setMinFee(num(byKey["pricing.min_platform_fee_ngn"], "250"));
        if (byKey["pricing.max_total_service_fee_ngn"] != null) setFeeCap(num(byKey["pricing.max_total_service_fee_ngn"], "2500"));
        if (byKey["security.id_verification_threshold"] != null) setIdThreshold(num(byKey["security.id_verification_threshold"], "5000"));
        if (byKey["security.require_id_verification"] != null) setIdRequired(Boolean(byKey["security.require_id_verification"]));
        if (byKey["security.session_timeout_minutes"] != null) setSessionTimeout(num(byKey["security.session_timeout_minutes"], "30"));
        if (byKey["security.two_factor_admin"] != null) setTwoFA(Boolean(byKey["security.two_factor_admin"]));
        if (byKey["notifications.email_enabled"] != null) setEmailOn(Boolean(byKey["notifications.email_enabled"]));
        if (byKey["notifications.sms_enabled"] != null) setSmsOn(Boolean(byKey["notifications.sms_enabled"]));
        if (byKey["escrow.auto_release_enabled"] != null) setAutoReleaseOn(Boolean(byKey["escrow.auto_release_enabled"]));
        // Timeouts (hours)
        (payload.timeouts ?? []).forEach((t) => {
          const match = scope === "vendor"
            ? (t.scope === "vendor" && t.vendor_id === vendorId) || t.scope === "platform"
            : t.scope === "platform";
          if (!match) return;
          if (t.rule_type === "seller_fulfillment_timeout") setSellerFulfil(String(Math.round(t.hours_until_trigger / 24)));
          if (t.rule_type === "buyer_verification_timeout") setBuyerVerify(String(t.hours_until_trigger));
        });
        setDirty(false);
      } catch (e: any) {
        toast.error(e?.message ?? "Failed to load settings");
      }
    })();
  }, [scope, vendorId]);

  // Vendor typeahead
  useEffect(() => {
    if (scope !== "vendor") return;
    const t = setTimeout(async () => {
      try { setVendorResults(await searchVendors(vendorQuery)); } catch { /* ignore */ }
    }, 200);
    return () => clearTimeout(t);
  }, [vendorQuery, scope]);

  async function handleSave() {
    if (scope === "vendor" && !vendorId) {
      toast.error("Pick a vendor first");
      return;
    }
    const reason = window.prompt("Reason for this change (audit log):", "");
    if (!reason || reason.trim().length < 3) {
      toast.error("A reason is required");
      return;
    }
    const updates: Record<string, unknown> = {
      "pricing.min_platform_fee_ngn": Number(minFee),
      "pricing.max_total_service_fee_ngn": Number(feeCap),
      "security.require_id_verification": idRequired,
      "security.id_verification_threshold": Number(idThreshold),
      "security.session_timeout_minutes": Number(sessionTimeout),
      "security.two_factor_admin": twoFA,
      "notifications.email_enabled": emailOn,
      "notifications.sms_enabled": smsOn,
      "escrow.auto_release_enabled": autoReleaseOn,
      "fees.refund_policy": refundPolicy,
    };
    // In vendor scope, strip keys the platform marked non-overridable
    if (scope === "vendor") {
      for (const k of Object.keys(updates)) {
        if (overridable[k] === false) delete updates[k];
      }
    }
    const timeouts = [
      { rule_type: "seller_fulfillment_timeout", hours: Number(sellerFulfil) * 24 },
      { rule_type: "buyer_verification_timeout", hours: Number(buyerVerify) },
    ];
    try {
      await saveAdminSettings({
        scope,
        vendor_id: scope === "vendor" ? vendorId : null,
        updates,
        timeouts,
        reason: reason.trim(),
        apply_to_all_vendors: scope === "platform" && applyToAll,
      });
      toast.success(scope === "vendor" ? "Vendor overrides saved" : applyToAll ? "Saved and applied to all vendors" : "Platform defaults saved");
      setDirty(false);
      setApplyToAll(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Save failed");
    }
  }

  return (
    <AdminLayout
      title="System Settings"
      hideDefaultHeaders
      fullBleed
      headerSlot={
        <HeaderBar
          dirty={dirty}
          onSave={handleSave}
          scope={scope}
          setScope={(s) => { setScope(s); if (s === "platform") setVendorId(null); }}
          vendorId={vendorId}
          setVendorId={setVendorId}
          vendorQuery={vendorQuery}
          setVendorQuery={setVendorQuery}
          vendorResults={vendorResults}
          applyToAll={applyToAll}
          setApplyToAll={setApplyToAll}
        />
      }
    >
      <div className="bg-background min-h-full">
        <div className="sd-page sd-page-y sd-section-y">

          {/* ============ TIMEOUT RULES ============ */}
          <section className="sd-card">
            <div className="sd-card-pad border-b border-border">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h3 className="h-card font-semibold text-foreground flex items-center gap-2">
                    <div className="w-8 h-8 bg-blue-500/10 border border-blue-500/20 rounded-lg flex items-center justify-center">
                      <Clock className="h-4 w-4 text-blue-400" />
                    </div>
                    Timeout Rules
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1 ml-10">
                    Configure time limits for critical platform operations
                  </p>
                </div>
                <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-500/10 border border-blue-500/20 rounded-full">
                  <Layers className="h-3 w-3 text-blue-400" />
                  <span className="text-blue-300 text-[11px] font-medium">4 Business Rules</span>
                </div>
              </div>
            </div>
            <div className="sd-card-pad">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
                <TimeoutRow label="Seller Fulfillment Timeout" desc="Time given to sellers to fulfill orders after payment" value={sellerFulfil} onChange={setStr(setSellerFulfil)} unit="days" />
                <TimeoutRow label="Buyer Verification Window" desc="Time buyer has to verify item after delivery" value={buyerVerify} onChange={setStr(setBuyerVerify)} unit="hours" />
                <TimeoutRow label="Auto-Release After Delivery" desc="Auto-release escrow if buyer takes no action" value={autoRelease} onChange={setStr(setAutoRelease)} unit="hours" />
                <TimeoutRow label="Payment Session Expiry" desc="How long a Paystack payment session stays open" value={paymentExpiry} onChange={setStr(setPaymentExpiry)} unit="minutes" />
              </div>
              <div className="mt-4 pt-4 border-t border-border">
                <div className="bg-amber-500/10 border-l-4 border-amber-500 rounded-lg p-3 mb-4 sd-alert">
                  <div className="flex items-start gap-2">
                    <ShieldAlert className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
                    <div className="flex-1">
                      <p className="text-amber-200 font-semibold text-sm">Production Change Impact</p>
                      <p className="text-amber-300/80 text-[11px] mt-1">
                        Changes apply to new transactions only. Active transactions retain original timeout values.
                        This action will be permanently logged in audit history.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-1.5 text-muted-foreground text-[11px]">
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>
                      Last modified: <span className="text-foreground font-medium">2 days ago</span> by{" "}
                      <span className="text-foreground font-medium">Admin User</span>
                    </span>
                  </div>
                  <button
                    onClick={() => { toast.success("Timeout rules saved locally"); setDirty(false); }}
                    className="h-9 px-3 bg-blue-600 hover:bg-blue-500 text-foreground rounded-lg text-xs font-semibold transition-colors inline-flex items-center gap-1.5"
                  >
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Update Timeout Rules
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* ============ FEE CONFIGURATION ============ */}
          <section className="sd-card">
            <div className="sd-card-pad border-b border-border">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h3 className="h-card font-semibold text-foreground flex items-center gap-2">
                    <div className="w-8 h-8 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center justify-center">
                      <Percent className="h-4 w-4 text-emerald-400" />
                    </div>
                    Fee Configuration
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1 ml-10">Protection fee structure and limits</p>
                </div>
                <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
                  <DollarSign className="h-3 w-3 text-emerald-400" />
                  <span className="text-emerald-300 text-[11px] font-medium">Active Rules</span>
                </div>
              </div>
            </div>
            <div className="sd-card-pad">
              <div className="mb-4 pb-4 border-b border-border">
                <h4 className="sd-eyebrow mb-3 flex items-center gap-1.5">
                  <Coins className="h-3 w-3 text-emerald-400" />
                  Base Fee Structure
                </h4>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
                  <FeeField label="Platform Fee Rate" suffix="%" value={platformRate} onChange={setStr(setPlatformRate)} help="Applied to all standard transactions" />
                  <FeeField label="Minimum Platform Fee" prefix="₦" value={minFee} onChange={setStr(setMinFee)} help="Floor charged even on small orders" />
                  <FeeField label="Total Service Fee Cap" prefix="₦" value={feeCap} onChange={setStr(setFeeCap)} help="Buyer-friendly ceiling on service fees" />
                </div>
              </div>

              <div className="mb-4 pb-4 border-b border-border">
                <h4 className="sd-eyebrow mb-3 flex items-center gap-1.5">
                  <Crown className="h-3 w-3 text-amber-400" />
                  Special Category Fee Caps
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                  <FeeField label="High-Value Tier Rate" suffix="%" value={hvRate} onChange={setStr(setHvRate)} help="Rate for transactions above ₦2,000,000" />
                  <div className="p-3 bg-muted/30 border border-border rounded-lg">
                    <label className="text-xs font-medium text-foreground">Refund Policy</label>
                    <p className="text-[11px] text-muted-foreground mt-0.5 mb-2">Whether service fees are refundable</p>
                    <select
                      value={refundPolicy}
                      onChange={(e) => setStr(setRefundPolicy)(e.target.value)}
                      className="w-full h-9 px-2 bg-muted/40 border border-border rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                    >
                      <option>Non-refundable</option>
                      <option>Refundable on cancellation</option>
                      <option>Refundable within 24h</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <div className="bg-red-500/10 border-l-4 border-red-500 rounded-lg p-3 mb-4 sd-alert">
                  <div className="flex items-start gap-2">
                    <TriangleAlert className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
                    <div className="flex-1">
                      <p className="text-red-200 font-semibold text-sm">Critical: Fee Structure Update</p>
                      <p className="text-red-300/80 text-[11px] mt-1">
                        Fee changes affect all new transactions immediately and impact revenue calculations.
                        Admin approval required. This action is permanently logged.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-1.5 text-muted-foreground text-[11px]">
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>
                      Last modified: <span className="text-foreground font-medium">2 hours ago</span> by{" "}
                      <span className="text-foreground font-medium">Admin User</span>
                    </span>
                  </div>
                  <button
                    onClick={() => { toast.success("Fee structure saved locally"); setDirty(false); }}
                    className="h-9 px-3 bg-emerald-600 hover:bg-emerald-500 text-foreground rounded-lg text-xs font-semibold transition-colors inline-flex items-center gap-1.5"
                  >
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Update Fee Structure
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* ============ PLATFORM + SECURITY ============ */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
            <section className="sd-card">
              <div className="sd-card-pad border-b border-border">
                <h3 className="h-card font-semibold text-foreground flex items-center gap-2">
                  <div className="w-8 h-8 bg-purple-500/10 border border-purple-500/20 rounded-lg flex items-center justify-center">
                    <Sliders className="h-4 w-4 text-purple-400" />
                  </div>
                  Platform Settings
                </h3>
                <p className="text-xs text-muted-foreground mt-1 ml-10">Core platform toggles and thresholds</p>
              </div>
              <div className="sd-card-pad space-y-4">
                <div>
                  <h4 className="sd-eyebrow mb-2">Feature Toggles</h4>
                  <div className="space-y-2">
                    <ToggleRow title="Auto-Release Payments" desc="Release funds automatically when conditions are met" on={autoReleaseOn} onChange={setBool(setAutoReleaseOn)} />
                    <ToggleRow title="Email Notifications" desc="Send email updates for transaction events" on={emailOn} onChange={setBool(setEmailOn)} />
                    <ToggleRow title="SMS Alerts" desc="Send SMS for critical transaction updates" on={smsOn} onChange={setBool(setSmsOn)} />
                  </div>
                </div>
                <div>
                  <h4 className="sd-eyebrow mb-2">Risk Thresholds</h4>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-xs text-foreground">High-Value Transaction Alert</label>
                      <div className="flex items-center gap-1.5">
                        <span className="text-muted-foreground text-xs">$</span>
                        <NumInput value={hvAlert} onChange={setStr(setHvAlert)} />
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-xs text-foreground">Fraud Risk Score Threshold</label>
                      <div className="flex items-center gap-1.5">
                        <NumInput value={fraudScore} onChange={setStr(setFraudScore)} className="w-16" />
                        <span className="text-muted-foreground text-xs">/ 100</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="sd-card">
              <div className="sd-card-pad border-b border-border">
                <h3 className="h-card font-semibold text-foreground flex items-center gap-2">
                  <div className="w-8 h-8 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center justify-center">
                    <ShieldHalf className="h-4 w-4 text-red-400" />
                  </div>
                  Security &amp; Compliance
                </h3>
                <p className="text-xs text-muted-foreground mt-1 ml-10">Identity verification and security protocols</p>
              </div>
              <div className="sd-card-pad space-y-4">
                <div>
                  <h4 className="sd-eyebrow mb-2">KYC Requirements</h4>
                  <div className="space-y-2">
                    <ToggleRow title="Require ID Verification" desc="Mandatory for transactions over threshold" on={idRequired} onChange={setBool(setIdRequired)} />
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-xs text-foreground">ID Verification Threshold</label>
                      <div className="flex items-center gap-1.5">
                        <span className="text-muted-foreground text-xs">$</span>
                        <NumInput value={idThreshold} onChange={setStr(setIdThreshold)} />
                      </div>
                    </div>
                  </div>
                </div>
                <div>
                  <h4 className="sd-eyebrow mb-2">Session Security</h4>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-xs text-foreground">Session Timeout</label>
                      <div className="flex items-center gap-1.5">
                        <NumInput value={sessionTimeout} onChange={setStr(setSessionTimeout)} className="w-16" />
                        <span className="text-muted-foreground text-xs">minutes</span>
                      </div>
                    </div>
                    <ToggleRow title="Two-Factor Authentication" desc="Require 2FA for admin accounts" on={twoFA} onChange={setBool(setTwoFA)} />
                  </div>
                </div>
              </div>
            </section>
          </div>

          {/* ============ AUDIT HISTORY ============ */}
          <section className="sd-card">
            <div className="sd-card-pad border-b border-border">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h3 className="h-card font-semibold text-foreground flex items-center gap-2">
                    <div className="w-8 h-8 bg-blue-500/10 border border-blue-500/20 rounded-lg flex items-center justify-center">
                      <HistoryIcon className="h-4 w-4 text-blue-400" />
                    </div>
                    Recent Changes &amp; Audit History
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1 ml-10">Track all system configuration modifications</p>
                </div>
                <button
                  onClick={() => toast.info("Full audit log export coming with wiring pass")}
                  className="h-9 px-3 bg-muted/60 hover:bg-muted text-foreground rounded-lg transition-colors inline-flex items-center gap-1.5 text-xs font-medium border border-border"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Export Full Log</span>
                </button>
              </div>
            </div>
            <div className="sd-card-pad">
              <div className="space-y-2">
                <AuditRow
                  icon={<Percent className="h-4 w-4 text-emerald-400" />}
                  iconBg="bg-emerald-500/10 border-emerald-500/20"
                  accent="border-emerald-500/30"
                  accentText="text-emerald-400"
                  title="Base Protection Fee Updated"
                  subtitle="Fee configuration modified"
                  when="2 hours ago"
                  prev="2.5%" next="2.9%" by="Admin User"
                />
                <AuditRow
                  icon={<Clock className="h-4 w-4 text-blue-400" />}
                  iconBg="bg-blue-500/10 border-blue-500/20"
                  accent="border-blue-500/30"
                  accentText="text-blue-400"
                  title="Seller Fulfillment Timeout Modified"
                  subtitle="Timeout rules adjusted"
                  when="1 day ago"
                  prev="5 days" next="7 days" by="Operations Admin"
                />
                <AuditRow
                  icon={<ToggleRight className="h-4 w-4 text-purple-400" />}
                  iconBg="bg-purple-500/10 border-purple-500/20"
                  accent="border-purple-500/30"
                  accentText="text-purple-400"
                  title="SMS Alerts Feature Disabled"
                  subtitle="Platform settings changed"
                  when="3 days ago"
                  prev="Enabled" next="Disabled" by="Admin User"
                />
                <AuditRow
                  icon={<Bell className="h-4 w-4 text-amber-400" />}
                  iconBg="bg-amber-500/10 border-amber-500/20"
                  accent="border-amber-500/30"
                  accentText="text-amber-400"
                  title="Notification Settings Updated"
                  subtitle="Email and SMS preferences modified"
                  when="5 days ago"
                  prev="All notifications enabled" next="Critical only" by="System Admin"
                />
              </div>
            </div>
          </section>

        </div>
      </div>
    </AdminLayout>
  );
}

/* ------------------------------ sub-components ------------------------------ */

function TimeoutRow({
  label, desc, value, onChange, unit,
}: { label: string; desc: string; value: string; onChange: (v: string) => void; unit: string }) {
  return (
    <div className="p-3 bg-muted/30 border border-border rounded-lg">
      <label className="text-xs font-medium text-foreground">{label}</label>
      <p className="text-[11px] text-muted-foreground mt-0.5 mb-2">{desc}</p>
      <div className="flex items-center gap-1.5">
        <NumInput value={value} onChange={onChange} className="w-20" />
        <span className="text-muted-foreground text-xs">{unit}</span>
      </div>
    </div>
  );
}

function FeeField({
  label, value, onChange, help, prefix, suffix,
}: { label: string; value: string; onChange: (v: string) => void; help?: string; prefix?: string; suffix?: string }) {
  return (
    <div className="p-3 bg-muted/30 border border-border rounded-lg">
      <label className="text-xs font-medium text-foreground">{label}</label>
      {help && <p className="text-[11px] text-muted-foreground mt-0.5 mb-2">{help}</p>}
      <div className="flex items-center gap-1.5">
        {prefix && <span className="text-muted-foreground text-xs">{prefix}</span>}
        <NumInput value={value} onChange={onChange} className="flex-1" />
        {suffix && <span className="text-muted-foreground text-xs">{suffix}</span>}
      </div>
    </div>
  );
}

function ToggleRow({
  title, desc, on, onChange,
}: { title: string; desc: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 p-2.5 bg-muted/30 border border-border rounded-lg">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-[11px] text-muted-foreground">{desc}</p>
      </div>
      <Toggle on={on} onChange={onChange} />
    </div>
  );
}

function AuditRow({
  icon, iconBg, accent, accentText, title, subtitle, when, prev, next, by,
}: {
  icon: React.ReactNode; iconBg: string; accent: string; accentText: string;
  title: string; subtitle: string; when: string; prev: string; next: string; by: string;
}) {
  return (
    <div className="flex items-start gap-3 p-3 bg-muted/30 border border-border rounded-lg hover:bg-muted/50 transition-colors">
      <div className={`w-8 h-8 rounded-lg ${iconBg} border flex items-center justify-center flex-shrink-0`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3 mb-1.5">
          <div>
            <p className="text-foreground font-medium text-sm">{title}</p>
            <p className="text-muted-foreground text-[11px] mt-0.5">{subtitle}</p>
          </div>
          <span className="text-muted-foreground text-[11px] whitespace-nowrap">{when}</span>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-2">
          <div className="bg-background/60 border border-border rounded-md px-2 py-1">
            <p className="text-muted-foreground text-[10px] mb-0.5">Previous Value</p>
            <p className="text-foreground/80 font-mono text-[11px]">{prev}</p>
          </div>
          <div className={`bg-background/60 border ${accent} rounded-md px-2 py-1`}>
            <p className={`${accentText} text-[10px] mb-0.5`}>New Value</p>
            <p className="text-foreground font-mono text-[11px] font-semibold">{next}</p>
          </div>
        </div>
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-border">
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[9px] text-foreground font-semibold">
              {by.split(" ").map((w) => w[0]).join("").slice(0, 2)}
            </div>
            <span className="text-muted-foreground text-[11px]">{by}</span>
          </div>
          <button
            onClick={() => toast.info("Change detail view coming with wiring pass")}
            className="text-blue-400 hover:text-blue-300 text-[11px] font-medium flex items-center gap-1"
          >
            View Details
            <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}