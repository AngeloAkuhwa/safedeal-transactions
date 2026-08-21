/**
 * BuyerNav: cart badge, Saved link, and real unread bell indicator.
 */
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/hooks/useCurrentUserId", () => ({
  useCurrentUserId: () => "user-1",
}));

vi.mock("@/hooks/useRealtimeNotifications", () => ({
  useRealtimeNotifications: () => {},
}));

vi.mock("@/services/auth.service", () => ({
  signOut: vi.fn(),
  getSession: vi.fn(async () => ({ data: { session: null } })),
}));

vi.mock("@/services/session.service", () => ({
  invalidateOldSessions: vi.fn(),
}));

let unreadCount = 0;
let cartCount = 0;

vi.mock("@/services/notifications.service", () => ({
  getBuyerNotifications: vi.fn(async () => ({
    summary: { unread_count: unreadCount },
    items: [],
    pagination: { page: 1, page_size: 1, total_count: 0, total_pages: 0 },
  })),
}));

vi.mock("@/services/cart.service", () => ({
  getCartItems: vi.fn(async () => ({ items: [], count: cartCount })),
}));

import { BuyerNav } from "@/components/dashboard/BuyerNav";

afterEach(() => {
  cleanup();
  unreadCount = 0;
  cartCount = 0;
});

function renderNav() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <BuyerNav buyerName="Jane Doe" avatarUrl={null} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("BuyerNav", () => {
  it("includes a Saved link to /dashboard/saved", () => {
    renderNav();
    const links = screen.getAllByRole("link", { name: "Saved" });
    expect(links.length).toBeGreaterThan(0);
    expect(links[0]).toHaveAttribute("href", "/dashboard/saved");
  });

  it("links the cart icon to /dashboard/cart", () => {
    renderNav();
    const cartLink = screen.getByRole("link", { name: /items in cart/i });
    expect(cartLink).toHaveAttribute("href", "/dashboard/cart");
  });

  it("renders the cart badge with the live item count", async () => {
    cartCount = 3;
    renderNav();
    expect(await screen.findByText("3")).toBeInTheDocument();
  });

  it("hides the notification bell badge when unread is 0", () => {
    unreadCount = 0;
    renderNav();
    const bell = screen.getByRole("link", { name: /0 unread notifications/i });
    expect(bell.querySelector("span")).not.toBeInTheDocument();
  });

  it("shows the notification bell badge when unread > 0", async () => {
    unreadCount = 5;
    renderNav();
    const bell = await screen.findByRole("link", { name: /5 unread notifications/i });
    expect(bell.querySelector("span")).toHaveTextContent("5");
  });
});
