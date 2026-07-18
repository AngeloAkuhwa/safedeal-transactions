import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Admin-scope realtime subscription for the Notification Center.
 * Debounced invalidation absorbs broadcast bursts.
 */
export function useRealtimeAdminNotifications() {
  const qc = useQueryClient();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const kick = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        qc.invalidateQueries({ queryKey: ["admin-notifications"] });
      }, 750);
    };

    const channel = supabase
      .channel("admin-notifications-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, kick)
      .on("postgres_changes", { event: "*", schema: "public", table: "notification_deliveries" }, kick)
      .subscribe();

    return () => {
      if (timer.current) clearTimeout(timer.current);
      supabase.removeChannel(channel);
    };
  }, [qc]);
}