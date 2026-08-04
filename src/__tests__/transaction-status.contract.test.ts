import { describe, it, expect } from "vitest";
import {
  TRANSACTION_STATUSES,
  BUYER_AWAITING_DELIVERY_STATUSES,
  BUYER_AWAITING_VERIFICATION_STATUSES,
  isTransactionStatus,
} from "../../supabase/functions/_shared/transaction-status";
import type { Database } from "@/integrations/supabase/types";

type DbTransactionStatus = Database["public"]["Enums"]["transaction_status"];

describe("transaction_status contract", () => {
  it("shared list matches the generated database enum exactly", () => {
    // Compile-time: every shared literal must be assignable to the DB enum.
    const checked: DbTransactionStatus[] = [...TRANSACTION_STATUSES];
    expect(checked.length).toBe(TRANSACTION_STATUSES.length);
    expect(new Set(TRANSACTION_STATUSES).size).toBe(TRANSACTION_STATUSES.length);
  });

  it("rejects the dead literals that previously leaked into buyer-dashboard", () => {
    for (const dead of [
      "awaiting_fulfillment",
      "in_transit",
      "delivered",
      "awaiting_buyer_confirmation",
    ]) {
      expect(isTransactionStatus(dead)).toBe(false);
    }
  });

  it("buyer dashboard metric groupings only use valid enum members", () => {
    for (const s of [
      ...BUYER_AWAITING_DELIVERY_STATUSES,
      ...BUYER_AWAITING_VERIFICATION_STATUSES,
    ]) {
      expect(isTransactionStatus(s)).toBe(true);
    }
    expect(BUYER_AWAITING_DELIVERY_STATUSES).toContain("seller_preparing_delivery");
  });
});
