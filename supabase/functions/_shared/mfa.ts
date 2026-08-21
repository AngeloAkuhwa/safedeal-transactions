// Shared MFA helpers: CSPRNG recovery-code generation, salted SHA-256 hashing,
// attempt logging and the sliding-window brute-force gate.
//
// Entropy: each code is 10 characters drawn uniformly (rejection-sampled) from
// a 32-symbol Crockford base32 alphabet => 50 bits of entropy per code.
// Codes and salts both come from crypto.getRandomValues (CSPRNG); no
// non-cryptographic RNG is used. Salted SHA-256 is sound here precisely because the codes are
// high-entropy machine-generated values, not user-chosen passwords.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

// Crockford base32 minus I, L, O, U to avoid transcription errors.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const CODE_LENGTH = 10;
export const CODE_COUNT = 10;
export const CODE_ENTROPY_BITS = 50; // log2(32) * 10

/** Uniform, rejection-sampled draw from ALPHABET using the CSPRNG. */
function randomChars(n: number): string {
  let out = "";
  while (out.length < n) {
    const buf = new Uint8Array(n * 2);
    crypto.getRandomValues(buf);
    for (const b of buf) {
      if (out.length === n) break;
      if (b >= 256 - (256 % ALPHABET.length)) continue; // reject to stay uniform
      out += ALPHABET[b % ALPHABET.length];
    }
  }
  return out;
}

export function generateRecoveryCode(): string {
  const raw = randomChars(CODE_LENGTH);
  return `${raw.slice(0, 5)}-${raw.slice(5)}`;
}

export function generateSalt(): string {
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  return Array.from(buf).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function normaliseCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^0-9A-Z]/g, "");
}

export async function hashCode(salt: string, code: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${salt}:${normaliseCode(code)}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Constant-time-ish comparison of two hex digests. */
export function hashesEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const RECOVERY_WINDOW_MINUTES = 15;
export const RECOVERY_MAX_FAILURES = 5;

/** Never receives or logs the submitted code, only the outcome. */
export async function logMfaAttempt(
  admin: SupabaseClient,
  userId: string,
  kind: "recovery_code" | "totp",
  success: boolean,
  ip: string | null,
): Promise<void> {
  try {
    await admin.from("mfa_verification_attempts").insert({
      user_id: userId,
      kind,
      success,
      ip,
    });
  } catch (e) {
    console.error("[mfa] attempt log failed", (e as Error).message);
  }
}

/** Count failed attempts inside the sliding window. */
export async function recentFailures(
  admin: SupabaseClient,
  userId: string,
  kind: "recovery_code" | "totp",
  windowMinutes = RECOVERY_WINDOW_MINUTES,
): Promise<number> {
  const since = new Date(Date.now() - windowMinutes * 60_000).toISOString();
  const { count, error } = await admin
    .from("mfa_verification_attempts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("kind", kind)
    .eq("success", false)
    .gte("created_at", since);
  if (error) {
    console.error("[mfa] failure count error", error.message);
    return 0; // fail open on read error; the code itself is still 50-bit
  }
  return count ?? 0;
}