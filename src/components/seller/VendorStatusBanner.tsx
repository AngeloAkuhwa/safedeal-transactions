import { useEffect, useState } from "react";
import { AlertOctagon, PauseCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUserId } from "@/hooks/useCurrentUserId";

interface Row {
  status: "active" | "disabled" | "suspended";
  reason: string | null;
  changed_at: string | null;
}

/**
 * Rendered inside the seller shell. Silent when the current vendor is active;
 * shows a prominent banner when their account has been disabled/suspended by an admin.
 */
export function VendorStatusBanner() {
  const userId = useCurrentUserId();
  const [row, setRow] = useState<Row | null>(null);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("vendor_status, vendor_status_reason, vendor_status_changed_at")
        .eq("id", userId)
        .maybeSingle();
      if (!alive || !data) return;
      setRow({
        status: (data.vendor_status as Row["status"]) ?? "active",
        reason: data.vendor_status_reason ?? null,
        changed_at: data.vendor_status_changed_at ?? null,
      });
    })();
    return () => { alive = false; };
  }, [userId]);

  if (!row || row.status === "active") return null;

  const isSuspended = row.status === "suspended";
  const Icon = isSuspended ? AlertOctagon : PauseCircle;
  const title = isSuspended ? "Your seller account is suspended" : "Your seller account is disabled";
  const tone = isSuspended
    ? "border-destructive/40 bg-destructive/10 text-destructive"
    : "border-amber-500/40 bg-amber-500/10 text-amber-300";

  return (
    <div className={`border-b ${tone}`}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-2.5 flex items-start gap-2.5 text-sm">
        <Icon className="h-4 w-4 mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-tight">{title}</p>
          {row.reason && <p className="text-xs opacity-90 mt-0.5 break-words">{row.reason}</p>}
          <p className="text-xs opacity-75 mt-1">
            New checkouts on your products are blocked. Contact support to resolve this.
          </p>
        </div>
      </div>
    </div>
  );
}