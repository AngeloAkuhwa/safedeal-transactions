import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUserId } from "./useCurrentUserId";

/**
 * Live count of permission change-sets currently `pending_approval` that the
 * signed-in actor is eligible to approve. Hidden (returns 0) when the actor
 * cannot approve anything, so callers can gate rendering with `count > 0`.
 */
export function usePendingApprovalsBadge(): { count: number; loading: boolean } {
  const uid = useCurrentUserId();
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) { setCount(0); setLoading(false); return; }
    let mounted = true;

    const refresh = async () => {
      const { data, error } = await supabase.rpc("count_pending_approvals_for_actor", { _actor: uid });
      if (!mounted) return;
      setLoading(false);
      if (error) { setCount(0); return; }
      setCount(typeof data === "number" ? data : 0);
    };

    refresh();
    const poll = setInterval(refresh, 60_000);

    const channel = supabase
      .channel(`pending-approvals:${uid}:${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "permission_change_sets" }, refresh)
      .subscribe();

    return () => {
      mounted = false;
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [uid]);

  return { count, loading };
}