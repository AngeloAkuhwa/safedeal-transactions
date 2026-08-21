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

  // Tone is carried by the surface and the icon; the words are `text-foreground`.
  //
  // The disabled branch used to be `bg-amber-500/10 text-amber-300`, three raw
  // Tailwind colours outside the token system, and `amber-300` is a light shade
  // fixed in both themes, so on the near-white app background it landed around
  // 1.4:1. That is not a styling preference, it is unreadable, on the one banner
  // that exists to tell a seller their account has stopped taking checkouts.
  // Tinting the copy with `--warning` instead would only reach ~2:1.
  //
  // So the colour moves to where it can be saturated without costing legibility
  // (the border, the wash and the glyph) and the text runs at full contrast.
  // Applied to the suspended branch too: `text-destructive` on `bg-destructive/10`
  // was about 3.3:1, also short of the 4.5:1 this size needs.
  const tone = isSuspended
    ? { surface: "border-destructive/40 bg-destructive/10", icon: "text-destructive" }
    : { surface: "border-warning/40 bg-warning/10", icon: "text-warning" };

  return (
    <div className={`border-b ${tone.surface}`}>
      <div className="mx-auto flex max-w-7xl items-start gap-2.5 px-4 py-2.5 text-sm text-foreground sm:px-6 lg:px-8">
        <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${tone.icon}`} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-tight">{title}</p>
          {row.reason && (
            <p className="mt-0.5 break-words text-xs text-muted-foreground">{row.reason}</p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            New checkouts on your products are blocked. Contact support to resolve this.
          </p>
        </div>
      </div>
    </div>
  );
}