import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TwoFactorDialog } from "./TwoFactorDialog";
import { useAal } from "@/hooks/useAal";

/**
 * Persistent (but non-blocking) enrolment prompt for internal teammates.
 * Navigation is never interrupted. Enforcement stays behind the default-OFF
 * `security.two_factor_admin_enforced` flag.
 */
export function TwoFactorEnrolmentBanner() {
  const { hasVerifiedFactor, loading, refresh } = useAal();
  const [open, setOpen] = useState(false);

  if (loading || hasVerifiedFactor) return null;

  return (
    <>
      <Card className="mb-4 border-destructive/40 bg-destructive/5 p-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <ShieldAlert className="h-5 w-5 text-destructive shrink-0" />
          <div>
            <p className="text-sm font-medium text-foreground">
              Two-factor authentication is required for back-office accounts
            </p>
            <p className="text-xs text-muted-foreground">
              Set up your authenticator app and save your recovery codes now, before enforcement is turned on.
            </p>
          </div>
        </div>
        <Button size="sm" onClick={() => setOpen(true)} className="shrink-0">Set up</Button>
      </Card>
      <TwoFactorDialog open={open} onOpenChange={setOpen} onChanged={refresh} />
    </>
  );
}