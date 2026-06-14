import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Broadcasts the signed-in user's presence on a shared Realtime channel so
 * admin screens can show online/offline indicators without DB writes.
 * Mount once in the app shell.
 */
export function usePresenceHeartbeat() {
  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const join = async (userId: string) => {
      if (cancelled) return;
      const ch = supabase.channel("presence:users", {
        config: { presence: { key: userId } },
      });
      ch.on("presence", { event: "sync" }, () => { /* no-op for broadcaster */ });
      await ch.subscribe(async (status) => {
        if (status === "SUBSCRIBED" && !cancelled) {
          await ch.track({ user_id: userId, joined_at: new Date().toISOString() });
        }
      });
      channel = ch;
    };

    const teardown = async () => {
      if (channel) {
        try { await channel.untrack(); } catch { /* ignore */ }
        supabase.removeChannel(channel);
        channel = null;
      }
    };

    supabase.auth.getSession().then(({ data }) => {
      const uid = data.session?.user?.id;
      if (uid) void join(uid);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      void teardown().then(() => {
        const uid = session?.user?.id;
        if (uid) void join(uid);
      });
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
      void teardown();
    };
  }, []);
}