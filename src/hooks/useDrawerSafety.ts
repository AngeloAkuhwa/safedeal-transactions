import { useEffect, useRef } from "react";

/**
 * Guards drawer/dialog dismissal against unsaved changes and restores focus
 * to the element that opened the surface when it closes.
 */
export function useDrawerSafety(opts: {
  open: boolean;
  isDirty: boolean;
  onClose: () => void;
  message?: string;
}) {
  const { open, isDirty, onClose, message = "You have unsaved changes. Discard them?" } = opts;
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    returnFocusRef.current = (document.activeElement as HTMLElement) ?? null;
    return () => {
      const el = returnFocusRef.current;
      if (el && typeof el.focus === "function") {
        try { el.focus(); } catch { /* noop */ }
      }
    };
  }, [open]);

  useEffect(() => {
    if (!open || !isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [open, isDirty]);

  const attemptClose = () => {
    if (isDirty && !window.confirm(message)) return;
    onClose();
  };

  return { attemptClose };
}