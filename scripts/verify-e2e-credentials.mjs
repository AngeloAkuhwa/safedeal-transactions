#!/usr/bin/env node
/**
 * Prove the E2E credentials authenticate — before anything expensive runs.
 *
 * Why this exists: a password grant that comes back 400 has three completely
 * different causes, and every one of them surfaces downstream as the same
 * useless line ("LOGIN FAILED", or 102 tests quietly skipped):
 *
 *   1. the password in the repository secret is not the password on the account
 *   2. the app is pointed at a Supabase project where the account does not exist
 *   3. the account exists but its email is not confirmed
 *
 * Supabase's reply distinguishes all three. This asks once, per account, and
 * prints the answer.
 *
 * Two deliberate details:
 *
 *   - The URL and anon key are read from the repo's tracked `.env`, NOT from a
 *     repository secret. They are public values that ship in the client bundle,
 *     and having a second copy in CI is exactly how CI ended up authenticating
 *     against a different project than every local run.
 *   - The password is read from `process.env` and JSON-encoded here. It is
 *     never interpolated into a shell word, a YAML scalar or a dotenv line, so
 *     characters that a shell or dotenv would expand — `$`, `#`, backticks —
 *     cannot alter it or truncate it on the way to the auth endpoint.
 */
import { readFileSync } from "node:fs";

function envFromDotenv(path = ".env") {
  const out = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    out[m[1]] = m[2].trim().replace(/^["'](.*)["']$/, "$1");
  }
  return out;
}

const dot = envFromDotenv();
const URL_ = process.env.VITE_SUPABASE_URL || dot.VITE_SUPABASE_URL;
const KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || dot.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!URL_ || !KEY) {
  console.error("::error::No Supabase URL/anon key — expected them in the repo's .env");
  process.exit(1);
}
console.log(`project: ${new global.URL(URL_).host}`);

const roles = process.argv.slice(2);
if (roles.length === 0) roles.push("buyer", "seller", "admin");

let bad = 0;
for (const role of roles) {
  const R = role.toUpperCase();
  const email = process.env[`E2E_${R}_EMAIL`] || `claude.e2e.${role}@safedeal.test`;
  const password = process.env[`E2E_${R}_PASSWORD`];
  if (!password) {
    console.error(`::error::E2E_${R}_PASSWORD is empty — set it in Settings → Secrets and variables → Actions`);
    bad += 1;
    continue;
  }
  const res = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (res.ok) {
    console.log(`${role.padEnd(6)} OK   ${email}`);
    continue;
  }
  const body = await res.text().catch(() => "");
  let code = "";
  try { code = JSON.parse(body).error_code || JSON.parse(body).error || ""; } catch { /* not JSON */ }
  const hint =
    code === "email_not_confirmed"
      ? "the account exists but its email is not confirmed"
      : res.status === 400
        ? `this project does not accept that password for ${email} — either E2E_${R}_PASSWORD holds a different string than the account's password (secrets are write-only, so it cannot be read back: re-enter it), or the account was seeded in a different project`
        : `unexpected status from the auth endpoint`;
  console.error(`::error::${role} sign-in failed: HTTP ${res.status} ${body.slice(0, 200)} — ${hint}`);
  console.error(`         password length as CI received it: ${password.length}`);
  bad += 1;
}

if (bad > 0) {
  console.error(`::error::${bad} of ${roles.length} E2E credential(s) cannot authenticate. Nothing downstream can pass; not running it.`);
  process.exit(1);
}
console.log("all E2E credentials authenticate");
