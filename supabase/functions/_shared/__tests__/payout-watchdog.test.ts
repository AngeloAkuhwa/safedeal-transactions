import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  DEFAULT_STUCK_HOURS,
  isStuckPayout,
  parseStuckHours,
  payoutAgeHours,
  shouldAlert,
  stuckCutoffIso,
} from "../payout-watchdog";

const NOW = new Date("2026-08-13T23:00:00.000Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const fnSrc = read("supabase/functions/payout-watchdog/index.ts");
const listSrc = read("supabase/functions/admin-payouts-list/index.ts");
const summarySrc = read("supabase/functions/admin-payouts-summary/index.ts");

describe("stuck-payout predicate", () => {
  it("flags pending/processing with no provider_reference older than threshold", () => {
    for (const status of ["pending", "processing"]) {
      expect(isStuckPayout(
        { status, provider_reference: null, initiated_at: hoursAgo(7) },
        DEFAULT_STUCK_HOURS,
        NOW,
      )).toBe(true);
    }
  });

  it("falls back to created_at when initiated_at is null", () => {
    expect(isStuckPayout(
      { status: "pending", provider_reference: null, initiated_at: null, created_at: hoursAgo(48) },
      DEFAULT_STUCK_HOURS,
      NOW,
    )).toBe(true);
  });

  it("does not flag a payout younger than the threshold", () => {
    expect(isStuckPayout(
      { status: "pending", provider_reference: null, initiated_at: hoursAgo(1) },
      DEFAULT_STUCK_HOURS,
      NOW,
    )).toBe(false);
  });

  it("does not flag a payout that has a provider reference", () => {
    expect(isStuckPayout(
      { status: "processing", provider_reference: "TRF_abc", initiated_at: hoursAgo(72) },
      DEFAULT_STUCK_HOURS,
      NOW,
    )).toBe(false);
  });

  it("does not flag terminal or non-in-flight statuses", () => {
    for (const status of ["completed", "failed", "reversed", "blocked", "awaiting_release", "cancelled"]) {
      expect(isStuckPayout(
        { status, provider_reference: null, initiated_at: hoursAgo(500) },
        DEFAULT_STUCK_HOURS,
        NOW,
      )).toBe(false);
    }
  });

  it("respects a configured threshold", () => {
    const p = { status: "pending", provider_reference: null, initiated_at: hoursAgo(10) };
    expect(isStuckPayout(p, 6, NOW)).toBe(true);
    expect(isStuckPayout(p, 24, NOW)).toBe(false);
  });

  it("parses the setting value safely", () => {
    expect(parseStuckHours(12)).toBe(12);
    expect(parseStuckHours("12")).toBe(12);
    expect(parseStuckHours(null)).toBe(DEFAULT_STUCK_HOURS);
    expect(parseStuckHours("abc")).toBe(DEFAULT_STUCK_HOURS);
    expect(parseStuckHours(-4)).toBe(DEFAULT_STUCK_HOURS);
  });

  it("computes age and cutoff", () => {
    expect(Math.round(payoutAgeHours({ initiated_at: hoursAgo(9) }, NOW))).toBe(9);
    expect(stuckCutoffIso(6, NOW)).toBe(hoursAgo(6));
  });
});

describe("alert cooldown", () => {
  it("alerts when never alerted before", () => {
    expect(shouldAlert({}, NOW)).toBe(true);
  });
  it("suppresses a repeat alert inside 24h", () => {
    expect(shouldAlert({ watchdog_alerted_at: hoursAgo(3) }, NOW)).toBe(false);
  });
  it("re-alerts after 24h", () => {
    expect(shouldAlert({ watchdog_alerted_at: hoursAgo(30) }, NOW)).toBe(true);
  });
});

describe("payout-watchdog function contract", () => {
  it("uses the cron-secret pattern", () => {
    expect(fnSrc).toMatch(/verifyCronSecret\(req\)/);
    expect(fnSrc).toMatch(/if \(!auth\.ok\) return auth\.res;/);
  });

  it("logs, alerts ops and returns a summary", () => {
    expect(fnSrc).toMatch(/service_name: SERVICE/);
    expect(fnSrc).toMatch(/notifyOpsTeam/);
    expect(fnSrc).toMatch(/type: "security_alert"/);
    expect(fnSrc).toMatch(/watchdog_alerted_at: now\.toISOString\(\)/);
    expect(fnSrc).toMatch(/scanned,[\s\S]*stuck: stuck\.length,[\s\S]*alerted/);
  });

  it("is detection-only: never touches money_status or escrow state", () => {
    expect(fnSrc).not.toMatch(/money_status:/);
    expect(fnSrc).not.toMatch(/escrow_states/);
    expect(fnSrc).not.toMatch(/from\("transactions"\)\s*\.update/);
  });
});

describe("admin surfacing", () => {
  it("exposes a stuck tab and per-row flag in the list", () => {
    expect(listSrc).toMatch(/\| "stuck"/);
    expect(listSrc).toMatch(/is_stuck: isStuckPayout/);
    expect(listSrc).toMatch(/stuck_threshold_hours/);
  });
  it("counts stuck payouts in the summary", () => {
    expect(summarySrc).toMatch(/isStuckPayout\(r, stuckThresholdHours, now\)/);
    expect(summarySrc).toMatch(/stuck: stuck\.length/);
  });
});
