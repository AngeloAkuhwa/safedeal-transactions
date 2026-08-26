import { RefreshCw, ShieldCheck } from "lucide-react";
import logo from "@/assets/safedeal-logo.svg";
import { Button } from "@/components/ui/button";

interface AuthUnavailableProps {
  onRetry: () => void;
}

/**
 * Shown when the sign-in service stopped answering, not when it said no.
 *
 * The distinction is the whole point, and it has to survive into the words.
 * "Session expired" or "please sign in again" would be a lie: the session is
 * fine, and telling someone their session ended when it did not sends them
 * hunting for a password they do not need to enter. What actually happened is
 * that we could not check, so that is what it says.
 *
 * The reassurance about money is not decoration. This screen can appear over
 * a checkout, and the first thought of someone who was mid-payment is whether
 * their funds moved. Answering that before they have to ask is the difference
 * between an outage and a panic.
 *
 * It says what it can defend and no more. "Nothing has moved" was the first
 * draft and is not something this screen can promise: a payment already in
 * flight is not undone by a sign-in outage. What IS true, and was true in both
 * incidents, is that the degradation is confined to the sign-in service while
 * Postgres and the escrow ledger stayed healthy. So the claim is about where
 * the money lives, not about what has or has not happened to it.
 */
const AuthUnavailable = ({ onRetry }: AuthUnavailableProps) => {
  return (
    <div
      role="alert"
      className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 bg-background px-6 py-12 text-center"
    >
      <img src={logo} alt="SafeDeal" width={64} height={64} className="h-16 w-16" />

      <div className="flex max-w-prose flex-col gap-2">
        <h1 className="text-xl font-bold tracking-tight text-foreground">
          We could not reach the sign-in service
        </h1>
        <p className="text-sm text-muted-foreground">
          You are still signed in. We just could not confirm it from here, so we have kept you
          where you are rather than send you back to the login screen.
        </p>
      </div>

      <div className="flex w-full max-w-sm items-start gap-3 rounded-lg border border-border bg-card p-4 text-left">
        {/* Neutral, not success. Nothing here has completed; this is a
            reassurance about where money lives during an outage, and the
            colour law reserves the success tone for a genuinely finished
            state. The words carry the meaning at full contrast. */}
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">
          This affects sign-in only. Your transactions and any money held in escrow live
          elsewhere and are not touched by it.
        </p>
      </div>

      <Button onClick={onRetry} className="min-h-11 gap-2">
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
        Try again
      </Button>

      <p className="max-w-prose text-xs text-muted-foreground">
        This is usually brief. If it keeps happening, the problem is on our side and we are
        already seeing it.
      </p>
    </div>
  );
};

export default AuthUnavailable;
