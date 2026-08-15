#!/usr/bin/env node
/**
 * Provision the disposable audit identities from secrets.
 *
 * The three `claude.e2e.*` accounts used to be created by a migration with
 * their passwords written into the file. One of them held `super_admin`. That
 * migration no longer sets a password, and 20260815203000 revoked the
 * privileges and disabled the logins on databases that already had them.
 *
 * This is where they come back — at run time, from secrets, only when an audit
 * needs them:
 *
 *   SUPABASE_URL                 project URL
 *   SUPABASE_SERVICE_ROLE_KEY    service role key (CI secret; never committed)
 *   E2E_BUYER_PASSWORD
 *   E2E_SELLER_PASSWORD
 *   E2E_ADMIN_PASSWORD
 *
 *   node scripts/provision-e2e-identities.mjs            # set passwords, enable
 *   node scripts/provision-e2e-identities.mjs --disable  # revoke again
 *
 * The accounts, their roles and the seeded product are all still created by the
 * migration — only the credential is dynamic. That keeps the fixture data in
 * version control, where it is reviewable, and the secret out of it.
 */

const ACCOUNTS = [
  { id: "0e2e0001-0000-4000-8000-000000000001", email: "claude.e2e.buyer@safedeal.test", env: "E2E_BUYER_PASSWORD" },
  { id: "0e2e0001-0000-4000-8000-000000000002", email: "claude.e2e.seller@safedeal.test", env: "E2E_SELLER_PASSWORD" },
  { id: "0e2e0001-0000-4000-8000-000000000003", email: "claude.e2e.admin@safedeal.test", env: "E2E_ADMIN_PASSWORD" },
];

const DISABLE = process.argv.includes("--disable");

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error(
    "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.\n" +
      "The service role key is a secret: pass it from the environment, never from a file in the repo.",
  );
  process.exit(2);
}

async function admin(path, method, body) {
  const res = await fetch(`${url}/auth/v1/admin/${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

let failed = false;

for (const account of ACCOUNTS) {
  try {
    if (DISABLE) {
      // Leave the row and its data intact; remove only the ability to sign in.
      await admin(`users/${account.id}`, "PUT", { password: null, ban_duration: "876000h" });
      console.log(`disabled  ${account.email}`);
      continue;
    }

    const password = process.env[account.env];
    if (!password) {
      console.error(`missing ${account.env} — ${account.email} left disabled`);
      failed = true;
      continue;
    }
    if (password.length < 16) {
      console.error(`${account.env} is shorter than 16 characters; refusing to set a weak audit credential`);
      failed = true;
      continue;
    }

    await admin(`users/${account.id}`, "PUT", {
      password,
      ban_duration: "none",
      email_confirm: true,
    });
    console.log(`provisioned ${account.email}`);
  } catch (err) {
    console.error(`FAILED ${account.email}: ${err.message}`);
    failed = true;
  }
}

if (failed) {
  console.error("\nOne or more identities were not provisioned. The signed-in audit will report LOGIN FAILED rather than passing silently.");
  process.exit(1);
}
console.log(DISABLE ? "\nAll audit identities disabled." : "\nAll audit identities provisioned.");
