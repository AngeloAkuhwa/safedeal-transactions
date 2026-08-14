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

/** Keys of a top-level object literal inside the edge function's `response`. */
function edgeResponseKeys(section: string): string[] {
  const src = fs.readFileSync(EDGE, "utf8");
  const start = src.indexOf(`      ${section}: {`, src.indexOf("const response = {"));
  if (start === -1) return [];
  const end = src.indexOf("\n      },", start);
  return [...src.slice(start, end).matchAll(/^\s{8}(\w+):/gm)].map((m) => m[1]).sort();
}

/** Keys declared on a `ReviewData` member, e.g. `transaction`, `seller`. */
function clientKeys(member: string, indent = 4): string[] {
  const src = fs.readFileSync(CLIENT, "utf8");
  const start = src.indexOf(`  ${member}: {`);
  const end = src.indexOf("\n  }", start);
  const re = new RegExp(String.raw`^\s{${indent}}(\w+)\??:`, "gm");
  return [...src.slice(start, end).matchAll(re)].map((m) => m[1]).sort();
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

  it("declares exactly the transaction fields the server emits", () => {
    const client = clientKeys("transaction");
    const edge = edgeResponseKeys("transaction");
    expect(edge.length).toBeGreaterThan(5);
    expect(client).toEqual(edge);
  });

  it("declares exactly the seller fields the server emits (email is withheld)", () => {
    const src = fs.readFileSync(EDGE, "utf8");
    const start = src.indexOf("seller: sellerRes.data");
    const block = src.slice(start, src.indexOf("sellerVerification", start));
    const edge = [...block.matchAll(/^\s{12}(\w+):/gm)].map((m) => m[1]).sort();
    expect(edge).not.toContain("email");
    expect(clientKeys("seller")).toEqual(edge);
  });

  it("declares the media item fields the server emits", () => {
    const src = fs.readFileSync(CLIENT, "utf8");
    const block = src.slice(src.indexOf("  media: Array<{"), src.indexOf("  }>;"));
    const client = [...block.matchAll(/^\s{4}(\w+)\??:/gm)].map((m) => m[1]).sort();
    // The edge function maps product_media into this exact shape.
    expect(client).toEqual(["file_id", "files", "id", "media_type", "sort_order"]);
    const edge = fs.readFileSync(EDGE, "utf8");
    expect(edge).not.toMatch(/display_order/);
    expect(edge).toMatch(/sort_order: m\.sort_order/);
  });
});
