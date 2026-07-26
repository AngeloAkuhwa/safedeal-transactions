import { ShieldAlert, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export function PermissionRiskBadge({ privileged, size = "sm" }: { privileged: boolean; size?: "sm" | "xs" }) {
  const Icon = privileged ? ShieldAlert : ShieldCheck;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium",
        size === "xs" ? "text-[10px]" : "text-xs",
        privileged
          ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
          : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
      )}
    >
      <Icon className="h-3 w-3" />
      {privileged ? "Privileged" : "Standard"}
    </span>
  );
}
