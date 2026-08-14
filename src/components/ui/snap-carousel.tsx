import { Children, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type Breakpoint = "sm" | "md" | "lg";

const TRACK_GRID: Record<Breakpoint, string> = {
  sm: "sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:px-0 lg:grid-cols-3",
  md: "md:mx-0 md:grid md:grid-cols-2 md:gap-4 md:overflow-visible md:px-0 lg:grid-cols-3",
  lg: "lg:mx-0 lg:grid lg:grid-cols-3 lg:gap-4 lg:overflow-visible lg:px-0",
};

const ITEM_GRID: Record<Breakpoint, string> = {
  sm: "sm:w-auto sm:max-w-none",
  md: "md:w-auto md:max-w-none",
  lg: "lg:w-auto lg:max-w-none",
};

const DOTS_HIDE: Record<Breakpoint, string> = {
  sm: "sm:hidden",
  md: "md:hidden",
  lg: "lg:hidden",
};

interface SnapCarouselProps {
  children: ReactNode;
  /** Accessible label for the scrollable region. */
  ariaLabel: string;
  className?: string;
  /** Breakpoint from which the carousel becomes a normal grid. */
  asGridFrom?: Breakpoint;
}

/**
 * Mobile-first snap carousel. Below `asGridFrom` it is a horizontally
 * snapping row where the next card peeks (the swipe affordance); from that
 * breakpoint up it collapses into the regular responsive grid so desktop
 * layouts are untouched.
 */
export function SnapCarousel({
  children,
  ariaLabel,
  className,
  asGridFrom = "sm",
}: SnapCarouselProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const items = Children.toArray(children);
  const [active, setActive] = useState(0);

  const onScroll = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const children = Array.from(el.children) as HTMLElement[];
    if (children.length === 0) return;
    const center = el.scrollLeft + el.clientWidth / 2;
    let best = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    children.forEach((child, index) => {
      const childCenter = child.offsetLeft + child.offsetWidth / 2;
      const distance = Math.abs(childCenter - center);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    });
    setActive(best);
  }, []);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [onScroll]);

  return (
    <div className={className}>
      <div
        ref={trackRef}
        role="region"
        aria-label={ariaLabel}
        tabIndex={0}
        className={cn(
          "-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain px-4 scroll-px-4",
          "[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          TRACK_GRID[asGridFrom],
        )}
      >
        {items.map((child, index) => (
          <div
            key={index}
            className={cn("w-[78%] max-w-[300px] shrink-0 snap-start", ITEM_GRID[asGridFrom])}
          >
            {child}
          </div>
        ))}
      </div>

      {items.length > 1 && (
        <div
          aria-hidden
          className={cn("mt-3 flex items-center justify-center gap-1.5", DOTS_HIDE[asGridFrom])}
        >
          {items.map((_, index) => (
            <span
              key={index}
              className={cn(
                "h-1.5 w-1.5 rounded-full transition-colors duration-200",
                index === active ? "bg-primary" : "bg-border",
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}
