import { useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import type { PermissionApprovalItem } from "@/services/permission-workspace.service";
import { EmptyState } from "./EmptyState";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, ExternalLink } from "lucide-react";
import { Link } from "react-router";
import { changeStateTone, normalizeChangeState } from "@/services/permission-approval-rules";
import { keyActivate } from "@/lib/a11y";

const RISK_CLR: Record<string, string> = {
  low: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30",
  medium: "bg-amber-500/10 text-amber-300 ring-amber-500/30",
  high: "bg-orange-500/15 text-orange-300 ring-orange-500/40",
  critical: "bg-rose-500/15 text-rose-300 ring-rose-500/40",
};

export function PendingApprovalTable({
  rows,
  onRowClick,
}: {
  rows: PermissionApprovalItem[];
  onRowClick?: (item: PermissionApprovalItem) => void;
}) {
  const [q, setQ] = useState("");
  const [risk, setRisk] = useState<string>("any");
  const [scope, setScope] = useState<string>("any");
  const [status, setStatus] = useState<string>("any");
  const [requester, setRequester] = useState<string>("any");
  const [approver, setApprover] = useState<string>("any");
  const [range, setRange] = useState<string>("any");

  const requesterOptions = useMemo(() => {
    const m = new Map<string, string>();
    rows.forEach((r) => { if (r.requested_by) m.set(r.requested_by, r.requested_by_name ?? r.requested_by); });
    return Array.from(m.entries()).map(([v, l]) => ({ v, l }));
  }, [rows]);
  const approverOptions = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => { if (r.required_approver) s.add(r.required_approver); });
    return Array.from(s.values()).map((v) => ({ v, l: v }));
  }, [rows]);

  const rangeMs: number | null = range === "1d" ? 86_400_000 : range === "7d" ? 7 * 86_400_000 : range === "30d" ? 30 * 86_400_000 : null;

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const cutoff = rangeMs ? Date.now() - rangeMs : null;
    return rows.filter((r) => {
      if (risk !== "any" && r.risk !== risk) return false;
      if (scope !== "any" && r.target_scope !== scope) return false;
      if (status !== "any" && normalizeChangeState(r.status) !== status) return false;
      if (requester !== "any" && r.requested_by !== requester) return false;
      if (approver !== "any" && (r.required_approver ?? "") !== approver) return false;
      if (cutoff !== null && new Date(r.requested_at).getTime() < cutoff) return false;
      if (!ql) return true;
      return (
        r.target_label.toLowerCase().includes(ql) ||
        r.target_key.toLowerCase().includes(ql) ||
        (r.requested_by_name ?? "").toLowerCase().includes(ql) ||
        (r.reason ?? "").toLowerCase().includes(ql) ||
        r.id.toLowerCase().includes(ql)
      );
    });
  }, [rows, q, risk, scope, status, requester, approver, rangeMs]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/40 bg-card/40 p-2 backdrop-blur-sm">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search target, requester, reason, or request ID" className="h-11 pl-7 text-xs" />
        </div>
        <FilterSelect value={scope} onChange={setScope} label="Type" items={[
          { v: "any", l: "All types" }, { v: "role", l: "Role" }, { v: "user", l: "User override" }, { v: "template", l: "Template" }, { v: "permission", l: "Permission" }, { v: "orchestration_rules", l: "Assignment rules" },
        ]} />
        <FilterSelect value={risk} onChange={setRisk} label="Risk" items={[
          { v: "any", l: "Any risk" }, { v: "low", l: "Low" }, { v: "medium", l: "Medium" }, { v: "high", l: "High" }, { v: "critical", l: "Critical" },
        ]} />
        <FilterSelect value={status} onChange={setStatus} label="Status" items={[
          { v: "any", l: "All statuses" }, { v: "pending_approval", l: "Pending" }, { v: "requested_changes", l: "Changes requested" }, { v: "approved", l: "Approved" }, { v: "applied", l: "Applied" }, { v: "rejected", l: "Rejected" }, { v: "cancelled", l: "Cancelled" }, { v: "failed", l: "Failed" },
        ]} />
        <FilterSelect value={requester} onChange={setRequester} label="Requester" items={[{ v: "any", l: "Any requester" }, ...requesterOptions]} />
        <FilterSelect value={approver} onChange={setApprover} label="Approver" items={[{ v: "any", l: "Any approver" }, ...approverOptions]} />
        <FilterSelect value={range} onChange={setRange} label="Date" items={[
          { v: "any", l: "Any time" }, { v: "1d", l: "Last 24h" }, { v: "7d", l: "Last 7 days" }, { v: "30d", l: "Last 30 days" },
        ]} />
      </div>

      {!filtered.length ? (
        <EmptyState title="No pending approvals" description="Privileged role and permission changes queued for approval will show up here." />
      ) : (
        <div className="rounded-2xl border border-border/50 bg-card/60 p-2 backdrop-blur-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-separate border-spacing-y-1 text-sm sd-stack">
              <thead>
                <tr className="text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">Request ID</th>
                  <th className="px-3 py-2 text-left font-medium">Type</th>
                  <th className="px-3 py-2 text-left font-medium">Target</th>
                  <th className="px-3 py-2 text-left font-medium">Requested changes</th>
                  <th className="px-3 py-2 text-left font-medium">Risk</th>
                  <th className="px-3 py-2 text-left font-medium">Requested by</th>
                  <th className="px-3 py-2 text-left font-medium">Requested</th>
                  <th className="px-3 py-2 text-left font-medium">Required approver</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const tone = changeStateTone(normalizeChangeState(r.status));
                  return (
                    <tr role="button" tabIndex={0} onKeyDown={keyActivate}
                      key={r.id}
                      className="cursor-pointer transition hover:bg-muted/30 [&>td]:bg-background/30 [&>td:first-child]:rounded-l-lg [&>td:last-child]:rounded-r-lg"
                      onClick={() => onRowClick?.(r)}
                    >
                      <td className="px-3 py-3 align-middle font-mono text-xs text-muted-foreground">{r.id.slice(0, 8)}…</td>
                      <td className="px-3 py-3 align-middle text-xs capitalize">
                        {r.target_scope === "orchestration_rules" ? "Assignment rules" : r.target_scope}
                      </td>
                      <td className="px-3 py-3 align-middle text-xs font-medium">
                        {r.target_scope === "orchestration_rules" ? (
                          <Link
                            to={`/admin/task-orchestration?rules_change=${r.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline min-h-11"
                          >
                            {r.target_label}
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                        ) : r.target_label}
                      </td>
                      <td className="px-3 py-3 align-middle text-xs text-muted-foreground">
                        <span className="text-emerald-400">+{r.added_keys.length}</span>
                        {" / "}
                        <span className="text-rose-400">−{r.removed_keys.length}</span>
                      </td>
                      <td className="px-3 py-3 align-middle">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold uppercase ring-1 ${RISK_CLR[r.risk] ?? RISK_CLR.low}`}>{r.risk}</span>
                      </td>
                      <td className="px-3 py-3 align-middle text-xs text-muted-foreground">{r.requested_by_name ?? "—"}</td>
                      <td className="px-3 py-3 align-middle whitespace-nowrap text-xs text-muted-foreground">{formatDistanceToNow(new Date(r.requested_at), { addSuffix: true })}</td>
                      <td className="px-3 py-3 align-middle text-xs text-muted-foreground">{r.required_approver ?? <span className="italic">—</span>}</td>
                      <td className="px-3 py-3 align-middle">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${tone.bg} ${tone.text} ${tone.ring}`}>{tone.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function FilterSelect({ value, onChange, label, items }: { value: string; onChange: (v: string) => void; label: string; items: Array<{ v: string; l: string }> }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-11 w-[160px] text-xs"><SelectValue placeholder={label} /></SelectTrigger>
      <SelectContent>{items.map((i) => (<SelectItem key={i.v} value={i.v} className="text-xs">{i.l}</SelectItem>))}</SelectContent>
    </Select>
  );
}
