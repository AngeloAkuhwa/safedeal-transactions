/**
 * A dialog on a desktop, a bottom sheet on a phone, and never both.
 *
 * `useIsMobile` returns `!!undefined` until its first effect runs, so on a
 * phone the first paint reports desktop and the effect flips it one frame
 * later. Choosing a className that way is invisible. Choosing a *component*
 * that way unmounts one subtree and mounts another, so an open dialog shows
 * the wrong presentation for a frame and anything its children set up during
 * that frame is discarded. `ResponsiveDialog` reads the three-state
 * `useViewport` and renders nothing until the answer is known.
 *
 * A note on what is and is not proved here, because the first version of this
 * file claimed more than it tested. It typed into a field inside an open
 * dialog and asserted the text survived, on the theory that the naive
 * implementation would have wiped it. That test passes against the naive
 * implementation too: `render` flushes effects before the test can type, so
 * the swap has already happened by the time there is anything to lose, and in
 * a real browser a user cannot type inside one frame either. It was testing
 * nothing.
 *
 * What is testable, and is tested below, is the actual contract: exactly one
 * presentation mounts, and nothing at all mounts while the viewport is
 * undecided.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import * as React from "react";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";

/** matchMedia is not implemented in jsdom, and the hook reads it on mount. */
function setViewport(width: number) {
  Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: width });
  window.matchMedia = ((query: string) => ({
    matches: width < 768,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

function Harness({ width }: { width: number }) {
  const [open, setOpen] = React.useState(true);
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={setOpen}
      title="Update stock"
      description="Set how many units are available."
    >
      <input aria-label="Quantity" defaultValue="" />
    </ResponsiveDialog>
  );
}

describe("ResponsiveDialog", () => {
  beforeEach(() => vi.useRealTimers());
  afterEach(() => vi.restoreAllMocks());

  it("renders one surface at desktop width", async () => {
    setViewport(1440);
    render(<Harness width={1440} />);
    await waitFor(() => expect(screen.getByText("Update stock")).toBeTruthy());
    // One title, not two: the two presentations must never both mount.
    expect(screen.getAllByText("Update stock").length).toBe(1);
  });

  it("renders one surface at phone width", async () => {
    setViewport(390);
    render(<Harness width={390} />);
    await waitFor(() => expect(screen.getByText("Update stock")).toBeTruthy());
    expect(screen.getAllByText("Update stock").length).toBe(1);
  });

  it("keeps the last control off the bottom edge of the phone", async () => {
    // A sheet is `bottom-0`, so whatever is last inside it ends at the last
    // pixel of the screen unless something says otherwise. Measured in
    // Chromium at 390x844 before the fix, the reset password sheet's submit
    // button ended at y=843 of 844: under the home indicator on a phone that
    // has one, inside the gesture strip on Android, and awkward on anything.
    //
    // jsdom has no layout, so this cannot re-measure. What it can do is assert
    // the class that does the work is still there, which is what a regression
    // would remove. `.safe-bottom` is `max(1rem, env(safe-area-inset-bottom))`.
    setViewport(390);
    const { container } = render(<Harness width={390} />);
    await waitFor(() => expect(screen.getByText("Update stock")).toBeTruthy());

    const surface = document.querySelector('[role="dialog"]') ?? container;
    const padded = surface.querySelector(".safe-bottom");
    expect(padded).not.toBeNull();
  });

  it("renders nothing while the viewport is undecided", async () => {
    // The state the naive implementation cannot represent: it collapses
    // undefined to false and commits to the desktop Dialog. This asserts that
    // an unresolved viewport produces no surface at all, which is what makes
    // the swap impossible rather than merely unlikely.
    vi.doMock("@/hooks/use-mobile", () => ({
      useViewport: () => undefined,
      useIsMobile: () => false,
    }));
    vi.resetModules();
    const { ResponsiveDialog: Undecided } = await import("@/components/ui/responsive-dialog");

    const { container } = render(
      <Undecided open onOpenChange={() => {}} title="Update stock" description="Set units.">
        <input aria-label="Quantity" defaultValue="" />
      </Undecided>,
    );

    expect(container.firstChild).toBeNull();
    expect(screen.queryByText("Update stock")).toBeNull();
    vi.doUnmock("@/hooks/use-mobile");
    vi.resetModules();
  });
});
