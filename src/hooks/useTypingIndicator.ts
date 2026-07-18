import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Lightweight typing indicator over a Supabase realtime broadcast channel.
 * No DB writes. Scope by threadId (e.g., transaction id).
 */
export function useTypingIndicator(threadId: string | null | undefined, userId: string | null | undefined, displayName?: string) {
  const [typingUsers, setTypingUsers] = useState<Record<string, { name: string; at: number }>>({});
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastSentRef = useRef(0);

  useEffect(() => {
    if (!threadId) return;
    const channel = supabase.channel(`typing:${threadId}`, { config: { broadcast: { self: false } } });
    channel
      .on("broadcast", { event: "typing" }, (payload) => {
        const p = payload.payload as { userId: string; name: string };
        if (!p?.userId || p.userId === userId) return;
        setTypingUsers((prev) => ({ ...prev, [p.userId]: { name: p.name, at: Date.now() } }));
      })
      .subscribe();
    channelRef.current = channel;

    const gc = setInterval(() => {
      const now = Date.now();
      setTypingUsers((prev) => {
        const next: typeof prev = {};
        for (const [k, v] of Object.entries(prev)) if (now - v.at < 4000) next[k] = v;
        return next;
      });
    }, 1500);

    return () => {
      clearInterval(gc);
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [threadId, userId]);

  const notifyTyping = useCallback(() => {
    if (!threadId || !userId || !channelRef.current) return;
    const now = Date.now();
    if (now - lastSentRef.current < 1500) return;
    lastSentRef.current = now;
    channelRef.current.send({
      type: "broadcast",
      event: "typing",
      payload: { userId, name: displayName ?? "Someone" },
    });
  }, [threadId, userId, displayName]);

  return { typingUsers: Object.values(typingUsers), notifyTyping };
}