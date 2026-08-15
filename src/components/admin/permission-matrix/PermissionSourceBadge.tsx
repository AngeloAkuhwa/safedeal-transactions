import { cn } from "@/lib/utils";
import {
  Layers, Sparkles, User, Clock, Ban, Wrench,
} from "lucide-react";
import {
  PERMISSION_SOURCE_LABEL,
  type PermissionSource,
} from "@/services/permission-catalog";

const STYLE: Record<PermissionSource, { cls: string; Icon: typeof Layers }> = {
  system_default:    { cls: "border-muted-foreground/25 bg-muted/40 text-muted-foreground", Icon: Layers },
  role_template:     { cls: "border-violet-500/40 bg-violet-500/10 text-violet-300",        Icon: Sparkles },
  direct_role:       { cls: "border-sky-500/40 bg-sky-500/10 text-sky-300",                 Icon: Wrench },
  user_override:     { cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",     Icon: User },
  temporary_access:  { cls: "border-amber-500/40 bg-amber-500/10 text-amber-300",           Icon: Clock },
  system_restriction:{ cls: "border-rose-500/40 bg-rose-500/10 text-rose-300",              Icon: Ban },
};

export function PermissionSourceBadge({
  source,
  size = "sm",
  title,
}: {
  source: PermissionSource;
  size?: "sm" | "xs";
  title?: string;
}) {
  const { cls, Icon } = STYLE[source];
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium",
        size === "xs" ? "text-xs" : "text-xs",
        cls,
      )}
    >
      <Icon className="h-3 w-3" />
      {PERMISSION_SOURCE_LABEL[source]}
    </span>
  );
}