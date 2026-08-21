/**
 * PHASE 0k: internal access must respect ACCOUNT STATUS, not just role rows.
 *
 * Defect: `has_any_internal_role()` only asked "does this user hold an internal
 * role row", so a SUSPENDED teammate whose role rows survived kept full
 * back-office access. The fix routes every internal-role helper through
 * `public.internal_access_active()`, which joins `internal_users` and requires
 * an allowed status plus a non-expired `access_expires_at`.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

const MIGRATION = fs.readFileSync(
  path.resolve("supabase/migrations/20260814163140_3705b571-4f13-4011-8c70-5bfe380d4e0a.sql"),
  "utf8",
);

/** Mirror of the SQL predicate `public.internal_access_active`. */
type InternalRow = { status: string; access_expires_at: string | null } | null;
function internalAccessActive(row: InternalRow, now = new Date()): boolean {
  if (!row) return false;
  if (!["active", "invited"].includes(row.status)) return false;
  if (row.access_expires_at && new Date(row.access_expires_at) <= now) return false;
  return true;
}

describe("internal_access_active: status + expiry predicate", () => {
  const future = "2099-01-01T00:00:00Z";
  const past = "2020-01-01T00:00:00Z";

  it("allows an active account with no expiry", () => {
    expect(internalAccessActive({ status: "active", access_expires_at: null })).toBe(true);
  });
  it("allows an active account whose expiry is in the future", () => {
    expect(internalAccessActive({ status: "active", access_expires_at: future })).toBe(true);
  });
  it("DENIES an active account whose access_expires_at has passed", () => {
    expect(internalAccessActive({ status: "active", access_expires_at: past })).toBe(false);
  });
  it.each(["suspended", "locked", "deactivated", "pending", "pending_approval"])(
    "DENIES status %s even with intact role rows",
    (status) => {
      expect(internalAccessActive({ status, access_expires_at: null })).toBe(false);
    },
  );
  it("DENIES a user with no internal_users row at all", () => {
    expect(internalAccessActive(null)).toBe(false);
  });
  it("allows 'invited' (pre-activation) so first sign-in can promote to active", () => {
    expect(internalAccessActive({ status: "invited", access_expires_at: null })).toBe(true);
  });
});

describe("migration wires every internal-role helper through the gate", () => {
  it("defines internal_access_active with a status + expiry predicate", () => {
    expect(MIGRATION).toMatch(/CREATE OR REPLACE FUNCTION public\.internal_access_active/);
    expect(MIGRATION).toMatch(/iu\.status IN \('active', 'invited'\)/);
    expect(MIGRATION).toMatch(/iu\.access_expires_at IS NULL OR iu\.access_expires_at > now\(\)/);
    expect(MIGRATION).toMatch(/FROM public\.internal_users iu/);
  });

  it.each([
    "has_any_internal_role",
    "has_internal_role",
    "is_internal_admin",
    "internal_actor_rank",
    "internal_effective_permissions",
  ])("%s calls internal_access_active", (fn) => {
    const start = MIGRATION.indexOf(`FUNCTION public.${fn}(`);
    expect(start).toBeGreaterThan(-1);
    const next = MIGRATION.indexOf("CREATE OR REPLACE FUNCTION", start + 10);
    const body = MIGRATION.slice(start, next === -1 ? undefined : next);
    expect(body).toContain("public.internal_access_active(_user_id)");
  });

  it("replaces the bare `EXISTS (... FROM internal_users)` RLS policies", () => {
    for (const table of [
      "public.permission_dependencies",
      "public.permission_conflicts",
      "public.permission_conflict_acknowledgements",
    ]) {
      expect(MIGRATION).toContain(`ON ${table} FOR SELECT TO authenticated`);
    }
    expect(
      (MIGRATION.match(/public\.internal_access_active\(auth\.uid\(\)\)/g) ?? []).length,
    ).toBe(3);
  });
});

describe("requireAdmin / admin-me derive internal access from the gated RPC", () => {
  const AUTH_SRC = fs.readFileSync("supabase/functions/_shared/auth.ts", "utf8");
  const ADMIN_ME_SRC = fs.readFileSync("supabase/functions/admin-me/index.ts", "utf8");

  it("requireAdmin decides internal access via has_any_internal_role, not a table read", () => {
    const fn = AUTH_SRC.slice(AUTH_SRC.indexOf("export async function requireAdmin"));
    expect(fn).toContain('rpc("has_any_internal_role"');
    expect(fn).not.toContain('from("internal_user_roles")');
    expect(fn).toContain('if (!hasConsumerAdmin && !hasInternal) throw new AuthError(403, "admin_required")');
  });

  it("requirePermission / requireAnyPermission also use the gated helpers", () => {
    const tail = AUTH_SRC.slice(AUTH_SRC.indexOf("export async function requirePermission"));
    expect(tail).not.toContain('from("internal_user_roles")');
    expect((tail.match(/rpc\(\s*\n?\s*"internal_effective_permissions"/g) ?? []).length).toBe(2);
  });

  it("admin-me gates on requireAdmin before reading any role rows", () => {
    const gateIdx = ADMIN_ME_SRC.indexOf("await requireAdmin(req)");
    const readIdx = ADMIN_ME_SRC.indexOf('from("internal_user_roles")');
    expect(gateIdx).toBeGreaterThan(-1);
    expect(readIdx).toBeGreaterThan(gateIdx);
  });

  it("admin-me's invited->active promotion cannot revive a suspended row", () => {
    expect(ADMIN_ME_SRC).toContain('.eq("status", "invited")');
  });
});

describe("requireAdmin denies a suspended internal user (simulated RPC)", () => {
  /** Minimal stand-in for the requireAdmin decision, driven by the real gate. */
  function decide(row: InternalRow, roleRows: string[], isConsumerAdmin = false) {
    const hasInternal = internalAccessActive(row) && roleRows.length > 0;
    return hasInternal || isConsumerAdmin ? "allow" : "403 admin_required";
  }

  it("suspended with intact role rows -> 403", () => {
    expect(decide({ status: "suspended", access_expires_at: null }, ["super_admin"])).toBe(
      "403 admin_required",
    );
  });
  it("expired access -> 403", () => {
    expect(decide({ status: "active", access_expires_at: "2020-01-01T00:00:00Z" }, ["auditor"])).toBe(
      "403 admin_required",
    );
  });
  it("active -> allow", () => {
    expect(decide({ status: "active", access_expires_at: null }, ["support_agent"])).toBe("allow");
  });
});

describe("client isInternalUser path", () => {
  beforeEach(() => vi.resetModules());

  async function loadWithRpc(result: boolean) {
    vi.doMock("@/integrations/supabase/client", () => ({
      supabase: { rpc: vi.fn(async () => ({ data: result, error: null })) },
    }));
    return (await import("@/lib/internal-role")).isInternalUser;
  }

  it("returns false when the gated RPC denies (suspended / expired)", async () => {
    const isInternalUser = await loadWithRpc(false);
    await expect(isInternalUser("suspended-user")).resolves.toBe(false);
  });

  it("returns true for an active internal user", async () => {
    const isInternalUser = await loadWithRpc(true);
    await expect(isInternalUser("active-user")).resolves.toBe(true);
  });

  it("uses the SECURITY DEFINER RPC rather than querying internal_user_roles", () => {
    const src = fs.readFileSync("src/lib/internal-role.ts", "utf8");
    expect(src).toContain('supabase.rpc("has_any_internal_role"');
    expect(src).not.toContain('from("internal_user_roles")');
  });
});

describe("bare /admin route", () => {
  it("redirects to /admin/dashboard", () => {
    const app = fs.readFileSync("src/App.tsx", "utf8");
    expect(app).toContain('<Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />');
  });
});
