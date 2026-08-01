import type { ReactNode } from "react";
import { Users } from "lucide-react";

export function EmptyState({
  title, hint, icon: Icon = Users, action,
}: { title: string; hint?: string; icon?: any; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-card/40 p-10 text-center">
      <Icon className="mb-3 h-6 w-6 text-muted-foreground" aria-hidden />
      <div className="text-sm font-medium text-foreground">{title}</div>
      {hint && <div className="mt-1 max-w-md text-xs text-muted-foreground">{hint}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}