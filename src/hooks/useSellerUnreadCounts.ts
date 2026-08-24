import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface UnreadCounts {
  notifications: number;
  messages: number;
  total: number;
}

export function useSellerUnreadCounts() {
  const [userId, setUserId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setUserId(data.session?.user.id ?? null);
    });
    return () => { cancelled = true; };
  }, []);

  const query = useQuery<UnreadCounts>({
    queryKey: ["seller-unread-counts", userId],
    enabled: !!userId,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      if (!userId) return { notifications: 0, messages: 0, total: 0 };
      const [n, m] = await Promise.all([
        supabase
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("is_read", false),
        supabase
          .from("transaction_messages")
          .select("id", { count: "exact", head: true })
          .eq("recipient_user_id", userId)
          .eq("is_read", false),
      ]);
      const notifications = n.count ?? 0;
      const messages = m.count ?? 0;
      return { notifications, messages, total: notifications + messages };
    },
  });

  useEffect(() => {
    if (!userId) return;
    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: ["seller-unread-counts", userId] });
      queryClient.invalidateQueries({ queryKey: ["seller-dashboard"] });
    };

    const notifChan = supabase
      .channel(`seller-unread-notif-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        invalidate,
      )
      .subscribe();

    const msgChan = supabase
      .channel(`seller-unread-msg-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "transaction_messages", filter: `recipient_user_id=eq.${userId}` },
        invalidate,
      )
      .subscribe();

    return () => {
      supabase.removeChannel(notifChan);
      supabase.removeChannel(msgChan);
    };
  }, [userId, queryClient]);

  // These are unread-item counts, so an absent payload honestly means zero
  // unread. The count-named local keeps the money-zero guard able to tell
  // this apart from a monetary total, which must never fall back to 0.
  const totalCount = query.data?.total;
  return {
    notifications: query.data?.notifications ?? 0,
    messages: query.data?.messages ?? 0,
    total: totalCount ?? 0,
    userId,
  };
}