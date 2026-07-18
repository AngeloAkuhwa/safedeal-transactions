import { useState } from "react";
import {
  Clock, Percent, ShieldCheck, ShieldAlert, History as HistoryIcon,
  TriangleAlert, Layers, DollarSign, Coins, Crown, Sliders, ShieldHalf,
  ToggleRight, Bell, Download, ArrowRight, RotateCcw, AlertTriangle,
} from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { toast } from "@/components/ui/sonner";

/* ------------------------------ primitives ------------------------------ */

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className={`w-12 h-6 rounded-full relative cursor-pointer transition-colors ${
        on ? "bg-emerald-600" : "bg-slate-600"
      }`}
      aria-pressed={on}
    >
      <span
        className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-all ${
          on ? "right-0.5" : "left-0.5"
        }`}
      />
    </button>
  );
}

function NumInput({
  value, onChange, className = "w-28",
}: { value: number | string; onChange: (v: string) => void; className?: string }) {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`${className} p-2 bg-slate-700 border border-slate-600 rounded text-white text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500/50`}
    />
  );
}

/* ------------------------------ header slot ------------------------------ */

function HeaderBar({ dirty, onSave }: { dirty: boolean; onSave: () => void }) {
  return (
    <header className="bg-slate-900 border-b border-slate-800 px-4 md:px-8 py-5 sticky top-0 z-20">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <h2 className="text-white text-xl font-semibold">System Settings</h2>
            <p className="text-slate-400 text-sm mt-0.5">
              Configure platform-wide business rules and operational parameters
            </p>
          </div>
          <div className="flex items-center gap-2 ml-0 md:ml-4">
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-lg">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
              <span className="text-amber-400 font-semibold text-sm">Production</span>
            </div>
            <div className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-slate-300 text-sm">All changes audited</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => toast.info("Audit history will open when wired to admin_actions")}
            className="px-4 py-2 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 transition-all flex items-center gap-2 text-sm font-medium border border-slate-700"
          >
            <HistoryIcon className="h-4 w-4" />
            <span className="hidden sm:inline">View History</span>
          </button>
          <button
            onClick={onSave}
            disabled={!dirty}
            className={`px-5 py-2.5 rounded-lg transition-all flex items-center gap-2 text-sm font-semibold shadow-lg text-white ${
              dirty
                ? "bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 shadow-amber-900/30"
                : "bg-slate-800 border border-slate-700 shadow-none opacity-60 cursor-not-allowed"
            }`}
          >
            <ShieldCheck className="h-4 w-4" />
            <span className="hidden sm:inline">Approve &amp; Save Changes</span>
          </button>
        </div>
      </div>
      <div className="mt-4 p-4 bg-red-500/10 border-l-4 border-red-500 rounded-lg flex items-start gap-3">
        <TriangleAlert className="h-5 w-5 text-red-400 mt-0.5" />
        <div className="flex-1">
          <p className="text-red-300 text-sm font-bold">
            ⚠️ Production Environment — Changes Affect Live Transactions
          </p>
          <p className="text-red-300/90 text-xs mt-1.5">
            All configuration changes are permanently logged and require admin approval.
            Changes to fees and timeouts apply immediately to new transactions.
          </p>
        </div>
      </div>
    </header>
  );
}

/* ------------------------------ page ------------------------------ */

export default function AdminSettings() {
  const [dirty, setDirty] = useState(false);
  const mark = () => setDirty(true);

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

  return (
    <AdminLayout
      title="System Settings"
      hideDefaultHeaders
      fullBleed
      headerSlot={<HeaderBar dirty={dirty} onSave={() => { toast.success("Changes saved locally (wiring pending)"); setDirty(false); }} />}
    >
      <div className="bg-slate-950 min-h-full">
        <div className="p-4 md:p-8 space-y-8">

          {/* ============ TIMEOUT RULES ============ */}
          <section className="bg-gradient-to-br from-slate-900 to-slate-900/95 border-2 border-slate-700/50 rounded-xl shadow-2xl">
            <div className="p-6 border-b-2 border-slate-700/50 bg-slate-800/30">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h3 className="text-white text-xl font-bold flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-500/20 border border-blue-500/30 rounded-lg flex items-center justify-center">
                      <Clock className="h-5 w-5 text-blue-400" />
                    </div>
                    Timeout Rules
                  </h3>
                  <p className="text-slate-400 text-sm mt-2 ml-[52px]">
                    Configure time limits for critical platform operations
                  </p>
                </div>
                <div className="flex items-center gap-2 px-4 py-2 bg-blue-500/10 border-2 border-blue-500/30 rounded-lg">
                  <Layers className="h-4 w-4 text-blue-400" />
                  <span className="text-blue-300 text-sm font-bold">4 Business Rules</span>
                </div>
              </div>
            </div>
            <div className="p-8">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <TimeoutRow label="Seller Fulfillment Timeout" desc="Time given to sellers to fulfill orders after payment" value={sellerFulfil} onChange={setStr(setSellerFulfil)} unit="days" />
                <TimeoutRow label="Buyer Verification Window" desc="Time buyer has to verify item after delivery" value={buyerVerify} onChange={setStr(setBuyerVerify)} unit="hours" />
                <TimeoutRow label="Auto-Release After Delivery" desc="Auto-release escrow if buyer takes no action" value={autoRelease} onChange={setStr(setAutoRelease)} unit="hours" />
                <TimeoutRow label="Payment Session Expiry" desc="How long a Paystack payment session stays open" value={paymentExpiry} onChange={setStr(setPaymentExpiry)} unit="minutes" />
              </div>
              <div className="mt-8 pt-6 border-t-2 border-slate-700/50">
                <div className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 border-l-4 border-amber-500 rounded-lg p-5 mb-6">
                  <div className="flex items-start gap-3">
                    <ShieldAlert className="h-5 w-5 text-amber-400 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-amber-200 font-bold text-sm">Production Change Impact</p>
                      <p className="text-amber-300/90 text-xs mt-2">
                        Changes apply to new transactions only. Active transactions retain original timeout values.
                        This action will be permanently logged in audit history.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-2 text-slate-400 text-sm">
                    <RotateCcw className="h-4 w-4" />
                    <span>
                      Last modified: <span className="text-slate-300 font-medium">2 days ago</span> by{" "}
                      <span className="text-slate-300 font-medium">Admin User</span>
                    </span>
                  </div>
                  <button
                    onClick={() => { toast.success("Timeout rules saved locally"); setDirty(false); }}
                    className="px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-lg font-bold transition-all shadow-lg shadow-blue-900/30 flex items-center gap-2"
                  >
                    <ShieldCheck className="h-4 w-4" />
                    Update Timeout Rules
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* ============ FEE CONFIGURATION ============ */}
          <section className="bg-gradient-to-br from-slate-900 to-slate-900/95 border-2 border-slate-700/50 rounded-xl shadow-2xl">
            <div className="p-6 border-b-2 border-slate-700/50 bg-slate-800/30">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h3 className="text-white text-xl font-bold flex items-center gap-3">
                    <div className="w-10 h-10 bg-emerald-500/20 border border-emerald-500/30 rounded-lg flex items-center justify-center">
                      <Percent className="h-5 w-5 text-emerald-400" />
                    </div>
                    Fee Configuration
                  </h3>
                  <p className="text-slate-400 text-sm mt-2 ml-[52px]">Protection fee structure and limits</p>
                </div>
                <div className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border-2 border-emerald-500/30 rounded-lg">
                  <DollarSign className="h-4 w-4 text-emerald-400" />
                  <span className="text-emerald-300 text-sm font-bold">Active Rules</span>
                </div>
              </div>
            </div>
            <div className="p-8">
              <div className="mb-8 pb-6 border-b-2 border-slate-700/50">
                <h4 className="text-slate-200 font-bold mb-5 text-sm uppercase tracking-wider flex items-center gap-2">
                  <Coins className="h-4 w-4 text-emerald-400" />
                  Base Fee Structure
                </h4>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <FeeField label="Platform Fee Rate" suffix="%" value={platformRate} onChange={setStr(setPlatformRate)} help="Applied to all standard transactions" />
                  <FeeField label="Minimum Platform Fee" prefix="₦" value={minFee} onChange={setStr(setMinFee)} help="Floor charged even on small orders" />
                  <FeeField label="Total Service Fee Cap" prefix="₦" value={feeCap} onChange={setStr(setFeeCap)} help="Buyer-friendly ceiling on service fees" />
                </div>
              </div>

              <div className="mb-8 pb-6 border-b-2 border-slate-700/50">
                <h4 className="text-slate-200 font-bold mb-5 text-sm uppercase tracking-wider flex items-center gap-2">
                  <Crown className="h-4 w-4 text-amber-400" />
                  Special Category Fee Caps
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <FeeField label="High-Value Tier Rate" suffix="%" value={hvRate} onChange={setStr(setHvRate)} help="Rate for transactions above ₦2,000,000" />
                  <div className="p-4 bg-slate-800 border border-slate-700 rounded-lg">
                    <label className="text-slate-300 text-sm font-medium">Refund Policy</label>
                    <p className="text-slate-500 text-xs mt-1 mb-2">Whether service fees are refundable</p>
                    <select
                      value={refundPolicy}
                      onChange={(e) => setStr(setRefundPolicy)(e.target.value)}
                      className="w-full p-2 bg-slate-700 border border-slate-600 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                    >
                      <option>Non-refundable</option>
                      <option>Refundable on cancellation</option>
                      <option>Refundable within 24h</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="pt-6">
                <div className="bg-gradient-to-r from-red-500/10 to-orange-500/10 border-l-4 border-red-500 rounded-lg p-5 mb-6">
                  <div className="flex items-start gap-3">
                    <TriangleAlert className="h-5 w-5 text-red-400 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-red-200 font-bold text-sm">Critical: Fee Structure Update</p>
                      <p className="text-red-300/90 text-xs mt-2">
                        Fee changes affect all new transactions immediately and impact revenue calculations.
                        Admin approval required. This action is permanently logged.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-2 text-slate-400 text-sm">
                    <RotateCcw className="h-4 w-4" />
                    <span>
                      Last modified: <span className="text-slate-300 font-medium">2 hours ago</span> by{" "}
                      <span className="text-slate-300 font-medium">Admin User</span>
                    </span>
                  </div>
                  <button
                    onClick={() => { toast.success("Fee structure saved locally"); setDirty(false); }}
                    className="px-6 py-3 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white rounded-lg font-bold transition-all shadow-lg shadow-emerald-900/30 flex items-center gap-2"
                  >
                    <ShieldCheck className="h-4 w-4" />
                    Update Fee Structure
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* ============ PLATFORM + SECURITY ============ */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
            <section className="bg-slate-900 border border-slate-800 rounded-xl">
              <div className="p-6 border-b border-slate-800">
                <h3 className="text-white text-lg font-semibold flex items-center gap-2">
                  <Sliders className="h-5 w-5 text-purple-400" />
                  Platform Settings
                </h3>
                <p className="text-slate-400 text-sm mt-1">Core platform toggles and thresholds</p>
              </div>
              <div className="p-6 space-y-6">
                <div>
                  <h4 className="text-slate-300 font-semibold mb-3">Feature Toggles</h4>
                  <div className="space-y-3">
                    <ToggleRow title="Auto-Release Payments" desc="Release funds automatically when conditions are met" on={autoReleaseOn} onChange={setBool(setAutoReleaseOn)} />
                    <ToggleRow title="Email Notifications" desc="Send email updates for transaction events" on={emailOn} onChange={setBool(setEmailOn)} />
                    <ToggleRow title="SMS Alerts" desc="Send SMS for critical transaction updates" on={smsOn} onChange={setBool(setSmsOn)} />
                  </div>
                </div>
                <div>
                  <h4 className="text-slate-300 font-semibold mb-3">Risk Thresholds</h4>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-slate-300 text-sm">High-Value Transaction Alert</label>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400">$</span>
                        <NumInput value={hvAlert} onChange={setStr(setHvAlert)} />
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="text-slate-300 text-sm">Fraud Risk Score Threshold</label>
                      <div className="flex items-center gap-2">
                        <NumInput value={fraudScore} onChange={setStr(setFraudScore)} className="w-20" />
                        <span className="text-slate-400">/ 100</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="bg-slate-900 border border-slate-800 rounded-xl">
              <div className="p-6 border-b border-slate-800">
                <h3 className="text-white text-lg font-semibold flex items-center gap-2">
                  <ShieldHalf className="h-5 w-5 text-red-400" />
                  Security &amp; Compliance
                </h3>
                <p className="text-slate-400 text-sm mt-1">Identity verification and security protocols</p>
              </div>
              <div className="p-6 space-y-6">
                <div>
                  <h4 className="text-slate-300 font-semibold mb-3">KYC Requirements</h4>
                  <div className="space-y-3">
                    <ToggleRow title="Require ID Verification" desc="Mandatory for transactions over threshold" on={idRequired} onChange={setBool(setIdRequired)} />
                    <div className="flex items-center justify-between">
                      <label className="text-slate-300 text-sm">ID Verification Threshold</label>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400">$</span>
                        <NumInput value={idThreshold} onChange={setStr(setIdThreshold)} />
                      </div>
                    </div>
                  </div>
                </div>
                <div>
                  <h4 className="text-slate-300 font-semibold mb-3">Session Security</h4>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-slate-300 text-sm">Session Timeout</label>
                      <div className="flex items-center gap-2">
                        <NumInput value={sessionTimeout} onChange={setStr(setSessionTimeout)} className="w-20" />
                        <span className="text-slate-400 text-sm">minutes</span>
                      </div>
                    </div>
                    <ToggleRow title="Two-Factor Authentication" desc="Require 2FA for admin accounts" on={twoFA} onChange={setBool(setTwoFA)} />
                  </div>
                </div>
              </div>
            </section>
          </div>

          {/* ============ AUDIT HISTORY ============ */}
          <section className="bg-gradient-to-br from-slate-900 to-slate-900/95 border-2 border-slate-700/50 rounded-xl shadow-2xl">
            <div className="p-6 border-b-2 border-slate-700/50 bg-slate-800/30">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h3 className="text-white text-xl font-bold flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-500/20 border border-blue-500/30 rounded-lg flex items-center justify-center">
                      <HistoryIcon className="h-5 w-5 text-blue-400" />
                    </div>
                    Recent Changes &amp; Audit History
                  </h3>
                  <p className="text-slate-400 text-sm mt-1">Track all system configuration modifications</p>
                </div>
                <button
                  onClick={() => toast.info("Full audit log export coming with wiring pass")}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-all flex items-center gap-2 text-sm font-semibold border border-slate-700"
                >
                  <Download className="h-4 w-4" />
                  <span className="hidden sm:inline">Export Full Log</span>
                </button>
              </div>
            </div>
            <div className="p-6">
              <div className="space-y-3">
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
    <div className="p-4 bg-slate-800 border border-slate-700 rounded-lg">
      <label className="text-slate-200 text-sm font-medium">{label}</label>
      <p className="text-slate-500 text-xs mt-1 mb-3">{desc}</p>
      <div className="flex items-center gap-2">
        <NumInput value={value} onChange={onChange} className="w-24" />
        <span className="text-slate-400 text-sm">{unit}</span>
      </div>
    </div>
  );
}

function FeeField({
  label, value, onChange, help, prefix, suffix,
}: { label: string; value: string; onChange: (v: string) => void; help?: string; prefix?: string; suffix?: string }) {
  return (
    <div className="p-4 bg-slate-800 border border-slate-700 rounded-lg">
      <label className="text-slate-200 text-sm font-medium">{label}</label>
      {help && <p className="text-slate-500 text-xs mt-1 mb-3">{help}</p>}
      <div className="flex items-center gap-2">
        {prefix && <span className="text-slate-400">{prefix}</span>}
        <NumInput value={value} onChange={onChange} className="flex-1" />
        {suffix && <span className="text-slate-400">{suffix}</span>}
      </div>
    </div>
  );
}

function ToggleRow({
  title, desc, on, onChange,
}: { title: string; desc: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between p-3 bg-slate-800 border border-slate-700 rounded-lg">
      <div>
        <p className="text-white text-sm font-medium">{title}</p>
        <p className="text-slate-500 text-xs">{desc}</p>
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
    <div className="flex items-start gap-4 p-4 bg-slate-800/50 border border-slate-700 rounded-lg hover:border-slate-600 transition-all">
      <div className={`w-10 h-10 rounded-full ${iconBg} border flex items-center justify-center flex-shrink-0`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-4 mb-2">
          <div>
            <p className="text-white font-semibold text-sm">{title}</p>
            <p className="text-slate-400 text-xs mt-1">{subtitle}</p>
          </div>
          <span className="text-slate-500 text-xs whitespace-nowrap">{when}</span>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <div className="bg-slate-900 border border-slate-700 rounded p-2">
            <p className="text-slate-500 text-xs mb-1">Previous Value</p>
            <p className="text-slate-300 font-mono text-sm">{prev}</p>
          </div>
          <div className={`bg-slate-900 border ${accent} rounded p-2`}>
            <p className={`${accentText} text-xs mb-1`}>New Value</p>
            <p className="text-white font-mono text-sm font-semibold">{next}</p>
          </div>
        </div>
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-700">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full bg-slate-700 flex items-center justify-center text-[10px] text-slate-300 font-semibold">
              {by.split(" ").map((w) => w[0]).join("").slice(0, 2)}
            </div>
            <span className="text-slate-400 text-xs">{by}</span>
          </div>
          <button
            onClick={() => toast.info("Change detail view coming with wiring pass")}
            className="text-blue-400 hover:text-blue-300 text-xs font-medium flex items-center gap-1"
          >
            View Details
            <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}