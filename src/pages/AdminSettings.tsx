import { useState, useEffect } from "react";
import {
  Clock, Percent, ShieldCheck, ShieldAlert, History as HistoryIcon,
  TriangleAlert, Layers, DollarSign, Coins, Crown, Sliders, ShieldHalf,
  ToggleRight, Bell, Download, ArrowRight, RotateCcw, AlertTriangle, Building2,
  ShoppingCart, Power, Image as ImageIcon,
} from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { toast } from "@/components/ui/sonner";
import {
  fetchAdminSettings, saveAdminSettings, searchVendors,
  fetchSettingsAudit,
  type VendorLite, type SettingsAuditRow,
} from "@/services/admin-settings.service";
import { formatDistanceToNow } from "date-fns";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useAdminPermissions } from "@/context/AdminPermissionsContext";

/** Keys whose values change money behaviour — mirror of the edge function gate. */
const isFinancialSettingKey = (key: string) =>
  key.startsWith("pricing.") || key === "fees.refund_policy";

/* ---- audit value formatting ---- */
function formatSettingValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number" || typeof v === "string") return String(v);
  try {
    const s = JSON.stringify(v);
    return s.length > 80 ? `${s.slice(0, 77)}…` : s;
  } catch { return String(v); }
}

function auditRowsToCsv(rows: SettingsAuditRow[]): string {
  const header = ["created_at","admin","action_type","target","changed_keys","before","after","reason","ip"];
  const esc = (s: unknown) => {
    const str = s === null || s === undefined ? "" : (typeof s === "string" ? s : JSON.stringify(s));
    return `"${str.replace(/"/g, '""')}"`;
  };
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push([
      esc(r.created_at),
      esc(r.admin_name ?? r.admin_user_id),
      esc(r.action_type),
      esc(r.target_name ?? r.target_user_id ?? ""),
      esc(r.changed_keys.join("|")),
      esc(r.before),
      esc(r.after),
      esc(r.reason ?? ""),
      esc(r.ip ?? ""),
    ].join(","));
  }
  return lines.join("\n");
}

/* ------------------------------ primitives ------------------------------ */

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className={`w-10 h-11 rounded-full relative cursor-pointer transition-colors ${
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
      className={`${className} h-9 px-2 bg-muted/40 border border-border rounded-lg text-foreground text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary/40 relative before:absolute before:-inset-2 before:content-['']`}
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
              <span className="text-amber-400 font-medium text-xs">Production</span>
            </div>
            <div className="hidden lg:inline-flex items-center gap-1 px-2 py-0.5 bg-muted border border-border rounded-full">
              <ShieldCheck className="h-3 w-3 text-emerald-400" />
              <span className="text-muted-foreground text-xs">All changes audited</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-border overflow-hidden">
            <button
              onClick={() => setScope("platform")}
              className={`h-11 px-3 text-xs font-medium transition-colors ${scope === "platform" ? "bg-primary/20 text-foreground" : "bg-muted/40 text-muted-foreground hover:bg-muted"}`}
            >Platform</button>
            <button
              onClick={() => setScope("vendor")}
              className={`h-11 px-3 text-xs font-medium transition-colors border-l border-border ${scope === "vendor" ? "bg-primary/20 text-foreground" : "bg-muted/40 text-muted-foreground hover:bg-muted"}`}
            >Vendor</button>
          </div>
          <button
            onClick={() => toast.info("Audit history will open when wired to admin_actions")}
            className="h-11 px-3 inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/60 text-foreground text-xs font-medium hover:bg-muted transition-colors"
          >
            <HistoryIcon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">View History</span>
          </button>
          <button
            onClick={onSave}
            disabled={!dirty}
            className={`h-11 px-3 inline-flex items-center gap-1.5 rounded-lg text-xs font-semibold text-foreground transition-colors ${
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
              className="flex-1 h-9 px-2 bg-background border border-border rounded-md text-sm text-foreground relative before:absolute before:-inset-2 before:content-['']"
            />
            <select
              value={vendorId ?? ""}
              onChange={(e) => setVendorId(e.target.value || null)}
              className="h-9 px-2 bg-background border border-border rounded-md text-sm text-foreground min-w-[220px] relative before:absolute before:-inset-2 before:content-['']"
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
          <label className="inline-flex items-center gap-2 text-xs text-muted-foreground cursor-pointer min-h-11">
            <input
              type="checkbox"
              checked={applyToAll}
              onChange={(e) => setApplyToAll(e.target.checked)}
              className="accent-primary min-h-11 inline-flex items-center"
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
            <p className="text-red-300/80 text-xs mt-1">
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
  // Money-behaviour keys additionally require `financial_controls.configure`.
  const { has: hasPermission } = useAdminPermissions();
  const canConfigureFinancial = hasPermission("financial_controls.configure");
  // Which keys currently have a vendor-scoped override for the selected vendor
  const [overriddenKeys, setOverriddenKeys] = useState<Set<string>>(new Set());
  const isOverridden = (key: string) => scope === "vendor" && overriddenKeys.has(key);
  // Aggregate vendor overrides across all vendors (platform tab)
  const [vendorOverrides, setVendorOverrides] = useState<
    Array<{ setting_key: string; vendor_id: string; setting_value: unknown; updated_at: string | null }>
  >([]);
  const [overrideCounts, setOverrideCounts] = useState<Record<string, number>>({});
  // Audit history
  const [auditRows, setAuditRows] = useState<SettingsAuditRow[]>([]);
  // Which timeout rules have a vendor-scoped override for the selected vendor
  const [overriddenTimeouts, setOverriddenTimeouts] = useState<Set<string>>(new Set());
  const isTimeoutOverridden = (ruleType: string) =>
    scope === "vendor" && overriddenTimeouts.has(ruleType);

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
  const [hvAlert, setHvAlert] = useState("500000");
  const [fraudScore, setFraudScore] = useState("75");

  // Security
  const [idRequired, setIdRequired] = useState(true);
  const [idThreshold, setIdThreshold] = useState("100000");
  const [sessionTimeout, setSessionTimeout] = useState("30");
  const [twoFA, setTwoFA] = useState(true);
  const [twoFAEnforced, setTwoFAEnforced] = useState(false);
  const [makerChecker, setMakerChecker] = useState(false);

  // Commerce (kill switches)
  const [checkoutEnabled, setCheckoutEnabled] = useState(false);
  const [addToCartEnabled, setAddToCartEnabled] = useState(false);
  const [disabledReason, setDisabledReason] = useState(
    "Checkout is not yet available. We're preparing the platform — you can browse and set up your account in the meantime.",
  );
  const [cartDisabledReason, setCartDisabledReason] = useState(
    "Cart is temporarily unavailable. You can still buy this item now — checkout works normally.",
  );
  const [checkoutDisabledReason, setCheckoutDisabledReason] = useState(
    "Checkout is not yet available. We're preparing the platform — you can browse and set up your account in the meantime.",
  );

  // Media standards (product photo / video quality bar)
  const [mediaMinDim, setMediaMinDim] = useState("800");
  const [mediaRecommendedMin, setMediaRecommendedMin] = useState("1600");
  const [mediaMaxMb, setMediaMaxMb] = useState("3");
  const [mediaMinImages, setMediaMinImages] = useState("3");
  const [mediaMaxImages, setMediaMaxImages] = useState("10");
  const [mediaMaxVideos, setMediaMaxVideos] = useState("1");
  const [mediaAutoNormalise, setMediaAutoNormalise] = useState(true);
  const [mediaServerVerification, setMediaServerVerification] = useState(true);
  const [mediaAdvisories, setMediaAdvisories] = useState(true);
  const [videoMaxSeconds, setVideoMaxSeconds] = useState("60");
  const [videoMinHeight, setVideoMinHeight] = useState("720");
  const [videoMaxMb, setVideoMaxMb] = useState("50");

  // Meta for the auto-release toggle: who flipped it and when (stamped by DB trigger).
  const [autoReleaseMeta, setAutoReleaseMeta] = useState<{ enabled_by: string | null; enabled_at: string | null } | null>(null);

  // Save-reason modal (replaces window.prompt for audit-log entry)
  const [reasonModalOpen, setReasonModalOpen] = useState(false);
  const [reasonText, setReasonText] = useState("");
  const [savingWithReason, setSavingWithReason] = useState(false);

  const setStr = (fn: (v: string) => void) => (v: string) => { fn(v); mark(); };
  const setBool = (fn: (v: boolean) => void) => (v: boolean) => { fn(v); mark(); };

  // Load from backend when scope/vendor changes
  useEffect(() => {
    (async () => {
      try {
        const payload = await fetchAdminSettings(scope === "vendor" ? vendorId : null);
        const byKey: Record<string, any> = {};
        const overrideMap: Record<string, boolean> = {};
        const overriddenSet = new Set<string>();
        (payload.settings ?? []).forEach((r) => {
          if (r.scope === "platform") overrideMap[r.setting_key] = r.is_overridable !== false;
          if (scope === "vendor" && r.scope === "vendor" && r.vendor_id === vendorId) {
            overriddenSet.add(r.setting_key);
          }
          // vendor row wins when present
          const isMatch = scope === "vendor"
            ? (r.scope === "vendor" && r.vendor_id === vendorId) || (r.scope === "platform" && !byKey[r.setting_key])
            : r.scope === "platform";
          if (isMatch) byKey[r.setting_key] = r.setting_value;
        });
        setOverridable(overrideMap);
        setOverriddenKeys(overriddenSet);
        setVendorOverrides(payload.vendor_overrides ?? []);
        setOverrideCounts(payload.override_counts ?? {});
        const num = (v: unknown, d: string) => (v == null ? d : String(v));
        if (byKey["pricing.min_platform_fee_ngn"] != null) setMinFee(num(byKey["pricing.min_platform_fee_ngn"], "250"));
        if (byKey["pricing.max_total_service_fee_ngn"] != null) setFeeCap(num(byKey["pricing.max_total_service_fee_ngn"], "2500"));
        if (byKey["security.id_verification_threshold"] != null) setIdThreshold(num(byKey["security.id_verification_threshold"], "100000"));
        if (byKey["risk.high_value_alert_ngn"] != null) setHvAlert(num(byKey["risk.high_value_alert_ngn"], "500000"));
        if (byKey["security.require_id_verification"] != null) setIdRequired(Boolean(byKey["security.require_id_verification"]));
        if (byKey["security.session_timeout_minutes"] != null) setSessionTimeout(num(byKey["security.session_timeout_minutes"], "30"));
        if (byKey["security.two_factor_admin"] != null) setTwoFA(Boolean(byKey["security.two_factor_admin"]));
        if (byKey["security.two_factor_admin_enforced"] != null) setTwoFAEnforced(Boolean(byKey["security.two_factor_admin_enforced"]));
        if (byKey["finance.maker_checker_enforced"] != null) setMakerChecker(Boolean(byKey["finance.maker_checker_enforced"]));
        if (byKey["notifications.email_enabled"] != null) setEmailOn(Boolean(byKey["notifications.email_enabled"]));
        if (byKey["notifications.sms_enabled"] != null) setSmsOn(Boolean(byKey["notifications.sms_enabled"]));
        if (byKey["escrow.auto_release_enabled"] != null) setAutoReleaseOn(Boolean(byKey["escrow.auto_release_enabled"]));
        if (byKey["commerce.checkout_enabled"] != null) setCheckoutEnabled(Boolean(byKey["commerce.checkout_enabled"]));
        if (byKey["commerce.add_to_cart_enabled"] != null) setAddToCartEnabled(Boolean(byKey["commerce.add_to_cart_enabled"]));
        if (typeof byKey["commerce.disabled_reason"] === "string") setDisabledReason(String(byKey["commerce.disabled_reason"]));
        if (typeof byKey["commerce.cart_disabled_reason"] === "string") setCartDisabledReason(String(byKey["commerce.cart_disabled_reason"]));
        if (typeof byKey["commerce.checkout_disabled_reason"] === "string") setCheckoutDisabledReason(String(byKey["commerce.checkout_disabled_reason"]));
        if (byKey["media.image_min_dimension_px"] != null) setMediaMinDim(String(byKey["media.image_min_dimension_px"]));
        if (byKey["media.image_recommended_min_px"] != null) setMediaRecommendedMin(String(byKey["media.image_recommended_min_px"]));
        if (byKey["media.image_max_bytes"] != null) setMediaMaxMb(String(Math.round((Number(byKey["media.image_max_bytes"]) / (1024 * 1024)) * 10) / 10));
        if (byKey["media.product_min_images_to_publish"] != null) setMediaMinImages(String(byKey["media.product_min_images_to_publish"]));
        if (byKey["media.product_max_images"] != null) setMediaMaxImages(String(byKey["media.product_max_images"]));
        if (byKey["media.product_max_videos"] != null) setMediaMaxVideos(String(byKey["media.product_max_videos"]));
        if (byKey["media.image_auto_normalise_ratio"] != null) setMediaAutoNormalise(Boolean(byKey["media.image_auto_normalise_ratio"]));
        if (byKey["media.server_verification_enabled"] != null) setMediaServerVerification(Boolean(byKey["media.server_verification_enabled"]));
        if (byKey["media.quality_advisories_enabled"] != null) setMediaAdvisories(Boolean(byKey["media.quality_advisories_enabled"]));
        if (byKey["media.video_max_seconds"] != null) setVideoMaxSeconds(String(byKey["media.video_max_seconds"]));
        if (byKey["media.video_min_height_px"] != null) setVideoMinHeight(String(byKey["media.video_min_height_px"]));
        if (byKey["media.video_max_bytes"] != null) setVideoMaxMb(String(Math.round(Number(byKey["media.video_max_bytes"]) / (1024 * 1024))));
        // Capture audit meta for the effective auto-release row.
        const arRow = (payload.settings ?? []).find((r) => {
          if (r.setting_key !== "escrow.auto_release_enabled") return false;
          if (scope === "vendor") return r.scope === "vendor" && r.vendor_id === vendorId;
          return r.scope === "platform";
        });
        setAutoReleaseMeta(arRow ? { enabled_by: (arRow as any).auto_release_enabled_by ?? null, enabled_at: (arRow as any).auto_release_enabled_at ?? null } : null);
        // Timeouts (hours)
        (payload.timeouts ?? []).forEach((t) => {
          const match = scope === "vendor"
            ? (t.scope === "vendor" && t.vendor_id === vendorId) || t.scope === "platform"
            : t.scope === "platform";
          if (!match) return;
          if (t.rule_type === "seller_fulfillment_timeout") setSellerFulfil(String(Math.round(t.hours_until_trigger / 24)));
          if (t.rule_type === "buyer_verification_timeout") setBuyerVerify(String(t.hours_until_trigger));
        });
        const tSet = new Set<string>();
        (payload.timeouts ?? []).forEach((t) => {
          if (scope === "vendor" && t.scope === "vendor" && t.vendor_id === vendorId) tSet.add(t.rule_type);
        });
        setOverriddenTimeouts(tSet);
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

  // Audit history — refresh on load and after successful save
  const loadAudit = async () => {
    try { setAuditRows(await fetchSettingsAudit(15)); } catch { /* ignore */ }
  };
  useEffect(() => { loadAudit(); }, []);

  function handleSave() {
    if (scope === "vendor" && !vendorId) {
      toast.error("Pick a vendor first");
      return;
    }
    setReasonText("");
    setReasonModalOpen(true);
  }

  async function doSaveWithReason(reason: string) {
    const updates: Record<string, unknown> = {
      "pricing.min_platform_fee_ngn": Number(minFee),
      "pricing.max_total_service_fee_ngn": Number(feeCap),
      "security.require_id_verification": idRequired,
      "security.id_verification_threshold": Number(idThreshold),
      "security.session_timeout_minutes": Number(sessionTimeout),
      "security.two_factor_admin": twoFA,
      "security.two_factor_admin_enforced": twoFAEnforced,
      "finance.maker_checker_enforced": makerChecker,
      "notifications.email_enabled": emailOn,
      "notifications.sms_enabled": smsOn,
      "escrow.auto_release_enabled": autoReleaseOn,
      "fees.refund_policy": refundPolicy,
      "risk.high_value_alert_ngn": Number(hvAlert),
      "commerce.checkout_enabled": checkoutEnabled,
      "commerce.add_to_cart_enabled": addToCartEnabled,
      "commerce.disabled_reason": disabledReason,
      "commerce.cart_disabled_reason": cartDisabledReason,
      "commerce.checkout_disabled_reason": checkoutDisabledReason,
      "media.image_min_dimension_px": Number(mediaMinDim),
      "media.image_recommended_min_px": Number(mediaRecommendedMin),
      "media.image_max_bytes": Math.round(Number(mediaMaxMb) * 1024 * 1024),
      "media.product_min_images_to_publish": Number(mediaMinImages),
      "media.product_max_images": Number(mediaMaxImages),
      "media.product_max_videos": Number(mediaMaxVideos),
      "media.image_auto_normalise_ratio": mediaAutoNormalise,
      "media.server_verification_enabled": mediaServerVerification,
      "media.quality_advisories_enabled": mediaAdvisories,
      "media.video_max_seconds": Number(videoMaxSeconds),
      "media.video_min_height_px": Number(videoMinHeight),
      "media.video_max_bytes": Math.round(Number(videoMaxMb) * 1024 * 1024),
    };
    // In vendor scope, strip keys the platform marked non-overridable AND
    // any key the catalog declares as not writable at the vendor scope
    // (e.g. platform-only controls like session timeout, 2FA-admin).
    if (scope === "vendor") {
      const { SETTINGS_CATALOG } = await import("@/lib/settings-catalog");
      const vendorWritable = new Set(
        SETTINGS_CATALOG.filter((e) => e.writable.includes("vendor")).map((e) => e.key),
      );
      for (const k of Object.keys(updates)) {
        if (overridable[k] === false) { delete updates[k]; continue; }
        if (!vendorWritable.has(k)) delete updates[k];
      }
    }
    // Without `financial_controls.configure` the server rejects money keys;
    // drop them client-side so the rest of the save still succeeds.
    if (!canConfigureFinancial) {
      for (const k of Object.keys(updates)) {
        if (isFinancialSettingKey(k)) delete updates[k];
      }
    }
    const timeouts = [
      { rule_type: "seller_fulfillment_timeout", hours: Number(sellerFulfil) * 24 },
      { rule_type: "buyer_verification_timeout", hours: Number(buyerVerify) },
    ];
    setSavingWithReason(true);
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
      loadAudit();
      setReasonModalOpen(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Save failed");
    } finally {
      setSavingWithReason(false);
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
                  <span className="text-blue-300 text-xs font-medium">4 Business Rules</span>
                </div>
              </div>
            </div>
            <div className="sd-card-pad">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
                <TimeoutRow label="Seller Fulfillment Timeout" desc="Time given to sellers to fulfill orders after payment" value={sellerFulfil} onChange={setStr(setSellerFulfil)} unit="days" overridden={isTimeoutOverridden("seller_fulfillment_timeout")} />
                <TimeoutRow label="Buyer Verification Window" desc="Time buyer has to verify item after delivery" value={buyerVerify} onChange={setStr(setBuyerVerify)} unit="hours" overridden={isTimeoutOverridden("buyer_verification_timeout")} />
                <TimeoutRow
                  label="Auto-Release After Delivery"
                  desc="Auto-release escrow if buyer takes no action"
                  value={autoRelease}
                  onChange={setStr(setAutoRelease)}
                  unit="hours"
                  disabled={!autoReleaseOn}
                  disabledHint="Auto-Release is OFF — payouts require manual admin release."
                />
                <TimeoutRow label="Payment Session Expiry" desc="How long a Paystack payment session stays open" value={paymentExpiry} onChange={setStr(setPaymentExpiry)} unit="minutes" />
              </div>
              <div className="mt-4 pt-4 border-t border-border">
                <div className="bg-amber-500/10 border-l-4 border-amber-500 rounded-lg p-3 mb-4 sd-alert">
                  <div className="flex items-start gap-2">
                    <ShieldAlert className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
                    <div className="flex-1">
                      <p className="text-amber-200 font-semibold text-sm">Production Change Impact</p>
                      <p className="text-amber-300/80 text-xs mt-1">
                        Changes apply to new transactions only. Active transactions retain original timeout values.
                        This action will be permanently logged in audit history.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>
                      Last modified: <span className="text-foreground font-medium">2 days ago</span> by{" "}
                      <span className="text-foreground font-medium">Admin User</span>
                    </span>
                  </div>
                  <button
                    onClick={() => { toast.success("Timeout rules saved locally"); setDirty(false); }}
                    className="h-11 px-3 bg-blue-600 hover:bg-blue-500 text-foreground rounded-lg text-xs font-semibold transition-colors inline-flex items-center gap-1.5"
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
                <div className="flex items-center gap-2">
                  {!canConfigureFinancial && (
                    <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded-full">
                      <ShieldAlert className="h-3 w-3 text-amber-400" />
                      <span className="text-amber-300 text-xs font-medium">Read-only — needs financial access</span>
                    </div>
                  )}
                  <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
                    <Coins className="h-3 w-3 text-emerald-400" />
                    <span className="text-emerald-300 text-xs font-medium">Active Rules</span>
                  </div>
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
                  <FeeField label="Minimum Platform Fee" prefix="₦" value={minFee} onChange={setStr(setMinFee)} help="Floor charged even on small orders" locked={isLocked("pricing.min_platform_fee_ngn") || !canConfigureFinancial} overridden={isOverridden("pricing.min_platform_fee_ngn")} />
                  <FeeField label="Total Service Fee Cap" prefix="₦" value={feeCap} onChange={setStr(setFeeCap)} help="Buyer-friendly ceiling on service fees" locked={isLocked("pricing.max_total_service_fee_ngn") || !canConfigureFinancial} overridden={isOverridden("pricing.max_total_service_fee_ngn")} />
                </div>
              </div>

              <div className="mb-4 pb-4 border-b border-border">
                <h4 className="sd-eyebrow mb-3 flex items-center gap-1.5">
                  <Crown className="h-3 w-3 text-amber-400" />
                  Special Category Fee Caps
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                  <FeeField label="High-Value Tier Rate" suffix="%" value={hvRate} onChange={setStr(setHvRate)} help="Rate for transactions above ₦2,000,000" overridden={isOverridden("pricing.tier_rates")} />
                  <div className={`p-3 bg-muted/30 border border-border rounded-lg ${isLocked("fees.refund_policy") ? "opacity-60" : ""}`}>
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-xs font-medium text-foreground">Refund Policy</label>
                      {isLocked("fees.refund_policy") ? (
                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300">Platform-only</span>
                      ) : isOverridden("fees.refund_policy") ? (
                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-300">Overridden</span>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 mb-2">Whether service fees are refundable</p>
                    <select
                      value={refundPolicy}
                      disabled={isLocked("fees.refund_policy") || !canConfigureFinancial}
                      onChange={(e) => setStr(setRefundPolicy)(e.target.value)}
                      className={`w-full h-11 px-2 bg-muted/40 border border-border rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 ${isLocked("fees.refund_policy") || !canConfigureFinancial ? "cursor-not-allowed" : ""}`}
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
                      <p className="text-red-300/80 text-xs mt-1">
                        Fee changes affect all new transactions immediately and impact revenue calculations.
                        Admin approval required. This action is permanently logged.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-end flex-wrap gap-2">
                  <button
                    onClick={() => { toast.success("Fee structure saved locally"); setDirty(false); }}
                    className="h-11 px-3 bg-emerald-600 hover:bg-emerald-500 text-foreground rounded-lg text-xs font-semibold transition-colors inline-flex items-center gap-1.5"
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
                    <ToggleRow title="Auto-Release Payments" desc="Release funds automatically when conditions are met" on={autoReleaseOn} onChange={setBool(setAutoReleaseOn)} overridden={isOverridden("escrow.auto_release_enabled")} />
                    {autoReleaseOn && (autoReleaseMeta?.enabled_by || autoReleaseMeta?.enabled_at) && (
                      <p className="text-xs text-muted-foreground pl-2.5">
                        Enabled
                        {autoReleaseMeta?.enabled_by ? <> by <span className="text-foreground/80 font-mono">{autoReleaseMeta.enabled_by.slice(0, 8)}…</span></> : null}
                        {autoReleaseMeta?.enabled_at ? <> on <span className="text-foreground/80">{format(new Date(autoReleaseMeta.enabled_at), "MMM d, yyyy · p")}</span></> : null}
                      </p>
                    )}
                    <ToggleRow title="Email Notifications" desc="Send email updates for transaction events" on={emailOn} onChange={setBool(setEmailOn)} overridden={isOverridden("notifications.email_enabled")} />
                    <ToggleRow title="SMS Alerts" desc="Send SMS for critical transaction updates" on={smsOn} onChange={setBool(setSmsOn)} overridden={isOverridden("notifications.sms_enabled")} />
                  </div>
                </div>
                <div>
                  <h4 className="sd-eyebrow mb-2">Risk Thresholds</h4>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-xs text-foreground flex items-center gap-1.5">
                        High-Value Transaction Alert
                        {isOverridden("risk.high_value_alert_ngn") && <OverrideBadge />}
                      </label>
                      <div className="flex items-center gap-1.5">
                        <span className="text-muted-foreground text-xs">₦</span>
                        <NumInput value={hvAlert} onChange={setStr(setHvAlert)} />
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-xs text-foreground flex items-center gap-1.5">
                        Fraud Risk Score Threshold
                        {isOverridden("risk.fraud_score_threshold") && <OverrideBadge />}
                      </label>
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
                    <ToggleRow title="Require ID Verification" desc="Mandatory for transactions over threshold" on={idRequired} onChange={setBool(setIdRequired)} overridden={isOverridden("security.require_id_verification")} />
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-xs text-foreground flex items-center gap-1.5">
                        ID Verification Threshold
                        {isOverridden("security.id_verification_threshold") && <OverrideBadge />}
                      </label>
                      <div className="flex items-center gap-1.5">
                        <span className="text-muted-foreground text-xs">₦</span>
                        <NumInput value={idThreshold} onChange={setStr(setIdThreshold)} />
                      </div>
                    </div>
                  </div>
                </div>
                <div>
                  <h4 className="sd-eyebrow mb-2">Session Security</h4>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-xs text-foreground flex items-center gap-1.5">
                        Session Timeout
                        {isOverridden("security.session_timeout_minutes") && <OverrideBadge />}
                      </label>
                      <div className="flex items-center gap-1.5">
                        <NumInput value={sessionTimeout} onChange={setStr(setSessionTimeout)} className="w-16" />
                        <span className="text-muted-foreground text-xs">minutes</span>
                      </div>
                    </div>
                    <ToggleRow
                      title="Two-Factor Authentication (advisory)"
                      desc={twoFAEnforced
                        ? "Policy signal. Enforcement is active via the switch below."
                        : "Policy signal only — this does NOT block sign-in. Admin access is not gated until enforcement is turned on."}
                      on={twoFA}
                      onChange={setBool(setTwoFA)}
                      overridden={isOverridden("security.two_factor_admin")}
                    />
                    <ToggleRow
                      title="Enforce 2FA for admins"
                      desc="Rejects admin API calls from sessions without a second factor (AAL2). Leave off until every internal user has enrolled."
                      on={twoFAEnforced}
                      onChange={setBool(setTwoFAEnforced)}
                      overridden={isOverridden("security.two_factor_admin_enforced")}
                    />
                    <ToggleRow
                      title="Maker-checker for money movement"
                      desc="Blocks the admin who flagged or opened a release/refund from executing it. Leave off for single-operator teams — self-approvals are logged either way."
                      on={makerChecker}
                      onChange={setBool(setMakerChecker)}
                      overridden={isOverridden("finance.maker_checker_enforced")}
                    />
                  </div>
                </div>
              </div>
            </section>
          </div>

          {/* ============ COMMERCE (KILL SWITCHES) ============ */}
          <section className="sd-card">
            <div className="sd-card-pad border-b border-border">
              <h3 className="h-card font-semibold text-foreground flex items-center gap-2">
                <div className="w-8 h-8 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-center justify-center">
                  <ShoppingCart className="h-4 w-4 text-amber-400" />
                </div>
                Commerce Availability
              </h3>
              <p className="text-xs text-muted-foreground mt-1 ml-10">
                Master kill switches for transactions. When checkout is OFF, buyers can still browse and onboard —
                they just cannot pay. Vendor overrides apply to that vendor's storefront and cart flows only.
              </p>
            </div>
            <div className="sd-card-pad space-y-4">
              <ToggleRow
                title="Checkout Enabled"
                desc="Master switch for full checkout & payments. Turn OFF to block payments platform-wide."
                on={checkoutEnabled}
                onChange={setBool(setCheckoutEnabled)}
                overridden={isOverridden("commerce.checkout_enabled")}
              />
              <ToggleRow
                title="Add-to-Cart Enabled"
                desc="Controls cart mutations: adding an item and changing quantity. When OFF the button is hidden and the server rejects both — existing cart rows are preserved and can still be removed or checked out (if checkout is ON)."
                on={addToCartEnabled}
                onChange={setBool(setAddToCartEnabled)}
                overridden={isOverridden("commerce.add_to_cart_enabled")}
              />
              <div>
                <label className="text-xs text-foreground flex items-center gap-1.5 mb-1.5">
                  <Power className="h-3.5 w-3.5 text-muted-foreground" />
                  Shown to shoppers when checkout / cart-add is OFF
                </label>
                <textarea
                  value={disabledReason}
                  onChange={(e) => { setDisabledReason(e.target.value); mark(); }}
                  rows={2}
                  className="w-full px-3 py-2 bg-muted/40 border border-border rounded-lg text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/40"
                  placeholder="e.g. Checkout is temporarily paused for maintenance."
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Global override. While this is filled in it replaces both messages below.
                </p>
              </div>
              <div>
                <label className="text-xs text-foreground flex items-center gap-1.5 mb-1.5">
                  <ShoppingCart className="h-3.5 w-3.5 text-muted-foreground" />
                  Cart disabled message
                </label>
                <textarea
                  value={cartDisabledReason}
                  onChange={(e) => { setCartDisabledReason(e.target.value); mark(); }}
                  rows={2}
                  maxLength={300}
                  className="w-full px-3 py-2 bg-muted/40 border border-border rounded-lg text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/40"
                  placeholder="Shown when add-to-cart is OFF."
                />
              </div>
              <div>
                <label className="text-xs text-foreground flex items-center gap-1.5 mb-1.5">
                  <Power className="h-3.5 w-3.5 text-muted-foreground" />
                  Checkout disabled message
                </label>
                <textarea
                  value={checkoutDisabledReason}
                  onChange={(e) => { setCheckoutDisabledReason(e.target.value); mark(); }}
                  rows={2}
                  maxLength={300}
                  className="w-full px-3 py-2 bg-muted/40 border border-border rounded-lg text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/40"
                  placeholder="Shown when checkout is OFF."
                />
              </div>
            </div>
          </section>

          {/* ============ MEDIA STANDARDS ============ */}
          <section className="sd-card">
            <div className="sd-card-pad border-b border-border">
              <h3 className="h-card font-semibold text-foreground flex items-center gap-2">
                <div className="w-8 h-8 bg-primary/10 border border-primary/20 rounded-lg flex items-center justify-center">
                  <ImageIcon className="h-4 w-4 text-primary" />
                </div>
                Product Media Standards
              </h3>
              <p className="text-xs text-muted-foreground mt-1 ml-10">
                The quality bar for seller product photos and video. Enforced in the browser for instant feedback and
                again on the server as the authority. Already-published products are grandfathered and never unpublished.
              </p>
            </div>
            <div className="sd-card-pad space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <NumField label="Min image side (px)" value={mediaMinDim} onChange={setStr(setMediaMinDim)} />
                <NumField label="Recommended long side (px)" value={mediaRecommendedMin} onChange={setStr(setMediaRecommendedMin)} />
                <NumField label="Max image size (MB)" value={mediaMaxMb} onChange={setStr(setMediaMaxMb)} />
                <NumField label="Min images to publish" value={mediaMinImages} onChange={setStr(setMediaMinImages)} />
                <NumField label="Max images" value={mediaMaxImages} onChange={setStr(setMediaMaxImages)} />
                <NumField label="Max videos" value={mediaMaxVideos} onChange={setStr(setMediaMaxVideos)} />
                <NumField label="Min video height (px)" value={videoMinHeight} onChange={setStr(setVideoMinHeight)} />
                <NumField label="Max video length (s)" value={videoMaxSeconds} onChange={setStr(setVideoMaxSeconds)} />
                <NumField label="Max video size (MB)" value={videoMaxMb} onChange={setStr(setVideoMaxMb)} />
              </div>
              <ToggleRow
                title="Auto-normalise aspect ratio"
                desc="ON: odd-shaped photos are padded with a white border to the first allowed ratio and the seller is shown the result — nothing is cropped. OFF: those photos are rejected instead."
                on={mediaAutoNormalise}
                onChange={setBool(setMediaAutoNormalise)}
                overridden={isOverridden("media.image_auto_normalise_ratio")}
              />
              <ToggleRow
                title="Server-side verification"
                desc="Kill switch. ON: every product upload is re-read from the media provider and validated against these limits (a direct API call cannot bypass them). OFF: only the browser checks apply — emergency use only."
                on={mediaServerVerification}
                onChange={setBool(setMediaServerVerification)}
                overridden={isOverridden("media.server_verification_enabled")}
              />
              <ToggleRow
                title="Quality advisories"
                desc="Show non-blocking hints about background, framing and watermarks. These are heuristics, so they never block an upload."
                on={mediaAdvisories}
                onChange={setBool(setMediaAdvisories)}
                overridden={isOverridden("media.quality_advisories_enabled")}
              />
            </div>
          </section>

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
                  onClick={() => {
                    if (!auditRows.length) { toast.info("No audit rows to export yet"); return; }
                    const csv = auditRowsToCsv(auditRows);
                    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `settings-audit-${format(new Date(), "yyyyMMdd-HHmm")}.csv`;
                    document.body.appendChild(a); a.click(); a.remove();
                    URL.revokeObjectURL(url);
                  }}
                  className="h-11 px-3 bg-muted/60 hover:bg-muted text-foreground rounded-lg transition-colors inline-flex items-center gap-1.5 text-xs font-medium border border-border"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Export Full Log</span>
                </button>
              </div>
            </div>
            <div className="sd-card-pad">
              {auditRows.length === 0 ? (
                <div className="text-xs text-muted-foreground p-3 bg-muted/20 border border-border rounded-lg">
                  No configuration changes recorded yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {auditRows.map((row) => {
                    return <AuditDiffRow key={row.id} row={row} />;
                  })}
                </div>
              )}
            </div>
          </section>

          {/* ============ VENDOR OVERRIDES SUMMARY (platform scope only) ============ */}
          {scope === "platform" && (
            <section className="sd-card">
              <div className="sd-card-pad border-b border-border">
                <h3 className="h-card font-semibold text-foreground flex items-center gap-2">
                  <div className="w-8 h-8 bg-purple-500/10 border border-purple-500/20 rounded-lg flex items-center justify-center">
                    <Building2 className="h-4 w-4 text-purple-400" />
                  </div>
                  Vendor Overrides
                </h3>
                <p className="text-xs text-muted-foreground mt-1 ml-10">
                  Settings currently overridden by individual vendors. Platform defaults apply to everyone else.
                </p>
              </div>
              <div className="sd-card-pad">
                {vendorOverrides.length === 0 ? (
                  <div className="text-xs text-muted-foreground p-3 bg-muted/20 border border-border rounded-lg">
                    No vendor-specific overrides are active.
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                      {Object.entries(overrideCounts).slice(0, 4).map(([k, n]) => (
                        <div key={k} className="p-2 bg-muted/30 border border-border rounded-lg">
                          <p className="text-xs text-muted-foreground truncate">{k}</p>
                          <p className="text-sm font-semibold text-foreground">{n} vendor{n === 1 ? "" : "s"}</p>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-1.5 max-h-60 overflow-auto">
                      {vendorOverrides.slice(0, 20).map((o) => (
                        <div key={`${o.setting_key}-${o.vendor_id}`} className="p-2 bg-muted/20 border border-border rounded flex items-center justify-between gap-2 text-xs">
                          <div className="min-w-0 flex-1">
                            <p className="text-foreground truncate font-mono">{o.setting_key}</p>
                            <p className="text-muted-foreground text-xs truncate">vendor: {o.vendor_id.slice(0, 8)}…</p>
                          </div>
                          <span className="text-foreground font-medium shrink-0">{JSON.stringify(o.setting_value).slice(0, 40)}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </section>
          )}

        </div>
      </div>
      <Dialog open={reasonModalOpen} onOpenChange={(o) => { if (!savingWithReason) setReasonModalOpen(o); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm changes</DialogTitle>
            <DialogDescription>
              Provide a brief reason for this change. It will be recorded in the audit log.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={reasonText}
            onChange={(e) => setReasonText(e.target.value)}
            placeholder="e.g. Raising fee cap for Q4 promo"
            rows={4}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setReasonModalOpen(false)} disabled={savingWithReason}>Cancel</Button>
            <Button
              onClick={() => doSaveWithReason(reasonText)}
              disabled={savingWithReason || reasonText.trim().length < 3}
            >
              {savingWithReason && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirm & Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}

/* ------------------------------ sub-components ------------------------------ */

function TimeoutRow({
  label, desc, value, onChange, unit, overridden, disabled, disabledHint,
}: { label: string; desc: string; value: string; onChange: (v: string) => void; unit: string; overridden?: boolean; disabled?: boolean; disabledHint?: string }) {
  return (
    <div className={`p-3 bg-muted/30 border border-border rounded-lg ${disabled ? "opacity-60" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs font-medium text-foreground">{label}</label>
        {overridden && <OverrideBadge />}
      </div>
      <p className="text-xs text-muted-foreground mt-0.5 mb-2">{disabled && disabledHint ? disabledHint : desc}</p>
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className={`w-20 h-11 px-2 bg-muted/40 border border-border rounded-lg text-foreground text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary/40 ${disabled ? "cursor-not-allowed" : ""}`}
        />
        <span className="text-muted-foreground text-xs">{unit}</span>
      </div>
    </div>
  );
}

function FeeField({
  label, value, onChange, help, prefix, suffix, locked, overridden,
}: { label: string; value: string; onChange: (v: string) => void; help?: string; prefix?: string; suffix?: string; locked?: boolean; overridden?: boolean }) {
  return (
    <div className={`p-3 bg-muted/30 border border-border rounded-lg ${locked ? "opacity-60" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs font-medium text-foreground">{label}</label>
        {locked ? (
          <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300">Platform-only</span>
        ) : overridden ? (
          <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-300">Overridden</span>
        ) : null}
      </div>
      {help && <p className="text-xs text-muted-foreground mt-0.5 mb-2">{help}</p>}
      <div className="flex items-center gap-1.5">
        {prefix && <span className="text-muted-foreground text-xs">{prefix}</span>}
        <input
          type="number"
          value={value}
          readOnly={locked}
          disabled={locked}
          onChange={(e) => onChange(e.target.value)}
          className={` flex-1 h-9 px-2 bg-muted/40 border border-border rounded-lg text-foreground text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary/40 relative before:absolute before:-inset-2 before:content-[''] ${locked ? "cursor-not-allowed relative before:absolute before:-inset-2 before:content-['']" : ""}`}
        />
        {suffix && <span className="text-muted-foreground text-xs">{suffix}</span>}
      </div>
    </div>
  );
}

/** Compact labelled number input used by the media standards grid. */
function NumField({
  label, value, onChange,
}: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-xs text-muted-foreground block mb-1">{label}</label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 bg-muted/40 border border-border rounded-lg text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/40 min-h-11"
      />
    </div>
  );
}

function ToggleRow({
  title, desc, on, onChange, overridden,
}: { title: string; desc: string; on: boolean; onChange: (v: boolean) => void; overridden?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 p-2.5 bg-muted/30 border border-border rounded-lg">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
          {title}
          {overridden && <OverrideBadge />}
        </p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
      <Toggle on={on} onChange={onChange} />
    </div>
  );
}

/** Small "Overridden" pill shown when a vendor row exists for a setting key. */
function OverrideBadge() {
  return (
    <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-300">
      Overridden
    </span>
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
            <p className="text-muted-foreground text-xs mt-0.5">{subtitle}</p>
          </div>
          <span className="text-muted-foreground text-xs whitespace-nowrap">{when}</span>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-2">
          <div className="bg-background/60 border border-border rounded-md px-2 py-1">
            <p className="text-muted-foreground text-xs mb-0.5">Previous Value</p>
            <p className="text-foreground/80 font-mono text-xs">{prev}</p>
          </div>
          <div className={`bg-background/60 border ${accent} rounded-md px-2 py-1`}>
            <p className={`${accentText} text-xs mb-0.5`}>New Value</p>
            <p className="text-foreground font-mono text-xs font-semibold">{next}</p>
          </div>
        </div>
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-border">
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-xs text-foreground font-semibold">
              {by.split(" ").map((w) => w[0]).join("").slice(0, 2)}
            </div>
            <span className="text-muted-foreground text-xs">{by}</span>
          </div>
          <button
            onClick={() => toast.info("Change detail view coming with wiring pass")}
            className="text-blue-400 hover:text-blue-300 text-xs font-medium flex items-center gap-1 min-h-11"
          >
            View Details
            <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---- Unified diff row for admin_actions audit ---- */
function AuditDiffRow({ row }: { row: SettingsAuditRow }) {
  const [expanded, setExpanded] = useState(false);
  const meta = row.metadata ?? {};
  const scope = (meta as any).scope === "vendor" || row.target_user_id ? "vendor" : "platform";
  const applyAll = Boolean((meta as any).apply_to_all_vendors);
  const keys = row.changed_keys;
  const isToggle = row.action_type === "toggle_auto_release";
  const summary = keys.length
    ? (isToggle ? "Auto-release toggled" : `Updated ${keys.length} setting${keys.length === 1 ? "" : "s"}`)
    : (isToggle ? "Auto-release event" : "Settings updated");
  const shownKeys = expanded ? keys : keys.slice(0, 6);
  const overflow = keys.length - shownKeys.length;

  return (
    <div className="p-3 bg-muted/30 border border-border rounded-lg flex items-start gap-2.5">
      <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
        <HistoryIcon className="h-3.5 w-3.5 text-blue-400" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium text-foreground truncate">{summary}</p>
          {scope === "vendor" ? (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-300">Vendor</span>
          ) : (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-300">Platform</span>
          )}
          {applyAll && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-300">Applied to all</span>
          )}
          {isToggle && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300">Auto-release</span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {row.admin_name ?? "Admin"}
          {row.target_name ? <> · target <span className="text-foreground/80">{row.target_name}</span></> : null}
          {" · "}
          {formatDistanceToNow(new Date(row.created_at), { addSuffix: true })}
          {row.ip ? <> · <span className="font-mono">{row.ip}</span></> : null}
        </p>
        {row.reason && (
          <p className="text-xs text-muted-foreground mt-0.5 italic">"{row.reason}"</p>
        )}
        {keys.length > 0 && (
          <div className="mt-2 border border-border rounded-md overflow-hidden">
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] text-xs uppercase tracking-wide text-muted-foreground bg-muted/40 px-2 py-1 border-b border-border">
              <span>Key</span><span>Previous</span><span>New</span>
            </div>
            {shownKeys.map((k) => (
              <div key={k} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] text-xs px-2 py-1 border-b border-border last:border-b-0">
                <span className="font-mono text-foreground/90 truncate">{k}</span>
                <span className="font-mono text-muted-foreground truncate">{formatSettingValue(row.before[k])}</span>
                <span className="font-mono text-foreground font-semibold truncate">{formatSettingValue(row.after[k])}</span>
              </div>
            ))}
            {overflow > 0 && (
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="w-full text-xs text-blue-400 hover:text-blue-300 px-2 py-1 bg-muted/40 text-left min-h-11"
              >
                +{overflow} more
              </button>
            )}
            {expanded && keys.length > 6 && (
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="w-full text-xs text-muted-foreground hover:text-foreground px-2 py-1 bg-muted/40 text-left min-h-11"
              >
                Show less
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}