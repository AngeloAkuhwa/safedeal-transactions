import { useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useAdminRealtimeChannel,
  createBurstThrottle,
  type AdminRealtimeSub,
} from "./useAdminRealtimeChannel";

/**
 * Admin-scope realtime subscription for the Notification Center.
 *
 * Scale hardening (audit #12):
 * - Server-side filter on `notifications.type` so only admin-relevant types
 *   (dispute, security, verification, system) reach the browser. The full,
 *   noisy stream of buyer/seller transaction updates stays server-side.
 * - `notification_deliveries` is filtered to failure states: successful
 *   deliveries don't need to page the admin UI.
 * - Burst throttle collapses spikes to ≤ 1 invalidation per second.
 */
export function useRealtimeAdminNotifications() {
  const qc = useQueryClient();
  const throttleRef = useRef(createBurstThrottle(1000));

  const subs = useMemo<AdminRealtimeSub[]>(() => {
    const kick = () =>
      throttleRef.current(() =>
        qc.invalidateQueries({ queryKey: ["admin-notifications"] }),
      );
    return [
      {
        table: "notifications",
        filter:
          "type=in.(dispute_update,security_alert,verification_update,system_message)",
        onEvent: kick,
      },
      {
        table: "notification_deliveries",
        filter: "delivery_status=eq.failed",
        onEvent: kick,
      },
    ];
  }, [qc]);

  useAdminRealtimeChannel({
    channelName: "admin-notifications-live",
    subs,
  });
}