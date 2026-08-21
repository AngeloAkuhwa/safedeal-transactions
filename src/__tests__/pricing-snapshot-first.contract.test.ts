/**
 * Pricing snapshot-first contract.
 *
 * transaction_pricing rows are locked at checkout time and must never be
 * silently recomputed for display. Each of the paths below must read the
 * snapshot before any computePricing() call, and any computePricing() call
 * must either receive an explicit 4th (vendor config) argument or live
 * inside a documented "FALLBACK" branch for the (should-not-happen) case
 * where no snapshot row exists.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "../../supabase/functions");

const SNAPSHOT_FIRST_FILES = [
  "verify-paystack-payment/index.ts",
  "paystack-webhook/index.ts",
  "transaction-agreement/index.ts",
  "transaction-detail/index.ts",
  "seller-transaction-detail/index.ts",
];

/**
 * Stronger than snapshot-first: these paths must not call computePricing at
 * all. With no snapshot there is no evidence of what was agreed, so they emit
 * nulls and let the screen block rather than recompute a display price.
 */
const NO_COMPUTE_FILES = ["resolve-share-token/index.ts"];

function readSource(relPath: string): string {
  return readFileSync(join(ROOT, relPath), "utf-8");
}

describe("pricing snapshot-first contract", () => {
  it.each(NO_COMPUTE_FILES)("%s never recomputes pricing for display", (relPath) => {
    const src = readSource(relPath);
    expect(src.indexOf('.from("transaction_pricing")')).toBeGreaterThan(-1);
    expect(src).not.toMatch(/computePricing\(/);
  });

  it.each(SNAPSHOT_FIRST_FILES)(
    "%s reads a transaction_pricing snapshot before any computePricing call",
    (relPath) => {
      const src = readSource(relPath);
      const snapshotIdx = src.indexOf('.from("transaction_pricing")');
      const firstComputeIdx = src.indexOf("computePricing(");

      expect(snapshotIdx, `${relPath}: no transaction_pricing select found`).toBeGreaterThan(-1);
      expect(firstComputeIdx, `${relPath}: no computePricing call found`).toBeGreaterThan(-1);
      expect(
        snapshotIdx,
        `${relPath}: transaction_pricing snapshot must be read before computePricing is called`,
      ).toBeLessThan(firstComputeIdx);
    },
  );

  it("every computePricing call in supabase/functions/** either passes a config argument or is inside a documented fallback branch", () => {
    const glob = require("node:fs").readdirSync;
    const walk = (dir: string): string[] => {
      const entries = require("node:fs").readdirSync(dir, { withFileTypes: true });
      let out: string[] = [];
      for (const e of entries) {
        const full = join(dir, e.name);
        if (e.isDirectory()) out = out.concat(walk(full));
        else if (e.name.endsWith(".ts")) out.push(full);
      }
      return out;
    };

    const files = walk(ROOT).filter(
      (f) => !f.includes("_shared/pricing.ts") && !f.includes("__tests__"),
    );
    const violations: string[] = [];

    for (const file of files) {
      const src = readFileSync(file, "utf-8");
      const lines = src.split("\n");
      // Track "FALLBACK" comment lookback window per call site.
      let callStart = 0;
      while (true) {
        const idx = src.indexOf("computePricing(", callStart);
        if (idx === -1) break;
        callStart = idx + 1;

        // Grab the full call (naive paren balance) to count arguments.
        let depth = 0;
        let end = idx + "computePricing(".length - 1;
        for (let i = end; i < src.length; i++) {
          if (src[i] === "(") depth++;
          if (src[i] === ")") {
            depth--;
            if (depth === 0) {
              end = i;
              break;
            }
          }
        }
        const callText = src.slice(idx, end + 1);
        const commaCount = (callText.match(/,/g) || []).length;
        const hasFourArgs = commaCount >= 3; // amount, currency, mode, config

        // Look back up to 15 lines for a "FALLBACK" marker comment.
        const lineNo = src.slice(0, idx).split("\n").length - 1;
        const lookback = lines.slice(Math.max(0, lineNo - 15), lineNo + 1).join("\n");
        const isDocumentedFallback = /FALLBACK/.test(lookback);

        if (!hasFourArgs && !isDocumentedFallback) {
          violations.push(`${file}:${lineNo + 1}: computePricing call missing config arg and not in a documented FALLBACK branch`);
        }
      }
    }

    expect(violations, violations.join("\n")).toEqual([]);
  });
});
