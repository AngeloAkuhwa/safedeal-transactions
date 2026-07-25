import { describe, it, expect } from "vitest";

/**
 * Employee IDs are minted server-side by `generate_employee_id()` and locked
 * on insert via `internal_users_lock_employee_id`. Format is `SD-YYYY-NNNN`
 * where `NNNN` is a monotonically increasing counter that resets per year.
 *
 * The DB round-trip is skipped here; when a service export exposes a pure
 * formatter this file will host contract tests for it.
 */

const EMPLOYEE_ID_RE = /^SD-(\d{4})-(\d{4,})$/;

describe.skip("employee id format", () => {
  it("matches SD-YYYY-NNNN", () => {
    const sample = "SD-2026-0007";
    const m = sample.match(EMPLOYEE_ID_RE);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThanOrEqual(2024);
  });

  it("rejects lowercase, missing year or missing counter", () => {
    expect("sd-2026-0007".match(EMPLOYEE_ID_RE)).toBeNull();
    expect("SD-0007".match(EMPLOYEE_ID_RE)).toBeNull();
    expect("SD-2026-".match(EMPLOYEE_ID_RE)).toBeNull();
  });
});