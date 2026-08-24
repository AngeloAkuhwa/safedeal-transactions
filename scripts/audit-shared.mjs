/**
 * What the render audit and the preview gallery both need to agree on.
 *
 * They used to be one script. Splitting the gallery out would have meant a
 * second copy of the route list and a second copy of the viewport table, and
 * this repository has already paid for that mistake twice: a duplicated seller
 * nav list quietly lost two whole sections, and a duplicated auth block
 * survived a clean auto-merge as a syntax error. A preview that renders a
 * different set of routes than the audit measures is the same defect, and it is
 * worse here because the gallery is the thing a human looks at and believes.
 *
 * So both import this.
 */

/**
 * The viewport classes, and what each one means for measurement.
 *
 * The audit used to run four phone widths under one hardcoded device profile:
 * `isMobile: true, hasTouch: true, deviceScaleFactor: 2`. That was right for
 * the widths it ran and wrong for every width it did not. Emulating a touch
 * device at 1920 is not a desktop check: `hover` and `pointer: fine` media
 * queries resolve the other way, the mobile viewport meta is honoured, and the
 * layout under test is not the layout a desktop user sees. Widening the list
 * without splitting the profile would have produced confident numbers about a
 * rendering nobody has.
 *
 * Two thresholds move with the class:
 *
 *   minTarget  44px where a finger is the pointer. Mouse and trackpad get
 *              WCAG 2.2 AA's 24px floor instead, because holding desktop to the
 *              touch figure reports every ordinary icon button as a defect and
 *              buries the real findings.
 *   prose      Only checked where lines can actually run too long. A paragraph
 *              is unbounded at 2560 and fine at 390, so running it on phones
 *              would be noise.
 *
 * `preview` is the width the gallery renders for that class. One per class,
 * because a human comparing four widths learns something and a human scrolling
 * eleven stops looking.
 *
 * Heights are those of a real device rather than one number reused: a phone is
 * not 1080 tall and a desktop is not 860.
 */
export const VIEWPORT_CLASSES = [
  { name: "mobile", widths: [320, 360, 390, 414], preview: 390, height: 860, touch: true, dpr: 2, minTarget: 44, prose: false },
  { name: "tablet", widths: [768, 834, 1024], preview: 834, height: 1024, touch: true, dpr: 2, minTarget: 44, prose: true },
  { name: "desktop", widths: [1280, 1440], preview: 1440, height: 900, touch: false, dpr: 1, minTarget: 24, prose: true },
  { name: "large", widths: [1920, 2560], preview: 1920, height: 1080, touch: false, dpr: 1, minTarget: 24, prose: true },
];

/**
 * An unlisted width still has to be measured as something. Fall to the nearest
 * class at or below it rather than defaulting to mobile, which would apply the
 * touch threshold to a desktop width.
 */
export const classForWidth = (w) =>
  VIEWPORT_CLASSES.find((c) => c.widths.includes(w)) ??
  [...VIEWPORT_CLASSES].reverse().find((c) => Math.min(...c.widths) <= w) ??
  VIEWPORT_CLASSES[0];

/** Playwright context options for a width, derived from its class. */
export const contextOptsFor = (width) => {
  const vp = classForWidth(width);
  return {
    viewport: { width, height: vp.height },
    deviceScaleFactor: vp.dpr,
    // `isMobile` enables the mobile viewport meta and the small-screen
    // behaviours that go with it. Tying it to the class keeps a desktop width
    // from being measured as a very wide phone.
    isMobile: vp.touch,
    hasTouch: vp.touch,
    ignoreHTTPSErrors: true,
  };
};

export const SEED_PRODUCT_ID =
  process.env.E2E_PRODUCT_ID || "0e2e0003-0000-4000-8000-000000000001";

export const PUBLIC_ROUTES = [
  { name: "landing", path: "/" },
  { name: "marketplace", path: "/marketplace" },
  { name: "pricing", path: "/pricing" },
  { name: "auth", path: "/auth" },
];

export const AUTH_ROUTES = {
  buyer: [
    "/dashboard",
    "/dashboard/marketplace",
    "/dashboard/cart",
    "/dashboard/saved",
    "/dashboard/transactions",
    // Checkout is where the money is agreed. Both entry points, audited.
    "/dashboard/cart/checkout",
    `/store/${process.env.E2E_STORE_SLUG || "claude-e2e-store"}/${process.env.E2E_PRODUCT_SLUG || "claude-e2e-test-listing-16in-pro-laptop"}/checkout?qty=1`,
  ],
  seller: [
    "/seller",
    "/seller/storefront",
    "/seller/storefront/new",
    `/seller/storefront/${SEED_PRODUCT_ID}`,
    `/seller/storefront/${SEED_PRODUCT_ID}/preview`,
    "/seller/transactions",
    "/seller/payouts",
  ],
  // One admin route was never going to be enough. The static touch-target
  // scanner cannot compute a width for 1,186 elements and silently counts each
  // as a pass, so the width axis is only ever really checked by rendering.
  // These are the admin surfaces that carry the controls it cannot see:
  // permission toggles, sortable table headers, and dense data tables.
  admin: [
    "/admin",
    "/admin/transactions",
    "/admin/disputes",
    "/admin/users",
    "/admin/payouts",
    "/admin/escrow",
    "/admin/flagged-users",
    "/admin/access-control",
    "/admin/permission-matrix",
    "/admin/settings",
    "/admin/audit-logs",
  ],
};

/**
 * A 5xx from the password grant is weather, not a verdict. During the
 * 2026-08-24 auth-layer flap, sign-ins succeeded and timed out seconds
 * apart, so a single attempt turned an entire audit run red while the
 * database underneath was healthy. Retry only when the failure says
 * "service", never when it says "credential" (400 stays terminal), and
 * log every attempt so a real outage still reads as one in the log.
 */
export async function signIn(page, base, email, password) {
  const ATTEMPTS = 3;
  const PAUSE_MS = 20000;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const { ok, retryable } = await signInOnce(page, base, email, password);
    if (ok) return true;
    if (!retryable || attempt === ATTEMPTS) return false;
    console.error(`signIn[${email}]: attempt ${attempt}/${ATTEMPTS} hit a service failure; retrying in ${PAUSE_MS / 1000}s`);
    await page.waitForTimeout(PAUSE_MS);
  }
  return false;
}

async function signInOnce(page, base, email, password) {
  // A sign-in that fails must say WHY. Without this, every failure looks the
  // same ("LOGIN FAILED") whether the password is wrong, the account is
  // unconfirmed, or the app is pointed at a Supabase project where the
  // account does not exist. Capture the token response itself: its status and
  // its error body are the only things that distinguish those three.
  let tokenStatus = null;
  let tokenBody = "";
  let tokenHost = "";
  const onResponse = async (res) => {
    if (!/\/auth\/v1\/token\b/.test(res.url())) return;
    tokenStatus = res.status();
    tokenHost = new URL(res.url()).host;
    if (tokenStatus >= 400) {
      try { tokenBody = (await res.text()).slice(0, 300); } catch { /* body already consumed */ }
    }
  };
  page.on("response", onResponse);
  // The interactive half can time out for service reasons too: during the
  // flap the auth page hung on its own session check and never rendered the
  // email input, so page.fill threw and killed the entire audit run from
  // inside attempt one. A timeout here is service-shaped, not a verdict
  // about the credential, so it reports as retryable instead of escaping.
  try {
    await page.goto(`${base}/auth?mode=login`, { waitUntil: "domcontentloaded", timeout: 35000 });
    await page.waitForTimeout(2000);
    if (/\/auth\b/.test(page.url())) {
      // A late token from a previous attempt can land the session and make
      // /auth redirect away, in which case there is no form to fill and the
      // sign-in already happened.
      await page.fill('input[type="email"]', email);
      await page.fill('input[type="password"]', password);
      await page.click('button[type="submit"]');
      await page.waitForTimeout(6000);
    }
  } catch (err) {
    page.off("response", onResponse);
    console.error(`signIn[${email}]: page interaction failed before the credential was judged (${err?.name ?? "Error"}: ${String(err?.message ?? err).split("\n")[0]})`);
    return { ok: false, retryable: true };
  }
  page.off("response", onResponse);
  const ok = !/\/auth\b/.test(page.url());
  if (!ok) {
    const why =
      tokenStatus === null
        ? "the browser never reached /auth/v1/token: the form did not submit, or Supabase is unreachable from this browser"
        : `POST /auth/v1/token -> ${tokenStatus} from ${tokenHost}${tokenBody ? ` :: ${tokenBody}` : ""}`;
    console.error(`signIn[${email}] failed: ${why}`);
    if (tokenStatus === 400) {
      console.error(
        `  400 on the password grant means ${tokenHost} rejected this credential.\n` +
          `  Check, in this order: (a) is ${tokenHost} the project that holds the seeded\n` +
          `  accounts, (b) does the password in E2E_<ROLE>_PASSWORD match the one set on the\n` +
          `  account, (c) is the account email-confirmed.`,
      );
    }
  }
  // "Never reached the token endpoint" is also service-shaped: the flap
  // manifests as both 504s and hung requests the form never gets past.
  const retryable = !ok && (tokenStatus === null || tokenStatus >= 500);
  return { ok, retryable };
}
