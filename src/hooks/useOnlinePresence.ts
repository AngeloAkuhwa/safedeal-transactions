import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Subscribes (observer-only) to the shared `presence:users` Realtime channel
 * and exposes the set of user IDs currently online.
 */
export function useOnlinePresence() {
  const [onlineIds, setOnlineIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const observerKey = `observer-${Math.random().toString(36).slice(2)}`;
    const channel = supabase.channel(`presence:users:observer:${observerKey}`, {
      config: { presence: { key: observerKey } },
    });

    const rebuild = () => {
      const state = channel.presenceState() as Record<string, Array<{ user_id?: string }>>;
      const ids = new Set<string>();
      for (const key of Object.keys(state)) {
        // Presence key is the user_id (from heartbeat); skip observer keys.
        if (key && !key.startsWith("observer")) ids.add(key);
        for (const entry of state[key] ?? []) {
          if (entry?.user_id) ids.add(entry.user_id);
        }
      }
      setOnlineIds(ids);
    };

    channel
      .on("presence", { event: "sync" }, rebuild)
      .on("presence", { event: "join" }, rebuild)
      .on("presence", { event: "leave" }, rebuild)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return useMemo(() => ({
    onlineIds,
    isOnline: (userId: string) => onlineIds.has(userId),
    onlineCount: onlineIds.size,
  }), [onlineIds]);
}