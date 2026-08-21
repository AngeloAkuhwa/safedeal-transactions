import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Sends periodic presence heartbeats for signed-in internal users so they
 * appear online in the Task Orchestration roster. Silently no-ops for
 * non-internal users (edge function returns 403).
 */
export function useAgentHeartbeat(intervalMs = 60_000) {
  useEffect(() => {
    let cancelled = false;
    const ping = async (status?: "available" | "busy" | "offline") => {
      try {
        const { data: sess } = await supabase.auth.getSession();
        const token = sess.session?.access_token;
        if (!token) return;
        await supabase.functions.invoke("admin-agent-heartbeat", {
          body: status ? { status } : {},
        });
      } catch {
        /* offline / not internal: ignore */
      }
    };

    ping();
    const timer = setInterval(() => { if (!cancelled) ping(); }, intervalMs);
    const onVisibility = () => { if (document.visibilityState === "visible") ping(); };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs]);
}