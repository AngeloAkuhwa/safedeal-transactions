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
        // Use direct fetch instead of supabase.functions.invoke so a transient
        // 401 (e.g. token expiring mid-refresh) does not emit a console.error
        // that the runtime tracker misreads as a blank-screen crash.
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/security-config`;
        const res = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            "Content-Type": "application/json",
          },
        });
        if (res.ok) {
          const data = await res.json().catch(() => null);
          const mins = Number(data?.session_timeout_minutes);
          if (Number.isFinite(mins) && mins >= 1) timeoutMsRef.current = mins * 60 * 1000;
        }
        // Non-2xx (including 401 invalid_session) → keep default silently.
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