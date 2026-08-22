import { useEffect, useState } from "react";
import { useParams, Link } from "react-router";
import { Loader2, ShieldCheck, Phone, CheckCircle2, AlertCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useToast } from "@/hooks/use-toast";
import {
  lookupDeliveryToken,
  sendDeliveryOtp,
  confirmDeliveryOtp,
  type DeliveryTokenInfo,
} from "@/services/delivery-token.service";
import { BlockSkeleton } from "@/components/common/PageSkeleton";

type Stage = "loading" | "ready" | "otp_sent" | "confirmed" | "error";

export default function DeliveryConfirm() {
  const { token } = useParams<{ token: string }>();
  const { toast } = useToast();

  const [stage, setStage] = useState<Stage>("loading");
  const [info, setInfo] = useState<DeliveryTokenInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("No token provided.");
      setStage("error");
      return;
    }
    lookupDeliveryToken(token)
      .then((data) => {
        setInfo(data);
        setStage("ready");
      })
      .catch((err: Error) => {
        setError(err.message);
        setStage("error");
      });
  }, [token]);

  const handleSendOtp = async () => {
    if (!token) return;
    setResending(true);
    try {
      const result = await sendDeliveryOtp(token);
      toast({
        title: result.sms_delivered === false ? "Code generated" : "Code sent to buyer",
        description:
          result.sms_delivered === false
            ? `Ask the buyer for the 6-digit code sent to ${result.masked_buyer_phone ?? "their phone"}. If they did not receive it, they can confirm delivery from their own SafeDeal account.`
            : `We've sent a 6-digit code to ${result.masked_buyer_phone}.`,
      });
      setStage("otp_sent");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not send code";
      toast({ title: "Could not send code", description: msg, variant: "destructive" });
    } finally {
      setResending(false);
    }
  };

  const handleConfirm = async () => {
    if (!token || otpCode.length !== 6) return;
    setSubmitting(true);
    try {
      const result = await confirmDeliveryOtp(token, otpCode);
      toast({ title: result.message });
      setStage("confirmed");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Confirmation failed";
      toast({ title: "Could not confirm", description: msg, variant: "destructive" });
      setOtpCode("");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-background to-muted/30 flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-6 sm:p-8 space-y-6 rounded-2xl shadow-xl">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-lg font-bold text-foreground">SafeDeal Delivery</h1>
            <p className="text-xs text-muted-foreground">Confirm with buyer's one-time code</p>
          </div>
        </div>

        {stage === "loading" && (
          <div className="space-y-3 py-6">
            <BlockSkeleton label="Looking up the delivery" lines={3} />
            <p className="text-center text-sm text-muted-foreground">Looking up delivery…</p>
          </div>
        )}

        {stage === "error" && (
          <div className="space-y-4">
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-foreground">{error ?? "This link is no longer valid"}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Ask the seller to issue a fresh confirmation link.
                </p>
              </div>
            </div>
            <Button asChild variant="outline" className="w-full rounded-xl">
              <Link to="/">Return to home</Link>
            </Button>
          </div>
        )}

        {(stage === "ready" || stage === "otp_sent") && info && (
          <>
            <div className="rounded-xl bg-muted/50 border border-border p-4 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Delivery for</p>
              <p className="text-base font-bold text-foreground">{info.item_title}</p>
              <p className="text-xs text-muted-foreground">
                Order <span className="font-mono">{info.transaction_code}</span> · From {info.seller_name}
              </p>
            </div>

            {stage === "ready" && (
              <div className="space-y-4">
                <div className="rounded-xl border border-border p-4 space-y-3">
                  <p className="text-sm font-semibold text-foreground">Step 1: Send code to buyer</p>
                  {info.has_phone ? (
                    <p className="text-sm text-muted-foreground">
                      We'll text a 6-digit code to <span className="font-mono">{info.masked_buyer_phone}</span> ({info.buyer_name_first}). Ask them to read it to you ONLY when they have the item in hand.
                    </p>
                  ) : (
                    <p className="text-sm text-destructive">
                      The buyer has no phone number on file. They'll need to confirm directly in their app.
                    </p>
                  )}
                  <Button
                    onClick={handleSendOtp}
                    disabled={!info.has_phone || resending}
                    className="w-full rounded-xl"
                  >
                    {resending ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sending…</>
                    ) : (
                      <><Phone className="h-4 w-4 mr-2" /> Send code to buyer</>
                    )}
                  </Button>
                </div>
              </div>
            )}

            {stage === "otp_sent" && (
              <div className="space-y-4">
                <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-4 space-y-3">
                  <p className="text-sm font-semibold text-foreground">Step 2: Enter the code</p>
                  <p className="text-xs text-muted-foreground">
                    Ask {info.buyer_name_first} for the 6-digit code from their phone.
                  </p>
                  <div className="flex justify-center py-2">
                    <InputOTP value={otpCode} onChange={setOtpCode} maxLength={6}>
                      <InputOTPGroup>
                        {[0, 1, 2, 3, 4, 5].map((i) => (
                          <InputOTPSlot key={i} index={i} />
                        ))}
                      </InputOTPGroup>
                    </InputOTP>
                  </div>
                  <Button
                    onClick={handleConfirm}
                    disabled={otpCode.length !== 6 || submitting}
                    className="w-full rounded-xl"
                  >
                    {submitting ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Confirming…</>
                    ) : (
                      <>Confirm delivery <ArrowRight className="h-4 w-4 ml-2" /></>
                    )}
                  </Button>
                  <button
                    type="button"
                    onClick={handleSendOtp}
                    disabled={resending}
                    className="text-xs text-primary hover:underline disabled:opacity-50 w-full text-center"
                  >
                    {resending ? "Sending…" : "Resend code"}
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {stage === "confirmed" && (
          <div className="space-y-4">
            <div className="rounded-xl border-2 border-success/30 bg-success/5 p-6 text-center space-y-3">
              <CheckCircle2 className="mx-auto h-6 w-6 text-success" />
              <p className="text-base font-bold text-foreground">Delivery confirmed</p>
              <p className="text-sm text-muted-foreground">
                The buyer now has time to inspect the item before funds are released. Thanks for delivering with SafeDeal.
              </p>
            </div>
            <Button asChild variant="outline" className="w-full rounded-xl">
              <Link to="/">Done</Link>
            </Button>
          </div>
        )}

        <p className="text-xs text-muted-foreground text-center pt-2 border-t">
          Powered by SafeDeal · Buyer-authorized handoff confirmation
        </p>
      </Card>
    </div>
  );
}
