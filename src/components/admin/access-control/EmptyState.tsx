import { UserX } from "lucide-react";
import type { ReactNode } from "react";

interface Props {
  title?: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({
  title = "No users match these filters",
  description = "Try clearing filters or inviting a new internal user.",
  action,
}: Props) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-12 text-center">
      <UserX className="h-8 w-8 text-muted-foreground/40" />
      <div>
        <div className="text-sm font-semibold text-foreground">{title}</div>
        <div className="mt-1 text-xs text-muted-foreground">{description}</div>
      </div>
      {action}
    </div>
  );
}