import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Signs the current user out after N minutes of no user interaction.
 * N is sourced from the platform setting `security.session_timeout_minutes`
 * via the `security-config` edge function. No-ops when signed out.
 *
 * Activity events: mousemove, mousedown, keydown, touchstart, scroll, visibilitychange.
 */
export function useSessionIdleTimeout() {
  const timerRef = useRef<number | null>(null);
  const timeoutMsRef = useRef<number>(30 * 60 * 1000);

  useEffect(() => {
    let cancelled = false;
    let unsub: (() => void) | null = null;

    const clear = () => { if (timerRef.current) window.clearTimeout(timerRef.current); timerRef.current = null; };

    const doSignOut = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
      toast("Signed out due to inactivity", { description: "Please sign back in to continue." });
    };

    const reset = () => {
      clear();
      timerRef.current = window.setTimeout(doSignOut, timeoutMsRef.current);
    };

    const attach = () => {
      const evs = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "visibilitychange"] as const;
      evs.forEach((e) => window.addEventListener(e, reset, { passive: true }));
      unsub = () => evs.forEach((e) => window.removeEventListener(e, reset));
      reset();
    };

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || cancelled) return;
      try {
        const { data, error } = await supabase.functions.invoke("security-config");
        if (!error && data?.session_timeout_minutes) {
          const mins = Number(data.session_timeout_minutes);
          if (Number.isFinite(mins) && mins >= 1) timeoutMsRef.current = mins * 60 * 1000;
        }
      } catch { /* keep default */ }
      if (cancelled) return;
      attach();
    })();

    const { data: authSub } = supabase.auth.onAuthStateChange((_ev, s) => {
      if (!s) { clear(); if (unsub) { unsub(); unsub = null; } }
    });

    return () => {
      cancelled = true;
      clear();
      if (unsub) unsub();
      authSub.subscription.unsubscribe();
    };
  }, []);
}