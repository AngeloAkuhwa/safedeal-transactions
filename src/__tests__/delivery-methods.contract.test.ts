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
  /(?<!typeof\s)\b([A-Za-z_$][\w$]*(?:\.[\w$]+)*)\s*[=!]==\s*["'`]([a-z_]+)["'`]/g;
/**
 * `x ?? "literal"` / `x || "literal"` defaults on a method-named operand.
 * NOTE: defaulting to a VALID member is the Phase 0 defect, not the escape
 * hatch: `?? "courier"` is exactly what made four fail-closed guards dead
 * code. Any string default on a delivery-method operand is banned.
 */
const DEFAULTING =
  /\b([A-Za-z_$][\w$]*(?:\.[\w$]+)*)\s*(?:\?\?|\|\|)\s*["'`]([a-z_]+)["'`]/g;
/**
 * Operands allowed to carry a string default. Add entries individually, with
 * a reason: never widen the rule itself.
 */
const DEFAULTING_ALLOWLIST = new Set<string>([]);
/** `switch (method) { case "literal": }`: captured per switch block below. */
const SWITCH_HEAD = /switch\s*\(\s*([A-Za-z_$][\w$]*(?:\.[\w$]+)*)[^)]*\)\s*\{/g;
const CASE_LABEL = /case\s+["'`]([a-z_]+)["'`]/g;
/**
 * Any operand whose name mentions a method is in scope. The invented names
 * have appeared under `method`, `rawMethod`, `deliveryMethod` and
 * `fulfillment_method` alike.
 */
const DELIVERY_OPERAND = /method/i;
/** Vocabularies that legitimately live under a `*method*` name. */
const OTHER_METHOD_VOCAB =
  /(payment|auth|verification|http|request|shipping_provider|login|signin|contact)/i;
/**
 * Operands that carry a NON-delivery vocabulary despite being named `*method*`.
 * Every entry is hand-checked; add only with a reason.
 */
const NON_DELIVERY_OPERANDS = new Set([
  "selectedMethod", // BuyerPaymentSummary: Paystack channel ("card" | "bank")
]);
/** Fail-closed sentinels are not claims about a delivery method. */
const SENTINELS = new Set(["unknown", "none", "other", "null", "unspecified"]);

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
    const SHAPE = ["string", "object", "number", "boolean", "undefined", "function", "symbol", "bigint"];

    const record = (file: string, msg: string) =>
      offenders.push(`${path.relative(ROOT, file)}: ${msg}`);

    const inScope = (operand: string) =>
      DELIVERY_OPERAND.test(operand) &&
      !OTHER_METHOD_VOCAB.test(operand) &&
      !NON_DELIVERY_OPERANDS.has(operand.split(".").pop()!);

    for (const file of FILES) {
      const src = fs.readFileSync(file, "utf8");
      // Skip files that never mention delivery at all. A bare `method` there
      // belongs to some other vocabulary.
      const deliveryFile = /deliver|shipp|fulfil|dispatch|courier|pickup|meetup/i.test(src);
      if (!deliveryFile) continue;

      for (const m of src.matchAll(COMPARISON)) {
        const [, operand, literal] = m;
        if (!inScope(operand) || SHAPE.includes(literal)) continue;
        if (!VOCAB.has(literal)) record(file, `${operand} === "${literal}"`);
      }

      for (const m of src.matchAll(DEFAULTING)) {
        const [, operand, literal] = m;
        if (!inScope(operand) || SHAPE.includes(literal) || SENTINELS.has(literal)) continue;
        if (DEFAULTING_ALLOWLIST.has(operand)) continue;
        record(
          file,
          `${operand} defaulted to "${literal}": a delivery method must fail closed, not default`,
        );
      }

      // switch blocks: take the text from the head to the matching brace depth.
      for (const head of src.matchAll(SWITCH_HEAD)) {
        const operand = head[1];
        if (!inScope(operand)) continue;
        let depth = 0;
        let end = head.index! + head[0].length;
        for (let i = head.index! + head[0].length - 1; i < src.length; i++) {
          if (src[i] === "{") depth++;
          else if (src[i] === "}") { depth--; if (depth === 0) { end = i; break; } }
        }
        const body = src.slice(head.index!, end);
        for (const c of body.matchAll(CASE_LABEL)) {
          if (!VOCAB.has(c[1])) record(file, `switch (${operand}) case "${c[1]}"`);
        }
      }

      // Object maps keyed by a delivery method: `const X: Record<..Method..>`
      // or a literal named `*method*Map` / `*Methods`.
      for (const m of src.matchAll(
        /(?:const|let)\s+([A-Za-z_$][\w$]*)[^=\n]*=\s*\{([^{}]*)\}/g,
      )) {
        const [, name, body] = m;
        if (!inScope(name)) continue;
        for (const k of body.matchAll(/(?:^|[,{\s])["']?([a-z_]{3,})["']?\s*:/g)) {
          if (!VOCAB.has(k[1])) record(file, `${name} map key "${k[1]}"`);
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
