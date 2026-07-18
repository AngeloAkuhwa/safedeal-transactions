# Answer first

The settings currently shown in your reference UI (Timeout Rules, Fee Configuration, Platform Settings, Security, Audit History) cover maybe **30%** of what this system actually needs to be configurable at the **platform / super-admin** level. Because SafeDeal is a multi-tenant escrow marketplace with money movement, disputes, KYC, delivery, notifications, and vendor onboarding, the admin needs a much broader control surface. The current UI is missing entire domains: Payments/Payouts, Escrow & Ledger, Disputes/SLA, KYC & Trust Tiers, Notifications/Resend, Marketplace Rules, Vendor Governance, Regional Rollout, Integrations, Feature Flags, Legal, and Observability.

Below is a copy-paste prompt for UX Pilot to rebuild the design with the complete set. It is UI-only — it does not touch vendor-scoped settings (those live on the seller side).

---

# Prompt to paste into UX Pilot

> **Redesign the "System Settings" screen for a multi-tenant escrow marketplace admin (SafeDeal).**
>
> Keep the existing dark, dense, card-based aesthetic from the reference screenshot (sticky top header, left sidebar nav, main content = grouped setting cards with inline inputs + Save-per-card, right rail for Audit History + "Danger Zone"). Match the current typography scale and card density — do not invent a new visual language.
>
> **Layout**
> - Sticky top bar: title "System Settings", environment pill (Production/Staging), "Search settings" input, "Save all changed" button, last-updated timestamp.
> - Left sidebar with grouped nav (see sections below). Sticky. Shows a small dot when a section has unsaved changes.
> - Main pane: one section at a time, rendered as stacked cards. Each card = one logical setting group with: title, one-line description, inputs, "Reason for change" textarea (required), Save button, and a "View history" link that opens a side drawer.
> - Right rail (collapsible): live Audit History feed + Danger Zone shortcuts.
> - Every editable value shows: current value, default value, who last changed it, when.
>
> **Sections to design (in this order in the sidebar)**
>
> 1. **General** — platform name, support email, support phone, default locale, default currency (NGN), default timezone (Africa/Lagos), business hours, maintenance-mode toggle with scheduled window.
> 2. **Timeout Rules** — seller fulfillment timeout (hrs), buyer verification/inspection window (hrs), auto-release after delivery (hrs), payment session expiry (min), cart reservation expiry (min), dispute response SLA (hrs), admin escalation SLA (hrs). Each row: number input + unit + active toggle.
> 3. **Fee Configuration** — tiered service fee table (tier bands + rate), platform fee floor (₦), total service fee cap (₦), Paystack local fee formula (read-only, sourced from provider), international fee formula (toggle + rate), refundability policy, currency rounding rule. Show a live "example calculation" preview card.
> 4. **Payments & Gateways** — active gateway (Paystack), test-mode toggle, webhook secret (masked, reveal), retry policy (attempts, backoff), payment methods enabled (card, transfer, USSD), min/max transaction amount, high-value review threshold.
> 5. **Escrow & Ledger** — auto-release enabled, hold-longer-for-high-risk toggle + threshold, ledger reconciliation cadence, variance alert threshold (₦ and %), unreconciled-entry SLA, freeze-on-variance toggle.
> 6. **Payouts** — payout schedule (instant / daily / weekly), payout cutoff time, min payout amount, payout provider, payout retry policy, payout hold on new sellers (days), payout hold on flagged sellers toggle, bank verification required toggle.
> 7. **KYC, Identity & Trust Tiers** — required documents per tier (Basic/Standard/Enhanced), NIN verification provider + retention window, selfie/liveness required toggle, per-tier transaction volume caps (daily/monthly), auto-upgrade rules, manual review queue SLA, data-minimization masking rules.
> 8. **Security** — session policy (single active session toggle, idle timeout, absolute timeout), 2FA required for admins, admin IP allowlist, password policy, OTP length + expiry + rate limit, brute-force lockout thresholds, secret rotation reminder cadence.
> 9. **Disputes & Resolution** — dispute response window, evidence upload limits (count, size, types), auto-refund threshold (₦), auto-release-to-seller conditions, escalation ladder (L1→L2→L3 SLAs), refund method preference, dispute reason taxonomy editor.
> 10. **Notifications & Delivery** — channels enabled (in-app, email, SMS, push), Resend from-address + from-name, SMS provider (placeholder), retry attempts + backoff, quiet hours, per-event channel matrix (event × channel toggle grid), broadcast throttle, user-preference override policy.
> 11. **Marketplace Rules** — categories editor (fixed 8), max media per listing, max price, min price, allowed delivery methods, listing visibility defaults, prohibited-items list, auto-moderation keywords, listing approval mode (auto/manual).
> 12. **Vendor Governance (multi-tenant controls)** — vendor onboarding mode (open / invite / approval), required vendor KYB documents, vendor tier definitions (Bronze/Silver/Gold), per-tier limits (# listings, GMV cap, payout speed), vendor suspension rules, storefront slug policy, custom-domain allowlist, allowed override keys (which settings vendors may override in `/seller/settings`) and hard ceilings for each.
> 13. **Regional Rollout** — serviceable regions (multi-select states), waitlist mode toggle for non-serviced regions, per-region delivery method availability, per-region fee overrides, launch schedule.
> 14. **Integrations & Connectors** — Paystack (status, last webhook), Resend (status, domain verified), Cloudinary (status, quota), analytics providers, AI gateway toggle, webhook subscriber list.
> 15. **Feature Flags** — table of flags with description, rollout % slider, audience targeting (all / buyers / sellers / verified / tier), kill-switch button, created-by, last-toggled.
> 16. **Legal & Compliance** — terms version, privacy version, dispute policy version, publish workflow (draft → live), consent record retention window, data export SLA, right-to-erasure workflow toggle, cookie-banner config.
> 17. **Observability** — error alert threshold, slow-query threshold, edge-function timeout, background-job retry policy, on-call email/phone rotation, incident status-page toggle.
> 18. **Audit History** — full-height table view: timestamp, admin, section, key, old→new, reason, IP. Filters: section, admin, date range. Export CSV. Never editable.
> 19. **Danger Zone** — freeze all payouts, freeze all new signups, freeze all new transactions, force logout all sessions, invalidate all API keys, wipe test data (staging only). Every action requires typed confirmation + reason + 2FA challenge.
>
> **Interaction & states to show in the mocks**
> - Card with unsaved changes → highlighted border + "Discard / Save" footer, sidebar dot.
> - Reason field empty → Save disabled with tooltip "Reason required for audit trail".
> - Save success → inline toast + audit rail updates in real time.
> - Setting with a platform ceiling that a vendor can override → show "Vendor-overridable ✓ (ceiling: X)" badge.
> - Read-only setting (provider-owned) → show a lock icon + "Managed by provider".
> - Danger-zone confirmation modal → typed phrase + reason + 2FA code.
>
> **Deliverables**
> - Desktop (1440) primary, plus a responsive collapse for tablet.
> - Empty state, filled state, unsaved state, success state, error state, and danger-confirmation modal for at least the Fee Configuration and Danger Zone sections.
> - Keep colors, spacing, and typography aligned with the current dark admin theme in the reference screenshot.

---

# Notes for you (not part of the prompt)

- Sections **12 (Vendor Governance)** and the "vendor-overridable + ceiling" badge are the two multi-tenant-specific additions — they are what make platform settings coexist with `/seller/settings` without vendors escaping platform limits.
- Sections **4, 5, 6, 7, 10, 14, 15, 16, 17, 19** are the big gaps vs. your current reference — all of them already have code paths in this project that today read from constants or env vars.
- Once UX Pilot returns the design, the implementation plan on our side stays the one we already agreed: `system_settings` (JSONB, scoped) + `timeout_rules` + `get_effective_setting(vendor_id, key)` RPC + audit to `admin_actions`.
