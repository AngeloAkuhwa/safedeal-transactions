import { useEffect } from "react";

/**
 * Intercepts in-app anchor clicks (from react-router NavLink/Link, which render
 * `<a href>`) while `active` is true, so the user is prompted before leaving a
 * screen that has unsaved staged changes. Also covers hard tab close / reload
 * via `beforeunload`. Used by Permission Matrix' Role tab.
 *
 * The app uses declarative <BrowserRouter> (not a data router), so
 * `useBlocker()` is unavailable. This click-capture approach reliably catches
 * every internal anchor click without changing the router setup.
 */
export function useUnsavedNavigationGuard(active: boolean, message: string) {
  useEffect(() => {
    if (!active) return;

    const beforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);

    const clickHandler = (e: MouseEvent) => {
      // Ignore right-click, middle-click, modified clicks (open in new tab).
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const anchor = target.closest("a") as HTMLAnchorElement | null;
      if (!anchor) return;
      // External or download links -> beforeunload handles it.
      if (anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      // Same-URL clicks aren't navigations.
      try {
        const url = new URL(anchor.href, window.location.origin);
        if (url.origin === window.location.origin
          && url.pathname === window.location.pathname
          && url.search === window.location.search) return;
      } catch { /* ignore */ }

      if (!window.confirm(message)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    // Capture phase so we intercept before react-router's SPA click handler runs.
    document.addEventListener("click", clickHandler, true);

    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", clickHandler, true);
    };
  }, [active, message]);
}