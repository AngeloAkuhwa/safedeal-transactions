import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useAuthState() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  const syncAuthState = useCallback(async (hasSessionHint: boolean) => {
    if (!hasSessionHint) {
      setIsAuthenticated(false);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase.auth.getUser();
    const hasValidUser = !!data.user && !error;

    setIsAuthenticated(hasValidUser);
    setLoading(false);

    const status = typeof error === "object" && error && "status" in error ? error.status : undefined;
    if (!hasValidUser && (status === 401 || status === 403)) {
      await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setLoading(true);
      void syncAuthState(!!session);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      void syncAuthState(!!session);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [syncAuthState]);

  return { isAuthenticated, loading };
}