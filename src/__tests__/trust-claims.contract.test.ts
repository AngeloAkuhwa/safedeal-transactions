/**
 * PHASE 0d CONTRACT — the trust-claim lock.
 *
 * Every user-facing trust / protection claim string must live in
 * `src/lib/trust/trust-claims.ts`, where it is paired with the condition that
 * must hold for it to render. This test fails if any of those strings appears
 * as a literal on any app or email surface. A vocabulary scan also catches new
 * wording, while a narrow documented allowlist covers factual operational
 * labels (for example a real ledger's "Escrow" heading).
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { TRUST_CLAIMS, ALL_TRUST_CLAIM_TEXTS, isTrackedDelivery } from "@/lib/trust/trust-claims";

const SRC = path.resolve(__dirname, "..");

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "__tests__" ? [] : walk(full);
    return /\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [full] : [];
  });
}

const PROJECT = path.resolve(SRC, "..");
const APP_SURFACES = ["pages", "components", "lib", "services", "hooks"].flatMap((dir) => walk(path.join(SRC, dir)));
const EMAIL_SURFACES = walk(path.join(PROJECT, "supabase", "functions")).filter((f) =>
  /(?:email|template|notification|support-copy)/i.test(f),
);
const SURFACES = [...APP_SURFACES, ...EMAIL_SURFACES];
const CLAIM_REGISTRY = path.join(SRC, "lib", "trust", "trust-claims.ts");
const CLAIM_CONSUMERS = SURFACES.filter((file) => file !== CLAIM_REGISTRY);
const rel = (f: string) => path.relative(SRC, f);
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Retired claims that must never come back in any form. */
const RETIRED_CLAIMS = [
  "Verified Sellers",
  "All sellers undergo verification",
  "Real-time Tracking",
  "Delivery Support",
  "Protected Delivery",
  "Verified Seller Trust Profile",
];

const TRUST_VOCABULARY = /\b(?:verified|trusted|protected|tracking|real[- ]?time|guaranteed|insured|licensed|escrow)\b/i;
const UNSUBSTANTIATED_SCALE = /\b(?:most trusted|thousands of|millions of|best|guaranteed|100%|always safe)\b|(?:#1|No\.\s*1)|\b\d[\d,]*\+?\s+(?:users|buyers|sellers|customers|merchants)\b/i;

/**
 * Factual operational vocabulary, not marketing/trust claims. These patterns
 * cover status labels backed by row data, internal/admin tooling, input labels,
 * and delivery/ledger record names. Buyer-facing promises are never allowlisted.
 */
const SAFE_OPERATIONAL_CONTEXTS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /admin|audit|reconciliation|settings|permission|role|employee|support/i, reason: "Internal operations UI describes real records and controls." },
  { pattern: /status|state|history|ledger|record|balance|amount|fee|payout|refund|release/i, reason: "Dynamic financial/status labels name backend data, not a promise." },
  { pattern: /delivery|courier|shipment|dispatch|handoff|method|number|url|update/i, reason: "Fulfillment field labels describe recorded delivery data." },
  { pattern: /identity|email|phone|bank|account|profile|verification/i, reason: "Verification workflow/status labels are backed by verification fields." },
  { pattern: /transaction|payment|funds|money/i, reason: "Transaction record vocabulary describes the current backend state." },
  { pattern: /search|filter|select|option|placeholder|error|failed|unavailable/i, reason: "Control and error copy makes no trust promise." },
];

function userVisibleJsxText(source: string): string[] {
  const values: string[] = [];
  for (const match of source.matchAll(/>([^<>{}]+)</g)) {
    const value = match[1].replace(/\s+/g, " ").trim();
    if (value) values.push(value);
  }
  for (const match of source.matchAll(/\b(?:aria-label|alt|placeholder|title)\s*=\s*["']([^"']+)["']/g)) {
    const value = match[1].replace(/\s+/g, " ").trim();
    if (value) values.push(value);
  }
  return values;
}

describe("the trust-claim lock", () => {
  it("scans a meaningful number of files", () => {
    expect(SURFACES.length).toBeGreaterThan(150);
  });

  it("declares a condition and a basis for every claim", () => {
    for (const [key, c] of Object.entries(TRUST_CLAIMS)) {
      expect(c.text.length, key).toBeGreaterThan(0);
      expect(c.condition, key).toBeTruthy();
      expect(c.basis.length, key).toBeGreaterThan(10);
    }
  });

  for (const text of ALL_TRUST_CLAIM_TEXTS) {
    it(`"${text}" appears as a literal only in trust-claims.ts`, () => {
      const needle = new RegExp(`["'\`>]\\s*${escape(text)}`);
      const offenders = CLAIM_CONSUMERS.filter((f) => needle.test(fs.readFileSync(f, "utf8"))).map(rel);
      expect(offenders).toEqual([]);
    });
  }

  for (const text of RETIRED_CLAIMS) {
    it(`the retired claim "${text}" is gone from the whole app`, () => {
      const needle = new RegExp(`\\b${escape(text)}\\b`, "i");
      const offenders = CLAIM_CONSUMERS.filter((f) => needle.test(fs.readFileSync(f, "utf8"))).map(rel);
      expect(offenders).toEqual([]);
    });
  }

  it("treats handover methods as untracked and courier as tracked", () => {
    for (const m of ["hand_delivery", "meetup", "pickup", "digital"]) {
      expect(isTrackedDelivery(m), m).toBe(false);
    }
    for (const m of ["courier", "courier_shipping", "shipping", "standard_delivery", "delivery"]) {
      expect(isTrackedDelivery(m), m).toBe(true);
    }
    for (const m of ["unknown", "drone", "other", ""]) expect(isTrackedDelivery(m), m).toBe(false);
    expect(isTrackedDelivery(null)).toBe(false);
  });

  it("blocks unsubstantiated scale and superlatives on app and email surfaces", () => {
    const offenders = CLAIM_CONSUMERS.flatMap((file) =>
      userVisibleJsxText(fs.readFileSync(file, "utf8"))
        .filter((text) => UNSUBSTANTIATED_SCALE.test(text))
        .map((text) => `${rel(file)}: ${text}`),
    );
    expect(offenders).toEqual([]);
  });

  it("triages every new user-visible trust-vocabulary string", () => {
    const registered = new Set(ALL_TRUST_CLAIM_TEXTS.map((text) => text.toLowerCase()));
    const offenders = CLAIM_CONSUMERS.flatMap((file) =>
      userVisibleJsxText(fs.readFileSync(file, "utf8"))
        .filter((text) => TRUST_VOCABULARY.test(text))
        .filter((text) => !registered.has(text.toLowerCase()))
        .filter((text) => !SAFE_OPERATIONAL_CONTEXTS.some(({ pattern }) => pattern.test(text)))
        .map((text) => `${rel(file)}: ${text}`),
    );
    expect(offenders).toEqual([]);
  });
});