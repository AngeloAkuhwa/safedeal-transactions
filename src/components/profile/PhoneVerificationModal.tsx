import { useState, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Phone, Loader2, CheckCircle2, ArrowLeft, ShieldCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { sendPhoneOtp, verifyPhoneOtp } from "@/services/profile.service";
import { resolveClaim } from "@/lib/trust/trust-claims";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPhone?: string | null;
}

type Step = "phone" | "otp" | "success";

export function PhoneVerificationModal({ open, onOpenChange, currentPhone }: Props) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState(currentPhone || "");
  const [otpCode, setOtpCode] = useState("");
  const [error, setError] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [devOtp, setDevOtp] = useState<string | null>(null);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setStep("phone");
      setPhone(currentPhone || "");
      setOtpCode("");
      setError("");
      setDevOtp(null);
      setCooldown(0);
    }
  }, [open, currentPhone]);

  // Cooldown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleSendOtp = useCallback(async () => {
    setError("");
    setIsSending(true);
    try {
      const result = await sendPhoneOtp(phone);
      setDevOtp(result.dev_otp || null);
      setStep("otp");
      setCooldown(60);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSending(false);
    }
  }, [phone]);

  const handleResend = useCallback(async () => {
    setError("");
    setOtpCode("");
    setIsSending(true);
    try {
      const result = await sendPhoneOtp(phone);
      setDevOtp(result.dev_otp || null);
      setCooldown(60);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSending(false);
    }
  }, [phone]);

  const handleVerify = useCallback(async () => {
    if (otpCode.length !== 6) return;
    setError("");
    setIsVerifying(true);
    try {
      await verifyPhoneOtp(otpCode);
      setStep("success");
      queryClient.invalidateQueries({ queryKey: ["buyer-profile"] });
      setTimeout(() => onOpenChange(false), 2000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsVerifying(false);
    }
  }, [otpCode, queryClient, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {step === "phone" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Phone className="h-5 w-5 text-primary" />
                Verify Your Phone Number
              </DialogTitle>
              <DialogDescription>
                We'll send a 6-digit verification code to your phone number.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Input
                  placeholder="+234XXXXXXXXXX or 0XXXXXXXXXX"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="rounded-xl"
                />
                <p className="text-xs text-muted-foreground">Nigerian phone number required</p>
              </div>
              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
              <Button
                onClick={handleSendOtp}
                disabled={!phone.trim() || isSending}
                className="w-full"
              >
                {isSending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Phone className="h-4 w-4 mr-2" />
                )}
                {isSending ? "Sending..." : "Send Verification Code"}
              </Button>
            </div>
          </>
        )}

        {step === "otp" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                Enter Verification Code
              </DialogTitle>
              <DialogDescription>
                Enter the 6-digit code sent to {phone}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              {devOtp && (
                <div className="bg-warning/10 border border-warning/30 rounded-lg p-3 text-center">
                  <p className="text-xs text-warning font-semibold">DEV MODE: OTP Code:</p>
                  <p className="text-2xl font-mono font-bold text-warning tracking-widest">{devOtp}</p>
                </div>
              )}

              <div className="flex justify-center">
                <InputOTP
                  maxLength={6}
                  value={otpCode}
                  onChange={(value) => setOtpCode(value)}
                >
                  <InputOTPGroup>
                    {[0, 1, 2, 3, 4, 5].map((i) => (
                      <InputOTPSlot key={i} index={i} />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
              </div>

              {error && (
                <p className="text-sm text-destructive text-center">{error}</p>
              )}

              <Button
                onClick={handleVerify}
                disabled={otpCode.length !== 6 || isVerifying}
                className="w-full"
              >
                {isVerifying ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                )}
                {isVerifying ? "Verifying..." : "Verify Code"}
              </Button>

              <div className="flex items-center justify-between">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setStep("phone"); setError(""); setOtpCode(""); }}
                >
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  Change number
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleResend}
                  disabled={cooldown > 0 || isSending}
                >
                  {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend Code"}
                </Button>
              </div>
            </div>
          </>
        )}

        {step === "success" && (
          <div className="py-8 text-center space-y-4">
            <div className="h-16 w-16 bg-success/10 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="h-8 w-8 text-success" />
            </div>
            <h3 className="text-xl font-bold text-foreground">{resolveClaim("SELLER_PHONE_VERIFIED", { phoneVerified: step === "success" })}!</h3>
            <p className="text-sm text-muted-foreground">
              Your phone number has been successfully verified.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
