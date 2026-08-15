import { useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import type { PermissionHistoryItem } from "@/services/permission-workspace.service";
import { EmptyState } from "./EmptyState";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, RotateCcw } from "lucide-react";
import { changeStateTone, normalizeChangeState } from "@/services/permission-approval-rules";
import { findPermissionEntry } from "@/services/permission-catalog";

export function PermissionHistoryTable({
  rows,
  onRowClick,
  onRecreate,
}: {
  rows: PermissionHistoryItem[];
  onRowClick?: (r: PermissionHistoryItem) => void;
  onRecreate?: (r: PermissionHistoryItem) => void;
}) {
  const [q, setQ] = useState("");
  const [scope, setScope] = useState("any");
  const [result, setResult] = useState("any");
  const [actor, setActor] = useState("any");
  const [module, setModule] = useState("any");
  const [permission, setPermission] = useState("any");
  const [range, setRange] = useState("any");

  const actorOptions = useMemo(() => {
    const m = new Map<string, string>();
    rows.forEach((r) => { if (r.actor_id) m.set(r.actor_id, r.actor_name ?? r.actor_id); });
    return Array.from(m.entries()).map(([v, l]) => ({ v, l }));
  }, [rows]);
  const keyToModule = (k: string) => findPermissionEntry(k)?.moduleLabel ?? "—";
  const moduleOptions = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => { [...r.added_keys, ...r.removed_keys].forEach((k) => s.add(keyToModule(k))); });
    s.delete("—");
    return Array.from(s.values()).map((v) => ({ v, l: v }));
  }, [rows]);
  const permissionOptions = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => { [...r.added_keys, ...r.removed_keys].forEach((k) => s.add(k)); });
    return Array.from(s.values()).sort().map((v) => ({ v, l: v }));
  }, [rows]);
  const rangeMs = range === "1d" ? 86_400_000 : range === "7d" ? 7 * 86_400_000 : range === "30d" ? 30 * 86_400_000 : null;

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const cutoff = rangeMs ? Date.now() - rangeMs : null;
    return rows.filter((r) => {
      if (scope !== "any" && r.target_scope !== scope) return false;
      if (result !== "any" && r.result !== result) return false;
      if (actor !== "any" && r.actor_id !== actor) return false;
      if (cutoff !== null && new Date(r.when).getTime() < cutoff) return false;
      const keys = [...r.added_keys, ...r.removed_keys];
      if (module !== "any" && !keys.some((k) => keyToModule(k) === module)) return false;
      if (permission !== "any" && !keys.includes(permission)) return false;
      if (!ql) return true;
      return (
        r.target_label.toLowerCase().includes(ql) ||
        r.target_key.toLowerCase().includes(ql) ||
        (r.actor_name ?? "").toLowerCase().includes(ql) ||
        (r.reason ?? "").toLowerCase().includes(ql) ||
        r.id.toLowerCase().includes(ql)
      );
    });
  }, [rows, q, scope, result, actor, module, permission, rangeMs]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/40 bg-card/40 p-2 backdrop-blur-sm">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search target, actor, reason, or ref" className="h-11 pl-7 text-xs" />
        </div>
        <Select value={scope} onValueChange={setScope}>
          <SelectTrigger className="h-11 w-[150px] text-xs"><SelectValue placeholder="Scope" /></SelectTrigger>
          <SelectContent>
            {[{ v: "any", l: "All scopes" }, { v: "role", l: "Role" }, { v: "user", l: "User" }, { v: "template", l: "Template" }, { v: "permission", l: "Permission" }].map((i) => (
              <SelectItem key={i.v} value={i.v} className="text-xs">{i.l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={result} onValueChange={setResult}>
          <SelectTrigger className="h-11 w-[150px] text-xs"><SelectValue placeholder="Result" /></SelectTrigger>
          <SelectContent>
            {[{ v: "any", l: "All results" }, { v: "applied", l: "Applied" }, { v: "rejected", l: "Rejected" }, { v: "cancelled", l: "Cancelled" }, { v: "failed", l: "Failed" }].map((i) => (
              <SelectItem key={i.v} value={i.v} className="text-xs">{i.l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={actor} onValueChange={setActor}>
          <SelectTrigger className="h-11 w-[160px] text-xs"><SelectValue placeholder="Actor" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="any" className="text-xs">Any actor</SelectItem>
            {actorOptions.map((i) => (<SelectItem key={i.v} value={i.v} className="text-xs">{i.l}</SelectItem>))}
          </SelectContent>
        </Select>
        <Select value={module} onValueChange={setModule}>
          <SelectTrigger className="h-11 w-[160px] text-xs"><SelectValue placeholder="Module" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="any" className="text-xs">Any module</SelectItem>
            {moduleOptions.map((i) => (<SelectItem key={i.v} value={i.v} className="text-xs">{i.l}</SelectItem>))}
          </SelectContent>
        </Select>
        <Select value={permission} onValueChange={setPermission}>
          <SelectTrigger className="h-11 w-[180px] text-xs"><SelectValue placeholder="Permission" /></SelectTrigger>
          <SelectContent className="max-h-[280px]">
            <SelectItem value="any" className="text-xs">Any permission</SelectItem>
            {permissionOptions.map((i) => (<SelectItem key={i.v} value={i.v} className="text-xs font-mono">{i.l}</SelectItem>))}
          </SelectContent>
        </Select>
        <Select value={range} onValueChange={setRange}>
          <SelectTrigger className="h-11 w-[140px] text-xs"><SelectValue placeholder="Date" /></SelectTrigger>
          <SelectContent>
            {[{ v: "any", l: "Any time" }, { v: "1d", l: "Last 24h" }, { v: "7d", l: "Last 7 days" }, { v: "30d", l: "Last 30 days" }].map((i) => (
              <SelectItem key={i.v} value={i.v} className="text-xs">{i.l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!filtered.length ? (
        <EmptyState title="No recorded changes" description="Applied and rejected change sets will appear here." />
      ) : (
        <div className="rounded-2xl border border-border/50 bg-card/60 p-2 backdrop-blur-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] border-separate border-spacing-y-1 text-sm sd-stack">
              <thead>
                <tr className="text-[12px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">When</th>
                  <th className="px-3 py-2 text-left font-medium">Actor</th>
                  <th className="px-3 py-2 text-left font-medium">Action</th>
                  <th className="px-3 py-2 text-left font-medium">Target</th>
                  <th className="px-3 py-2 text-left font-medium">Previous</th>
                  <th className="px-3 py-2 text-left font-medium">New</th>
                  <th className="px-3 py-2 text-left font-medium">Reason</th>
                  <th className="px-3 py-2 text-left font-medium">Approval ref</th>
                  <th className="px-3 py-2 text-left font-medium">Result</th>
                  <th className="px-3 py-2 text-left font-medium">Env</th>
                  <th className="px-3 py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const tone = changeStateTone(normalizeChangeState(r.result));
                  return (
                    <tr
                      key={r.id}
                      className="cursor-pointer transition hover:bg-muted/30 [&>td]:bg-background/30 [&>td:first-child]:rounded-l-lg [&>td:last-child]:rounded-r-lg"
                      onClick={() => onRowClick?.(r)}
                    >
                      <td className="px-3 py-3 align-middle whitespace-nowrap text-xs text-muted-foreground">{formatDistanceToNow(new Date(r.when), { addSuffix: true })}</td>
                      <td className="px-3 py-3 align-middle text-xs">{r.actor_name ?? <span className="italic text-muted-foreground">System</span>}</td>
                      <td className="px-3 py-3 align-middle text-xs">{r.action}</td>
                      <td className="px-3 py-3 align-middle text-xs font-medium">{r.target_label}</td>
                      <td className="px-3 py-3 align-middle text-xs text-muted-foreground">{r.previous_summary}</td>
                      <td className="px-3 py-3 align-middle text-xs text-muted-foreground">
                        <span className="text-emerald-400">+{r.added_keys.length}</span>{" / "}<span className="text-rose-400">−{r.removed_keys.length}</span>
                      </td>
                      <td className="px-3 py-3 align-middle text-xs text-muted-foreground max-w-[220px] truncate" title={r.reason ?? ""}>{r.reason ?? "—"}</td>
                      <td className="px-3 py-3 align-middle font-mono text-[12px] text-muted-foreground">{r.approval_ref.slice(0, 8)}…</td>
                      <td className="px-3 py-3 align-middle">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[12px] font-semibold ring-1 ${tone.bg} ${tone.text} ${tone.ring}`}>{tone.label}</span>
                      </td>
                      <td className="px-3 py-3 align-middle text-[12px] uppercase text-muted-foreground">{r.environment}</td>
                      <td className="px-3 py-3 align-middle text-right">
                        {onRecreate && r.target_scope === "role" ? (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onRecreate(r); }}
                            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[12px] hover:bg-muted min-h-11"
                            title="Stage the inverse of this change as a draft for review"
                          >
                            <RotateCcw className="h-3 w-3" /> Recreate
                          </button>
                        ) : null}
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
