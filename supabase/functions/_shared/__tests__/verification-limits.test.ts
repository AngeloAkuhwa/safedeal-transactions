/**
 * The limits that decide how much of someone else's money can move.
 *
 * Before this module there were FIVE independent copies of the level-to-limit
 * table, one per edge function, on the money path. Four agreed on the buyer
 * amount and one did not. Worse, the two concurrency tables disagreed with
 * each other by 5x and nobody knew, because nothing compared them.
 *
 * Three rules, each with the way it gets broken:
 *
 *   1. **One definition site.** A sixth copy is one `const` away, and it will
 *      agree on the day it is written. Agreeing today is not a property.
 *
 *   2. **An unrecognised level refuses, it does not become zero.** `?? 0` is
 *      the tempting shorthand and it fails in the worst available way: the
 *      person reads "you have reached your limit" for a system fault, and
 *      nobody is paged because nothing errored. The trigger is routine, add a
 *      level anywhere and forget a table.
 *
 *   3. **The numbers are pinned.** Not because they are sacred, but because
 *      re-pricing a money limit should be a visible line in a review rather
 *      than a character someone changed while doing something else.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import {
  BUYER_AMOUNT_LIMIT_BY_LEVEL,
  SELLER_PUBLISH_LIMIT_BY_LEVEL,
  BUYER_CONCURRENT_SHOWN_IN_PROFILE,
  BUYER_CONCURRENT_ENFORCED_AT_PAYMENT,
  KNOWN_LEVELS,
  UNKNOWN_LEVEL_ERROR,
  limitFor,
} from "../verification-limits";

const FUNCTIONS = resolve(__dirname, "../..");
const read = (rel: string) => readFileSync(join(FUNCTIONS, rel), "utf8");
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

describe("the limit tables have one definition site", () => {
  it("no edge function declares its own level-keyed table", () => {
    // Scoped to tables keyed by verification level. Plenty of other
    // Record<string, number> maps exist (role ranks, signal weights) and are
    // none of this file's business.
    const offenders: string[] = [];
    for (const name of readdirSync(FUNCTIONS)) {
      const file = join(FUNCTIONS, name, "index.ts");
      if (!existsSync(file)) continue;
      const src = stripComments(readFileSync(file, "utf8"));
      for (const m of src.matchAll(/const (\w+): Record<string, number> = \{([^}]*)\}/g)) {
        const body = m[2];
        if (!/\bbasic_verified\b/.test(body) || !/\btrusted_buyer\b/.test(body)) continue;
        offenders.push(`${name}: ${m[1]}`);
      }
    }
    expect(
      offenders,
      "a level-keyed limit table must live in _shared, not in a function:\n  " +
        offenders.join("\n  "),
    ).toEqual([]);
  });

  it("nothing collapses an unknown level to zero", () => {
    const offenders: string[] = [];
    for (const name of readdirSync(FUNCTIONS)) {
      const file = join(FUNCTIONS, name, "index.ts");
      if (!existsSync(file)) continue;
      const src = stripComments(readFileSync(file, "utf8"));
      for (const m of src.matchAll(/(\w*(?:LIMIT|CONCURRENT|DISPUTES)\w*)\[[^\]]+\]\s*\?\?\s*0/g)) {
        offenders.push(`${name}: ${m[0]}`);
      }
    }
    expect(
      offenders,
      "an unrecognised level is a data fault, not a zero allowance:\n  " + offenders.join("\n  "),
    ).toEqual([]);
  });
});

describe("an unrecognised level refuses", () => {
  it("limitFor returns null rather than a number it cannot justify", () => {
    expect(limitFor(BUYER_AMOUNT_LIMIT_BY_LEVEL, "basic_verified")).toBe(50_000);
    expect(limitFor(BUYER_AMOUNT_LIMIT_BY_LEVEL, "platinum_founder")).toBeNull();
    expect(limitFor(BUYER_AMOUNT_LIMIT_BY_LEVEL, null)).toBeNull();
    expect(limitFor(BUYER_AMOUNT_LIMIT_BY_LEVEL, "")).toBeNull();
  });

  it("a zero allowance is distinguishable from an unknown level", () => {
    // The whole point. `unverified` genuinely has a zero limit; an unknown
    // level has no limit we can state. Collapsing both to 0 is what made a
    // system fault read as a cap.
    expect(limitFor(BUYER_AMOUNT_LIMIT_BY_LEVEL, "unverified")).toBe(0);
    expect(limitFor(BUYER_AMOUNT_LIMIT_BY_LEVEL, "unknown")).toBeNull();
  });

  it("the gates that enforce a limit return the refusal explicitly", () => {
    // Either spelling counts: the shared constant, or the literal it holds.
    // `initiate-paystack-payment` predates the constant and writes the string.
    for (const fn of ["initiate-paystack-payment", "create-transaction"]) {
      const src = read(`${fn}/index.ts`);
      expect(
        src.includes(UNKNOWN_LEVEL_ERROR) || src.includes("UNKNOWN_LEVEL_ERROR"),
        `${fn} does not refuse an unknown level`,
      ).toBe(true);
    }
  });
});

describe("no limit is unbounded, and none is invented", () => {
  it("the seller publish table has no infinity in it", () => {
    // Was `high_trust_buyer: Number.MAX_SAFE_INTEGER`, an unbounded publishing
    // allowance reachable only by a manual database write, because
    // `compute_verification_level` can never return that level.
    for (const v of Object.values(SELLER_PUBLISH_LIMIT_BY_LEVEL)) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeLessThan(Number.MAX_SAFE_INTEGER);
    }
    // Comments are not code. The module explains WHY the infinity was removed,
    // and a scan that reads prose would fail on the explanation.
    expect(stripComments(read("_shared/verification-limits.ts"))).not.toMatch(
      /MAX_SAFE_INTEGER|Infinity/,
    );
  });

  it("omits the level nobody can be assigned rather than guessing a number", () => {
    // Fail closed: a manually promoted seller hits the explicit refusal
    // instead of an allowance nobody decided on.
    expect(SELLER_PUBLISH_LIMIT_BY_LEVEL.high_trust_buyer).toBeUndefined();
    expect(limitFor(SELLER_PUBLISH_LIMIT_BY_LEVEL, "high_trust_buyer")).toBeNull();
  });
});

describe("the numbers are pinned, so a re-price is a visible line", () => {
  it("buyer amount limits", () => {
    expect(BUYER_AMOUNT_LIMIT_BY_LEVEL).toEqual({
      unverified: 0,
      basic_verified: 50_000,
      trusted_buyer: 200_000,
      high_trust_buyer: 500_000,
    });
  });

  it("seller publish limits", () => {
    expect(SELLER_PUBLISH_LIMIT_BY_LEVEL).toEqual({
      unverified: 0,
      basic_verified: 200_000,
      trusted_buyer: 5_000_000,
    });
  });

  it("both concurrency tables, including the fact that they disagree", () => {
    // Pinned AS A CONFLICT on purpose. These two describe the same allowance
    // and differ by 5x: one is shown to the person, the other is enforced when
    // they pay. Converging them is decision D12, a product call about how many
    // transactions someone may run at once, and this test exists so the
    // divergence cannot be resolved silently in either direction.
    expect(BUYER_CONCURRENT_SHOWN_IN_PROFILE).toEqual({
      unverified: 0,
      basic_verified: 1,
      trusted_buyer: 3,
      high_trust_buyer: 5,
    });
    expect(BUYER_CONCURRENT_ENFORCED_AT_PAYMENT).toEqual({
      unverified: 0,
      basic_verified: 5,
      trusted_buyer: 10,
      high_trust_buyer: 20,
    });
    expect(
      BUYER_CONCURRENT_SHOWN_IN_PROFILE,
      "the two concurrency tables now agree. If that was deliberate (D12), " +
        "collapse them into one export and delete this assertion.",
    ).not.toEqual(BUYER_CONCURRENT_ENFORCED_AT_PAYMENT);
  });

  it("covers every level the enum can hold", () => {
    // A level in the enum with no entry anywhere would refuse at every gate,
    // which is safe but silent. Buyer tables must be complete.
    for (const level of KNOWN_LEVELS) {
      expect(BUYER_AMOUNT_LIMIT_BY_LEVEL, `missing ${level}`).toHaveProperty(level);
      expect(BUYER_CONCURRENT_SHOWN_IN_PROFILE, `missing ${level}`).toHaveProperty(level);
    }
  });
});
