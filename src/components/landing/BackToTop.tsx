import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router";
import { ArrowUp } from "lucide-react";
import { getTabsForPath } from "@/components/layout/MobileTabBar";

/** Scroll distance before the FAB is eligible to appear. */
export const SHOW_AFTER_Y = 600;
/** Accumulated movement (px) in one direction before the state flips. */
export const DIRECTION_HYSTERESIS = 24;

export function BackToTop() {
  const { pathname } = useLocation();
  const hasTabBar = getTabsForPath(pathname) !== null;
  const [shown, setShown] = useState(false);
  const ref = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    // Direction-based visibility: appear on scroll up (past a threshold),
    // hide on scroll down. Hysteresis keeps jitter/momentum from blinking it.
    let lastY = window.scrollY;
    let accum = 0;

    const onScroll = () => {
      const y = window.scrollY;
      const delta = y - lastY;
      lastY = y;
      if (delta === 0) return;

      // Reset the accumulator whenever direction flips.
      if ((accum > 0 && delta < 0) || (accum < 0 && delta > 0)) accum = 0;
      accum += delta;

      if (y <= SHOW_AFTER_Y) {
        setShown(false);
        return;
      }
      if (accum <= -DIRECTION_HYSTERESIS) setShown(true);
      else if (accum >= DIRECTION_HYSTERESIS) setShown(false);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleClick = () => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <button
      ref={ref}
      type="button"
      onClick={handleClick}
      aria-label="Back to top"
      aria-hidden={!shown}
      tabIndex={shown ? 0 : -1}
      className={`fixed right-4 z-sheet flex h-11 w-11 items-center justify-center rounded-full border border-primary-foreground/20 bg-primary/90 text-primary-foreground shadow-xl ring-1 ring-primary/30 backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5 hover:bg-primary hover:shadow-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:right-6 ${
        shown
          ? "translate-y-0 opacity-100"
          : "pointer-events-none translate-y-2 opacity-0"
      }`}
      style={{
        // Sit above the mobile tab bar (56px + safe area) where one exists.
        bottom: hasTabBar
          ? "calc(72px + env(safe-area-inset-bottom))"
          : "calc(1.5rem + env(safe-area-inset-bottom))",
      }}
    >
      <ArrowUp className="h-5 w-5" />
    </button>
  );
}
