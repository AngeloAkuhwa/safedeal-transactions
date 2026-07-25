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
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <UserX className="h-6 w-6" />
      </div>
      <div>
        <div className="text-sm font-semibold text-foreground">{title}</div>
        <div className="mt-1 text-xs text-muted-foreground">{description}</div>
      </div>
      {action}
    </div>
  );
}