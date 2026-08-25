import { Flag, ExternalLink, FileText, Vault, Scale, SearchCheck, StickyNote, Link2, Hourglass, CheckCircle2, AlertTriangle } from "lucide-react";
import { useNavigate } from "react-router";
import { formatMoneyOrDash } from "@/lib/payment/money-format";
import { formatRelative } from "@/components/admin/dashboard/relative";
import type { EscrowRecordRow } from "@/services/admin-escrow.service";
import { ADMIN_TONE, ADMIN_GROUND } from "@/components/admin/palette";

/**
 * Fallback for a state the UI does not know about. A dynamic key lookup must
 * never be dereferenced unguarded. An unmapped value used to blank the table.
 */
const UNKNOWN_STATE_STYLE = {
  dot: "bg-slate-500",
  pill: "bg-slate-700/40 text-slate-300 border border-slate-600",
  label: "Unknown",
};

const STATE_STYLES: Record<string, { dot: string; pill: string; label: string }> = {
  held:            { dot: "bg-emerald-400",   pill: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30", label: "Held" },
  frozen:          { dot: "bg-red-400 sd-live-dot", pill: "bg-red-500/15 text-red-300 border-red-500/30",     label: "Frozen" },
  pending_release: { dot: ADMIN_TONE.elevated.dot,    pill: ADMIN_TONE.elevated.badge,     label: "Pending Release" },
  released:        { dot: "bg-cyan-400",      pill: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",           label: "Released" },
  refunded:        { dot: "bg-purple-400",    pill: "bg-purple-500/15 text-purple-300 border-purple-500/30",     label: "Refunded" },
};

function Avatar({ name, url }: { name: string; url: string | null }) {
  const initials = name.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
  if (url) return <img src={url} alt={name} className="w-8 h-8 rounded-full object-cover shrink-0" />;
  return (
    <div className="w-8 h-8 rounded-full bg-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center shrink-0">
      {initials || "??"}
    </div>
  );
}

function StateSubLines({ row }: { row: EscrowRecordRow }) {
  const lines: { icon: React.ReactNode; text: string; className: string }[] = [];
  if (row.flagged) {
    lines.push({ icon: <Link2 className="h-3 w-3" />, text: "Linked dispute", className: "text-slate-400" });
    lines.push({ icon: <Hourglass className="h-3 w-3" />, text: "Admin review", className: ADMIN_TONE.elevated.text });
  } else if (row.money_status === "funds_releasing") {
    lines.push({ icon: <CheckCircle2 className="h-3 w-3" />, text: "Buyer confirmed", className: "text-emerald-400" });
    lines.push({ icon: <Hourglass className="h-3 w-3" />, text: "Auto-release pending", className: ADMIN_TONE.elevated.text });
  }
  if (row.state_mismatch) {
    lines.push({ icon: <AlertTriangle className="h-3 w-3" />, text: "State mismatch", className: ADMIN_TONE.warning.text });
  }
  if (!lines.length) return null;
  return (
    <div className="mt-1.5 space-y-0.5">
      {lines.map((l, i) => (
        <p key={i} className={`text-xs inline-flex items-center gap-1 ${l.className}`}>
          {l.icon} <span>{l.text}</span>
        </p>
      ))}
    </div>
  );
}

function ActionButtons({ row, onOpenTx, onOpenDetail, onDispute }: { row: EscrowRecordRow; onOpenTx: () => void; onOpenDetail: () => void; onDispute: () => void }) {
  const btn = "h-11 w-11 rounded-lg flex items-center justify-center transition-all group";
  return (
    <div className="flex items-center justify-center gap-1.5">
      <button type="button" onClick={onOpenTx} title="View Transaction" className={`min-h-11 min-w-11 inline-flex items-center justify-center ${btn} bg-slate-800 hover:bg-blue-600 relative before:absolute before:-inset-1 before:content-['']`}>
        <FileText className={`h-4 w-4 ${ADMIN_GROUND.body} group-hover:text-white`} />
      </button>
      <button type="button" onClick={onOpenDetail} title="View Escrow Record" className={`min-h-11 min-w-11 inline-flex items-center justify-center ${btn} bg-slate-800 hover:bg-emerald-600 relative before:absolute before:-inset-1 before:content-['']`}>
        <Vault className={`h-4 w-4 ${ADMIN_GROUND.body} group-hover:text-white`} />
      </button>
      <button
        type="button"
        onClick={onDispute}
        title={row.flagged ? "Active Dispute" : "No dispute"}
        disabled={!row.flagged}
        className={`min-h-11 ${btn} ${row.flagged ? "bg-red-500/20 border border-red-500/40 hover:bg-red-600" : "bg-slate-800/50 opacity-50 cursor-not-allowed"} relative before:absolute before:-inset-1 before:content-['']`}
      >
        <Scale className={`h-4 w-4 ${row.flagged ? "text-red-400 group-hover:text-white" : "text-slate-500"}`} />
      </button>
    </div>
  );
}

export function EscrowRecordsTable({ rows, total, page, pageSize, onPage, onOpenDetail, exportSlot }: {
  rows: EscrowRecordRow[]; total: number; page: number; pageSize: number; onPage: (p: number) => void;
  onOpenDetail: (txId: string) => void;
  exportSlot?: React.ReactNode;
}) {
  const nav = useNavigate();
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const lastPage = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className={`${ADMIN_GROUND.panel} border rounded-xl`}>
      <div className={`p-4 lg:p-6 border-b ${ADMIN_GROUND.border}`}>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h3 className={`${ADMIN_GROUND.heading} text-base lg:text-lg font-semibold`}>Escrow Records</h3>
            <p className={`${ADMIN_GROUND.muted} text-xs lg:text-sm mt-1`}>
              {total.toLocaleString()} active escrow transactions • Showing {from}-{to}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {exportSlot}
          </div>
        </div>
      </div>

      {/* Desktop table */}
      <div className="hidden lg:block overflow-x-auto">
        <table className="w-full">
          <thead className={`${ADMIN_GROUND.raised} border-b ${ADMIN_GROUND.borderSoft}`}>
            <tr>
              {["Transaction","Buyer","Seller","Total Held","Frozen","Releasable","Released","State","Last Changed","Actions"].map((h, i) => (
                <th key={h}
                    className={`p-4 text-slate-300 font-semibold text-sm whitespace-nowrap ${i >= 3 && i <= 6 ? "text-right" : i === 9 ? "text-center" : "text-left"}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {rows.length === 0 ? (
              <tr><td colSpan={10} className={`p-12 text-center text-sm ${ADMIN_GROUND.faint}`}>No escrow records match these filters.</td></tr>
            ) : rows.map((r) => {
              const st = STATE_STYLES[r.state] ?? UNKNOWN_STATE_STYLE;
              return (
                <tr key={r.transaction_id} className="hover:bg-slate-800/50 transition-all">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 ${st.dot} rounded-full`} />
                      <div className="min-w-0">
                        <p className={`${ADMIN_GROUND.heading} text-sm font-medium whitespace-nowrap`}>#{r.transaction_code}</p>
                        <p className={`${ADMIN_GROUND.muted} text-xs`}>{new Date(r.created_at).toLocaleDateString("en-NG", { month: "short", day: "numeric", year: "numeric" })}</p>
                      </div>
                      {r.flagged && <Flag className={`h-3 w-3 ${ADMIN_TONE.danger.text}`} />}
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <Avatar name={r.buyer.name} url={r.buyer.avatar_url} />
                      <p className={`${ADMIN_GROUND.heading} text-sm font-medium truncate max-w-[160px]`}>{r.buyer.name}</p>
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <Avatar name={r.seller.name} url={r.seller.avatar_url} />
                      <p className={`${ADMIN_GROUND.heading} text-sm font-medium truncate max-w-[160px]`}>{r.seller.name}</p>
                    </div>
                  </td>
                  <td className={`p-4 text-right text-sm font-medium whitespace-nowrap ${r.total_held ? "text-white" : "text-slate-500"}`}>{formatMoneyOrDash(r.total_held, r.currency_code)}</td>
                  <td className={`p-4 text-right text-sm whitespace-nowrap ${r.frozen ? "text-red-400" : "text-slate-500"}`}>{formatMoneyOrDash(r.frozen, r.currency_code)}</td>
                  <td className={`p-4 text-right text-sm whitespace-nowrap ${r.releasable ? "text-emerald-400" : "text-slate-500"}`}>{formatMoneyOrDash(r.releasable, r.currency_code)}</td>
                  <td className={`p-4 text-right text-sm whitespace-nowrap ${r.released ? "text-cyan-400" : "text-slate-500"}`}>{formatMoneyOrDash(r.released, r.currency_code)}</td>
                  <td className="p-4">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold ${st.pill}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                      {st.label}
                    </span>
                    <StateSubLines row={r} />
                  </td>
                  <td className={`p-4 ${ADMIN_GROUND.muted} text-xs whitespace-nowrap`}>{formatRelative(r.last_changed_at)}</td>
                  <td className="p-4">
                    <ActionButtons
                      row={r}
                      onOpenTx={() => nav(`/admin/transactions/${r.transaction_id}`)}
                      onOpenDetail={() => onOpenDetail(r.transaction_id)}
                      onDispute={() => nav(`/admin/disputes?tx=${r.transaction_id}`)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile / tablet cards */}
      <div className="lg:hidden p-3 space-y-3">
        {rows.length === 0 ? (
          <p className={`p-8 text-center text-sm ${ADMIN_GROUND.faint}`}>No escrow records match these filters.</p>
        ) : rows.map((r) => {
          const st = STATE_STYLES[r.state] ?? UNKNOWN_STATE_STYLE;
          return (
            <button
              key={r.transaction_id}
              type="button"
              onClick={() => onOpenDetail(r.transaction_id)}
              className="w-full text-left bg-slate-800/60 border border-slate-700 rounded-xl p-4 hover:border-slate-600 transition-all"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`w-2 h-2 ${st.dot} rounded-full`} />
                  <span className={`${ADMIN_GROUND.heading} text-sm font-semibold truncate`}>#{r.transaction_code}</span>
                  {r.flagged && <Flag className={`h-3 w-3 ${ADMIN_TONE.danger.text} shrink-0`} />}
                  {r.state_mismatch && <AlertTriangle className={`h-3 w-3 ${ADMIN_TONE.warning.text} shrink-0`} />}
                </div>
                <span className={`px-2.5 py-1 rounded-full border text-xs font-semibold ${st.pill}`}>{st.label}</span>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="flex items-center gap-2 min-w-0">
                  <Avatar name={r.buyer.name} url={r.buyer.avatar_url} />
                  <div className="min-w-0">
                    <p className={`${ADMIN_GROUND.faint} text-xs uppercase`}>Buyer</p>
                    <p className={`${ADMIN_GROUND.heading} text-xs font-medium truncate`}>{r.buyer.name}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 min-w-0">
                  <Avatar name={r.seller.name} url={r.seller.avatar_url} />
                  <div className="min-w-0">
                    <p className={`${ADMIN_GROUND.faint} text-xs uppercase`}>Seller</p>
                    <p className={`${ADMIN_GROUND.heading} text-xs font-medium truncate`}>{r.seller.name}</p>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="bg-slate-900/60 rounded-lg p-2">
                  <p className={`${ADMIN_GROUND.faint} text-xs uppercase`}>Held</p>
                  <p className={`text-xs font-semibold mt-0.5 ${r.total_held ? "text-white" : "text-slate-500"}`}>{formatMoneyOrDash(r.total_held, r.currency_code)}</p>
                </div>
                <div className="bg-slate-900/60 rounded-lg p-2">
                  <p className={`${ADMIN_GROUND.faint} text-xs uppercase`}>Frozen</p>
                  <p className={`text-xs font-semibold mt-0.5 ${r.frozen ? "text-red-400" : "text-slate-500"}`}>{formatMoneyOrDash(r.frozen, r.currency_code)}</p>
                </div>
                <div className="bg-slate-900/60 rounded-lg p-2">
                  <p className={`${ADMIN_GROUND.faint} text-xs uppercase`}>Releasable</p>
                  <p className={`text-xs font-semibold mt-0.5 ${r.releasable ? "text-emerald-400" : "text-slate-500"}`}>{formatMoneyOrDash(r.releasable, r.currency_code)}</p>
                </div>
                <div className="bg-slate-900/60 rounded-lg p-2">
                  <p className={`${ADMIN_GROUND.faint} text-xs uppercase`}>Released</p>
                  <p className={`text-xs font-semibold mt-0.5 ${r.released ? "text-cyan-400" : "text-slate-500"}`}>{formatMoneyOrDash(r.released, r.currency_code)}</p>
                </div>
              </div>
              <div className="flex items-center justify-between mt-3 text-xs">
                <span className={ADMIN_GROUND.faint}>{formatRelative(r.last_changed_at)}</span>
                <span className={`${ADMIN_TONE.success.text} inline-flex items-center gap-1 font-medium`}>
                  Open <ExternalLink className="h-3 w-3" />
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Pagination */}
      {total > pageSize && (
        <div className={`p-4 border-t ${ADMIN_GROUND.border} flex items-center justify-between text-sm`}>
          <span className={ADMIN_GROUND.muted}>Page {page} of {lastPage}</span>
          <div className="flex items-center gap-2">
            <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}
              className="px-3 py-1.5 bg-slate-800 text-slate-200 rounded disabled:opacity-40 disabled:cursor-not-allowed min-h-11">Prev</button>
            <button type="button" disabled={page >= lastPage} onClick={() => onPage(page + 1)}
              className="px-3 py-1.5 bg-slate-800 text-slate-200 rounded disabled:opacity-40 disabled:cursor-not-allowed min-h-11">Next</button>
          </div>
        </div>
      )}
    </div>
  );
}