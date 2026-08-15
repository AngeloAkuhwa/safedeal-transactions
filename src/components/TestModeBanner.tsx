import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";

const DISMISS_KEY = "sd-test-mode-banner-dismissed";

/**
 * Detects Paystack test mode from a non-secret, client-safe signal only:
 * - VITE_PAYSTACK_TEST_MODE=true, or
 * - a publicly exposed Paystack key prefixed with "pk_test_"
 * Never reads or renders any secret key. Defaults to hidden.
 */
export function isPaystackTestMode(): boolean {
  const explicitFlag = String(import.meta.env.VITE_PAYSTACK_TEST_MODE ?? "").toLowerCase();
  if (explicitFlag === "true") return true;
  if (explicitFlag === "false") return false;

  const publicKey = String(import.meta.env.VITE_PAYSTACK_PUBLIC_KEY ?? "");
  if (publicKey.startsWith("pk_test_")) return true;

  return false;
}

export function TestModeBanner() {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setDismissed(window.sessionStorage.getItem(DISMISS_KEY) === "1");
  }, []);

  if (!isPaystackTestMode() || dismissed) return null;

  const handleDismiss = () => {
    window.sessionStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  };

  return (
    <div className="relative flex items-center justify-center gap-2 bg-warning/15 px-4 py-1.5 text-center text-xs font-medium text-warning-foreground border-b border-warning/30">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
      <span>Test mode — payments are simulated and no real money moves.</span>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss test mode notice"
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 hover:bg-warning/20 min-h-11"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
