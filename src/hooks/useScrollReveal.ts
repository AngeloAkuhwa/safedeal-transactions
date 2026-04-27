import { useEffect, useRef } from "react";

/**
 * Adds the `animate-fade-in` class to the element once it scrolls into view.
 * Element starts FULLY VISIBLE so a missing IntersectionObserver, disabled JS,
 * or `prefers-reduced-motion` never leaves content invisible.
 */
export function useScrollReveal<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    // Prepare for animation only when JS+IO are available
    el.style.opacity = "0";
    el.style.willChange = "opacity, transform";

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            el.classList.add("animate-fade-in");
            el.style.opacity = "";
            io.unobserve(el);
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return ref;
}
