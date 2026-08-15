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
 * So this renders the app in Chromium at real phone widths and measures five
 * things per element:
 *
 *   1. box escaping the viewport (and its own parent)
 *   2. glyphs escaping their own box  <- the one static analysis cannot do
 *   3. computed font below 12px
 *   4. pointer target below 44px, including `before:`/`after:` hit expansion
 *   5. collapsed media
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

const AUTH_ROUTES = {
  buyer: ["/dashboard", "/dashboard/marketplace", "/dashboard/cart", "/dashboard/saved", "/dashboard/transactions"],
  seller: ["/seller", "/seller/storefront", "/seller/transactions", "/seller/payouts"],
  admin: ["/admin"],
};

/** Runs in the page. Keep it dependency-free and self-contained. */
function measure(VW) {
  const out = { docW: document.documentElement.scrollWidth, overflow: [], glyph: [], tiny: [], small: [], squashed: [] };
  const cls = (e) => (e.className || "").toString().slice(0, 60);
  const label = (e) => (e.getAttribute("aria-label") || e.textContent || "").trim().slice(0, 30);
  const visible = (e) => {
    const c = getComputedStyle(e);
    if (c.display === "none" || c.visibility === "hidden" || Number(c.opacity) === 0) return false;
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  for (const el of document.querySelectorAll("body *")) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    const c = getComputedStyle(el);

    if (r.right > VW + 0.5 && c.position !== "fixed") {
      const par = el.parentElement && el.parentElement.getBoundingClientRect();
      // A scroll-snap carousel is *meant* to extend past the viewport — that is
      // the whole mechanism. Flagging its slides is how a detector teaches
      // people to ignore it.
      const inCarousel = (() => {
        for (let p = el.parentElement; p; p = p.parentElement) {
          const pc = getComputedStyle(p);
          if (/(auto|scroll)/.test(pc.overflowX) && pc.scrollSnapType !== "none") return true;
          if (/(auto|scroll)/.test(pc.overflowX)) return true;
        }
        return false;
      })();
      // Decorative blurs are deliberately oversized and non-interactive.
      if (!inCarousel && par && r.right > par.right + 0.5 && !/blur-|pointer-events-none/.test(cls(el))) {
        out.overflow.push({ cls: cls(el), right: Math.round(r.right), text: label(el) });
      }
    }

    if (el.children.length === 0 && (el.textContent || "").trim()) {
      // `truncate` clips on purpose and `sr-only` is a 1px box by design.
      // Flagging either is how a detector earns its way into being ignored.
      const intentional = c.textOverflow === "ellipsis" || /\bsr-only\b/.test(cls(el)) || r.width <= 2;
      if (!intentional) {
        const range = document.createRange();
        range.selectNodeContents(el);
        const glyphW = range.getBoundingClientRect().width;
        if (glyphW > r.width + 1.5 && (c.overflow !== "visible" || el.closest('[class*="overflow-hidden"]'))) {
          out.glyph.push({ cls: cls(el), text: label(el), glyph: Math.round(glyphW), box: Math.round(r.width) });
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
      // A negative-inset pseudo-element expands the real pointer target without
      // changing the box, so measure it rather than calling a 32px button with
      // a 48px hit area a violation.
      let padX = 0;
      let padY = 0;
      for (const which of ["::before", "::after"]) {
        const ps = getComputedStyle(el, which);
        if (!ps || ps.content === "none") continue;
        const top = parseFloat(ps.top);
        const left = parseFloat(ps.left);
        if (ps.position === "absolute" && top < 0) padY = Math.max(padY, -top * 2);
        if (ps.position === "absolute" && left < 0) padX = Math.max(padX, -left * 2);
      }
      if (r.width + padX < 44 || r.height + padY < 44) {
        out.small.push({ text: label(el), w: Math.round(r.width + padX), h: Math.round(r.height + padY), cls: cls(el) });
      }
    }

    if (el.tagName === "IMG" && (r.width < 24 || r.height < 24)) {
      out.squashed.push({ src: (el.getAttribute("src") || "").slice(0, 48), w: Math.round(r.width), h: Math.round(r.height) });
    }
  }

  const dedupe = (a) => Array.from(new Map(a.map((x) => [JSON.stringify(x), x])).values()).slice(0, 10);
  return {
    ...out,
    overflow: dedupe(out.overflow),
    glyph: dedupe(out.glyph),
    tiny: dedupe(out.tiny),
    small: dedupe(out.small),
    squashed: dedupe(out.squashed),
  };
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
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--ignore-certificate-errors"],
  });
  const report = [];

  for (const width of WIDTHS) {
    const ctx = await browser.newContext({
      viewport: { width, height: 860 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message.slice(0, 140)));

    for (const route of PUBLIC_ROUTES) {
      await page.goto(BASE + route.path, { waitUntil: "domcontentloaded", timeout: 35000 }).catch((e) => errors.push(e.message.slice(0, 80)));
      await page.waitForTimeout(3000);
      const found = await page.evaluate(measure, width);
      await page.screenshot({ path: `${OUT}/${route.name}-${width}.png`, fullPage: true });
      report.push({ who: "public", route: route.path, width, errors: [...errors], ...found, horizScroll: found.docW > width + 1 });
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
        const ctx = await browser.newContext({ viewport: { width, height: 860 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
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
          const found = await page.evaluate(measure, width);
          await page.screenshot({ path: `${OUT}/${who}${path.replace(/\//g, "_")}-${width}.png`, fullPage: true });
          report.push({ who, route: path, width, ...found, horizScroll: found.docW > width + 1 });
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
    const flags = [];
    if (row.horizScroll) flags.push(`H-SCROLL(${row.docW})`);
    if (row.overflow.length) flags.push(`overflow:${row.overflow.length}`);
    if (row.glyph.length) flags.push(`glyph:${row.glyph.length}`);
    if (row.tiny.length) flags.push(`tiny:${row.tiny.length}`);
    if (row.small.length) flags.push(`tap<44:${row.small.length}`);
    if (row.squashed.length) flags.push(`squashed:${row.squashed.length}`);
    if (row.errors && row.errors.length) flags.push(`ERR:${row.errors.length}`);
    if (flags.length) failures += 1;
    console.log(`${row.who.padEnd(7)} ${String(row.width).padStart(4)} ${row.route.padEnd(26)} ${flags.length ? flags.join(" ") : "clean"}`);
  }
  console.log(`\nscreenshots: ${OUT}\nreport:      ${OUT}/report.json`);
  process.exit(failures ? 1 : 0);
}

main();
