import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUserId } from "./useCurrentUserId";

const ADMIN_TYPES = [
  "dispute_update",
  "security_alert",
  "verification_update",
  "system_message",
] as const;

/**
 * Unread admin-relevant notification count for the signed-in actor.
 * Mirrors the type filter used by `useRealtimeAdminNotifications`, so the bell
 * badge and the Notification Center stay in agreement.
 */
export function useAdminUnreadNotifications(): { unread: number; refresh: () => void } {
  const uid = useCurrentUserId();
  const [unread, setUnread] = useState(0);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    if (!uid) { setUnread(0); return; }
    let mounted = true;

    const load = async () => {
      const { count, error } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", uid)
        .eq("is_read", false)
        .in("type", [...ADMIN_TYPES]);
      if (!mounted) return;
      setUnread(error ? 0 : count ?? 0);
    };

    load();
    const poll = setInterval(load, 60_000);
    const channel = supabase
      .channel(`admin-unread:${uid}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${uid}` },
        load,
      )
      .subscribe();

    return () => {
      mounted = false;
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [uid, tick]);

  return { unread, refresh };
}
