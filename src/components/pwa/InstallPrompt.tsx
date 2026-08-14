import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Custom "Add to home screen" card.
 *
 * Only shown after a meaningful signal (second visit, or an explicit
 * `safedeal:install-signal` event fired after onboarding / first product),
 * never on first paint. Dismissal is remembered and it is capped at two
 * lifetime impressions.
 */

const VISITS_KEY = "sd_pwa_visits";
const SHOWN_KEY = "sd_pwa_prompt_shown";
const DISMISSED_KEY = "sd_pwa_prompt_dismissed";
const MAX_IMPRESSIONS = 2;

export const INSTALL_SIGNAL_EVENT = "safedeal:install-signal";

/** Fire from onboarding/first-product success paths to surface the prompt. */
export function emitInstallSignal(): void {
  try {
    localStorage.setItem("sd_pwa_signal", "1");
  } catch {
    /* storage may be unavailable */
  }
  window.dispatchEvent(new Event(INSTALL_SIGNAL_EVENT));
}

function readNumber(key: string): number {
  try {
    return Number(localStorage.getItem(key) ?? "0") || 0;
  } catch {
    return 0;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage may be unavailable */
  }
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  // Count visits once per page load.
  useEffect(() => {
    write(VISITS_KEY, String(readNumber(VISITS_KEY) + 1));
  }, []);

  useEffect(() => {
    const alreadyDismissed = (() => {
      try {
        return localStorage.getItem(DISMISSED_KEY) === "1";
      } catch {
        return false;
      }
    })();
    const impressions = readNumber(SHOWN_KEY);
    if (alreadyDismissed || impressions >= MAX_IMPRESSIONS) return;

    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) return;

    const hasSignal = () => {
      try {
        return readNumber(VISITS_KEY) >= 2 || localStorage.getItem("sd_pwa_signal") === "1";
      } catch {
        return false;
      }
    };

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
      if (hasSignal()) {
        setVisible(true);
        write(SHOWN_KEY, String(impressions + 1));
      }
    };

    const onSignal = () => {
      setDeferred((current) => {
        if (current && !visible) {
          setVisible(true);
          write(SHOWN_KEY, String(readNumber(SHOWN_KEY) + 1));
        }
        return current;
      });
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener(INSTALL_SIGNAL_EVENT, onSignal);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener(INSTALL_SIGNAL_EVENT, onSignal);
    };
  }, [visible]);

  if (!visible || !deferred) return null;

  const dismiss = () => {
    write(DISMISSED_KEY, "1");
    setVisible(false);
  };

  const install = async () => {
    setVisible(false);
    try {
      await deferred.prompt();
      await deferred.userChoice;
    } catch {
      /* user agent may reject a stale prompt */
    }
    setDeferred(null);
  };

  return (
    <div
      role="dialog"
      aria-label="Add SafeDeal to your home screen"
      className="fixed inset-x-3 bottom-3 z-[70] mx-auto max-w-md rounded-2xl border border-border bg-card/95 p-4 shadow-lg backdrop-blur md:left-auto md:right-4 md:mx-0"
      style={{ bottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <Download className="h-5 w-5 text-primary" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">Add SafeDeal to your home screen</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Open your protected deals in one tap, like an app.
          </p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={install}>Add to home screen</Button>
            <Button size="sm" variant="ghost" onClick={dismiss}>Not now</Button>
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss install prompt"
          className="rounded-lg p-1 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
