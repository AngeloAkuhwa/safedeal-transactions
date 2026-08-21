import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

/**
 * Subscription descriptor for an admin realtime channel.
 * `filter` uses the postgres_changes filter syntax, e.g. `status=in.(flagged,frozen)`
 * or `type=eq.security_alert`. Passing a filter is what keeps the browser sane
 * at platform scale: without it every admin receives every row change on the table.
 */
export interface AdminRealtimeSub {
  table: string;
  event?: "INSERT" | "UPDATE" | "DELETE" | "*";
  filter?: string;
  /** Called on every event that passes the filter. Payload id is de-duplicated. */
  onEvent: (payload: any) => void;
}

export interface UseAdminRealtimeChannelOptions {
  channelName: string;
  subs: AdminRealtimeSub[];
  /** Optional connection status callback. */
  onStatus?: (status: "connecting" | "live" | "off") => void;
  enabled?: boolean;
}

/**
 * Shared factory for admin realtime channels.
 * - Enforces server-side filters (`filter` field on each sub) so Postgres only
 *   forwards rows the admin actually cares about.
 * - Small in-memory de-dupe (last 200 event ids) so retries don't double-fire.
 * - Automatic teardown on unmount.
 */
export function useAdminRealtimeChannel({
  channelName,
  subs,
  onStatus,
  enabled = true,
}: UseAdminRealtimeChannelOptions) {
  const subsRef = useRef(subs);
  subsRef.current = subs;

  useEffect(() => {
    if (!enabled) return;
    onStatus?.("connecting");

    const seen: string[] = [];
    const dedupe = (id: string | undefined) => {
      if (!id) return false;
      if (seen.includes(id)) return true;
      seen.push(id);
      if (seen.length > 200) seen.shift();
      return false;
    };

    const channel: RealtimeChannel = supabase.channel(channelName);
    for (const sub of subsRef.current) {
      const config: Record<string, string> = {
        event: sub.event ?? "*",
        schema: "public",
        table: sub.table,
      };
      if (sub.filter) config.filter = sub.filter;
      channel.on(
        "postgres_changes" as any,
        config as any,
        (payload: any) => {
          const rowId =
            payload?.new?.id ?? payload?.old?.id ?? payload?.commit_timestamp;
          if (dedupe(`${sub.table}:${payload?.eventType}:${rowId}`)) return;
          sub.onEvent(payload);
        },
      );
    }

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") onStatus?.("live");
      else if (
        status === "CHANNEL_ERROR" ||
        status === "TIMED_OUT" ||
        status === "CLOSED"
      ) {
        onStatus?.("off");
      }
    });

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelName, enabled]);
}

/**
 * Throttle helper for realtime bursts. Returns a function that will invoke
 * `fn` at most once per `windowMs`, collapsing intermediate calls.
 */
export function createBurstThrottle(windowMs: number) {
  let last = 0;
  let pending: ReturnType<typeof setTimeout> | null = null;
  return (fn: () => void) => {
    const now = Date.now();
    const wait = Math.max(0, last + windowMs - now);
    if (wait === 0) {
      last = now;
      fn();
      return;
    }
    if (pending) return;
    pending = setTimeout(() => {
      pending = null;
      last = Date.now();
      fn();
    }, wait);
  };
}