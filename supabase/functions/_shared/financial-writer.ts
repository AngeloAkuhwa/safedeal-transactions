/**
 * financial-writer.ts. Canonical fingerprinting + stable idempotency keys.
 *
 * This file is the TypeScript twin of the SQL routines
 * `public.canonical_payload_v1(jsonb)` / `public.canonical_fingerprint_v1(jsonb)`.
 * Both sides MUST produce byte-identical canonical strings and hashes; the
 * golden vectors in __tests__/financial-writer.test.ts are generated from SQL.
 *
 * v1 canonical form (flat payloads only):
 *   - object keys sorted ascending by UTF-8 code unit ("C" collation)
 *   - each entry serialized as `key=value`, entries joined with "\n"
 *   - string  -> NFC-normalized value
 *   - integer -> decimal digits (non-integer numbers are rejected)
 *   - boolean -> "true" / "false"
 *   - null    -> "\u0001"
 *   - nested objects/arrays are rejected (fail closed)
 * Fingerprint = "v1:" + sha256_hex(utf8(canonical string)).
 */

export type CanonicalValue = string | number | boolean | null;
export type CanonicalPayload = Record<string, CanonicalValue>;

export function canonicalPayloadV1(payload: CanonicalPayload): string {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("canonical_payload_v1_requires_object");
  }
  const keys = Object.keys(payload).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const parts: string[] = [];
  for (const key of keys) {
    const value = payload[key];
    if (value === null || value === undefined) {
      parts.push(`${key}=\u0001`);
    } else if (typeof value === "number") {
      if (!Number.isInteger(value)) throw new Error(`canonical_payload_v1_non_integer_number:${key}`);
      parts.push(`${key}=${value.toFixed(0)}`);
    } else if (typeof value === "boolean") {
      parts.push(`${key}=${value ? "true" : "false"}`);
    } else if (typeof value === "string") {
      parts.push(`${key}=${value.normalize("NFC")}`);
    } else {
      throw new Error(`canonical_payload_v1_nested_not_allowed:${key}`);
    }
  }
  return parts.join("\n");
}

export async function canonicalFingerprintV1(payload: CanonicalPayload): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalPayloadV1(payload));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `v1:${hex}`;
}

/** Money -> integer minor units, fail closed on anything non-exact. */
export function toMinorUnits(amount: number | string): number {
  const text = typeof amount === "number" ? amount.toString() : String(amount).trim();
  if (!/^-?\d+(\.\d{1,2})?$/.test(text)) throw new Error(`invalid_money_amount:${text}`);
  const negative = text.startsWith("-");
  const [whole, frac = ""] = text.replace("-", "").split(".");
  const minor = Number(whole) * 100 + Number((frac + "00").slice(0, 2));
  return negative ? -minor : minor;
}

/**
 * Stable idempotency key:
 *   <scope>:<action>:<transaction_id>:<stable_operation_id>:<entry_type>
 * `stableOperationId` must be retry-stable (provider event id, confirmation id,
 * payout id, refund id): never a timestamp or a random value.
 */
export function buildIdempotencyKey(input: {
  scope: string;
  action: string;
  transactionId: string;
  stableOperationId: string;
  entryType: string;
}): string {
  const { scope, action, transactionId, stableOperationId, entryType } = input;
  for (const [name, part] of Object.entries({ scope, action, transactionId, stableOperationId, entryType })) {
    if (!part || String(part).includes("\n")) throw new Error(`invalid_idempotency_key_part:${name}`);
  }
  return `${scope}:${action}:${transactionId}:${stableOperationId}:${entryType}`;
}
