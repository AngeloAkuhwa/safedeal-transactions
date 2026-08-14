/**
 * REVIEW PAYLOAD SHAPE LOCK.
 *
 * `BuyerPaymentSummary` blocks payment when a pricing field is missing, so a
 * field the client reads but `resolve-share-token` never emits takes checkout
 * down silently. This ties the two together: every pricing key declared on
 * `ReviewData` must appear in the edge function's emitted pricing object, and
 * vice versa.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const CLIENT = path.join(ROOT, "src/services/review.service.ts");
const EDGE = path.join(ROOT, "supabase/functions/resolve-share-token/index.ts");

function clientPricingKeys(): string[] {
  const src = fs.readFileSync(CLIENT, "utf8");
  const start = src.indexOf("  pricing: {");
  const end = src.indexOf("} | null;", start);
  const block = src.slice(start, end);
  return [...block.matchAll(/^\s{4}(\w+)\??:/gm)].map((m) => m[1]).sort();
}

function edgePricingKeys(): string[] {
  const src = fs.readFileSync(EDGE, "utf8");
  const start = src.indexOf("let computedPricing: {");
  const end = src.indexOf("} | null = null;", start);
  const block = src.slice(start, end);
  return [...block.matchAll(/^\s+(\w+)\??:/gm)].map((m) => m[1]).sort();
}

describe("resolve-share-token pricing payload matches ReviewData", () => {
  it("emits every pricing field the client reads", () => {
    const client = clientPricingKeys();
    const edge = edgePricingKeys();
    expect(client.length).toBeGreaterThan(5);
    expect(edge.filter((k) => !client.includes(k))).toEqual([]);
    expect(client.filter((k) => !edge.includes(k))).toEqual([]);
  });

  it("carries the charged fee rate the payment guard requires", () => {
    expect(edgePricingKeys()).toContain("service_fee_rate");
    expect(fs.readFileSync(EDGE, "utf8")).toMatch(/service_fee_rate:\s*\n?\s*serviceFee/);
  });
});
