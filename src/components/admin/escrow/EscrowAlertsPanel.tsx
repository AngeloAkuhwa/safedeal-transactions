import { Clock, Hourglass, Pause, GitCompare, Lock, AlertTriangle, PauseCircle, AlertCircle, Bell, Settings } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { formatMoney } from "@/lib/format";
import type { EscrowAlerts } from "@/services/admin-escrow.service";
import { canConfigureEscrowAlerts } from "@/services/admin-escrow-alerts.service";
import { ConfigureAlertsModal } from "./ConfigureAlertsModal";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ADMIN_GROUND, ADMIN_TONE } from "@/components/admin/palette";

type Accent = {
  bg: string;        // icon container background
  border: string;    // card + icon border
  text: string;      // accent text
  chipBg: string;    // count chip bg
  hoverBorder: string;
};

const RED: Accent     = { bg: "bg-red-500/20",     border: "border-red-500/30",     text: "text-red-400",     chipBg: "bg-red-500/20",     hoverBorder: "hover:border-red-500/50" };
const ORANGE: Accent  = { bg: "bg-orange-500/20",  border: "border-orange-500/30",  text: ADMIN_TONE.elevated.text,  chipBg: "bg-orange-500/20",  hoverBorder: "hover:border-orange-500/50" };
const PURPLE: Accent  = { bg: "bg-purple-500/20",  border: "border-purple-500/30",  text: "text-purple-400",  chipBg: "bg-purple-500/20",  hoverBorder: "hover:border-purple-500/50" };
const YELLOW: Accent  = { bg: "bg-amber-500/20",  border: "border-amber-500/30",  text: "text-amber-400",  chipBg: "bg-amber-500/20",  hoverBorder: "hover:border-amber-500/50" };

type Item = {
  id: string;
  code: string;
  amount?: number;
  rowIcon: React.ReactNode;
  right: React.ReactNode;
};

function AlertCard({
  icon, title, subtitle, count, accent, items, expanded, onToggle, onOpen,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  count: number;
  accent: Accent;
  items: Item[];
  expanded: boolean;
  onToggle: () => void;
  onOpen: (id: string) => void;
}) {
  const visible = expanded ? items : items.slice(0, 3);
  const hiddenCount = Math.max(0, items.length - 3);
  return (
    <div className={`bg-slate-800/50 border ${accent.border} rounded-lg p-4`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 ${accent.bg} border ${accent.border} rounded-lg flex items-center justify-center`}>
            <span className={accent.text}>{icon}</span>
          </div>
          <div>
            <h4 className="text-white font-semibold text-sm">{title}</h4>
            <p className="text-slate-400 text-xs">{subtitle}</p>
          </div>
        </div>
        <span className={`px-2 py-1 ${accent.chipBg} ${accent.text} rounded text-xs font-bold`}>{count}</span>
      </div>
      <div className={`space-y-2 ${expanded && items.length > 3 ? "max-h-72 overflow-y-auto pr-1" : ""}`}>
        {items.length === 0 ? (
          <p className="text-slate-500 text-xs italic px-2 py-2">No active alerts.</p>
        ) : visible.map((it) => (
          <button
            key={it.id}
            type="button"
            onClick={() => onOpen(it.id)}
            className={`w-full flex items-center justify-between p-2.5 bg-slate-900/50 rounded border border-slate-700 ${accent.hoverBorder} transition-all text-left min-h-11`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className={`${accent.text} shrink-0`}>{it.rowIcon}</span>
              <span className="text-white text-sm font-medium truncate">{it.code}</span>
              {it.amount !== undefined && (
                <span className="text-slate-400 text-xs">{formatMoney(it.amount, "NGN")}</span>
              )}
            </div>
            <div className="shrink-0 ml-2">{it.right}</div>
          </button>
        ))}
      </div>
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={onToggle}
          className={`w-full text-center ${accent.text} hover:opacity-80 text-xs font-medium pt-2`}
        >
          {expanded ? "Show less ↑" : `View all ${items.length} ${title.toLowerCase()} alerts →`}
        </button>
      )}
    </div>
  );
}

export function EscrowAlertsPanel({
  alerts,
  onThresholdsSaved,
}: {
  alerts: EscrowAlerts;
  onThresholdsSaved?: (t: EscrowAlerts["thresholds"]) => void;
}) {
  const nav = useNavigate();
  const open = (id: string) => nav(`/admin/transactions/${id}`);
  const [modalOpen, setModalOpen] = useState(false);
  const [canConfigure, setCanConfigure] = useState(false);
  const [liveThresholds, setLiveThresholds] = useState(alerts.thresholds);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const toggle = (key: string) => setExpanded((p) => ({ ...p, [key]: !p[key] }));

  useEffect(() => {
    canConfigureEscrowAlerts().then(setCanConfigure).catch(() => setCanConfigure(false));
  }, []);

  useEffect(() => { setLiveThresholds(alerts.thresholds); }, [alerts.thresholds]);
  const t = liveThresholds ?? alerts.thresholds ?? { frozen_days: 30, overdue_days: 5, idle_days: 15, high_value_amount: 1_000_000, mismatch_min_delta: 0.01 };

  // Map existing aggregator output → reference's four visual categories.
  const frozenItems: Item[] = alerts.frozen_too_long.map((r) => ({
    id: r.tx_id,
    code: `#${r.code}`,
    amount: r.amount,
    rowIcon: <Lock className="h-3 w-3" />,
    right: <span className={`${ADMIN_TONE.danger.text} text-xs font-semibold`}>Frozen {r.days_frozen}d</span>,
  }));

  const overdueItems: Item[] = alerts.dispute_stalled.map((r) => ({
    id: r.tx_id,
    code: `#${r.code}`,
    rowIcon: <AlertTriangle className="h-3 w-3" />,
    right: <span className={`${ADMIN_TONE.elevated.text} text-xs font-semibold`}>Overdue {r.stalled_for}d</span>,
  }));

  const stuckItems: Item[] = alerts.high_value_held.map((r) => ({
    id: r.tx_id,
    code: `#${r.code}`,
    amount: r.amount,
    rowIcon: <PauseCircle className="h-3 w-3" />,
    right: <span className={`${ADMIN_TONE.special.text} text-xs font-semibold`}>Idle {r.held_for}d</span>,
  }));

  const mismatchItems: Item[] = alerts.provider_mismatch.map((r) => ({
    id: r.tx_id,
    code: `#${r.code}`,
    rowIcon: <AlertCircle className="h-3 w-3" />,
    right: (
      <div className="text-right">
        <p className={`${ADMIN_TONE.warning.text} text-xs font-semibold`}>Δ {formatMoney(r.delta, "NGN")}</p>
        <p className="text-slate-500 text-xs">Verify reconciliation</p>
      </div>
    ),
  }));

  return (
    <div className={`${ADMIN_GROUND.panel} border rounded-xl`}>
      <div className="p-4 lg:p-6 border-b border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="text-white text-base lg:text-lg font-semibold">Escrow Alerts &amp; Anomalies</h3>
            <p className="text-slate-400 text-xs lg:text-sm mt-1">Active operational alerts requiring attention • Updated real-time</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-3 py-1.5 ${ADMIN_TONE.danger.chip} border rounded-lg text-xs font-semibold inline-flex items-center gap-1.5`}>
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 sd-live-dot" />
              {alerts.counts.critical} Critical
            </span>
            <span className={`px-3 py-1.5 ${ADMIN_TONE.elevated.chip} border rounded-lg text-xs font-semibold`}>
              {alerts.counts.warning} Warnings
            </span>
          </div>
        </div>
      </div>

      <div className="p-4 lg:p-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-4">
          <AlertCard
            icon={<Clock className="h-5 w-5" />}
            title="Frozen Too Long"
            subtitle="Escrow frozen beyond expected timeframe"
            count={frozenItems.length}
            accent={RED}
            items={frozenItems}
            expanded={!!expanded.frozen}
            onToggle={() => toggle("frozen")}
            onOpen={open}
          />
          <AlertCard
            icon={<Hourglass className="h-5 w-5" />}
            title="Release Overdue"
            subtitle="Pending release past expected date"
            count={overdueItems.length}
            accent={ORANGE}
            items={overdueItems}
            expanded={!!expanded.overdue}
            onToggle={() => toggle("overdue")}
            onOpen={open}
          />
          <AlertCard
            icon={<Pause className="h-5 w-5" />}
            title="Stuck Escrow"
            subtitle="No state change for extended period"
            count={stuckItems.length}
            accent={PURPLE}
            items={stuckItems}
            expanded={!!expanded.stuck}
            onToggle={() => toggle("stuck")}
            onOpen={open}
          />
          <AlertCard
            icon={<GitCompare className="h-5 w-5" />}
            title="State Mismatch"
            subtitle="Transaction vs money state inconsistency"
            count={mismatchItems.length}
            accent={YELLOW}
            items={mismatchItems}
            expanded={!!expanded.mismatch}
            onToggle={() => toggle("mismatch")}
            onOpen={open}
          />
        </div>

        <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 bg-slate-800/30 border border-slate-700 rounded-lg">
          <div className="flex items-center gap-3 min-w-0">
            <Bell className="h-4 w-4 text-slate-400 shrink-0" />
            <p className="text-slate-300 text-xs sm:text-sm truncate">
              Alert thresholds: Frozen &gt;{t.frozen_days}d | Overdue &gt;{t.overdue_days}d | Idle &gt;{t.idle_days}d | Mismatch ≥{formatMoney(t.mismatch_min_delta, "NGN")}
            </p>
          </div>
          {canConfigure ? (
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="px-4 py-2 bg-sky-700 hover:bg-sky-800 text-white rounded-lg text-sm font-medium inline-flex items-center gap-2 shrink-0 transition-colors min-h-11"
            >
              <Settings className="h-4 w-4" />
              Configure Alerts
            </button>
          ) : (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    disabled
                    className="px-4 py-2 bg-slate-700/60 text-slate-400 rounded-lg text-sm font-medium inline-flex items-center gap-2 cursor-not-allowed shrink-0 min-h-11"
                  >
                    <Settings className="h-4 w-4" />
                    Configure Alerts
                  </button>
                </TooltipTrigger>
                <TooltipContent>Requires admin clearance</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>

      <ConfigureAlertsModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        initial={alerts.thresholds}
        onSaved={(next) => {
          setLiveThresholds(next);
          onThresholdsSaved?.(next);
        }}
      />
    </div>
  );
}
