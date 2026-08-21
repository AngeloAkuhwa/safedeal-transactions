// 2FA recovery-code endpoint.
//
// AAL NOTE (deliberate): this endpoint authenticates with `requireUser`, which
// accepts an aal1 session. That is required by design. A user who has lost
// their authenticator can never reach aal2, so gating recovery behind aal2
// would make it useless. The compensating controls against someone holding
// only a stolen password are:
//   1. they must still present a valid, unused 50-bit recovery code;
//   2. attempts are rate limited (5 failures / 15 min) and then locked;
//   3. every attempt, success or failure, alerts the account owner;
//   4. a successful recovery UNENROLS all factors, forcing re-enrolment.
// The submitted code is never logged.
import { requireUser, authErrorResponse } from "../_shared/auth.ts";
import { extractRequestMeta, logAdminAction } from "../_shared/audit.ts";
import { notifyUser } from "../_shared/notify.ts";
import {
  CODE_COUNT,
  CODE_ENTROPY_BITS,
  generateRecoveryCode,
  generateSalt,
  hashCode,
  hashesEqual,
  logMfaAttempt,
  normaliseCode,
  recentFailures,
  RECOVERY_MAX_FAILURES,
  RECOVERY_WINDOW_MINUTES,
} from "../_shared/mfa.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let ctx;
  try {
    ctx = await requireUser(req);
  } catch (err) {
    const resp = authErrorResponse(err, corsHeaders);
    if (resp) return resp;
    throw err;
  }

  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const admin = ctx.adminClient;
  const { ip, userAgent } = extractRequestMeta(req);

  let body: { action?: string; code?: string; success?: boolean };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid_body" });
  }
  const action = body.action;

  // ---------------------------------------------------------------- status
  if (action === "status") {
    const { data: factorData } = await admin.auth.admin.mfa.listFactors({ userId: ctx.userId });
    const factors = (factorData?.factors ?? []) as Array<{ id: string; status: string; factor_type: string }>;
    const { data: codes } = await admin
      .from("mfa_recovery_codes")
      .select("id, used_at, created_at")
      .eq("user_id", ctx.userId);
    const rows = (codes ?? []) as Array<{ used_at: string | null; created_at: string }>;
    return json(200, {
      has_verified_factor: factors.some((f) => f.status === "verified"),
      unverified_factor_count: factors.filter((f) => f.status !== "verified").length,
      recovery_codes_total: rows.length,
      recovery_codes_unused: rows.filter((r) => r.used_at === null).length,
      recovery_codes_generated_at:
        rows.length ? rows.map((r) => r.created_at).sort().at(-1) : null,
    });
  }

  // -------------------------------------------------------------- generate
  if (action === "generate") {
    const { data: factorData } = await admin.auth.admin.mfa.listFactors({ userId: ctx.userId });
    const verified = ((factorData?.factors ?? []) as Array<{ status: string }>)
      .some((f) => f.status === "verified");
    if (!verified) return json(400, { error: "no_verified_factor" });

    // Invalidate the previous batch entirely.
    await admin.from("mfa_recovery_codes").delete().eq("user_id", ctx.userId);

    const batchId = crypto.randomUUID();
    const codes: string[] = [];
    const rows: Array<Record<string, unknown>> = [];
    for (let i = 0; i < CODE_COUNT; i++) {
      const code = generateRecoveryCode();
      const salt = generateSalt();
      codes.push(code);
      rows.push({
        user_id: ctx.userId,
        batch_id: batchId,
        salt,
        code_hash: await hashCode(salt, code),
      });
    }
    const { error } = await admin.from("mfa_recovery_codes").insert(rows);
    if (error) return json(500, { error: "generate_failed" });

    await notifyUser(admin, {
      user_id: ctx.userId,
      type: "security_alert",
      title: "New 2FA recovery codes generated",
      message:
        "A new set of two-factor recovery codes was generated for your account. Any previous codes no longer work. If this was not you, change your password immediately.",
      metadata: { event: "mfa_recovery_codes_generated", ip },
    });

    // Codes are returned exactly once, here, and never persisted in plaintext.
    return json(200, { codes, entropy_bits_per_code: CODE_ENTROPY_BITS, count: codes.length });
  }

  // ------------------------------------------------- TOTP attempt telemetry
  if (action === "log_totp_attempt") {
    const success = body.success === true;
    await logMfaAttempt(admin, ctx.userId, "totp", success, ip);
    if (!success) {
      const failures = await recentFailures(admin, ctx.userId, "totp", 60);
      if (failures === RECOVERY_MAX_FAILURES * 2) {
        await notifyUser(admin, {
          user_id: ctx.userId,
          type: "security_alert",
          title: "Repeated failed 2FA codes",
          message:
            "Several incorrect authenticator codes were entered on your account in the last hour. If this was not you, change your password.",
          metadata: { event: "mfa_totp_failures", failures, ip },
        });
      }
    }
    return json(200, { logged: true });
  }

  // --------------------------------------------------------------- consume
  if (action === "consume") {
    const submitted = normaliseCode(String(body.code ?? ""));
    if (submitted.length < 8) {
      await logMfaAttempt(admin, ctx.userId, "recovery_code", false, ip);
      return json(400, { error: "invalid_code" });
    }

    const failures = await recentFailures(admin, ctx.userId, "recovery_code");
    if (failures >= RECOVERY_MAX_FAILURES) {
      return json(429, {
        error: "rate_limited",
        reason: `Too many incorrect recovery codes. Try again in ${RECOVERY_WINDOW_MINUTES} minutes.`,
        retry_after_seconds: RECOVERY_WINDOW_MINUTES * 60,
      });
    }

    const { data: codeRows } = await admin
      .from("mfa_recovery_codes")
      .select("id, salt, code_hash")
      .eq("user_id", ctx.userId)
      .is("used_at", null);

    let matchId: string | null = null;
    for (const row of (codeRows ?? []) as Array<{ id: string; salt: string; code_hash: string }>) {
      const candidate = await hashCode(row.salt, submitted);
      if (hashesEqual(candidate, row.code_hash)) {
        matchId = row.id;
        break;
      }
    }

    if (!matchId) {
      await logMfaAttempt(admin, ctx.userId, "recovery_code", false, ip);
      const now = failures + 1;
      if (now >= RECOVERY_MAX_FAILURES) {
        await notifyUser(admin, {
          user_id: ctx.userId,
          type: "security_alert",
          title: "2FA recovery locked after repeated failures",
          message:
            `${now} incorrect recovery codes were entered on your account. Recovery is locked for ${RECOVERY_WINDOW_MINUTES} minutes. If this was not you, change your password immediately.`,
          metadata: { event: "mfa_recovery_locked", failures: now, ip },
        });
      }
      return json(401, { error: "invalid_code", attempts_remaining: Math.max(0, RECOVERY_MAX_FAILURES - now) });
    }

    // Single use: only consume a row that is still unused.
    const { data: consumed, error: consumeErr } = await admin
      .from("mfa_recovery_codes")
      .update({ used_at: new Date().toISOString() })
      .eq("id", matchId)
      .is("used_at", null)
      .select("id");
    if (consumeErr || !consumed?.length) {
      await logMfaAttempt(admin, ctx.userId, "recovery_code", false, ip);
      return json(401, { error: "invalid_code" });
    }

    // Forced re-enrolment: strip every factor so the code cannot double as a
    // permanent second factor.
    const { data: factorData } = await admin.auth.admin.mfa.listFactors({ userId: ctx.userId });
    for (const f of ((factorData?.factors ?? []) as Array<{ id: string }>)) {
      await admin.auth.admin.mfa.deleteFactor({ userId: ctx.userId, id: f.id });
    }
    await admin
      .from("internal_users")
      .update({ two_factor_enabled: false })
      .eq("id", ctx.userId);

    await logMfaAttempt(admin, ctx.userId, "recovery_code", true, ip);
    await notifyUser(admin, {
      user_id: ctx.userId,
      type: "security_alert",
      title: "2FA recovery code used",
      message:
        "A recovery code was used to sign in and your authenticator app was removed. Set up two-factor authentication again from your security settings. If this was not you, change your password immediately.",
      metadata: { event: "mfa_recovery_used", ip },
    });
    await logAdminAction(admin, {
      actorId: ctx.userId,
      action: "mfa_recovery_code_used",
      targetType: "user",
      targetId: ctx.userId,
      after: { factors_removed: (factorData?.factors ?? []).length },
      mirrorToAuditLogs: true,
      ip,
      userAgent,
    });

    return json(200, { ok: true, factors_removed: (factorData?.factors ?? []).length });
  }

  return json(400, { error: "unknown_action" });
});