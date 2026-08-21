import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, act, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { BackToTop, SHOW_AFTER_Y, DIRECTION_HYSTERESIS } from "@/components/landing/BackToTop";

function scrollTo(y: number) {
  act(() => {
    Object.defineProperty(window, "scrollY", { value: y, writable: true, configurable: true });
    window.dispatchEvent(new Event("scroll"));
  });
}

function fab() {
  const el = document.querySelector<HTMLButtonElement>('button[aria-label="Back to top"]');
  if (!el) throw new Error("FAB not rendered");
  return el;
}

function isShown() {
  return fab().getAttribute("aria-hidden") === "false";
}

describe("BackToTop: direction-based visibility", () => {
  beforeEach(() => {
    Object.defineProperty(window, "scrollY", { value: 0, writable: true, configurable: true });
    render(
      <MemoryRouter initialEntries={["/"]}>
        <BackToTop />
      </MemoryRouter>,
    );
  });
  afterEach(cleanup);

  it("is hidden initially", () => {
    expect(isShown()).toBe(false);
    expect(fab().tabIndex).toBe(-1);
  });

  it("stays hidden while scrolling down past the threshold", () => {
    scrollTo(SHOW_AFTER_Y + 400);
    expect(isShown()).toBe(false);
  });

  it("appears when scrolling up past the threshold", () => {
    scrollTo(2000);
    scrollTo(2000 - DIRECTION_HYSTERESIS - 1);
    expect(isShown()).toBe(true);
    expect(fab().tabIndex).toBe(0);
  });

  it("ignores jitter smaller than the hysteresis", () => {
    scrollTo(2000);
    scrollTo(2000 - (DIRECTION_HYSTERESIS - 6));
    expect(isShown()).toBe(false);
  });

  it("hides again once the user scrolls back down past the hysteresis", () => {
    scrollTo(2000);
    scrollTo(1900);
    expect(isShown()).toBe(true);
    scrollTo(1900 + DIRECTION_HYSTERESIS + 1);
    expect(isShown()).toBe(false);
  });

  it("never shows near the top of the page", () => {
    scrollTo(2000);
    scrollTo(1900);
    expect(isShown()).toBe(true);
    scrollTo(SHOW_AFTER_Y - 100);
    expect(isShown()).toBe(false);
  });
});
