/**
 * The one place that knows how to talk to MetaMap.
 *
 * Two functions need this (the starter and the webhook) and rule 7 says that
 * is exactly when a second copy gets written and then drifts. Everything
 * provider-shaped lives here: config, the hosted URL, the OAuth exchange, the
 * resource fetch, signature verification, and the mapping from their three
 * verdicts to ours.
 *
 * Contract, taken from docs.metamap.com rather than guessed:
 *
 *   hosted flow   https://signup.getmati.com/?merchantToken=<client_id>
 *                 &flowId=<flow_id>&metadata=<json>
 *   oauth         POST https://api.prod.metamap.com/oauth
 *                 Basic base64(client_id:client_secret), grant_type=client_credentials
 *                 access_token expires after one hour
 *   webhook       header `x-signature`, HMAC-SHA256 hex over the payload body
 *   verdicts      verified | reviewNeeded | rejected
 *   updates       `verification_updated` repeats the completed shape; the new
 *                 verdict is in `identityStatus`, while `status` is immutable
 *                 and keeps the original
 */

const HOSTED_BASE = "https://signup.getmati.com/";
const OAUTH_URL = "https://api.prod.metamap.com/oauth";

export interface MetaMapConfig {
  clientId: string;
  clientSecret: string;
  flowId: string;
  webhookSecret: string;
}

/**
 * Read the four secrets, or say precisely which are missing.
 *
 * Returns a reason rather than throwing, and names every absent variable at
 * once. A function that fails on the first missing one sends whoever is
 * configuring this round the loop four times, and "misconfigured" without a
 * name is the kind of message that gets diagnosed by reading source.
 */
export function readConfig(): { config: MetaMapConfig } | { missing: string[] } {
  const keys = [
    "METAMAP_CLIENT_ID",
    "METAMAP_CLIENT_SECRET",
    "METAMAP_FLOW_ID",
    "METAMAP_WEBHOOK_SECRET",
  ] as const;
  const values = keys.map((k) => [k, (Deno.env.get(k) ?? "").trim()] as const);
  const missing = values.filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) return { missing };
  const get = (k: string) => values.find(([n]) => n === k)![1];
  return {
    config: {
      clientId: get("METAMAP_CLIENT_ID"),
      clientSecret: get("METAMAP_CLIENT_SECRET"),
      flowId: get("METAMAP_FLOW_ID"),
      webhookSecret: get("METAMAP_WEBHOOK_SECRET"),
    },
  };
}

/**
 * The hosted verification URL.
 *
 * `metadata` comes back on every webhook, which is how a delivery is tied to
 * the submission that started it. Only ids go in: MetaMap echoes this into
 * their dashboard and into every event, so a name or an email here would be
 * personal data scattered across a third party's logs for no gain.
 */
export function hostedFlowUrl(
  config: MetaMapConfig,
  metadata: { submission_id: string; user_id: string },
): string {
  const url = new URL(HOSTED_BASE);
  url.searchParams.set("merchantToken", config.clientId);
  url.searchParams.set("flowId", config.flowId);
  url.searchParams.set("metadata", JSON.stringify(metadata));
  return url.toString();
}

/**
 * Constant-time comparison.
 *
 * `a === b` on a hex digest leaks, through timing, how many leading characters
 * of a forged signature were right, which is enough to construct a valid one
 * given enough attempts. Deno has no `timingSafeEqual` for strings, so this is
 * the explicit version: always compare every byte.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Is this delivery really from MetaMap?
 *
 * `rawBody` must be the body exactly as it arrived. Re-serialising the parsed
 * object would change key order and whitespace, and the digest would never
 * match: the provider's own sample hashes `JSON.stringify(payload)` because in
 * their example the object IS the source, which does not transfer to a
 * receiver. Read the text, verify the text, then parse.
 */
export async function verifySignature(
  rawBody: string,
  signature: string | null,
  webhookSecret: string,
): Promise<boolean> {
  if (!signature) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(webhookSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const hex = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return timingSafeEqual(hex, signature.trim().toLowerCase());
}

/** An access token. Expires after an hour; each invocation gets its own, since
 *  an edge isolate does not live long enough for caching to pay. */
export async function accessToken(config: MetaMapConfig): Promise<string | null> {
  const basic = btoa(`${config.clientId}:${config.clientSecret}`);
  const res = await fetch(OAUTH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) return null;
  const body = await res.json().catch(() => null);
  const token = body?.access_token;
  return typeof token === "string" && token ? token : null;
}

/**
 * Fetch the full verification.
 *
 * `verification_completed` does not carry the verdict; it carries a `resource`
 * URL and the instruction to GET it. So the decision always comes from a
 * server-to-server read authenticated with our own credentials, never from the
 * webhook body. That is worth stating plainly: even a webhook whose signature
 * verified is not trusted to say whether someone passed.
 */
export async function fetchResource(
  resourceUrl: string,
  token: string,
): Promise<Record<string, unknown> | null> {
  // Only MetaMap's own hosts. `resource` arrives inside a signed payload, but
  // a URL from outside that we fetch with a bearer token is an SSRF primitive
  // if the signature check is ever weakened, and defence in depth here costs
  // one comparison.
  let host: string;
  try {
    host = new URL(resourceUrl).hostname;
  } catch {
    return null;
  }
  if (!/(^|\.)(getmati\.com|metamap\.com|mati\.io)$/.test(host)) return null;

  const res = await fetch(resourceUrl, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as Record<string, unknown> | null;
}

export type ProviderVerdict = "verified" | "reviewNeeded" | "rejected";

/**
 * MetaMap's verdict for this verification.
 *
 * `identityStatus` wins when present: on `verification_updated` the `status`
 * field is immutable and still shows the original, so reading `status` alone
 * would silently ignore a human at MetaMap overturning a decision.
 *
 * Anything unrecognised returns null, and every caller treats null as "send it
 * to a human". Guessing `verified` from a shape we do not recognise is the one
 * failure this whole file exists to prevent.
 */
export function verdictOf(resource: Record<string, unknown> | null): ProviderVerdict | null {
  if (!resource) return null;
  const candidate = resource.identityStatus ?? resource.status;
  if (candidate === "verified" || candidate === "reviewNeeded" || candidate === "rejected") {
    return candidate;
  }
  return null;
}

/** The document MetaMap read, when it read one. Recorded so the admin view can
 *  say "passport" rather than "a document". */
export function documentTypeOf(resource: Record<string, unknown> | null): string | null {
  const documents = resource?.documents;
  if (!Array.isArray(documents) || !documents.length) return null;
  const type = (documents[0] as { type?: unknown })?.type;
  return typeof type === "string" ? type : null;
}

/**
 * The reason a verification did not pass, in the person's language.
 *
 * MetaMap reports failures as step errors with a code and an internal message.
 * Those messages are written for an integrator ("Document is considered as
 * fraud attempt"), and showing them to the applicant is both alarming and, in
 * the fraud case, tells someone attempting fraud exactly what was detected.
 * So known codes get our own wording and unknown ones fall back to something
 * true and unspecific.
 */
export function rejectionReasonOf(resource: Record<string, unknown> | null): string {
  const steps = Array.isArray(resource?.steps) ? (resource!.steps as Record<string, unknown>[]) : [];
  const documents = Array.isArray(resource?.documents)
    ? (resource!.documents as Record<string, unknown>[])
    : [];
  const allSteps = [
    ...steps,
    ...documents.flatMap((d) => (Array.isArray(d.steps) ? (d.steps as Record<string, unknown>[]) : [])),
  ];

  const failed = allSteps.find((s) => s && typeof s === "object" && s.error);
  const code = String((failed?.error as { code?: unknown })?.code ?? "");

  if (/expired/i.test(code)) {
    return "The document you used has expired. Please try again with a current one.";
  }
  if (/facematch|selfie|liveness/i.test(code)) {
    return "The selfie did not match the photo on the document clearly enough. Please try again in good light.";
  }
  if (/quality|blur|glare|readable|reading/i.test(code)) {
    return "We could not read the document clearly. Please try again with a sharper, well-lit photo.";
  }
  if (/age/i.test(code)) {
    return "The date of birth on the document does not meet the minimum age for an account.";
  }
  if (/watchlist|aml|sanction/i.test(code)) {
    // Deliberately vague and routed to a human. A screening hit is not a
    // finding, and telling someone they matched a watchlist is both alarming
    // and often wrong.
    return "We need to review this manually. Our team will be in touch.";
  }
  return "We could not verify this document automatically. Our team will review it.";
}

/**
 * The slice of the resource worth keeping.
 *
 * Deliberately not the whole thing. The resource carries media URLs and full
 * extracted document fields, and storing all of it would turn our database
 * into a copy of everyone's passport for the sake of an audit trail that only
 * needs to answer "what did they check, and what did they say".
 */
export function auditSlice(resource: Record<string, unknown> | null): Record<string, unknown> {
  if (!resource) return {};
  const steps = Array.isArray(resource.steps) ? (resource.steps as Record<string, unknown>[]) : [];
  const documents = Array.isArray(resource.documents)
    ? (resource.documents as Record<string, unknown>[])
    : [];
  return {
    id: resource.id ?? null,
    status: resource.status ?? null,
    identityStatus: resource.identityStatus ?? null,
    flow: resource.flow ?? null,
    dashboard_url: resource.matiDashboardUrl ?? null,
    steps: steps.map((s) => ({
      id: s.id ?? null,
      status: s.status ?? null,
      error_code: (s.error as { code?: unknown })?.code ?? null,
    })),
    documents: documents.map((d) => ({
      type: d.type ?? null,
      country: d.country ?? null,
      steps: (Array.isArray(d.steps) ? (d.steps as Record<string, unknown>[]) : []).map((s) => ({
        id: s.id ?? null,
        status: s.status ?? null,
        error_code: (s.error as { code?: unknown })?.code ?? null,
      })),
    })),
  };
}
