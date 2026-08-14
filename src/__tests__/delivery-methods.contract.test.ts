/**
 * Delivery-method vocabulary lock.
 *
 * Invented method names ("courier_shipping" compared against a transaction
 * enum column, "delivery" compared against it, etc.) have shipped three times
 * and each time silently skipped the address form. This test asserts that
 * every literal a branch compares a delivery method against is a member of one
 * of the two real vocabularies.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  PRODUCT_DELIVERY_METHODS,
  TRANSACTION_DELIVERY_METHODS,
  methodNeedsAddress,
  methodNeedsPhone,
  toTransactionDeliveryMethod,
} from "@/lib/delivery-methods";

const ROOT = path.resolve(__dirname, "../..");
const VOCAB = new Set<string>([...PRODUCT_DELIVERY_METHODS, ...TRANSACTION_DELIVERY_METHODS]);

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === "dist" || e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(tsx?|ts)$/.test(e.name) && !p.includes("__tests__")) out.push(p);
  }
  return out;
}

const FILES = [
  ...walk(path.join(ROOT, "src")),
  ...walk(path.join(ROOT, "supabase/functions")),
].filter((f) => !f.endsWith("delivery-methods.ts"));

/** `x === "literal"` / `!==` where the operand names a delivery method. */
const COMPARISON =
  /\b([A-Za-z_$][\w$]*(?:\.[\w$]+)*)\s*[=!]==\s*["'`]([a-z_]+)["'`]/g;
/** `{ pickup: ..., delivery: ... }` style maps keyed by a method name. */
const MAP_KEYS = /\b(?:deliveryMethod|delivery_method|method|rawMethod)\b/;

describe("delivery method vocabulary", () => {
  it("has exactly the four live delivery_method_type enum members", () => {
    expect([...TRANSACTION_DELIVERY_METHODS]).toEqual([
      "courier",
      "pickup",
      "meetup",
      "hand_delivery",
    ]);
  });

  it("only branches on real delivery-method values", () => {
    const offenders: string[] = [];
    for (const file of FILES) {
      const src = fs.readFileSync(file, "utf8");
      if (!MAP_KEYS.test(src)) continue;
      for (const m of src.matchAll(COMPARISON)) {
        const [, operand, literal] = m;
        if (!/method/i.test(operand)) continue;
        if (!VOCAB.has(literal)) {
          offenders.push(`${path.relative(ROOT, file)}: ${operand} === "${literal}"`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("requires an address for shipments in either vocabulary", () => {
    for (const m of ["courier", "courier_shipping", "delivery"]) {
      expect(methodNeedsAddress(m), m).toBe(true);
    }
    for (const m of ["pickup", "meetup", "hand_delivery", "digital"]) {
      expect(methodNeedsAddress(m), m).toBe(false);
    }
  });

  it("requires a contact phone for in-person handoffs", () => {
    for (const m of ["pickup", "meetup", "hand_delivery", "digital"]) {
      expect(methodNeedsPhone(m), m).toBe(true);
    }
    expect(methodNeedsPhone("courier")).toBe(false);
  });

  it("fails closed on unknown or missing methods", () => {
    for (const m of [null, undefined, "", "unknown", "teleport"]) {
      expect(toTransactionDeliveryMethod(m as string | null)).toBeNull();
      expect(methodNeedsAddress(m as string | null)).toBe(false);
      expect(methodNeedsPhone(m as string | null)).toBe(false);
    }
  });

  it("maps every product vocabulary member onto the enum", () => {
    for (const m of PRODUCT_DELIVERY_METHODS) {
      const resolved = toTransactionDeliveryMethod(m);
      expect(resolved, m).not.toBeNull();
      expect(TRANSACTION_DELIVERY_METHODS).toContain(resolved!);
    }
  });
});
