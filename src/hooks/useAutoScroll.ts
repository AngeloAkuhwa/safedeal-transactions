import { useCallback, useEffect, useRef, useState } from "react";

export type ScrollDirection = "down" | "up";
export type ScrollSpeed = "very-slow" | "slow" | "normal";

export const SPEED_PX_PER_SEC: Record<ScrollSpeed, number> = {
  "very-slow": 10,
  slow": 20 as never,
  normal: 32,
} as unknown as Record<ScrollSpeed, number>;

const SPEEDS: Record<ScrollSpeed, number> = {
  "very-slow": 10,
  slow: 20,
  normal: 32,
};

export interface UseAutoScrollOptions {
  containerRef?: React.RefObject<HTMLElement | null>;
  initialSpeed?: ScrollSpeed;
  initialDirection?: ScrollDirection;
  onReachEdge?: (edge: "top" | "bottom") => void;
  onBlocked?: (reason: "reduced-motion") => void;
}

function prefersReducedMotion() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function useAutoScroll(options: UseAutoScrollOptions = {}) {
  const { containerRef, initialSpeed = "very-slow", initialDirection = "down", onReachEdge, onBlocked } = options;

  const [isActive, setIsActive] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [direction, setDirectionState] = useState<ScrollDirection>(initialDirection);
  const [speed, setSpeedState] = useState<ScrollSpeed>(initialSpeed);

  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const accumRef = useRef(0);
  const isActiveRef = useRef(false);
  const isPausedRef = useRef(false);
  const directionRef = useRef<ScrollDirection>(initialDirection);
  const speedRef = useRef<ScrollSpeed>(initialSpeed);
  const ignoreScrollRef = useRef(false);

  useEffect(() => { isActiveRef.current = isActive; }, [isActive]);
  useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);
  useEffect(() => { directionRef.current = direction; }, [direction]);
  useEffect(() => { speedRef.current = speed; }, [speed]);

  const getMetrics = useCallback(() => {
    const el = containerRef?.current;
    if (el) {
      return {
        top: el.scrollTop,
        max: el.scrollHeight - el.clientHeight,
        scrollTo: (y: number) => { el.scrollTop = y; },
      };
    }
    const doc = document.scrollingElement || document.documentElement;
    return {
      top: window.scrollY,
      max: doc.scrollHeight - window.innerHeight,
      scrollTo: (y: number) => window.scrollTo(0, y),
    };
  }, [containerRef]);

  const cancelRaf = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    lastTsRef.current = null;
    accumRef.current = 0;
  }, []);

  const tick = useCallback((ts: number) => {
    if (!isActiveRef.current || isPausedRef.current) {
      rafRef.current = null;
      return;
    }
    if (lastTsRef.current == null) lastTsRef.current = ts;
    const dt = (ts - lastTsRef.current) / 1000;
    lastTsRef.current = ts;

    const px = SPEEDS[speedRef.current] * dt;
    accumRef.current += px;
    const step = Math.floor(accumRef.current);

    if (step >= 1) {
      accumRef.current -= step;
      const { top, max, scrollTo } = getMetrics();
      const next = directionRef.current === "down" ? Math.min(max, top + step) : Math.max(0, top - step);
      ignoreScrollRef.current = true;
      scrollTo(next);
      // release flag next frame
      requestAnimationFrame(() => { ignoreScrollRef.current = false; });

      if (directionRef.current === "down" && next >= max - 1) {
        setIsActive(false);
        cancelRaf();
        onReachEdge?.("bottom");
        return;
      }
      if (directionRef.current === "up" && next <= 1) {
        setIsActive(false);
        cancelRaf();
        onReachEdge?.("top");
        return;
      }
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [cancelRaf, getMetrics, onReachEdge]);

  const ensureRaf = useCallback(() => {
    if (rafRef.current == null && isActiveRef.current && !isPausedRef.current) {
      lastTsRef.current = null;
      rafRef.current = requestAnimationFrame(tick);
    }
  }, [tick]);

  const pause = useCallback(() => {
    setIsPaused(true);
    cancelRaf();
  }, [cancelRaf]);

  const resume = useCallback(() => {
    if (!isActiveRef.current) return;
    setIsPaused(false);
    // ensureRaf via effect below
  }, []);

  const stop = useCallback(() => {
    setIsActive(false);
    setIsPaused(false);
    cancelRaf();
  }, [cancelRaf]);

  const start = useCallback(() => {
    if (prefersReducedMotion()) {
      onBlocked?.("reduced-motion");
      return false;
    }
    const { top, max } = getMetrics();
    if (directionRef.current === "down" && top >= max - 1) {
      onReachEdge?.("bottom");
      return false;
    }
    if (directionRef.current === "up" && top <= 1) {
      onReachEdge?.("top");
      return false;
    }
    setIsActive(true);
    setIsPaused(false);
    return true;
  }, [getMetrics, onBlocked, onReachEdge]);

  const setDirection = useCallback((d: ScrollDirection) => setDirectionState(d), []);
  const setSpeed = useCallback((s: ScrollSpeed) => setSpeedState(s), []);

  // Drive RAF when active+!paused changes
  useEffect(() => {
    if (isActive && !isPaused) {
      ensureRaf();
    } else {
      cancelRaf();
    }
    return () => cancelRaf();
  }, [isActive, isPaused, ensureRaf, cancelRaf]);

  // External pause triggers
  useEffect(() => {
    if (!isActive) return;

    const onWheel = () => { if (!ignoreScrollRef.current) pause(); };
    const onTouch = () => { if (!ignoreScrollRef.current) pause(); };
    const onKey = (e: KeyboardEvent) => {
      const keys = ["PageUp", "PageDown", "ArrowUp", "ArrowDown", "Home", "End", " ", "Spacebar"];
      if (keys.includes(e.key)) pause();
    };
    const onVisibility = () => { if (document.hidden) pause(); };
    const onFocusIn = (e: FocusEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (t.matches("input, textarea, select, [contenteditable=true], [role='combobox']")) pause();
    };

    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("touchmove", onTouch, { passive: true });
    window.addEventListener("keydown", onKey);
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("focusin", onFocusIn);

    // Radix open-state observer
    const checkOpenOverlays = () => {
      const open = document.querySelector('[data-state="open"][role="dialog"], [data-state="open"][role="menu"], [data-state="open"][role="listbox"]');
      if (open) pause();
    };
    const mo = new MutationObserver(checkOpenOverlays);
    mo.observe(document.body, { attributes: true, subtree: true, attributeFilter: ["data-state"] });

    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchmove", onTouch);
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("focusin", onFocusIn);
      mo.disconnect();
    };
  }, [isActive, pause]);

  // Cleanup on unmount
  useEffect(() => () => cancelRaf(), [cancelRaf]);

  return {
    isActive,
    isPaused,
    direction,
    speed,
    start,
    pause,
    resume,
    stop,
    setDirection,
    setSpeed,
  };
}