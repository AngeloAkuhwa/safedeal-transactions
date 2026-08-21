import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  isPromptDeniedPath,
  isPromptSnoozed,
  snoozePrompt,
  PROMPT_INTERVAL_DAYS,
} from "@/lib/mfa-prompt-policy";
import { SETTINGS_CATALOG } from "@/lib/settings-catalog";

const recoveryFn = readFileSync("supabase/functions/mfa-recovery/index.ts", "utf8");
const unenrolFn = readFileSync("supabase/functions/admin-mfa-unenrol/index.ts", "utf8");
const mfaShared = readFileSync("supabase/functions/_shared/mfa.ts", "utf8");
const authShared = readFileSync("supabase/functions/_shared/auth.ts", "utf8");

describe("2FA: consumer prompt policy", () => {
  it("never prompts on money, transaction or dispute routes", () => {
    for (const p of [
      "/cart",
      "/checkout",
      "/checkout/review",
      "/payment/callback",
      "/transactions/abc",
      "/transaction/abc/agreement",
      "/disputes/1",
      "/seller/disputes/1",
      "/offer/xyz",
      "/delivery/confirm",
      "/auth",
      "/reset-password",
    ]) {
      expect(isPromptDeniedPath(p)).toBe(true);
    }
  });

  it("allows the prompt on neutral surfaces", () => {
    for (const p of ["/dashboard", "/seller", "/profile", "/marketplace"]) {
      expect(isPromptDeniedPath(p)).toBe(false);
    }
  });

  it("snoozes for 30 days and is always dismissible", () => {
    const store: Record<string, string> = {};
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => { store[k] = v; },
    });
    const now = Date.now();
    expect(isPromptSnoozed(now)).toBe(false);
    snoozePrompt(now);
    expect(isPromptSnoozed(now + 1000)).toBe(true);
    expect(isPromptSnoozed(now + (PROMPT_INTERVAL_DAYS + 1) * 86_400_000)).toBe(false);
  });
});

describe("2FA: enforcement stays OFF by default", () => {
  it("the enforcement key is a platform-only boolean and defaults off in the UI", () => {
    const entry = SETTINGS_CATALOG.find((s) => s.key === "security.two_factor_admin_enforced");
    expect(entry).toBeTruthy();
    expect(entry?.spec.type).toBe("boolean");
    expect(entry?.writable).toEqual(["platform"]);
    const adminSettings = readFileSync("src/pages/AdminSettings.tsx", "utf8");
    expect(adminSettings).toMatch(/twoFAEnforced,\s*setTwoFAEnforced\s*\]\s*=\s*useState\(false\)/);
  });

  it("the server gate only hard-blocks when the enforcement key is on", () => {
    expect(authShared).toContain("security.two_factor_admin_enforced");
    expect(authShared).toContain('if (enforced) {');
    expect(authShared).toContain("mfa_gate_log_only");
  });
});

describe("2FA: recovery endpoint contract", () => {
  it("authenticates at aal1 (requireUser) and never behind requireAdmin", () => {
    expect(recoveryFn).toContain("requireUser");
    expect(recoveryFn).not.toContain("requireAdmin");
    // No runtime assurance-level gate anywhere in the handler.
    expect(recoveryFn).not.toMatch(/ctx\.aal/);
    expect(recoveryFn).not.toMatch(/mfa_required/);
  });

  it("rate limits failed recovery attempts in a sliding window", () => {
    expect(recoveryFn).toContain("RECOVERY_MAX_FAILURES");
    expect(recoveryFn).toContain('error: "rate_limited"');
    expect(mfaShared).toContain("export const RECOVERY_MAX_FAILURES = 5");
    expect(mfaShared).toContain("export const RECOVERY_WINDOW_MINUTES = 15");
  });

  it("consumes a code only once and forces re-enrolment", () => {
    expect(recoveryFn).toContain('.is("used_at", null)');
    expect(recoveryFn).toContain("deleteFactor");
  });

  it("alerts the account owner on use and on lockout", () => {
    expect(recoveryFn).toContain("mfa_recovery_used");
    expect(recoveryFn).toContain("mfa_recovery_locked");
  });

  it("never logs the submitted code", () => {
    expect(recoveryFn).not.toMatch(/console\.(log|error|warn)\([^)]*body\.code/);
    expect(mfaShared).toContain("only the outcome");
  });
});

describe("2FA: code entropy", () => {
  it("uses a CSPRNG, never Math.random", () => {
    expect(mfaShared).toContain("crypto.getRandomValues");
    expect(mfaShared).not.toContain("Math.random");
  });

  it("documents 50 bits per code and salts per row", () => {
    expect(mfaShared).toContain("CODE_ENTROPY_BITS = 50");
    expect(mfaShared).toContain("export function generateSalt");
    expect(recoveryFn).toContain("const salt = generateSalt();");
  });
});

describe("2FA: admin-assisted unenrol authorisation", () => {
  it("requires the manage_permissions permission and a long reason", () => {
    expect(unenrolFn).toContain('requirePermission(req, "users_and_access.manage_permissions")');
    expect(unenrolFn).toContain("reason.length < 20");
  });

  it("blocks a lower-ranked actor from stripping a higher-ranked target", () => {
    expect(unenrolFn).toContain("only_super_admin_may_unenrol_super_admin");
    expect(unenrolFn).toContain("target_rank_not_lower");
  });

  it("cannot be used for self-service or privilege escalation", () => {
    expect(unenrolFn).toContain("cannot_unenrol_self");
    expect(unenrolFn).not.toContain("internal_user_roles\").insert");
  });

  it("audits every unenrol", () => {
    expect(unenrolFn).toContain('action: "admin_mfa_unenrol"');
    expect(unenrolFn).toContain("mirrorToAuditLogs: true");
  });
});

describe("2FA: derived state, no shadow truth", () => {
  const service = readFileSync("src/services/admin-access-control.service.ts", "utf8");
  const securitySection = readFileSync("src/components/profile/SecuritySection.tsx", "utf8");

  it("the internal directory derives 2FA from auth factors", () => {
    expect(service).toContain('supabase.rpc("internal_users_mfa_status")');
    expect(service).not.toContain("two_factor_enabled: !!row.two_factor_enabled");
  });

  it("the profile security row no longer hardcodes a Disabled badge", () => {
    expect(securitySection).not.toContain('badge: "Disabled"');
    expect(securitySection).toContain("getMfaStatus");
  });
});

describe("2FA: enrolment cleanup", () => {
  const svc = readFileSync("src/services/mfa.service.ts", "utf8");
  it("removes abandoned unverified factors before enrolling again", () => {
    expect(svc).toContain("cleanUpUnverifiedFactors");
    expect(svc).toMatch(/startEnrolment[\s\S]{0,200}cleanUpUnverifiedFactors\(\)/);
  });
});

beforeEach(() => {
  vi.unstubAllGlobals();
});