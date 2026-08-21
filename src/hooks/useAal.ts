import { useCallback, useEffect, useState } from "react";
import { getAal, listFactors } from "@/services/mfa.service";
import { onAuthStateChange } from "@/services/auth.service";

export interface AalState {
  currentLevel: string | null;
  nextLevel: string | null;
  needsStepUp: boolean;
  hasVerifiedFactor: boolean;
  loading: boolean;
  refresh: () => void;
}

/**
 * Read-only assurance-level awareness. Nothing in the app blocks on this in
 * the current release: it drives UI hints and the enrolment prompt only.
 */
export function useAal(): AalState {
  const [state, setState] = useState<Omit<AalState, "refresh">>({
    currentLevel: null,
    nextLevel: null,
    needsStepUp: false,
    hasVerifiedFactor: false,
    loading: true,
  });

  const load = useCallback(async () => {
    try {
      const [aal, factors] = await Promise.all([getAal(), listFactors()]);
      setState({
        currentLevel: aal.currentLevel,
        nextLevel: aal.nextLevel,
        needsStepUp: !!aal.nextLevel && aal.currentLevel !== aal.nextLevel,
        hasVerifiedFactor: factors.some((f) => f.status === "verified"),
        loading: false,
      });
    } catch {
      setState((s) => ({ ...s, loading: false }));
    }
  }, []);

  useEffect(() => {
    load();
    const { data } = onAuthStateChange(async () => { await load(); });
    return () => { data.subscription.unsubscribe(); };
  }, [load]);

  return { ...state, refresh: load };
}