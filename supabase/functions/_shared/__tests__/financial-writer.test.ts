import { describe, expect, it } from "vitest";
import {
  buildIdempotencyKey,
  canonicalFingerprintV1,
  canonicalPayloadV1,
  toMinorUnits,
} from "../financial-writer";

// Golden vectors produced by public.canonical_fingerprint_v1() in Postgres.
const GOLDEN: Array<[Record<string, any>, string]> = [
  [
    { b: "x", a: 1, c: null },
    "v1:e24d1d1233c869a4295a691c723bc0654a28eeb041f20b0e7175fdabbd5d4aa0",
  ],
  [
    {
      amount_minor: 250000,
      currency: "NGN",
      entry_type: "escrow_hold",
      transaction_id: "11111111-1111-1111-1111-111111111111",
    },
    "v1:e253c67d4d99f1eead0335e65373c5a52543178edad307059292ff37b3fee749",
  ],
  [
    { note: "café", flag: true, zero: 0 },
    "v1:c18ce84159e6be3ac7eab70009eab4d7ed97e8010b08922e89bb426efb07ae22",
  ],
];

describe("canonical fingerprint v1: SQL parity", () => {
  it.each(GOLDEN)("matches the SQL fingerprint for %j", async (payload, expected) => {
    await expect(canonicalFingerprintV1(payload)).resolves.toBe(expected);
  });

  it("is key-order independent", async () => {
    const a = await canonicalFingerprintV1({ a: 1, b: "two", c: null });
    const b = await canonicalFingerprintV1({ c: null, b: "two", a: 1 });
    expect(a).toBe(b);
  });

  it("distinguishes different amounts", async () => {
    const a = await canonicalFingerprintV1({ amount_minor: 100 });
    const b = await canonicalFingerprintV1({ amount_minor: 101 });
    expect(a).not.toBe(b);
  });

  it("rejects nested payloads and non-integer numbers", () => {
    expect(() => canonicalPayloadV1({ a: { b: 1 } } as any)).toThrow(/nested_not_allowed/);
    expect(() => canonicalPayloadV1({ a: 1.5 })).toThrow(/non_integer_number/);
    expect(() => canonicalPayloadV1([] as any)).toThrow(/requires_object/);
  });
});

describe("toMinorUnits", () => {
  it("converts exact money", () => {
    expect(toMinorUnits("1250.00")).toBe(125000);
    expect(toMinorUnits("0.5")).toBe(50);
    expect(toMinorUnits(-3.21)).toBe(-321);
  });
  it("fails closed on inexact money", () => {
    expect(() => toMinorUnits("1.005")).toThrow(/invalid_money_amount/);
    expect(() => toMinorUnits("abc")).toThrow(/invalid_money_amount/);
  });
});

describe("buildIdempotencyKey", () => {
  it("is deterministic and structured", () => {
    const key = buildIdempotencyKey({
      scope: "payment",
      action: "capture",
      transactionId: "tx-1",
      stableOperationId: "evt-9",
      entryType: "escrow_hold",
    });
    expect(key).toBe("payment:capture:tx-1:evt-9:escrow_hold");
  });
  it("rejects empty parts", () => {
    expect(() =>
      buildIdempotencyKey({ scope: "payment", action: "capture", transactionId: "", stableOperationId: "e", entryType: "x" }),
    ).toThrow(/invalid_idempotency_key_part/);
  });
});
