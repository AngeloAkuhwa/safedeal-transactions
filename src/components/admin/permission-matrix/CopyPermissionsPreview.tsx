import { useMemo } from "react";
import { X, ArrowRight, Plus, Minus, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ROLE_LABEL,
  PERMISSION_MODULES,
  getPermissionRisk,
  isProtectedRole,
  type InternalRoleKey,
} from "@/services/permission-catalog";
import type { RoleGrantMap } from "@/services/permission-workspace.service";
import type { StagedOp } from "@/hooks/useStagedPermissionChanges";
import { keyActivate } from "@/lib/a11y";

interface Props {
  open: boolean;
  source: InternalRoleKey | null;
  target: InternalRoleKey | null;
  roleMap: RoleGrantMap;
  onClose: () => void;
  onStage: (target: InternalRoleKey, changes: Array<{ permissionKey: string; op: StagedOp }>) => void;
}

function permMeta(key: string) {
  for (const m of PERMISSION_MODULES) {
    const p = m.permissions.find((x) => x.key === key);
    if (p) return { label: p.label, module: m.label };
  }
  return { label: key, module: "—" };
}

function RiskDot({ k }: { k: string }) {
  const r = getPermissionRisk(k);
  const cls = r === "critical" ? "bg-rose-400"
    : r === "high" ? "bg-amber-400"
    : r === "medium" ? "bg-sky-400" : "bg-muted-foreground/50";
  return <span className={cn("mr-2 inline-block h-1.5 w-1.5 rounded-full", cls)} />;
}

export function CopyPermissionsPreview({ open, source, target, roleMap, onClose, onStage }: Props) {
  const diff = useMemo(() => {
    if (!source || !target) return { adds: [] as string[], removes: [] as string[], keeps: [] as string[] };
    const src = roleMap.map.get(source) ?? new Set<string>();
    const tgt = roleMap.map.get(target) ?? new Set<string>();
    const adds: string[] = [];
    const removes: string[] = [];
    const keeps: string[] = [];
    for (const k of src) (tgt.has(k) ? keeps : adds).push(k);
    for (const k of tgt) if (!src.has(k)) removes.push(k);
    return { adds: adds.sort(), removes: removes.sort(), keeps: keeps.sort() };
  }, [source, target, roleMap]);

  if (!open || !source || !target) return null;

  const targetProtected = isProtectedRole(target);
  const totalChanges = diff.adds.length + diff.removes.length;

  const handleStage = () => {
    if (targetProtected || totalChanges === 0) return;
    const changes: Array<{ permissionKey: string; op: StagedOp }> = [
      ...diff.adds.map((k) => ({ permissionKey: k, op: "grant" as StagedOp })),
      ...diff.removes.map((k) => ({ permissionKey: k, op: "revoke" as StagedOp })),
    ];
    onStage(target, changes);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-modal flex">
      <div role="button" tabIndex={0} onKeyDown={keyActivate} className="flex-1 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <aside className="flex h-full w-full max-w-[520px] flex-col overflow-hidden border-l border-border/60 bg-card shadow-2xl">
        <header className="flex items-center justify-between border-b border-border/40 px-5 py-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Preview copy</div>
            <div className="mt-1 flex items-center gap-2 text-base font-semibold">
              <span>{ROLE_LABEL[source]}</span>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              <span>{ROLE_LABEL[target]}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted min-h-11 min-w-11 inline-flex items-center justify-center"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {targetProtected && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 text-xs text-rose-200">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <strong className="font-semibold">{ROLE_LABEL[target]}</strong> is a protected role. Its permissions cannot be modified through the matrix.
              </span>
            </div>
          )}

          <SummaryRow color="emerald" icon={<Plus className="h-3 w-3" />} label="Add" count={diff.adds.length} />
          <SummaryRow color="rose" icon={<Minus className="h-3 w-3" />} label="Remove" count={diff.removes.length} />
          <SummaryRow color="muted" icon={<span className="h-3 w-3" />} label="Unchanged" count={diff.keeps.length} />

          <Section title="Will be granted" tone="emerald" items={diff.adds} />
          <Section title="Will be revoked" tone="rose" items={diff.removes} />
          <Section title="Already matching" tone="muted" items={diff.keeps} collapsed />
        </div>

        <footer className="flex items-center gap-2 border-t border-border/40 bg-background/40 px-5 py-3">
          <div className="mr-auto text-xs text-muted-foreground">
            {totalChanges === 0 ? "No changes to stage." : `${totalChanges} change${totalChanges === 1 ? "" : "s"} will be staged.`}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border bg-background/60 px-3 py-1.5 text-xs font-medium hover:bg-muted min-h-11"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={targetProtected || totalChanges === 0}
            onClick={handleStage}
            className="rounded-md bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 min-h-11"
          >
            Stage changes
          </button>
        </footer>
      </aside>
    </div>
  );
}

function SummaryRow({ color, icon, label, count }: { color: "emerald" | "rose" | "muted"; icon: React.ReactNode; label: string; count: number }) {
  const cls = color === "emerald" ? "bg-emerald-500/15 text-emerald-300"
    : color === "rose" ? "bg-rose-500/15 text-rose-300"
    : "bg-muted/40 text-muted-foreground";
  return (
    <div className="mb-1.5 flex items-center gap-2 text-xs">
      <span className={cn("inline-flex h-5 w-5 items-center justify-center rounded-full", cls)}>{icon}</span>
      <span className="text-muted-foreground">{label}</span>
      <span className="ml-auto font-mono font-semibold">{count}</span>
    </div>
  );
}

function Section({ title, tone, items, collapsed }: { title: string; tone: "emerald" | "rose" | "muted"; items: string[]; collapsed?: boolean }) {
  if (items.length === 0) return null;
  const dot = tone === "emerald" ? "bg-emerald-400" : tone === "rose" ? "bg-rose-400" : "bg-muted-foreground/50";
  return (
    <details open={!collapsed} className="mt-4 rounded-xl bg-background/30 p-3">
      <summary className="flex cursor-pointer items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground min-h-11">
        <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />
        {title}
        <span className="ml-auto rounded-full bg-muted/60 px-2 py-0.5 text-xs font-medium text-muted-foreground">{items.length}</span>
      </summary>
      <ul className="mt-2 space-y-0.5">
        {items.map((k) => {
          const meta = permMeta(k);
          return (
            <li key={k} className="flex items-center gap-1 rounded-md px-2 py-1 text-xs hover:bg-muted/30">
              <RiskDot k={k} />
              <span className="font-medium">{meta.label}</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">{meta.module}</span>
              <code className="ml-auto text-xs text-muted-foreground">{k}</code>
            </li>
          );
        })}
      </ul>
    </details>
  );
}