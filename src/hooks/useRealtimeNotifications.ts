import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";

/**
 * Subscribe to realtime inserts/updates on public.notifications for the given user.
 * Invalidates common notification query keys and shows a toast on new inserts
 * (skipped when the tab is hidden).
 */
export function useRealtimeNotifications(userId: string | null | undefined) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (payload) => {
          qc.invalidateQueries({ queryKey: ["buyer-notifications"] });
          qc.invalidateQueries({ queryKey: ["seller-notifications"] });
          qc.invalidateQueries({ queryKey: ["notification-summary"] });
          qc.invalidateQueries({ queryKey: ["dashboard"] });
          qc.invalidateQueries({ queryKey: ["seller-dashboard"] });

          if (payload.eventType === "INSERT" && typeof document !== "undefined" && document.visibilityState !== "hidden") {
            const row = payload.new as { title?: string; message?: string };
            toast(row.title ?? "New notification", { description: row.message });
          }
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId, qc]);
}