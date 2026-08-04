# End-to-end 2FA (TOTP): enrolment, recovery, enforcement readiness

Enforcement stays OFF in this batch. Nothing here flips `security.two_factor_admin_enforced`.

## Current state (verified now)

- 2 active internal users: `admin@safedeal.test` (super_admin) and `angeloakuhwa@gmail.com` (support_agent). Both have **0 verified and 0 unverified** MFA factors.
- `internal_users.two_factor_enabled` exists and is `false` for both. Nothing writes it today, and it is displayed in `UserDetailsDrawer.tsx` — it is a shadow source of truth and will be derived, not stored (Item 4).
- `security.two_factor_admin` (advisory) and `security.two_factor_admin_enforced` (real switch, default OFF) are both in the client and server settings catalogs; `_shared/auth.ts` already reads them and runs the AAL2 gate in log-only mode.
- Permission keys available: `users_and_access.manage_permissions`, `users_and_access.suspend`, `permissions.manage_permissions`, `platform_configuration.configure`, `financial_controls.*`.

## Scope: I agree with the owner's split

Internal = required (behind the OFF flag); buyers/sellers = offered, always skippable. One addition, flagged rather than assumed: **no consumer route ever triggers a step-up**. The only place a buyer or seller can be asked for a TOTP code is login, and only if they chose to enrol. Checkout, cart, payment, dispute and profile actions never call step-up, which makes "buyer blocked mid-checkout" structurally impossible rather than merely unlikely.

---

## Item 1 — Supabase MFA wiring

New `src/services/mfa.service.ts` (the only file importing the Supabase client for MFA): `listFactors`, `startEnrolment`, `verifyEnrolment`, `challengeAndVerify`, `unenrol`, `getAal`.

(a) **Enrolment** — `mfa.enroll({ factorType: 'totp' })` → show QR plus the raw secret for manual entry → `mfa.challenge` + `mfa.verify` with the 6-digit code. A factor counts only at `status='verified'`.
Abandoned enrolment: on opening the dialog, `listFactors()` and unenrol every `unverified` TOTP factor before enrolling a new one; also unenrol the pending factor on cancel/unmount. At most one live unverified factor, no junk accumulation.

(b) **Login challenge** — native to Supabase: for a user with a verified factor, password sign-in yields aal1 with `nextLevel='aal2'`. `LoginForm.tsx` gains one extra step after `signIn` succeeds: if `currentLevel !== nextLevel`, render a code-entry step (reusing the code-entry styling from `PhoneVerificationModal.tsx`) that runs challenge+verify, then continues into the existing redirect logic. A "Use a recovery code" link switches input mode (Item 2).

(c) **AAL helper** — `src/hooks/useAal.ts` wrapping `getAuthenticatorAssuranceLevel()`, refreshed on `onAuthStateChange`, returning `{ currentLevel, nextLevel, needsStepUp, hasVerifiedFactor, loading }`. Read-only; no route blocks on it in this batch.

(d) **Server side** — `_shared/auth.ts` already parses `aal` from the JWT and already has the advisory/enforced branch. The only change: keep log-only behaviour and add AAL + factor status to the `admin-me` response so the admin console can show enrolment state and drive the persistent prompt. No new gate on any endpoint.

---

## Item 2 — Recovery path (the blocker item, designed before enforcement)

(a) **Recovery codes.** New table `public.mfa_recovery_codes(id, user_id → auth.users, salt, code_hash, used_at, created_at, batch_id)`. Hash: **salted SHA-256** — `encode(digest(salt || upper(code)), 'hex')`. Ten codes of 10 Crockford-base32 characters, generated **server-side in an edge function**, returned exactly once in the response body. Never logged, never persisted client-side, never left in a toast that survives navigation.
RLS: users can read only their own rows, and only non-secret columns via a view `public.my_mfa_recovery_status (id, used_at, created_at)`. No client insert/update/delete. Writes go through `SECURITY DEFINER` RPCs:
- `generate_mfa_recovery_codes(_user_id)` — invalidates the previous batch, inserts the new one.
- `consume_mfa_recovery_code(_user_id, _code)` — matches unused rows, sets `used_at`, returns boolean.
Consumption runs in edge function `mfa-recovery`, which on success unenrols the user's factors so they must re-enrol. A recovery code is a way back in, not a permanent second factor.

(b) **Admin-assisted unenrol.** Edge function `admin-mfa-unenrol`, gated by `requirePermission(req, 'users_and_access.manage_permissions')` plus server-side rules:
- The target's highest internal role must be **strictly lower** than the actor's (reuse `internal_effective_access_level`). A `support_agent` therefore cannot touch a `super_admin`; a `senior_admin` cannot strip a `super_admin`.
- Only a `super_admin` may unenrol another `super_admin`, and never themselves via this path.
- Reason ≥ 20 characters (matching the existing `ReviewChangesDrawer` convention), one `admin_actions` + `audit_logs` entry with before/after factor counts, and a `security_alert` notification to all super_admins.
No escalation is possible: it removes a factor, never grants a role, and the target still needs their password.

(c) **Break-glass (last super_admin locked out).** `docs/2fa-recovery-runbook.md`: (1) use a recovery code; (2) if codes are lost, a second super_admin performs the assisted unenrol; (3) if no second super_admin exists, recovery goes through the platform owner's backend access by removing the `auth.mfa_factors` row, followed by mandatory re-enrolment and a logged incident. **Therefore the enforcement pre-flight requires at least two super_admin accounts, each enrolled, each holding an unused recovery batch** — the single most important guard against total lockout.

---

## Item 3 — Prompting UX (reuse only, no layout changes)

(a) **After signup** — the existing `EmailVerificationPending` flow is untouched; the offer appears on the first authenticated landing as a dismissible `Card` banner, not inside signup.
(b) **After login** —
- Internal users without a verified factor: a persistent (non-dismissible but non-blocking) banner at the top of the admin content area, reusing the status-banner pattern already used by the payouts auto-release banner, linking to admin profile security. Navigation is never blocked.
- Buyers/sellers: a dismissible `Dialog` with a **30-day re-prompt interval**, dismissal stored per user in `localStorage` (`safedeal_2fa_prompt_dismissed_until`). The component checks the current path against a deny-list (cart, checkout, payment, transaction, dispute routes) and renders nothing there.
(c) **Permanent entry point** — the existing `SecuritySection.tsx` "Two-Factor Authentication" row (currently a dead row with a hardcoded "Disabled" badge) becomes live and opens `TwoFactorDialog`: status, enrol (QR + manual secret), remaining recovery-code count, regenerate codes, unenrol (requires a current TOTP code). The same component mounts on the admin profile security surface.
(d) **Reused**: `Dialog`, `Card`, `Badge`, `Button`, `Input`, `Label`, `Skeleton`, `sonner`, `useDrawerSafety`, `PhoneVerificationModal` code-entry styling. New files only: `src/components/security/TwoFactorDialog.tsx`, `TwoFactorPrompt.tsx`, `RecoveryCodesPanel.tsx`.

---

## Item 4 — Data model + migrations

Supabase already stores natively: the factor, its TOTP secret, `status` (`unverified`/`verified`), friendly name, timestamps, and AAL in the JWT. None of that is duplicated.

Migration (needs approval):
1. `create table public.mfa_recovery_codes(...)`, then `GRANT SELECT ON public.mfa_recovery_codes TO authenticated; GRANT ALL ON public.mfa_recovery_codes TO service_role;`, then enable RLS, then own-row select policy; secret columns hidden behind the `my_mfa_recovery_status` view.
2. `generate_mfa_recovery_codes` and `consume_mfa_recovery_code` as `SECURITY DEFINER ... SET search_path = public`.
3. `internal_users.two_factor_enabled` — **stop treating it as truth.** Comment it as deprecated and have the access-control read path derive the flag from `auth.mfa_factors` (verified count > 0) inside the admin edge function that builds the directory row. The column stays one release, then drops.

---

## Item 5 — Enforcement readiness (design only, DO NOT ENABLE)

Flipping `security.two_factor_admin_enforced` makes `requireAdmin` throw `AuthError(403, 'mfa_required')` for any internal caller whose JWT `aal !== 'aal2'` — i.e. every admin edge function, immediately, including existing sessions sitting at aal1. Those sessions are not force-refreshed; the user sees failures until they sign in again and complete the challenge. UI response: a global handler maps `mfa_required` on admin routes to a full-screen step-up prompt rather than a raw toast.

Pre-flight checklist — all must pass:
1. Every `active` internal user has a verified TOTP factor.
2. At least two `super_admin` accounts, both enrolled.
3. Every enrolled internal user holds an unused recovery-code batch.
4. `docs/2fa-recovery-runbook.md` published and assisted unenrol exercised once on a test account.
5. A real admin login reaches aal2 and one write endpoint succeeds.
6. `security.two_factor_admin` (advisory) turned on first; log-only warnings observed for a full working day with no unexpected identities.

---

## Item 6 — Tests

Enrolment happy path; wrong code rejected with the factor left unverified; abandoned-enrolment cleanup unenrols stale unverified factors; recovery code succeeds once and fails the second time; assisted unenrol authorised for super_admin over support_agent and **rejected** for support_agent over super_admin; `useAal` reports `needsStepUp` only when `currentLevel !== nextLevel`; guard test asserting `security.two_factor_admin_enforced` defaults to false in both catalogs and that no route guard blocks on AAL.

---

## Risks and rollback

| Risk | Mitigation |
|---|---|
| Only super_admin locked out | Two-super_admin pre-flight, recovery codes, documented break-glass; enforcement stays OFF this batch |
| Existing aal1 sessions break at flip | Named in pre-flight; flip in a low-traffic window; UI maps `mfa_required` to a re-login step-up |
| Buyer blocked mid-checkout | No consumer route calls step-up; prompt has a route deny-list; covered by test |
| Recovery codes leak | Server-generated, shown once, stored salted-SHA-256, never logged, no client persistence |
| An RLS policy or function assuming aal1 | Nothing reads `aal` today except `_shared/auth.ts`; aal2 is a superset of aal1, so a stronger session cannot break a policy — re-verified with a repo scan during implementation |

Rollback: the table, RPCs and components are all additive; reverting means deleting the new components and leaving the table unused. No existing behaviour changes.

## Approval split

- **Safe to apply**: mfa service, `useAal`, new components, tests, docs, `admin-me` returning factor status.
- **Needs approval**: the migration (new table, RPCs, deprecating `internal_users.two_factor_enabled`), the two new edge functions (`mfa-recovery`, `admin-mfa-unenrol`), and the `LoginForm` step-up step.
- **Explicitly out of scope**: enabling enforcement.