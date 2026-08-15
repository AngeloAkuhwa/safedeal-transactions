#!/usr/bin/env node
/**
 * Mobile render audit.
 *
 * Static scanners verify each element in isolation. They cannot see two
 * elements competing for one line, and they cannot see text overflowing a box
 * that itself fits. Both of those shipped to `main` this week and were only
 * caught by rendering:
 *
 *   - the public header needed 358px of a 328px line and ran off-screen at
 *     320-390px, while every element in it passed the touch-target scanner;
 *   - a seven-figure price was clipped by `overflow-hidden` while a
 *     box-based overflow check reported success, because `min-w-0` had made
 *     the *box* fit while the glyphs still ran past it.
 *
 * So this renders the app in Chromium at real phone widths and measures six
 * things per element:
 *
 *   1. box escaping the viewport (and its own parent)
 *   2. content amputated by an ancestor's `overflow-hidden`  <- unreachable,
 *      and invisible to a scroll-width check because nothing scrolls
 *   3. glyphs escaping their own box  <- the one static analysis cannot do
 *   4. computed font below 12px
 *   5. pointer target below 44px, resolving `before:`/`after:` against their
 *      containing block so a stretched link is measured at its real size
 *   6. collapsed media
 *
 * Usage
 *   bun run dev -- --host 127.0.0.1 --port 5199
 *   node scripts/mobile-audit.mjs                       # public routes
 *   node scripts/mobile-audit.mjs --auth                # + signed-in routes
 *   node scripts/mobile-audit.mjs --widths 320,360      # narrower sweep
 *
 * Signed-in routes need test credentials in the environment:
 *   E2E_BUYER_EMAIL / E2E_BUYER_PASSWORD
 *   E2E_SELLER_EMAIL / E2E_SELLER_PASSWORD
 *   E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD
 *
 * They also need the Supabase host reachable from wherever this runs. In a
 * sandbox with an egress allowlist, `<project>.supabase.co` must be on it or
 * sign-in fails with "Host not in allowlist" and every signed-in route is
 * silently skipped rather than reported clean.
 */
import { mkdirSync, writeFileSync } from "node:fs";

// Playwright is not a project dependency — it is a local tool. Import it
// dynamically so a missing install produces an instruction rather than a
// MODULE_NOT_FOUND stack trace.
let chromium;
async function loadChromium() {
  // Playwright is a local tool, not a project dependency. Try the project
  // first, then a global install, and only then explain what to do — a
  // MODULE_NOT_FOUND stack trace is not an instruction.
  try {
    return (await import("playwright")).chromium;
  } catch { /* fall through */ }
  try {
    const { execSync } = await import("node:child_process");
    const root = execSync("npm root -g", { encoding: "utf8" }).trim();
    const mod = await import(`file://${root}/playwright/index.js`);
    return mod.chromium ?? mod.default?.chromium;
  } catch { /* fall through */ }
  console.error(
    "This audit needs Playwright.\n" +
      "  bun add -d playwright   (or: npm i -g playwright)\n" +
      "Browsers: set PLAYWRIGHT_BROWSERS_PATH if Chromium is already on the machine.",
  );
  process.exit(2);
}

/**
 * Playwright pins one Chromium build per release and refuses to start against
 * any other. A sandbox that ships its own Chromium therefore breaks the audit
 * on a version mismatch — "Executable doesn't exist at .../chromium-1234" when
 * .../chromium-1194 is sitting right there and works fine for measuring layout.
 * Re-downloading is not an option on an egress allowlist, so find what is
 * already installed instead. PLAYWRIGHT_CHROMIUM_PATH overrides.
 */
async function resolveExecutable() {
  const { existsSync, readdirSync } = await import("node:fs");
  const explicit = process.env.PLAYWRIGHT_CHROMIUM_PATH;
  if (explicit) {
    if (existsSync(explicit)) return explicit;
    console.error(`PLAYWRIGHT_CHROMIUM_PATH is set but missing: ${explicit}`);
    process.exit(2);
  }
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!root || !existsSync(root)) return undefined; // let Playwright use its own
  // Full Chromium before headless_shell: the shell cannot service every API the
  // measurement pass relies on, and the size difference is irrelevant here.
  const candidates = [];
  for (const dir of readdirSync(root)) {
    if (/^chromium-\d+$/.test(dir)) candidates.push(`${root}/${dir}/chrome-linux/chrome`);
  }
  for (const dir of readdirSync(root)) {
    if (/^chromium_headless_shell-\d+$/.test(dir)) candidates.push(`${root}/${dir}/chrome-linux/headless_shell`);
  }
  const found = candidates.find((p) => existsSync(p));
  if (found) console.log(`chromium: ${found}`);
  return found;
}

/**
 * Sandboxes route egress through a MITM proxy. curl and node read `HTTPS_PROXY`
 * from the environment; Chromium does not, so sign-in POSTs to Supabase hang
 * until they time out and every signed-in route reports LOGIN FAILED while the
 * same credentials work from the shell.
 *
 * Two things are needed, and the second is not obvious: the proxy has to be
 * passed explicitly, AND Chromium has to be capped at TLS 1.2. Its TLS 1.3
 * ClientHello is reset by the proxy after ~12s, which reads as a network
 * outage rather than a handshake rejection. This caps only the audit browser's
 * own connections — it says nothing about what the app negotiates in
 * production.
 */
function proxyConfig() {
  if (process.env.AUDIT_NO_PROXY) return null;
  const server = process.env.AUDIT_PROXY || process.env.HTTPS_PROXY || process.env.https_proxy;
  if (!server) return null;
  console.log(`proxy: ${server} (TLS capped at 1.2 for the audit browser)`);
  return { server, bypass: "127.0.0.1,localhost,::1" };
}
const PROXY = proxyConfig();

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};
const BASE = arg("base", "http://127.0.0.1:5199");
const WIDTHS = String(arg("widths", "320,360,390,414")).split(",").map(Number);
const OUT = arg("out", "/tmp/mobile-audit");
const WITH_AUTH = process.argv.includes("--auth");

const PUBLIC_ROUTES = [
  { name: "landing", path: "/" },
  { name: "marketplace", path: "/marketplace" },
  { name: "pricing", path: "/pricing" },
  { name: "auth", path: "/auth" },
];

// `/seller/storefront` lost 278px of content at every width while three
// sibling pages sharing its exact shell were never audited at all. A route
// list that covers one page of a shell and not the others is how the same
// defect gets fixed once and shipped three more times.
const SEED_PRODUCT_ID = process.env.E2E_PRODUCT_ID || "0e2e0003-0000-4000-8000-000000000001";

const AUTH_ROUTES = {
  buyer: ["/dashboard", "/dashboard/marketplace", "/dashboard/cart", "/dashboard/saved", "/dashboard/transactions"],
  seller: [
    "/seller",
    "/seller/storefront",
    "/seller/storefront/new",
    `/seller/storefront/${SEED_PRODUCT_ID}`,
    `/seller/storefront/${SEED_PRODUCT_ID}/preview`,
    "/seller/transactions",
    "/seller/payouts",
  ],
  admin: ["/admin"],
};

/** Runs in the page. Keep it dependency-free and self-contained. */
function measure({ VW, scope }) {
  const out = { docW: document.documentElement.scrollWidth, overflow: [], clipped: [], glyph: [], tiny: [], small: [], squashed: [] };
  const cls = (e) => (e.className || "").toString().slice(0, 60);
  const label = (e) => (e.getAttribute("aria-label") || e.textContent || "").trim().slice(0, 30);
  const visible = (e) => {
    const c = getComputedStyle(e);
    if (c.display === "none" || c.visibility === "hidden" || Number(c.opacity) === 0) return false;
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  const rootEl = scope ? document.querySelector(scope) : document.body;
  if (!rootEl) return { ...out, missingScope: scope };

  for (const el of rootEl.querySelectorAll("*")) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    const c = getComputedStyle(el);

    if (r.right > VW + 0.5 && c.position !== "fixed") {
      // What happens to an element that sticks out depends entirely on what its
      // ancestors do about it, so find the first ancestor that does anything:
      //
      //   nothing         -> it really does escape the viewport      (overflow)
      //   auto | scroll   -> reachable by scrolling; a carousel      (fine)
      //   hidden | clip   -> silently cut off and unreachable        (clipped)
      //
      // The previous version treated any scrollable ancestor as a carousel and
      // never looked at clipping ancestors at all, which meant a row of text
      // amputated by `overflow-hidden` was filed as a viewport overflow on the
      // pages where nothing clipped it and missed entirely on the pages where
      // something did.
      let clipper = null;
      let scrollable = false;
      for (let p = el.parentElement; p; p = p.parentElement) {
        const pc = getComputedStyle(p);
        if (/(auto|scroll)/.test(pc.overflowX)) { scrollable = true; break; }
        if (/(hidden|clip)/.test(pc.overflowX)) { clipper = p; break; }
      }

      if (!scrollable) {
        if (clipper) {
          // Cutting off a decorative shape is the point of `overflow-hidden`.
          // Cutting off words or controls is a defect. Tell them apart by what
          // the element actually carries, not by what it is named.
          const cr = clipper.getBoundingClientRect();
          const carriesText = !!(el.textContent || "").trim();
          const carriesControl = !!el.querySelector('a,button,input,select,textarea,[role="button"],[role="link"]') ||
            el.matches('a,button,input,select,textarea,[role="button"],[role="link"]');
          if (r.right > cr.right + 0.5 && (carriesText || carriesControl)) {
            out.clipped.push({
              cls: cls(el),
              text: label(el),
              right: Math.round(r.right),
              clippedAt: Math.round(cr.right),
              lost: Math.round(r.right - cr.right),
            });
          }
        } else {
          const par = el.parentElement && el.parentElement.getBoundingClientRect();
          if (par && r.right > par.right + 0.5 && !/blur-|pointer-events-none/.test(cls(el))) {
            out.overflow.push({ cls: cls(el), right: Math.round(r.right), text: label(el) });
          }
        }
      }
    }

    if (el.children.length === 0 && (el.textContent || "").trim()) {
      // `truncate` clips on purpose and `sr-only` is a 1px box by design.
      // Flagging either is how a detector earns its way into being ignored.
      // `line-clamp-N` is the author saying "cut this at N lines" just as
      // plainly as `truncate` says "cut this at one", and it clips through
      // `-webkit-line-clamp` rather than `text-overflow`, so a check that only
      // knows about ellipsis reports every clamped paragraph as a defect.
      const clamped = c.webkitLineClamp && c.webkitLineClamp !== "none";
      const intentional =
        c.textOverflow === "ellipsis" || clamped || /\bsr-only\b/.test(cls(el)) || r.width <= 2;
      if (!intentional) {
        const range = document.createRange();
        range.selectNodeContents(el);
        const gr = range.getBoundingClientRect();
        const glyphW = gr.width;
        if (glyphW > r.width + 1.5) {
          // Overflowing the box is only a defect if something actually cuts
          // the glyphs off. Asking `closest('[class*=overflow-hidden]')`
          // answers a different question — whether any ancestor anywhere up
          // the tree clips — and a paragraph two subpixels wider than its own
          // box inside a page-level `overflow-hidden` is not clipped by
          // anything. Find the real edge and compare against it.
          let edge = null;
          if (c.overflow !== "visible") {
            edge = r.right;
          } else {
            for (let p = el.parentElement; p; p = p.parentElement) {
              const pc = getComputedStyle(p);
              if (/(auto|scroll)/.test(pc.overflowX)) break; // scrollable: reachable
              if (/(hidden|clip)/.test(pc.overflowX)) { edge = p.getBoundingClientRect().right; break; }
            }
          }
          // Escaping the box hurts in two different ways, and only one of them
          // is clipping. `₦1,250,000.00` in a 78px box was never cut off — its
          // card is wider than the glyphs — it ran straight into the
          // add-to-cart button next to it. Reporting that as clipping sent the
          // last pass looking for an `overflow-hidden` that was not the
          // problem, so name the two separately.
          const clippedAt = edge !== null && gr.right > edge + 1 ? Math.round(gr.right - edge) : 0;

          let collidesWith = null;
          if (!clippedAt && el.parentElement) {
            for (const sib of el.parentElement.parentElement?.children || []) {
              if (sib === el || sib.contains(el) || el.contains(sib)) continue;
              const sr = sib.getBoundingClientRect();
              if (sr.width === 0 || sr.height === 0) continue;
              const overlapX = Math.min(gr.right, sr.right) - Math.max(gr.left, sr.left);
              const overlapY = Math.min(gr.bottom, sr.bottom) - Math.max(gr.top, sr.top);
              // The box itself must not already overlap — that would be a
              // deliberate stack, not glyphs spilling into a neighbour.
              const boxOverlapX = Math.min(r.right, sr.right) - Math.max(r.left, sr.left);
              if (overlapX > 1 && overlapY > 1 && boxOverlapX <= 1) {
                collidesWith = cls(sib) || sib.tagName;
                break;
              }
            }
          }

          if (clippedAt || collidesWith) {
            out.glyph.push({
              cls: cls(el),
              text: label(el),
              glyph: Math.round(glyphW),
              box: Math.round(r.width),
              ...(clippedAt ? { clippedBy: clippedAt } : { collidesWith }),
            });
          }
        }
      }
    }

    const fontPx = parseFloat(c.fontSize);
    if (fontPx && fontPx < 11.5 && el.children.length === 0 && (el.textContent || "").trim()) {
      out.tiny.push({ cls: cls(el), text: label(el), px: Math.round(fontPx * 10) / 10 });
    }

    if (el.matches('a,button,input,select,textarea,[role="button"],[role="link"]')) {
      if (c.position === "absolute" && c.clip !== "auto") continue;
      // WCAG 2.5.5 exempts a link inline in a sentence: it cannot be enlarged
      // without breaking the line it sits in. Detect it structurally — an
      // inline-display anchor whose parent holds text either side of it —
      // rather than by guessing from class names.
      if (el.tagName === "A" && c.display.startsWith("inline") && el.parentElement) {
        const parentText = (el.parentElement.textContent || "").trim();
        const ownText = (el.textContent || "").trim();
        if (parentText.length > ownText.length + 4) continue;
      }
      // An absolutely-positioned pseudo-element is the real pointer target, and
      // it is not always a small nudge outwards. `after:absolute after:inset-0`
      // — the "stretched link" idiom behind every clickable card — makes a
      // 141x35 title into a 171x353 target covering the whole card. Resolving
      // the pseudo against its containing block catches both that and the
      // negative-inset nudge; measuring the element's own box catches neither,
      // and reports the most common card pattern in the app as a violation.
      let hitW = r.width;
      let hitH = r.height;
      for (const which of ["::before", "::after"]) {
        const ps = getComputedStyle(el, which);
        // A decorative ring drawn with `pointer-events-none` enlarges nothing.
        if (!ps || ps.content === "none" || ps.position !== "absolute") continue;
        if (ps.pointerEvents === "none") continue;
        let cb = null;
        for (let a = el; a; a = a.parentElement) {
          if (getComputedStyle(a).position !== "static") { cb = a.getBoundingClientRect(); break; }
        }
        if (!cb) continue;
        // `top`/`left` measure inward from the containing block's near edge,
        // `bottom`/`right` inward from its far edge. `auto` means the pseudo
        // does not constrain that side, so fall back to the element's own.
        const pr = {
          top: ps.top === "auto" ? r.top : cb.top + parseFloat(ps.top),
          left: ps.left === "auto" ? r.left : cb.left + parseFloat(ps.left),
          bottom: ps.bottom === "auto" ? r.bottom : cb.bottom - parseFloat(ps.bottom),
          right: ps.right === "auto" ? r.right : cb.right - parseFloat(ps.right),
        };
        hitW = Math.max(hitW, pr.right - pr.left);
        hitH = Math.max(hitH, pr.bottom - pr.top);
      }
      if (hitW < 44 || hitH < 44) {
        out.small.push({ text: label(el), w: Math.round(hitW), h: Math.round(hitH), cls: cls(el) });
      }
    }

    if (el.tagName === "IMG" && (r.width < 24 || r.height < 24)) {
      out.squashed.push({ src: (el.getAttribute("src") || "").slice(0, 48), w: Math.round(r.width), h: Math.round(r.height) });
    }
  }

  // Keeping 10 examples per category is fine; *saying* there were 10 when there
  // were 24 is not. A truncated list that reads as a complete one is how a page
  // gets called fixed while a dozen findings sit underneath the cut.
  const totals = {};
  const dedupe = (a, key) => {
    const uniq = Array.from(new Map(a.map((x) => [JSON.stringify(x), x])).values());
    totals[key] = uniq.length;
    return uniq.slice(0, 10);
  };
  return {
    ...out,
    overflow: dedupe(out.overflow, "overflow"),
    clipped: dedupe(out.clipped, "clipped"),
    glyph: dedupe(out.glyph, "glyph"),
    tiny: dedupe(out.tiny, "tiny"),
    small: dedupe(out.small, "small"),
    squashed: dedupe(out.squashed, "squashed"),
    totals,
  };
}

// One place for viewport + the proxy's self-signed MITM certificate, so the
// public sweep and the signed-in sweep can never drift apart.
const contextOpts = (width) => ({
  viewport: { width, height: 860 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  ignoreHTTPSErrors: true,
});

/**
 * A modal that opens by itself makes every measurement behind it a lie.
 *
 * The dashboard raises a "Turn on two-factor authentication" dialog on load,
 * and Radix marks the page inert while it is up — `document.body` gets
 * `pointer-events: none`, which every element behind the overlay inherits.
 * The touch-target pass then sees a stretched link whose overlay expands
 * nothing and reports the card title as a violation, and the wishlist button
 * whose `before:-inset-2` hit area is real reports as 32x32. Both are
 * artefacts of the page being dead, not defects.
 *
 * It is also intermittent — it appeared on three of five buyer routes and on
 * /admin at one width out of four — so it produces findings that cannot be
 * reproduced by looking at the page.
 *
 * So: measure the dialog on its own terms (its buttons are real and were
 * genuinely undersized), then dismiss it and measure the page underneath. If
 * it will not dismiss, say so loudly rather than returning numbers.
 */
async function blockingDialog(page) {
  return page.evaluate(() => {
    // Presence of a dialog node means nothing: the mobile nav Sheet stays
    // mounted while closed, so `querySelector('[role=dialog]')` matches on
    // every dashboard route whether or not anything is covering the page.
    // What matters is whether something is actually open and holding the page.
    const open = [...document.querySelectorAll('[role="dialog"],[role="alertdialog"]')].find((d) => {
      if (d.getAttribute("data-state") === "closed") return false;
      if (d.getAttribute("aria-hidden") === "true") return false;
      const cs = getComputedStyle(d);
      if (cs.display === "none" || cs.visibility === "hidden") return false;
      const r = d.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    const inert = getComputedStyle(document.body).pointerEvents === "none";
    if (!inert && !open) return null;
    return { inert, title: open ? (open.textContent || "").trim().slice(0, 60) : "(page inert, no visible dialog)" };
  });
}

async function dismissDialog(page) {
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(700);
  const still = await blockingDialog(page);
  if (!still) return true;
  // Escape is refused by alertdialogs that demand an explicit choice.
  const declined = await page.evaluate(() => {
    const dlg = document.querySelector('[role="dialog"],[role="alertdialog"]');
    if (!dlg) return false;
    const btn = [...dlg.querySelectorAll("button")].find((b) =>
      /not now|later|dismiss|close|skip|cancel/i.test((b.getAttribute("aria-label") || b.textContent || "")),
    );
    if (!btn) return false;
    btn.click();
    return true;
  });
  if (!declined) return false;
  await page.waitForTimeout(900);
  return !(await blockingDialog(page));
}

/**
 * Land on a route and hand back rows that are honest about what was on screen:
 * one for a self-opening dialog if there was one, and one for the page itself.
 */
async function measureRoute(page, width) {
  const rows = [];
  const blocker = await blockingDialog(page);
  if (blocker) {
    const dlg = await page.evaluate(measure, { VW: width, scope: '[role="dialog"],[role="alertdialog"]' });
    rows.push({ dialog: blocker.title, ...dlg, horizScroll: false });
    const cleared = await dismissDialog(page);
    if (!cleared) {
      rows.push({ inert: blocker.title });
      return rows;
    }
    await page.waitForTimeout(500);
  }
  const found = await page.evaluate(measure, { VW: width, scope: null });
  rows.push({ ...found, horizScroll: found.docW > width + 1 });
  return rows;
}

async function signIn(page, email, password) {
  await page.goto(`${BASE}/auth?mode=login`, { waitUntil: "domcontentloaded", timeout: 35000 });
  await page.waitForTimeout(2000);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(6000);
  return !/\/auth\b/.test(page.url());
}

async function main() {
  chromium = await loadChromium();
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    executablePath: await resolveExecutable(),
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--ignore-certificate-errors",
      ...(PROXY ? ["--ssl-version-max=tls1.2"] : []),
    ],
    ...(PROXY ? { proxy: PROXY } : {}),
  });
  const report = [];

  for (const width of WIDTHS) {
    const ctx = await browser.newContext({ ...contextOpts(width) });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message.slice(0, 140)));

    for (const route of PUBLIC_ROUTES) {
      await page.goto(BASE + route.path, { waitUntil: "domcontentloaded", timeout: 35000 }).catch((e) => errors.push(e.message.slice(0, 80)));
      await page.waitForTimeout(3000);
      for (const row of await measureRoute(page, width)) {
        report.push({ who: "public", route: route.path, width, errors: [...errors], ...row });
      }
      await page.screenshot({ path: `${OUT}/${route.name}-${width}.png`, fullPage: true });
      errors.length = 0;
    }
    await ctx.close();
  }

  if (WITH_AUTH) {
    for (const [who, routes] of Object.entries(AUTH_ROUTES)) {
      const email = process.env[`E2E_${who.toUpperCase()}_EMAIL`];
      const password = process.env[`E2E_${who.toUpperCase()}_PASSWORD`];
      if (!email || !password) {
        report.push({ who, route: "(all)", width: 0, skipped: `no E2E_${who.toUpperCase()}_EMAIL/PASSWORD in env` });
        continue;
      }
      for (const width of WIDTHS) {
        const ctx = await browser.newContext({ ...contextOpts(width) });
        const page = await ctx.newPage();
        const ok = await signIn(page, email, password);
        if (!ok) {
          // Loud, not silent: a failed sign-in must never read as "clean".
          report.push({ who, route: "(login)", width, loginFailed: true });
          await ctx.close();
          continue;
        }
        for (const path of routes) {
          await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 35000 }).catch(() => {});
          await page.waitForTimeout(3000);
          for (const row of await measureRoute(page, width)) {
            report.push({ who, route: path, width, ...row });
          }
          await page.screenshot({ path: `${OUT}/${who}${path.replace(/\//g, "_")}-${width}.png`, fullPage: true });
        }
        await ctx.close();
      }
    }
  }

  await browser.close();
  writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 1));

  let failures = 0;
  for (const row of report) {
    if (row.skipped) { console.log(`${row.who.padEnd(7)}  SKIPPED — ${row.skipped}`); failures += 1; continue; }
    if (row.loginFailed) { console.log(`${row.who.padEnd(7)} ${String(row.width).padStart(4)}  LOGIN FAILED`); failures += 1; continue; }
    if (row.inert) {
      // Never let an unmeasurable page fall through as clean.
      console.log(`${row.who.padEnd(7)} ${String(row.width).padStart(4)} ${row.route.padEnd(26)} UNMEASURABLE — a modal held the page inert: "${row.inert}"`);
      failures += 1;
      continue;
    }
    const flags = [];
    // Report the true count, and mark the ones whose examples were truncated.
    const n = (key) => {
      const total = (row.totals && row.totals[key]) ?? row[key].length;
      return total > row[key].length ? `${total} (${row[key].length} shown)` : `${total}`;
    };
    if (row.horizScroll) flags.push(`H-SCROLL(${row.docW})`);
    if (row.overflow.length) flags.push(`overflow:${n("overflow")}`);
    if (row.clipped.length) flags.push(`clipped:${n("clipped")}`);
    if (row.glyph.length) flags.push(`glyph:${n("glyph")}`);
    if (row.tiny.length) flags.push(`tiny:${n("tiny")}`);
    if (row.small.length) flags.push(`tap<44:${n("small")}`);
    if (row.squashed.length) flags.push(`squashed:${n("squashed")}`);
    if (row.errors && row.errors.length) flags.push(`ERR:${row.errors.length}`);
    if (flags.length) failures += 1;
    const where = row.dialog ? `${row.route}  [dialog: ${row.dialog.slice(0, 28)}]` : row.route;
    console.log(`${row.who.padEnd(7)} ${String(row.width).padStart(4)} ${where.padEnd(26)} ${flags.length ? flags.join(" ") : "clean"}`);
  }
  console.log(`\nscreenshots: ${OUT}\nreport:      ${OUT}/report.json`);
  process.exit(failures ? 1 : 0);
}

main();
