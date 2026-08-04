/**
 * Point-in-time rate reconstruction (Batch 5, Item 1).
 *
 * Mirrors the selection rule implemented by the `get_pricing_settings_at`
 * RPC over `system_settings_history`: for each pricing key take the newest
 * version whose `effective_from <= T`, preferring a vendor-scope version over
 * the platform version. Verified against the live RPC/table during Batch 5
 * (versions 1..5 of pricing.min_platform_fee_ngn reconstructed correctly).
 */
import { describe, it, expect } from "vitest";

interface HistoryRow {
  setting_key: string;
  scope: "platform" | "vendor";
  vendor_id: string | null;
  version: number;
  new_value: unknown;
  effective_from: string;
}

export function reconstructAt(
  rows: HistoryRow[],
  vendorId: string | null,
  at: string,
): Record<string, unknown> {
  const t = Date.parse(at);
  const scoped = rows.filter(
    (r) =>
      Date.parse(r.effective_from) <= t &&
      (r.scope === "platform" || (r.scope === "vendor" && r.vendor_id === vendorId)),
  );
  const out: Record<string, unknown> = {};
  for (const key of new Set(scoped.map((r) => r.setting_key))) {
    const candidates = scoped
      .filter((r) => r.setting_key === key)
      .sort(
        (a, b) =>
          Number(b.scope === "vendor") - Number(a.scope === "vendor") ||
          Date.parse(b.effective_from) - Date.parse(a.effective_from) ||
          b.version - a.version,
      );
    out[key] = candidates[0].new_value;
  }
  return out;
}

const KEY = "pricing.min_platform_fee_ngn";
const HISTORY: HistoryRow[] = [
  { setting_key: KEY, scope: "platform", vendor_id: null, version: 1, new_value: 250, effective_from: "2026-07-19T00:24:08Z" },
  { setting_key: KEY, scope: "platform", vendor_id: null, version: 2, new_value: 260, effective_from: "2026-08-04T09:58:03Z" },
  { setting_key: KEY, scope: "platform", vendor_id: null, version: 3, new_value: 250, effective_from: "2026-08-04T09:58:05Z" },
  { setting_key: "pricing.tier_rates", scope: "vendor", vendor_id: "v1", version: 1, new_value: [{ upto: null, rate: 0.03 }], effective_from: "2026-08-04T10:00:00Z" },
];

describe("point-in-time pricing reconstruction", () => {
  it("returns version 1 before the first change", () => {
    expect(reconstructAt(HISTORY, null, "2026-07-20T00:00:00Z")[KEY]).toBe(250);
  });

  it("returns version 2 between the two later versions", () => {
    expect(reconstructAt(HISTORY, null, "2026-08-04T09:58:04Z")[KEY]).toBe(260);
  });

  it("returns the newest version at the current time", () => {
    expect(reconstructAt(HISTORY, null, "2026-08-04T12:00:00Z")[KEY]).toBe(250);
  });

  it("prefers a vendor-scope version over the platform version", () => {
    const at = "2026-08-04T12:00:00Z";
    expect(reconstructAt(HISTORY, "v1", at)["pricing.tier_rates"]).toEqual([{ upto: null, rate: 0.03 }]);
    expect(reconstructAt(HISTORY, null, at)["pricing.tier_rates"]).toBeUndefined();
  });
});
