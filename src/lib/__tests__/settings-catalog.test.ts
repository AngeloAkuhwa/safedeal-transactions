import { describe, it, expect } from "vitest";
import { clampSetting } from "../settings-catalog";

describe("clampSetting", () => {
  it("clamps numbers to catalog min/max", () => {
    const r = clampSetting("pricing.max_total_service_fee_ngn", 999_999, "platform");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(25_000);

    const r2 = clampSetting("pricing.max_total_service_fee_ngn", 100, "platform");
    if (r2.ok) expect(r2.value).toBe(500);
  });

  it("rejects vendor writes to platform-only keys", () => {
    const r = clampSetting("pricing.min_platform_fee_ngn", 300, "vendor");
    expect(r.ok).toBe(false);
  });

  it("rejects invalid enum values", () => {
    const r = clampSetting("fees.refund_policy", "totally-refundable", "platform");
    expect(r.ok).toBe(false);
  });

  it("passes unknown keys through untouched", () => {
    const r = clampSetting("some.new.future_key", 42, "platform");
    expect(r).toEqual({ ok: true, value: 42 });
  });

  it("coerces numeric strings", () => {
    const r = clampSetting("security.session_timeout_minutes", "45", "platform");
    if (r.ok) expect(r.value).toBe(45);
  });
});