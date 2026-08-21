#!/usr/bin/env node
/**
 * Provision the disposable audit identities from secrets.
 *
 * The three `claude.e2e.*` accounts used to be created by a migration with
 * their passwords written into the file. One of them held `super_admin`. That
 * migration no longer sets a password, and 20260815203000 revoked the
 * privileges and disabled the logins on databases that already had them.
 *
 * This is where they come back: at run time, from secrets, only when an audit
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
 *   node scripts/provision-e2e-identities.mjs --sql      # print SQL instead
 *
 * ON LOVABLE CLOUD THERE IS NO SERVICE ROLE KEY. Supabase's own documentation
 * is explicit: a Lovable Cloud project's Supabase instance is "owned and
 * managed by Lovable, not by your personal Supabase account", and the owner
 * has no access to the dashboard, the service role key, or the database URL.
 *
 * So the admin-API path above cannot be used there. `--sql` prints statements
 * to run through Lovable's SQL access instead; it reads the same environment
 * variables and never prints a password it was not given.
 *
 * The accounts, their roles and the seeded product are all still created by the
 * migration: only the credential is dynamic. That keeps the fixture data in
 * version control, where it is reviewable, and the secret out of it.
 */

const ACCOUNTS = [
  { id: "0e2e0001-0000-4000-8000-000000000001", email: "claude.e2e.buyer@safedeal.test", env: "E2E_BUYER_PASSWORD" },
  { id: "0e2e0001-0000-4000-8000-000000000002", email: "claude.e2e.seller@safedeal.test", env: "E2E_SELLER_PASSWORD" },
  { id: "0e2e0001-0000-4000-8000-000000000003", email: "claude.e2e.admin@safedeal.test", env: "E2E_ADMIN_PASSWORD" },
];

const ACCOUNTS_FOR_SQL = () => ACCOUNTS;

const DISABLE = process.argv.includes("--disable");
const AS_SQL = process.argv.includes("--sql");

// The minimum length for an audit credential, applied identically by both
// paths below. It used to be 16 in both, which quietly refused a 15-character
// secret: and "quietly" was the whole problem, not the number: the --sql path
// printed no UPDATE for that account, exited 0, and the operator pasted an
// output that provisioned two of three users with nothing to say so. 12 keeps
// out the obviously guessable. The refusal is now visible in the pasted SQL
// itself and the exit code is non-zero, so a partial run cannot read as a
// complete one.
const MIN_PASSWORD_LENGTH = 12;

if (AS_SQL) {
  // No service role key needed: this is the Lovable Cloud path.
  const lines = [
    "-- Provision the disposable audit identities.",
    "-- Passwords come from the environment; nothing here is committed.",
  ];
  let refused = false;
  for (const a of ACCOUNTS_FOR_SQL()) {
    if (DISABLE) {
      lines.push(
        `UPDATE auth.users SET encrypted_password = crypt(gen_random_uuid()::text || gen_random_uuid()::text, gen_salt('bf')), updated_at = now() WHERE email = '${a.email}';`,
      );
      continue;
    }
    const pw = process.env[a.env];
    if (!pw) {
      // Into `lines`, not just stderr: this has to survive being copied.
      lines.push(`-- !! MISSING ${a.env}. ${a.email} NOT provisioned.`);
      console.error(`MISSING ${a.env}: ${a.email} not provisioned`);
      refused = true;
      continue;
    }
    if (pw.length < MIN_PASSWORD_LENGTH) {
      lines.push(
        `-- !! ${a.env} is under ${MIN_PASSWORD_LENGTH} characters. ${a.email} NOT provisioned.`,
      );
      console.error(`REFUSED ${a.env}: under ${MIN_PASSWORD_LENGTH} characters`);
      refused = true;
      continue;
    }
    lines.push(
      `UPDATE auth.users SET encrypted_password = crypt('${pw.replace(/'/g, "''")}', gen_salt('bf')), banned_until = NULL, email_confirmed_at = COALESCE(email_confirmed_at, now()), updated_at = now() WHERE email = '${a.email}';`,
    );
  }
  if (refused) {
    lines.push("-- !! INCOMPLETE: at least one account above was not provisioned.");
  }
  console.log(lines.join("\n"));
  process.exit(refused ? 1 : 0);
}

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
      console.error(`missing ${account.env}. ${account.email} left disabled`);
      failed = true;
      continue;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      console.error(`${account.env} is shorter than ${MIN_PASSWORD_LENGTH} characters; refusing to set a weak audit credential`);
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
