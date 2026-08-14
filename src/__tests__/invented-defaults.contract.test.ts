/**
 * Invented-default lock.
 *
 * Two figures have repeatedly been conjured client-side when the real value
 * was missing:
 *
 *  - a verification window of `72` hours, which is AGREEMENT data — inventing
 *    it showed buyer and seller different deadlines for the same transaction;
 *  - a currency of `"NGN"`, which is a money claim about someone else's order.
 *
 * Both must fail closed (render `—`, or omit the statement) instead. This test
 * fails on any literal default for either.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
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
];

/** `verification_window_hours ?? 72`, `windowHours || 48`, `= 72` defaults. */
const WINDOW_DEFAULT =
  /\b([A-Za-z_$][\w$]*(?:\.[\w$]+)*)?\s*(?:verification_window_hours|verificationWindowHours|windowHours)\s*(?:\?\?|\|\|)\s*(\d+)/g;
/** A default parameter: `windowHours = 72`. */
const WINDOW_PARAM_DEFAULT =
  /\b(?:verification_window_hours|verificationWindowHours|windowHours)\s*(?::\s*number\s*)?=\s*(\d+)\b/g;

/** `?? "NGN"`, `|| "NGN"`, `currency = "NGN"`, `currency: "NGN"`. */
const CURRENCY_DEFAULT =
  /(?:\?\?|\|\||=|:)\s*["'`](NGN|USD|GBP|EUR)["'`]/g;
/**
 * Modules allowed to name a currency literally: they DEFINE the platform's
 * default currency or a provider's fixed settlement currency.
 */
const CURRENCY_DEFINITION_FILES = new Set([
  "src/lib/format.ts",
  "src/lib/pricing.ts",
  "src/lib/payment/money-format.ts",
  "src/services/vendor-plan.service.ts",
  "supabase/functions/_shared/pricing.ts",
]);

describe("invented defaults", () => {
  it("never invents a verification window", () => {
    const offenders: string[] = [];
    for (const file of FILES) {
      const src = stripComments(fs.readFileSync(file, "utf8"));
      const rel = path.relative(ROOT, file);
      for (const m of src.matchAll(WINDOW_DEFAULT)) offenders.push(`${rel}: ${m[0].trim()}`);
      for (const m of src.matchAll(WINDOW_PARAM_DEFAULT)) offenders.push(`${rel}: ${m[0].trim()}`);
    }
    expect(offenders).toEqual([]);
  });

  it("never defaults a currency in user-facing code", () => {
    const offenders: string[] = [];
    for (const file of FILES) {
      const rel = path.relative(ROOT, file).split(path.sep).join("/");
      if (CURRENCY_DEFINITION_FILES.has(rel)) continue;
      const src = stripComments(fs.readFileSync(file, "utf8"));
      for (const m of src.matchAll(CURRENCY_DEFAULT)) offenders.push(`${rel}: ${m[0].trim()}`);
    }
    expect(offenders).toEqual([]);
  });
});
