import { useEffect, useState } from "react";
import { useLocation } from "react-router";
import { ShieldCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { TwoFactorDialog } from "./TwoFactorDialog";
import { useAal } from "@/hooks/useAal";
import {
  isPromptDeniedPath,
  isPromptSnoozed,
  snoozePrompt,
} from "@/lib/mfa-prompt-policy";

/**
 * Buyer/seller 2FA offer. Always skippable, re-prompts at most every 30 days,
 * and renders nothing on money, transaction, dispute or auth routes so it can
 * never interrupt a purchase.
 */
export function TwoFactorPrompt() {
  const { pathname } = useLocation();
  const { hasVerifiedFactor, loading } = useAal();
  const [open, setOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);

  const blocked = isPromptDeniedPath(pathname);

  useEffect(() => {
    if (loading || blocked || hasVerifiedFactor) return;
    if (isPromptSnoozed()) return;
    const t = setTimeout(() => setOpen(true), 1200);
    return () => clearTimeout(t);
  }, [loading, blocked, hasVerifiedFactor, pathname]);

  if (blocked) return null;

  const dismiss = () => {
    snoozePrompt();
    setOpen(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : dismiss())}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Add extra protection
            </DialogTitle>
            <DialogDescription>
              Turn on two-factor authentication so a stolen password alone can't reach your
              SafeDeal account. It takes about a minute and you can do it later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={dismiss}>Not now</Button>
            <Button onClick={() => { setOpen(false); setSetupOpen(true); }}>Set up 2FA</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TwoFactorDialog open={setupOpen} onOpenChange={setSetupOpen} />
    </>
  );
}