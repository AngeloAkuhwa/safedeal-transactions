import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router";
import { ArrowUp } from "lucide-react";
import { getTabsForPath } from "@/components/layout/MobileTabBar";

/** Selector for content the FAB must never sit on top of. */
const CONTENT_SELECTOR = "a, button, [role='button'], input, h1, h2, h3, p, li, img, svg";

export function BackToTop() {
  const { pathname } = useLocation();
  const hasTabBar = getTabsForPath(pathname) !== null;
  const [visible, setVisible] = useState(false);
  const [collides, setCollides] = useState(false);
  const ref = useRef<HTMLButtonElement | null>(null);

  // Never cover page content: if anything meaningful sits under the FAB's
  // footprint at the current scroll position, fade it out until it's clear.
  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const pad = 8;
    const box = {
      left: r.left - pad,
      right: r.right + pad,
      top: r.top - pad,
      bottom: r.bottom + pad,
    };
    const nodes = document.querySelectorAll<HTMLElement>(`main ${CONTENT_SELECTOR}`);
    let hit = false;
    for (const node of nodes) {
      if (el.contains(node)) continue;
      const n = node.getBoundingClientRect();
      if (n.width === 0 || n.height === 0) continue;
      if (n.left < box.right && n.right > box.left && n.top < box.bottom && n.bottom > box.top) {
        hit = true;
        break;
      }
    }
    setCollides(hit);
  }, []);

  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      setVisible(window.scrollY > 600);
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [measure]);

  const handleClick = () => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  };

  const shown = visible && !collides;

  return (
    <button
      ref={ref}
      type="button"
      onClick={handleClick}
      aria-label="Back to top"
      aria-hidden={!shown}
      tabIndex={shown ? 0 : -1}
      className={`fixed right-4 z-[60] flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-1 ring-primary/20 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:right-6 ${
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
