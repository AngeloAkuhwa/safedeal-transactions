/**
 * Admin route smoke suite (UAT Fix 5, Stage 2. Kept permanently).
 *
 * Mounts every admin page component behind a mocked backend and a super-admin
 * permission context, and asserts that:
 *   1. the component renders without throwing, and
 *   2. the mount produces no console.error / console.warn output
 *      (React key warnings, uncontrolled-input warnings, act() warnings...).
 *
 * This is a regression net: any future change that breaks a page mount or
 * introduces a React warning fails here instead of in the browser.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ---------------------------------------------------------------- mocks ----

/** Chainable no-op stand-in for the supabase-js query builder. */
function makeQueryBuilder(): unknown {
  const result = { data: [], error: null, count: 0 };
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_t, prop) {
      if (prop === "then") {
        return (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
      }
      if (prop === "maybeSingle" || prop === "single") {
        return () => Promise.resolve({ data: null, error: null });
      }
      return () => proxy;
    },
  };
  const proxy: unknown = new Proxy({}, handler);
  return proxy;
}

const channelStub = {
  on: () => channelStub,
  subscribe: () => channelStub,
  unsubscribe: () => Promise.resolve("ok"),
  send: () => Promise.resolve("ok"),
  track: () => Promise.resolve("ok"),
  presenceState: () => ({}),
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => makeQueryBuilder(),
    rpc: () => Promise.resolve({ data: [], error: null }),
    channel: () => channelStub,
    removeChannel: () => Promise.resolve("ok"),
    getChannels: () => [],
    auth: {
      getSession: () => Promise.resolve({ data: { session: null }, error: null }),
      getUser: () => Promise.resolve({ data: { user: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signOut: () => Promise.resolve({ error: null }),
    },
    functions: { invoke: () => Promise.resolve({ data: null, error: null }) },
    storage: { from: () => ({ upload: () => Promise.resolve({ data: null, error: null }) }) },
  },
}));

vi.mock("@/context/AdminPermissionsContext", async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    "@/context/AdminPermissionsContext",
  );
  return {
    ...actual,
    AdminPermissionsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    useAdminPermissions: () => ({
      loading: false,
      error: null,
      userId: "00000000-0000-4000-8000-000000000001",
      email: "uat.admin@safedeal.ng",
      fullName: "UAT Admin",
      roles: ["super_admin"],
      permissions: ["*"],
      accessLevel: "full",
      isSuper: true,
      has: () => true,
      hasAny: () => true,
      status: "active",
      refresh: () => Promise.resolve(),
    }),
  };
});

// ------------------------------------------------------------- registry ----

type Loader = () => Promise<{ default: React.ComponentType }>;

interface RouteCase {
  path: string;
  /** Concrete URL to mount when the path carries params. */
  url?: string;
  load: Loader;
  /**
   * Set when the page cannot currently be mounted in isolation.
   * Must carry the reason so the skip is never silent.
   */
  skip?: string;
}

const ROUTES: RouteCase[] = [
  { path: "/admin/dashboard", load: () => import("@/pages/AdminDashboard") },
  { path: "/admin/transactions", load: () => import("@/pages/AdminTransactions") },
  {
    path: "/admin/transactions/:transactionId",
    url: "/admin/transactions/t-1",
    load: () => import("@/pages/AdminTransactionDetail"),
  },
  { path: "/admin/disputes", load: () => import("@/pages/AdminDisputes") },
  { path: "/admin/disputes/:id", url: "/admin/disputes/d-1", load: () => import("@/pages/AdminDisputeDetail") },
  { path: "/admin/payouts", load: () => import("@/pages/AdminPayouts") },
  { path: "/admin/reconciliation", load: () => import("@/pages/AdminReconciliation") },
  { path: "/admin/escrow", load: () => import("@/pages/AdminEscrow") },
  { path: "/admin/flagged-users", load: () => import("@/pages/AdminFlaggedUsers") },
  { path: "/admin/users", load: () => import("@/pages/AdminUsers") },
  { path: "/admin/users/:id", url: "/admin/users/u-1", load: () => import("@/pages/AdminUserDetail") },
  { path: "/admin/notifications", load: () => import("@/pages/AdminNotifications") },
  { path: "/admin/settings", load: () => import("@/pages/AdminSettings") },
  { path: "/admin/audit-logs", load: () => import("@/pages/AdminAuditLogs") },
  { path: "/admin/access-control", load: () => import("@/pages/AdminAccessControl") },
  { path: "/admin/permission-matrix", load: () => import("@/pages/AdminPermissionMatrix") },
  { path: "/admin/access-approvals", load: () => import("@/pages/AdminAccessApprovals") },
  { path: "/admin/task-orchestration", load: () => import("@/pages/AdminTaskOrchestration") },
  { path: "/admin/agent-performance", load: () => import("@/pages/AdminAgentPerformance") },
  { path: "/admin/support", load: () => import("@/pages/AdminSupport") },
  { path: "/legal/privacy", load: () => import("@/pages/LegalPrivacy") },
  { path: "/legal/terms", load: () => import("@/pages/LegalTerms") },
];

/**
 * Fix 7: tab / sub-view coverage.
 *
 * Every admin screen whose tabs are URL-driven is mounted once per tab so a
 * broken sub-view fails here instead of in the browser. Tabs that are local
 * component state only (Access Approvals, Settings sections, Notifications
 * segments) cannot be driven from the URL in jsdom and are tracked in the
 * NEEDS MANUAL CHECK list of the Fix 7 report instead of being skipped here.
 */
const TAB_ROUTES: RouteCase[] = [
  // Payouts: status tabs (?tab=)
  ...["all", "pending_release", "blocked", "processing", "completed", "failed", "reversed", "on_hold"].map(
    (tab) => ({
      path: "/admin/payouts",
      url: `/admin/payouts?tab=${tab}`,
      load: () => import("@/pages/AdminPayouts"),
    }),
  ),
  // Permission Matrix: workspace tabs (?tab=)
  ...[
    "role-matrix",
    "role-detail",
    "feature-registry",
    "user-overrides",
    "pending-approvals",
    "permission-templates",
    "change-history",
  ].map((tab) => ({
    path: "/admin/permission-matrix",
    url: `/admin/permission-matrix?tab=${tab}`,
    load: () => import("@/pages/AdminPermissionMatrix"),
  })),
  // Agent Performance: analysis tabs (?tab=)
  ...["workload", "performance", "sla", "rankings"].map((tab) => ({
    path: "/admin/agent-performance",
    url: `/admin/agent-performance?tab=${tab}`,
    load: () => import("@/pages/AdminAgentPerformance"),
  })),
  // Transactions: quick-filter views (?quick=)
  ...["high_risk", "overdue", "in_dispute", "flagged"].map((quick) => ({
    path: "/admin/transactions",
    url: `/admin/transactions?quick=${quick}`,
    load: () => import("@/pages/AdminTransactions"),
  })),
  // Disputes: quick-filter views (?quick=)
  ...["all", "priority"].map((quick) => ({
    path: "/admin/disputes",
    url: `/admin/disputes?quick=${quick}`,
    load: () => import("@/pages/AdminDisputes"),
  })),
];

// ---------------------------------------------------------------- suite ----

let errorSpy: ReturnType<typeof vi.spyOn>;
let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  errorSpy.mockRestore();
  warnSpy.mockRestore();
});

function messages(spy: ReturnType<typeof vi.spyOn>): string[] {
  return spy.mock.calls.map((args) => args.map((a) => String(a)).join(" "));
}

describe("admin routes: mount smoke test", () => {
  it.each(ROUTES.map((r) => [r.path, r] as const))("%s mounts cleanly", async (_path, route) => {
    if (route.skip) {
      console.info(`skipped ${route.path}: ${route.skip}`);
      return;
    }
    const mod = await route.load();
    const Page = mod.default;
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });

    expect(() =>
      render(
        <QueryClientProvider client={client}>
          <MemoryRouter initialEntries={[route.url ?? route.path]}>
            <Routes>
              <Route path={route.path} element={<Page />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      ),
    ).not.toThrow();

    expect(messages(errorSpy), `console.error during ${route.path}`).toEqual([]);
    expect(messages(warnSpy), `console.warn during ${route.path}`).toEqual([]);
  }, 20000);
});

describe("admin tabs: sub-view smoke test", () => {
  it.each(TAB_ROUTES.map((r) => [r.url ?? r.path, r] as const))(
    "%s renders cleanly",
    async (_url, route) => {
      const mod = await route.load();
      const Page = mod.default;
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
      });

      expect(() =>
        render(
          <QueryClientProvider client={client}>
            <MemoryRouter initialEntries={[route.url ?? route.path]}>
              <Routes>
                <Route path={route.path} element={<Page />} />
              </Routes>
            </MemoryRouter>
          </QueryClientProvider>,
        ),
      ).not.toThrow();

      expect(messages(errorSpy), `console.error during ${route.url}`).toEqual([]);
      expect(messages(warnSpy), `console.warn during ${route.url}`).toEqual([]);
    },
    20000,
  );
});