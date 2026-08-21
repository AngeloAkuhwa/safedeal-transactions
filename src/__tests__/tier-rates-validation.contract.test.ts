/**
 * `pricing.tier_rates` validator contract.
 *
 * `src/lib/settings-catalog.ts` (client) and
 * `supabase/functions/_shared/settings-catalog.ts` (edge function) are
 * hand-duplicated (Deno can't import from src/). Both must reject the same
 * malformed tier lists: overlapping ranges, gaps, more than one open-ended
 * tier, non-monotonic ordering, and out-of-range rates.
 */
import { describe, it, expect } from "vitest";
import { clampSetting as clientClamp } from "@/lib/settings-catalog";
import { clampSetting as serverClamp } from "../../supabase/functions/_shared/settings-catalog";

const VALID_TIERS = [
  { upto: 100_000, rate: 0.039 },
  { upto: 500_000, rate: 0.035 },
  { upto: 2_000_000, rate: 0.029 },
  { upto: null, rate: 0.025 },
];

function expectRejectedBothSides(tiers: unknown) {
  const client = clientClamp("pricing.tier_rates", tiers, "platform");
  const server = serverClamp("pricing.tier_rates", tiers, "platform");
  expect(client.ok).toBe(false);
  expect(server.ok).toBe(false);
}

describe("pricing.tier_rates validation (client + server parity)", () => {
  it("accepts a well-formed, contiguous, single-open-ended tier list", () => {
    const client = clientClamp("pricing.tier_rates", VALID_TIERS, "platform");
    const server = serverClamp("pricing.tier_rates", VALID_TIERS, "platform");
    expect(client.ok).toBe(true);
    expect(server.ok).toBe(true);
  });

  it("rejects overlapping ranges (duplicate/decreasing upto)", () => {
    expectRejectedBothSides([
      { upto: 100_000, rate: 0.039 },
      { upto: 100_000, rate: 0.035 }, // duplicate boundary = overlap
      { upto: null, rate: 0.025 },
    ]);
    expectRejectedBothSides([
      { upto: 500_000, rate: 0.035 },
      { upto: 100_000, rate: 0.039 }, // goes backwards = overlap
      { upto: null, rate: 0.025 },
    ]);
  });

  it("rejects a non-monotonic ordering even without exact duplicates", () => {
    expectRejectedBothSides([
      { upto: 100_000, rate: 0.039 },
      { upto: 2_000_000, rate: 0.029 },
      { upto: 500_000, rate: 0.035 }, // out of order
      { upto: null, rate: 0.025 },
    ]);
  });

  it("rejects more than one open-ended tier", () => {
    expectRejectedBothSides([
      { upto: 100_000, rate: 0.039 },
      { upto: null, rate: 0.035 },
      { upto: null, rate: 0.025 },
    ]);
  });

  it("rejects a missing open-ended final tier", () => {
    expectRejectedBothSides([
      { upto: 100_000, rate: 0.039 },
      { upto: 500_000, rate: 0.035 },
    ]);
  });

  it("rejects an open-ended tier that isn't last", () => {
    expectRejectedBothSides([
      { upto: null, rate: 0.025 },
      { upto: 100_000, rate: 0.039 },
    ]);
  });

  it("rejects negative or absurd (>100%) rates", () => {
    expectRejectedBothSides([
      { upto: 100_000, rate: -0.01 },
      { upto: null, rate: 0.025 },
    ]);
    expectRejectedBothSides([
      { upto: 100_000, rate: 1.5 },
      { upto: null, rate: 0.025 },
    ]);
  });

  it("rejects a non-positive or non-finite upto boundary", () => {
    expectRejectedBothSides([
      { upto: 0, rate: 0.039 },
      { upto: null, rate: 0.025 },
    ]);
    expectRejectedBothSides([
      { upto: -100, rate: 0.039 },
      { upto: null, rate: 0.025 },
    ]);
  });

  it("rejects an empty or non-array value", () => {
    expectRejectedBothSides([]);
    expectRejectedBothSides("not-an-array");
    expectRejectedBothSides(null);
  });
});
