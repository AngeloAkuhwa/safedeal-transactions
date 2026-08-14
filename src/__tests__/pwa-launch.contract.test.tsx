/**
 * Installed-app launch routing: standalone launches open the app home,
 * browser visits keep the marketing landing page.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";
import { LaunchGate } from "@/components/pwa/LaunchGate";
import { isStandaloneLaunch, resolveLaunchTarget } from "@/pwa/launch-routing";

let session: { user: { id: string } } | null = null;
let roles: { role: string }[] = [];

vi.mock("@/services/auth.service", () => ({
  getSession: vi.fn(async () => ({ data: { session } })),
}));
vi.mock("@/services/role.service", () => ({
  getUserRoles: vi.fn(async () => ({ data: roles })),
}));

function setStandalone(on: boolean) {
  window.matchMedia = ((q: string) =>
    ({
      matches: on && q.includes("standalone"),
      media: q,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      onchange: null,
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList) as typeof window.matchMedia;
}

function renderGate() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<LaunchGate><div>LANDING PAGE</div></LaunchGate>} />
        <Route path="/auth" element={<div>AUTH</div>} />
        <Route path="/seller" element={<div>SELLER HOME</div>} />
        <Route path="/dashboard" element={<div>BUYER HOME</div>} />
        <Route path="/role-selection" element={<div>ROLE PICKER</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  session = null;
  roles = [];
});
afterEach(cleanup);

describe("resolveLaunchTarget", () => {
  it("prefers the seller home, then buyer, then the role picker", () => {
    expect(resolveLaunchTarget(["buyer", "seller"])).toBe("/seller");
    expect(resolveLaunchTarget(["buyer"])).toBe("/dashboard");
    expect(resolveLaunchTarget([])).toBe("/role-selection");
  });
});

describe("isStandaloneLaunch", () => {
  it("is false for a plain browser visit", () => {
    setStandalone(false);
    expect(isStandaloneLaunch(window)).toBe(false);
  });
  it("is true in standalone display mode", () => {
    setStandalone(true);
    expect(isStandaloneLaunch(window)).toBe(true);
  });
});

describe("LaunchGate", () => {
  it("standalone + session -> role home", async () => {
    setStandalone(true);
    session = { user: { id: "u1" } };
    roles = [{ role: "seller" }];
    renderGate();
    await waitFor(() => expect(screen.getByText("SELLER HOME")).toBeTruthy());
  });

  it("standalone + buyer session -> buyer dashboard", async () => {
    setStandalone(true);
    session = { user: { id: "u1" } };
    roles = [{ role: "buyer" }];
    renderGate();
    await waitFor(() => expect(screen.getByText("BUYER HOME")).toBeTruthy());
  });

  it("standalone + no session -> /auth", async () => {
    setStandalone(true);
    renderGate();
    await waitFor(() => expect(screen.getByText("AUTH")).toBeTruthy());
  });

  it("not standalone -> renders the landing page", async () => {
    setStandalone(false);
    session = { user: { id: "u1" } };
    roles = [{ role: "seller" }];
    renderGate();
    expect(screen.getByText("LANDING PAGE")).toBeTruthy();
  });
});