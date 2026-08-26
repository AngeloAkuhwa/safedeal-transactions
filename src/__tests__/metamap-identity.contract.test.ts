/**
 * The rules that keep an automated identity check from verifying the wrong person.
 *
 * This pipeline decides whether someone is identity-verified on a product that
 * holds other people's money in escrow. Every defect here is a fraud path, and
 * most of them look like ordinary code: a slightly wrong comparison, a status
 * read from the wrong field, a retry handled by doing the work twice.
 *
 * Five rules, each with the concrete way it gets broken:
 *
 *   1. **The signature is checked, in constant time, against the raw body.**
 *      Hashing a re-serialised object instead of the bytes that arrived is the
 *      classic version of this bug, and it fails open in the worst way: it
 *      still matches for payloads whose key order happens to survive the round
 *      trip, so it works in testing and lets forged bodies through in
 *      production. `a === b` on the digest is the other one, leaking through
 *      timing how much of a guess was right.
 *
 *   2. **A signed body is still not trusted to say what happened.** The verdict
 *      always comes from a server-to-server GET of the resource, with our own
 *      credentials. Reading `payload.status` would mean anyone who ever
 *      obtains the webhook secret can mint verified identities.
 *
 *   3. **Ambiguity goes to a human, never to verified.** An unreadable
 *      resource, a missing token, a status nobody recognises: all land in
 *      `pending_review`. The tempting shape is `status !== "rejected"` meaning
 *      pass, which verifies everything that is merely unclear.
 *
 *   4. **A retry cannot re-decide.** MetaMap retries. Without an idempotency
 *      key, a replayed `verification_completed` re-runs the decision and can
 *      silently undo a rejection an admin made in between.
 *
 *   5. **The verification level is computed, not written.** There is one rule
 *      for what level someone holds and it lives in `compute_verification_level`.
 *      A first draft of the webhook wrote a constant instead, which was both a
 *      level that does not exist and a second copy of the rule.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const readRaw = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

/** Comments are not code. These files are heavily commented precisely because
 *  the rules are subtle, and a scan that reads prose reports on itself. */
const read = (rel: string) =>
  readRaw(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

const SHARED = "supabase/functions/_shared/metamap.ts";
const WEBHOOK = "supabase/functions/metamap-webhook/index.ts";
const START = "supabase/functions/metamap-start/index.ts";
const MIGRATION = "supabase/migrations/20260826140000_metamap_identity.sql";

describe("the signature is verified properly", () => {
  const shared = read(SHARED);
  const webhook = read(WEBHOOK);

  it("hashes the raw body, not a re-serialisation of the parsed object", () => {
    expect(shared).toMatch(/verifySignature\(\s*\n?\s*rawBody: string/);
    // The give-away for the broken version.
    expect(shared).not.toMatch(/JSON\.stringify\([^)]*\)[\s\S]{0,80}crypto\.subtle\.sign/);
    const textAt = webhook.indexOf("await req.text()");
    const parseAt = webhook.indexOf("JSON.parse(rawBody)");
    const verifyAt = webhook.indexOf("verifySignature(");
    expect(textAt).toBeGreaterThan(-1);
    // Verify the bytes, then parse them. Not the other way round.
    expect(verifyAt).toBeGreaterThan(textAt);
    expect(parseAt).toBeGreaterThan(verifyAt);
  });

  it("compares in constant time", () => {
    expect(shared).toMatch(/function timingSafeEqual/);
    expect(shared).toMatch(/diff \|= a\.charCodeAt\(i\) \^ b\.charCodeAt\(i\)/);
    // A short-circuiting comparison of the digests would defeat the point.
    expect(shared).not.toMatch(/return hex === signature/);
  });

  it("treats a missing signature as a failure, not as an exemption", () => {
    expect(shared).toMatch(/if \(!signature\) return false/);
  });

  it("refuses an unsigned delivery with 401 and records the attempt", () => {
    expect(webhook).toMatch(/if \(!valid\)[\s\S]{0,600}?invalid_signature.{0,40}401/);
    // Recorded BEFORE the refusal returns: a forged delivery that is silently
    // dropped is indistinguishable from no delivery at all.
    const insertAt = webhook.indexOf('.from("metamap_webhook_events")');
    const refuseAt = webhook.indexOf("if (!valid)");
    expect(insertAt).toBeGreaterThan(-1);
    expect(insertAt).toBeLessThan(refuseAt);
  });

  it("measures the body before parsing it", () => {
    expect(webhook).toMatch(/rawBody\.length > MAX_BODY_BYTES/);
  });
});

describe("a signed body is still not trusted to report the outcome", () => {
  const webhook = read(WEBHOOK);
  const shared = read(SHARED);

  it("reads the verdict from a fetched resource, never from the payload", () => {
    expect(webhook).toMatch(/const resource = resourceUrl \? await fetchResource\(/);
    expect(webhook).toMatch(/const verdict = verdictOf\(resource\)/);
    // The failure mode: trusting the delivered body.
    expect(webhook).not.toMatch(/verdictOf\(payload\)/);
    expect(webhook).not.toMatch(/payload\.status/);
    expect(webhook).not.toMatch(/payload\.identityStatus/);
  });

  it("authenticates that fetch with our own credentials", () => {
    expect(shared).toMatch(/Authorization: `Bearer \$\{token\}`/);
    expect(shared).toMatch(/grant_type=client_credentials/);
  });

  it("only fetches MetaMap's own hosts", () => {
    // `resource` arrives inside a signed payload, but a URL we fetch carrying a
    // bearer token is an SSRF primitive the moment the signature check is
    // weakened.
    expect(shared).toMatch(/getmati\\\.com\|metamap\\\.com\|mati\\\.io/);
  });

  it("prefers identityStatus over status, because an update overrides", () => {
    // On `verification_updated` the `status` field is immutable and still
    // shows the original verdict. Reading it alone would ignore a human at
    // MetaMap overturning a decision.
    expect(shared).toMatch(/resource\.identityStatus \?\? resource\.status/);
  });
});

describe("ambiguity resolves to a human, never to verified", () => {
  const shared = read(SHARED);
  const webhook = read(WEBHOOK);

  it("returns null for any status it does not recognise", () => {
    expect(shared).toMatch(/candidate === "verified" \|\|\s*candidate === "reviewNeeded" \|\|\s*candidate === "rejected"/);
    expect(shared).toMatch(/return null;\s*\}/);
  });

  it("verifies only on an explicit verified verdict", () => {
    // Every write of status "verified" must be inside a `verdict === "verified"`
    // branch. The dangerous shape is a negative test (`!== "rejected"`), which
    // passes everything merely unclear.
    expect(webhook).toMatch(/if \(verdict === "verified"\)/);
    expect(webhook).not.toMatch(/verdict !== "rejected"/);
    expect(webhook).not.toMatch(/verdict \?\? "verified"/);

    const verifiedWrites = webhook.match(/status: "verified"/g) ?? [];
    expect(verifiedWrites.length).toBe(1);
    const at = webhook.indexOf('status: "verified"');
    const branchAt = webhook.indexOf('if (verdict === "verified")');
    expect(branchAt).toBeGreaterThan(-1);
    expect(at).toBeGreaterThan(branchAt);
  });

  it("falls through to pending_review when the token or resource is unusable", () => {
    expect(webhook).toMatch(/if \(!token\)[\s\S]{0,900}?deferred/);
    expect(webhook).toMatch(/status: "pending_review"/);
  });

  it("does not let an expired session become a rejection", () => {
    // Someone who opened the flow and wandered off has not failed anything.
    expect(webhook).toMatch(/if \(expired\)[\s\S]{0,500}?status: "more_info_needed"/);
  });
});

describe("a provider retry cannot re-decide", () => {
  const sql = read(MIGRATION);
  const webhook = read(WEBHOOK);

  it("has a uniqueness key on the delivery", () => {
    expect(sql).toMatch(/CREATE UNIQUE INDEX[\s\S]{0,200}metamap_webhook_events[\s\S]{0,200}\(verification_id, event_name, event_timestamp\)/);
  });

  it("treats the resulting unique violation as done, not as an error", () => {
    expect(webhook).toMatch(/recordError\.code === "23505"[\s\S]{0,120}duplicate/);
  });

  it("cross-checks the metadata owner against the submission", () => {
    // The metadata is signed, so this should always agree. If it ever does
    // not, something is wrong in a way that must not be resolved by picking
    // one of the two.
    expect(webhook).toMatch(/metadataUserId !== submission\.user_id/);
    expect(webhook).toMatch(/owner_mismatch/);
  });
});

describe("the verification level is computed, not invented", () => {
  const webhook = read(WEBHOOK);

  it("grants through the same RPC the human path uses", () => {
    expect(webhook).toMatch(/rpc\("compute_verification_level"/);
    expect(webhook).toMatch(/identity_verified: true/);
  });

  it("never writes a level from a literal", () => {
    // The real levels are unverified, basic_verified and trusted_buyer, and
    // which one someone holds is decided in one place.
    expect(webhook).not.toMatch(/verification_level: "/);
  });

  it("matches the manual path, so the two cannot drift apart", () => {
    const manual = read("supabase/functions/admin-review-identity/index.ts");
    for (const marker of ['identity_verified: true', 'rpc("compute_verification_level"']) {
      expect(manual, `the manual path no longer does: ${marker}`).toContain(marker);
      expect(webhook, `the automated path no longer does: ${marker}`).toContain(marker);
    }
  });
});

describe("configuration failures are loud", () => {
  const shared = read(SHARED);
  const start = read(START);
  const webhook = read(WEBHOOK);

  it("names every missing secret at once", () => {
    // Failing on the first one sends whoever is configuring this round the
    // loop four times.
    expect(shared).toMatch(/const missing = values\.filter/);
    for (const key of [
      "METAMAP_CLIENT_ID",
      "METAMAP_CLIENT_SECRET",
      "METAMAP_FLOW_ID",
      "METAMAP_WEBHOOK_SECRET",
    ]) {
      expect(shared).toContain(key);
    }
  });

  it("refuses rather than silently falling back to the manual queue", () => {
    // A silent fallback looks exactly like the feature not being offered, and
    // nobody would find out it had never been switched on.
    expect(start).toMatch(/provider_not_configured[\s\S]{0,60}503/);
    expect(webhook).toMatch(/provider_not_configured[\s\S]{0,60}503/);
  });

  it("never logs a secret", () => {
    // Scoped to reporting lines, not to any mention. `btoa(clientId:clientSecret)`
    // IS the OAuth call and has to interpolate the secret; a scan that banned
    // every interpolation would fail on the one place that must do it, which
    // is a guard that has to be silenced rather than obeyed.
    const lines = [shared, start, webhook].join("\n").split("\n");
    const reporting = lines.filter((l) =>
      /console\.|logEdgeError|message:|request_context:|reportError/.test(l),
    );
    expect(reporting.length, "no reporting lines found to check").toBeGreaterThan(5);
    for (const line of reporting) {
      expect(line, `a reporting line mentions a secret: ${line.trim()}`).not.toMatch(
        /clientSecret|webhookSecret|clientId/,
      );
    }
    // Whole-config dumps are the other way this happens by accident.
    const all = lines.join("\n");
    expect(all).not.toMatch(/JSON\.stringify\(cfg/);
    expect(all).not.toMatch(/JSON\.stringify\(config\b/);
  });
});

describe("the stored record stays proportionate", () => {
  const shared = read(SHARED);
  const sql = read(MIGRATION);

  it("keeps the provider's verdict separate from our decision", () => {
    // Collapsing them makes "why is this person verified" unanswerable six
    // months later, which an escrow product cannot afford.
    expect(sql).toContain("provider_status");
    expect(sql).toContain("auto_decided_at");
  });

  it("stores a slice of the resource, not the whole thing", () => {
    expect(shared).toMatch(/export function auditSlice/);
    // Media URLs and full extracted document fields would turn this database
    // into a copy of everyone's passport.
    expect(shared).not.toMatch(/provider_payload: resource/);
  });

  it("keeps the webhook table unreachable from a browser", () => {
    expect(sql).toMatch(/ALTER TABLE public\.metamap_webhook_events ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/REVOKE ALL ON public\.metamap_webhook_events FROM anon, authenticated/);
    expect(sql).not.toMatch(/CREATE POLICY[\s\S]*metamap_webhook_events/i);
  });

  it("does not send personal data to the provider as metadata", () => {
    // MetaMap echoes metadata into their dashboard and every webhook. Ids
    // only: a name or an email there is personal data scattered through a
    // third party's logs for no gain.
    const hosted = shared.match(/export function hostedFlowUrl[\s\S]*?\n\}/)?.[0] ?? "";
    expect(hosted).not.toMatch(/email|legal_name|full_name|phone/i);
  });
});

describe("the client cannot report its own result", () => {
  it("the start endpoint returns a URL and nothing decisive", () => {
    const service = read("src/services/identity.service.ts");
    expect(service).toMatch(/startMetaMapVerification/);
    // No client-side path that writes a status.
    expect(service).not.toMatch(/status: "verified"/);
  });

  it("the screen reads the outcome back from our own database", () => {
    const screen = read("src/components/verification/InstantIdentityCheck.tsx");
    expect(screen).toMatch(/getIdentityStatus\(\)/);
    expect(screen).not.toMatch(/submitIdentity|resubmitIdentity/);
  });

  it("a failed poll is not treated as a failed verification", () => {
    const screen = read("src/components/verification/InstantIdentityCheck.tsx");
    const catchBlock = screen.match(/catch \{[\s\S]*?\n {6}\}/)?.[0] ?? "";
    expect(catchBlock).not.toMatch(/toast\.error|setWatching\(false\)/);
  });
});
