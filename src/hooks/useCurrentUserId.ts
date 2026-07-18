import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** Reactive current auth user id, or null when signed out. */
export function useCurrentUserId(): string | null {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setId(data.session?.user?.id ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setId(session?.user?.id ?? null);
    });
    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, []);
  return id;
}