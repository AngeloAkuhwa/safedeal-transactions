import { useCallback, useEffect, useState } from "react";
import { Loader2, ShieldCheck, ShieldOff } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/sonner";
import { RecoveryCodesPanel } from "./RecoveryCodesPanel";
import {
  cleanUpUnverifiedFactors,
  getMfaStatus,
  listFactors,
  startEnrolment,
  unenrol,
  verifyFactor,
  type MfaStatus,
} from "@/services/mfa.service";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged?: () => void;
}

type Enrolment = { factorId: string; qrCode: string; secret: string } | null;

export function TwoFactorDialog({ open, onOpenChange, onChanged }: Props) {
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [enrolment, setEnrolment] = useState<Enrolment>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setStatus(await getMfaStatus());
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setEnrolment(null);
    setCode("");
    refresh();
  }, [open, refresh]);

  // Abandoned enrolment must not leave a junk unverified factor behind.
  const closeAndCleanUp = async (next: boolean) => {
    if (!next && enrolment) {
      await cleanUpUnverifiedFactors().catch(() => undefined);
      setEnrolment(null);
    }
    onOpenChange(next);
  };

  const beginEnrolment = async () => {
    setBusy(true);
    try {
      setEnrolment(await startEnrolment());
    } catch (err) {
      toast.error((err as Error).message || "Could not start setup");
    } finally {
      setBusy(false);
    }
  };

  const confirmEnrolment = async () => {
    if (!enrolment) return;
    setBusy(true);
    try {
      await verifyFactor(enrolment.factorId, code);
      toast.success("Two-factor authentication is now active");
      setEnrolment(null);
      setCode("");
      await refresh();
      onChanged?.();
    } catch (err) {
      toast.error((err as Error).message || "That code was not correct");
    } finally {
      setBusy(false);
    }
  };

  const removeFactor = async () => {
    setBusy(true);
    try {
      const factors = await listFactors();
      for (const f of factors) await unenrol(f.id);
      toast.success("Two-factor authentication removed");
      await refresh();
      onChanged?.();
    } catch (err) {
      toast.error((err as Error).message || "Could not remove two-factor authentication");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={closeAndCleanUp}>
      <DialogContent className="sm:max-w-md max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Two-Factor Authentication</DialogTitle>
          <DialogDescription>
            Use an authenticator app to add a second step when you sign in.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-3 py-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : enrolment ? (
          <div className="space-y-4 py-2">
            <div className="flex justify-center">
              <img
                src={enrolment.qrCode}
                alt="Scan this QR code with your authenticator app"
                className="h-44 w-44 rounded-lg border bg-background p-2"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Can't scan? Enter this key manually</Label>
              <p className="rounded border bg-muted/50 px-2 py-1 font-mono text-xs break-all">
                {enrolment.secret}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="totp">6-digit code</Label>
              <Input
                id="totp"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
              />
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center">
                  {status?.has_verified_factor
                    ? <ShieldCheck className="h-5 w-5 text-success" />
                    : <ShieldOff className="h-5 w-5 text-muted-foreground" />}
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Authenticator app</p>
                  <p className="text-xs text-muted-foreground">
                    {status?.has_verified_factor
                      ? "Active on this account"
                      : "Not set up yet"}
                  </p>
                </div>
              </div>
              <Badge variant="outline" className="text-muted-foreground">
                {status?.has_verified_factor ? "Enabled" : "Disabled"}
              </Badge>
            </div>

            {status?.has_verified_factor && (
              <RecoveryCodesPanel
                unused={status.recovery_codes_unused}
                total={status.recovery_codes_total}
                onGenerated={refresh}
              />
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          {enrolment ? (
            <>
              <Button variant="outline" onClick={() => closeAndCleanUp(false)} disabled={busy}>
                Cancel
              </Button>
              <Button onClick={confirmEnrolment} disabled={busy || code.length !== 6}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Verify and enable
              </Button>
            </>
          ) : status?.has_verified_factor ? (
            <Button variant="outline" onClick={removeFactor} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Turn off
            </Button>
          ) : (
            <Button onClick={beginEnrolment} disabled={busy || loading}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Set up
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}