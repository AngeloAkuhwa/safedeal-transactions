# SafeDeal 2FA — recovery runbook and enforcement pre-flight

Enforcement is **OFF**. `security.two_factor_admin_enforced` is `false` and nothing in
this release changes it. `_shared/auth.ts` runs the AAL2 gate in log-only mode.

## Scope

| Audience | Policy |
|---|---|
| Internal / back-office | 2FA required (prompted persistently), enforcement behind the OFF flag |
| Buyers and sellers | 2FA offered, always skippable, re-prompt at most every 30 days |

No consumer route may trigger a step-up. The deny-list lives in
`src/lib/mfa-prompt-policy.ts` and is asserted by `src/__tests__/mfa.contract.test.ts`.

## Recovery codes

- 10 codes per batch, 10 characters each from a 32-symbol Crockford base32 alphabet.
- **50 bits of entropy per code**, drawn with `crypto.getRandomValues` and rejection
  sampled for uniformity. No non-cryptographic RNG is used anywhere in the path.
- Stored as `sha256(salt + ":" + code)` with a **per-row, 128-bit CSPRNG salt**. The
  plaintext code exists only in the generation response.
- Shown once. Regenerating invalidates the entire previous batch.
- Single use: consumption updates the row only while `used_at IS NULL`.
- Using a code **removes every MFA factor**, forcing re-enrolment.

### Rate limiting

| Path | Limit | Behaviour on breach |
|---|---|---|
| Recovery code (`mfa-recovery`, action `consume`) | 5 failures / 15 min / user | HTTP 429 for the rest of the window; a `security_alert` notification is raised to the account owner |
| TOTP verify (`supabase.auth.mfa.verify`) | Supabase's native per-user MFA verification limit (default 15 attempts/hour, plus a 429 on the auth endpoint) | Supabase rejects the attempt. We additionally log every attempt to `mfa_verification_attempts` and alert the owner after 10 failures in an hour |

Every attempt is logged with user id, timestamp, kind, outcome and IP. **The submitted
code is never logged, stored, or included in any error payload.**

### Why the recovery endpoint accepts an aal1 session

By definition someone who lost their authenticator cannot reach aal2, so gating recovery
behind aal2 would make it unusable. `mfa-recovery` therefore authenticates with
`requireUser` (valid session, password already proven) and has no assurance-level check.
An attacker holding only a stolen password still has to:

1. guess an unused 50-bit code,
2. inside a window that locks after 5 failures per 15 minutes,
3. while the account owner receives a security alert on lockout and on any successful use,
4. and even on success the account is left with no factors, so the legitimate owner sees
   the change immediately and can re-enrol after a password reset.

## Admin-assisted unenrol

Endpoint: `admin-mfa-unenrol`. Requires `users_and_access.manage_permissions` **and**:

- the target's effective access level must be strictly lower than the actor's;
- only a `super_admin` may unenrol another `super_admin`;
- self-unenrol through this path is rejected;
- a reason of 20+ characters is mandatory.

It removes factors and recovery codes only — it never grants a role or permission, so it
cannot be used for privilege escalation. Every call writes an `admin_actions` row mirrored
to `audit_logs`, notifies the target, and alerts every super_admin.

## Break-glass: the last super_admin is locked out

1. Use a recovery code (`Use a recovery code` on the login step-up screen).
2. If the codes are gone, a second super_admin performs an admin-assisted unenrol.
3. If no second super_admin exists, recovery requires backend access to delete the
   `auth.mfa_factors` row for that account, followed by immediate re-enrolment, a fresh
   recovery batch, and a logged incident note.

> **BLOCKING DEPENDENCY — owner's decision, not a task in this batch.**
> The platform currently has exactly **one** super_admin (`admin@safedeal.test`). The
> owner's own account (`angeloakuhwa@gmail.com`) is a `support_agent`. Step 2 above is
> therefore unavailable today. Enforcement must not be enabled until a second super_admin
> exists and is enrolled. No account was created or elevated as part of this work.

## Enforcement pre-flight checklist

| # | Item | Status |
|---|---|---|
| 1 | Every `active` internal user has a verified TOTP factor | FAIL — 0 of 2 enrolled |
| 2 | At least two super_admin accounts, both enrolled | FAIL — 1 super_admin exists |
| 3 | Every enrolled internal user holds an unused recovery batch | FAIL — no batches issued yet |
| 4 | This runbook published and assisted unenrol exercised once | PARTIAL — published; drill not yet run |
| 5 | A real admin login reaches aal2 and one write endpoint succeeds | PENDING — requires item 1 |
| 6 | `security.two_factor_admin` advisory on, log-only warnings observed for a full working day | PENDING |

Flipping `security.two_factor_admin_enforced` to `true` makes `requireAdmin` return
`403 mfa_required` for any internal caller whose JWT `aal !== 'aal2'` — immediately, for
every admin edge function, including sessions already open at aal1. Do not flip it until
all six rows read PASS.

## Data model

| Object | Purpose |
|---|---|
| `public.mfa_recovery_codes` | Salted hashes only. Service-role access only. |
| `public.mfa_verification_attempts` | Attempt log for rate limiting and alerting. No codes. |
| `public.user_has_verified_mfa(uuid)` | Derived factor state for backend callers. |
| `public.internal_users_mfa_status()` | Real 2FA state for the internal directory. |
| `public.my_mfa_recovery_status()` | Own unused-code count, never the codes. |
| `internal_users.two_factor_enabled` | **Deprecated shadow flag.** Kept one release, then dropped. |

Supabase natively stores the factor, its secret, `status`, and the session AAL — none of
that is duplicated here.