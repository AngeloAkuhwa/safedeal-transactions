import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useAutoScroll, type ScrollDirection, type ScrollSpeed } from "@/hooks/useAutoScroll";
import { useToast } from "@/hooks/use-toast";

type Ctx = ReturnType<typeof useAutoScroll>;

const ReadingModeContext = createContext<Ctx | null>(null);

const STORAGE_KEY = "admin.readingMode";

function loadPrefs(): { speed: ScrollSpeed; direction: ScrollDirection } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { speed: "very-slow", direction: "down" };
    const p = JSON.parse(raw);
    return {
      speed: (p.speed as ScrollSpeed) ?? "very-slow",
      direction: (p.direction as ScrollDirection) ?? "down",
    };
  } catch {
    return { speed: "very-slow", direction: "down" };
  }
}

export function ReadingModeProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const initial = useMemo(loadPrefs, []);
  const engine = useAutoScroll({
    initialSpeed: initial.speed,
    initialDirection: initial.direction,
    onReachEdge: (edge) => {
      toast({
        description: edge === "bottom" ? "You're at the bottom." : "You're at the top.",
      });
    },
    onBlocked: (reason) => {
      if (reason === "reduced-motion") {
        toast({
          description: "Auto-scroll is disabled because reduced motion is enabled.",
        });
      }
    },
  });

  // Persist prefs
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ speed: engine.speed, direction: engine.direction }),
      );
    } catch {
      /* ignore */
    }
  }, [engine.speed, engine.direction]);

  // Stop on route change
  const location = useLocation();
  useEffect(() => {
    engine.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  return <ReadingModeContext.Provider value={engine}>{children}</ReadingModeContext.Provider>;
}

export function useReadingMode(): Ctx {
  const ctx = useContext(ReadingModeContext);
  if (!ctx) {
    throw new Error("useReadingMode must be used within ReadingModeProvider");
  }
  return ctx;
}