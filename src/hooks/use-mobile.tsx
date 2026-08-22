import * as React from "react";

const MOBILE_BREAKPOINT = 768;

/**
 * `undefined` until the first effect runs, then a real answer.
 *
 * The distinction matters for anything that renders a *different component*
 * per viewport rather than different classes. `useIsMobile` collapses the
 * undecided state to `false`, so on a phone the first paint says desktop and
 * the effect then flips it. For a className that is a one-frame flicker
 * nobody sees. For a component swap it is an unmount and remount: children
 * lose their state, an open dialog would blink, and a half-typed form inside
 * one would be wiped.
 *
 * So the raw three-state answer is available for callers that need to wait,
 * and `useIsMobile` keeps its old two-state shape for the twenty-odd callers
 * that are choosing classes and are right not to care.
 */
export function useViewport(): boolean | undefined {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined);

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    mql.addEventListener("change", onChange);
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}

/**
 * Is this a phone-width viewport? Resolves to `false` before the first effect,
 * which is the right default for picking classes and the wrong one for picking
 * components. See `useViewport` if you are doing the latter.
 */
export function useIsMobile() {
  return !!useViewport();
}
