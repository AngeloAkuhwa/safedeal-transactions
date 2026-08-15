import { cn } from "@/lib/utils";

export type WorkspaceTab =
  | "role-matrix"
  | "role-detail"
  | "feature-registry"
  | "user-overrides"
  | "permission-templates"
  | "pending-approvals"
  | "change-history";

export const TAB_DEFS: Array<{ key: WorkspaceTab; label: string; short: string }> = [
  { key: "role-matrix", label: "Role Matrix", short: "Matrix" },
  { key: "role-detail", label: "Role Detail", short: "Detail" },
  { key: "feature-registry", label: "Feature Registry", short: "Features" },
  { key: "user-overrides", label: "User Overrides", short: "Overrides" },
  { key: "permission-templates", label: "Permission Templates", short: "Templates" },
  { key: "pending-approvals", label: "Pending Approvals", short: "Approvals" },
  { key: "change-history", label: "Change History", short: "History" },
];

export function PermissionWorkspaceTabs({
  active,
  onChange,
  counts,
}: {
  active: WorkspaceTab;
  onChange: (t: WorkspaceTab) => void;
  counts?: Partial<Record<WorkspaceTab, number>>;
}) {
  return (
    <div className="flex w-full items-center gap-1 overflow-x-auto rounded-full border border-border/70 bg-card/60 p-1 backdrop-blur-sm shadow-[0_1px_0_hsl(var(--border)/0.4)_inset]">
      {TAB_DEFS.map((t) => {
        const isActive = active === t.key;
        const count = counts?.[t.key];
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            className={cn(
              "relative shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition min-h-11",
              isActive
                ? "bg-primary/15 text-primary ring-1 ring-inset ring-primary/40"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <span className="hidden sm:inline">{t.label}</span>
            <span className="sm:hidden">{t.short}</span>
            {count != null && count > 0 && (
              <span className={cn(
                "ml-2 inline-flex h-4 min-w-[18px] items-center justify-center rounded-full px-1 font-mono text-[12px] font-semibold",
                isActive ? "bg-primary/25 text-primary" : "bg-muted text-muted-foreground",
              )}>
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
