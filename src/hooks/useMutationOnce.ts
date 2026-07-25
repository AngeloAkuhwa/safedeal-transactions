import { useRef, useState, useCallback } from "react";

/**
 * Wraps an async action with an in-flight lock so repeat clicks
 * (Enter mashing, double-clicks, form re-submits) never fire the
 * mutation twice.
 */
export function useMutationOnce<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
) {
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);

  const run = useCallback(
    async (...args: TArgs): Promise<TResult | undefined> => {
      if (inFlight.current) return undefined;
      inFlight.current = true;
      setPending(true);
      try {
        return await fn(...args);
      } finally {
        inFlight.current = false;
        setPending(false);
      }
    },
    [fn],
  );

  return { run, pending };
}