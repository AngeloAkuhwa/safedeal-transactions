import { useCallback, useEffect, useState } from "react";
import { getVendorPlanState, type VendorPlanState } from "@/services/vendor-plan.service";

/**
 * Seller-side plan + showcase-slot state. Display only. The server enforces
 * every limit independently.
 */
export function useVendorPlan(enabled = true) {
  const [state, setState] = useState<VendorPlanState | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      setState(await getVendorPlanState());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => { void refresh(); }, [refresh]);

  return { state, loading, error, refresh };
}
