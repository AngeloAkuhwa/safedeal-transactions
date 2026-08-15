import { useEffect, useState } from "react";
import { BookOpen, Pause, Play, ArrowDown, ArrowUp, Square } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useReadingMode } from "./ReadingModeContext";
import type { ScrollSpeed } from "@/hooks/useAutoScroll";

interface Props {
  variant: "desktop" | "mobile-trigger" | "mobile-floater" | "desktop-floater";
}

function useScrolledPast(threshold = 120) {
  const [past, setPast] = useState(false);
  useEffect(() => {
    const onScroll = () => setPast(window.scrollY > threshold);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);
  return past;
}

export function AdminReadingModeControl({ variant }: Props) {
  const rm = useReadingMode();
  const { isActive, isPaused, direction, speed, start, pause, resume, stop, setDirection, setSpeed } = rm;
  const scrolledPast = useScrolledPast(120);

  const onPlayPause = () => {
    if (!isActive) {
      start();
      return;
    }
    if (isPaused) resume();
    else pause();
  };

  const toggleDirection = () => setDirection(direction === "down" ? "up" : "down");

  if (variant === "mobile-trigger") {
    return (
      <button
        type="button"
        onClick={onPlayPause}
        aria-label={isActive ? (isPaused ? "Resume reading mode" : "Pause reading mode") : "Start reading mode"}
        className={`flex h-11 w-11 items-center justify-center rounded-lg ${
          isActive ? "bg-emerald-500/15 text-emerald-300" : "bg-muted text-foreground/90 hover:bg-muted/70"
        }`}
      >
        {isActive && !isPaused ? <Pause className="h-4 w-4" /> : <BookOpen className="h-4 w-4" />}
      </button>
    );
  }

  if (variant === "mobile-floater") {
    if (!isActive && !scrolledPast) return null;
    if (!isActive) {
      return (
        <div
          className="fixed left-1/2 z-50 -translate-x-1/2 lg:hidden"
          style={{ bottom: "calc(env(safe-area-inset-bottom) + 72px)" }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => start()}
            aria-label="Start reading mode"
            className="inline-flex items-center gap-2 rounded-full border border-border bg-card/95 px-3.5 py-2 text-xs font-medium text-foreground shadow-lg backdrop-blur transition-opacity hover:bg-muted min-h-11"
          >
            <BookOpen className="h-3.5 w-3.5" />
            Reading Mode
          </button>
        </div>
      );
    }
    return (
      <div
        className="fixed left-1/2 z-50 -translate-x-1/2 lg:hidden"
        style={{ bottom: "calc(env(safe-area-inset-bottom) + 72px)" }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-1 rounded-full border border-border bg-card/95 px-2 py-1.5 shadow-lg backdrop-blur">
          <span className="ml-2 mr-1 flex items-center gap-1.5 text-xs font-medium text-emerald-300">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            Reading
          </span>
          <button
            type="button"
            onClick={onPlayPause}
            aria-label={isPaused ? "Resume reading mode" : "Pause reading mode"}
            className="flex h-11 w-11 items-center justify-center rounded-full text-foreground hover:bg-muted"
          >
            {isPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={toggleDirection}
            aria-label="Change scroll direction"
            className="flex h-11 w-11 items-center justify-center rounded-full text-foreground hover:bg-muted"
          >
            {direction === "down" ? <ArrowDown className="h-3.5 w-3.5" /> : <ArrowUp className="h-3.5 w-3.5" />}
          </button>
          <Select value={speed} onValueChange={(v) => setSpeed(v as ScrollSpeed)}>
            <SelectTrigger
              aria-label="Change scroll speed"
              className="h-11 w-[96px] border-border bg-card/60 px-2 text-xs text-foreground"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-border bg-card text-foreground">
              <SelectItem value="very-slow">Very Slow</SelectItem>
              <SelectItem value="slow">Slow</SelectItem>
            </SelectContent>
          </Select>
          <button
            type="button"
            onClick={stop}
            aria-label="Stop reading mode"
            className="flex h-11 w-11 items-center justify-center rounded-full text-foreground hover:bg-muted"
          >
            <Square className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  }

  if (variant === "desktop-floater") {
    if (!scrolledPast) return null;
    return (
      <div
        className="fixed bottom-5 left-5 z-40 hidden transition-opacity duration-200 lg:block"
        onPointerDown={(e) => e.stopPropagation()}
      >
        {!isActive ? (
          <button
            type="button"
            onClick={() => start()}
            aria-label="Start reading mode"
            className="inline-flex items-center gap-2 rounded-full border border-border bg-card/95 px-4 py-2 text-sm text-foreground shadow-lg backdrop-blur hover:bg-muted min-h-11"
          >
            <BookOpen className="h-4 w-4" />
            Reading Mode
          </button>
        ) : (
          <div className="flex items-center gap-1 rounded-full border border-emerald-500/30 bg-card/95 px-2 py-1.5 shadow-lg backdrop-blur">
            <span className="ml-2 mr-1 flex items-center gap-1.5 text-xs font-medium text-emerald-300">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
              Reading
            </span>
            <button
              type="button"
              onClick={onPlayPause}
              aria-label={isPaused ? "Resume reading mode" : "Pause reading mode"}
              className="flex h-11 w-11 items-center justify-center rounded-full text-foreground hover:bg-muted"
            >
              {isPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              onClick={toggleDirection}
              aria-label="Change scroll direction"
              className="flex h-11 w-11 items-center justify-center rounded-full text-foreground hover:bg-muted"
            >
              {direction === "down" ? <ArrowDown className="h-3.5 w-3.5" /> : <ArrowUp className="h-3.5 w-3.5" />}
            </button>
            <Select value={speed} onValueChange={(v) => setSpeed(v as ScrollSpeed)}>
              <SelectTrigger
                aria-label="Change scroll speed"
                className="h-11 w-[110px] border-border bg-card/60 px-2 text-xs text-foreground"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-border bg-card text-foreground">
                <SelectItem value="very-slow">Very Slow</SelectItem>
                <SelectItem value="slow">Slow</SelectItem>
              </SelectContent>
            </Select>
            <button
              type="button"
              onClick={stop}
              aria-label="Stop reading mode"
              className="flex h-11 w-11 items-center justify-center rounded-full text-foreground hover:bg-muted"
            >
              <Square className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    );
  }

  // desktop
  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex items-center gap-1.5">
        {!isActive ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onPlayPause}
                aria-label="Start reading mode"
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-muted/60 px-3.5 py-2 text-sm text-foreground transition-colors hover:bg-muted min-h-11"
              >
                <BookOpen className="h-4 w-4" />
                Reading Mode
              </button>
            </TooltipTrigger>
            <TooltipContent className="border-border bg-muted text-foreground">
              Auto-scroll this page slowly
            </TooltipContent>
          </Tooltip>
        ) : (
          <div className="flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-1">
            <span className="ml-1 mr-1 flex items-center gap-1.5 text-xs font-medium text-emerald-300">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
              Reading Mode active
            </span>
            <button
              type="button"
              onClick={onPlayPause}
              aria-label={isPaused ? "Resume reading mode" : "Pause reading mode"}
              className="flex h-11 w-11 items-center justify-center rounded-md text-foreground hover:bg-muted"
            >
              {isPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              onClick={toggleDirection}
              aria-label="Change scroll direction"
              className="flex h-11 w-11 items-center justify-center rounded-md text-foreground hover:bg-muted"
            >
              {direction === "down" ? <ArrowDown className="h-3.5 w-3.5" /> : <ArrowUp className="h-3.5 w-3.5" />}
            </button>
            <Select value={speed} onValueChange={(v) => setSpeed(v as ScrollSpeed)}>
              <SelectTrigger
                aria-label="Change scroll speed"
                className="h-11 w-[110px] border-border bg-card/60 px-2 text-xs text-foreground"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-border bg-card text-foreground">
                <SelectItem value="very-slow">Very Slow</SelectItem>
                <SelectItem value="slow">Slow</SelectItem>
              </SelectContent>
            </Select>
            <button
              type="button"
              onClick={stop}
              aria-label="Stop reading mode"
              className="flex h-11 w-11 items-center justify-center rounded-md text-foreground hover:bg-muted"
            >
              <Square className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}