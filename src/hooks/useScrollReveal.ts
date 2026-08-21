import { useEffect, useRef } from "react";

/**
 * Adds the `sd-reveal` initial state and toggles `is-visible` once the
 * element enters view. Falls back to immediately visible if IO is missing
 * or the user prefers reduced motion. So content NEVER stays hidden.
 */
export function useScrollReveal<T extends HTMLElement = HTMLDivElement>(opts?: {
  delay?: number;
}) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    el.classList.add("sd-reveal");
    if (opts?.delay) {
      el.style.transitionDelay = `${opts.delay}ms`;
    }

    const reveal = () => el.classList.add("is-visible");

    if (typeof window === "undefined" || !("IntersectionObserver" in window)) {
      reveal();
      return;
    }
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      reveal();
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            reveal();
            io.unobserve(el);
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -10% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [opts?.delay]);

  return ref;
}