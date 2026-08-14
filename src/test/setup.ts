import "@testing-library/jest-dom";

// Node-environment suites (static/lint scans) load this setup too.
if (typeof window === "undefined") {
  // nothing DOM-related to patch
} else {
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
}
