#!/usr/bin/env node
/**
 * UI preview gallery.
 *
 * The render audit answers "is anything broken". This answers "what does it
 * look like", which is the question a person actually asks after a UI change,
 * and the one a pass/fail number cannot answer. It renders every route at one
 * width per viewport class and writes a single self-contained HTML page.
 *
 * It shares `audit-shared.mjs` with the audit rather than keeping its own route
 * list, because a gallery that previews a different set of screens than the
 * audit measures is worse than no gallery: it is the artefact a human looks at
 * and believes.
 *
 * One width per class, not all eleven. Four widths side by side is a comparison
 * someone reads; eleven is a contact sheet they scroll past. The audit still
 * measures all eleven, so nothing is being skipped, only summarised.
 *
 * JPEG at deviceScaleFactor 1, because this is a picture rather than evidence.
 * The audit's own screenshots stay PNG at the device's real DPR.
 *
 * Usage
 *   npx vite build && npx vite preview --host 127.0.0.1 --port 5199
 *   node scripts/ui-preview.mjs                     # public routes
 *   node scripts/ui-preview.mjs --auth              # + signed-in routes
 *   node scripts/ui-preview.mjs --roles seller      # just one role
 *   node scripts/ui-preview.mjs --out ./preview-out
 *
 * Signed-in routes need the same credentials the audit uses:
 *   E2E_BUYER_EMAIL / E2E_BUYER_PASSWORD, and the seller and admin pairs.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import {
  VIEWPORT_CLASSES,
  contextOptsFor,
  PUBLIC_ROUTES,
  AUTH_ROUTES,
  signIn,
} from "./audit-shared.mjs";

let chromium;
async function loadChromium() {
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
    "This preview needs Playwright.\n" +
      "  bun add -d playwright   (or: npm i -g playwright)\n" +
      "Browsers: set PLAYWRIGHT_BROWSERS_PATH if Chromium is already on the machine.",
  );
  process.exit(2);
}

async function resolveExecutable() {
  const { existsSync, readdirSync } = await import("node:fs");
  const explicit = process.env.PLAYWRIGHT_CHROMIUM_PATH;
  if (explicit && existsSync(explicit)) return explicit;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!root || !existsSync(root)) return undefined;
  const candidates = [];
  for (const dir of readdirSync(root)) {
    if (/^chromium-\d+$/.test(dir)) candidates.push(`${root}/${dir}/chrome-linux/chrome`);
  }
  return candidates.find((p) => existsSync(p));
}

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};
const BASE = arg("base", "http://127.0.0.1:5199");
const OUT = arg("out", "/tmp/ui-preview");
const WITH_AUTH = process.argv.includes("--auth");
const ROLES = String(arg("roles", "buyer,seller,admin")).split(",").map((s) => s.trim());
const QUALITY = Number(arg("quality", 62));
/** Tall pages make an unreadable gallery and a file nobody can open. */
const MAX_H = Number(arg("maxHeight", 2200));

const PROXY = (() => {
  if (process.env.AUDIT_NO_PROXY) return null;
  const server = process.env.AUDIT_PROXY || process.env.HTTPS_PROXY || process.env.https_proxy;
  return server ? { server, bypass: "127.0.0.1,localhost,::1" } : null;
})();

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

async function shoot(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 35000 });
  await page.waitForTimeout(2500);
  // Settle late-arriving layout the same way the audit does: fonts change
  // metrics, and a screenshot taken mid-transition shows a state no user sees.
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
  await page.waitForTimeout(600);
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  const clipH = Math.min(h, MAX_H);
  const buf = await page.screenshot({
    type: "jpeg",
    quality: QUALITY,
    clip: { x: 0, y: 0, width: page.viewportSize().width, height: clipH },
  });
  return { data: buf.toString("base64"), truncated: h > MAX_H, fullHeight: h };
}

function html(shots, meta) {
  const routes = [...new Set(shots.map((s) => s.key))];
  const classNames = VIEWPORT_CLASSES.map((c) => c.name);
  const widest = Math.max(...VIEWPORT_CLASSES.map((c) => c.preview));

  const cards = routes
    .map((key) => {
      const forRoute = shots.filter((s) => s.key === key);
      const first = forRoute[0];
      const frames = classNames
        .map((cn) => {
          const s = forRoute.find((x) => x.cls === cn);
          if (!s) return "";
          const vp = VIEWPORT_CLASSES.find((c) => c.name === cn);
          // Frame width tracks real viewport width. Four equal boxes would
          // hide the thing this page exists to show, which is how much room
          // each class actually has.
          const flexBasis = Math.round(120 + (vp.preview / widest) * 320);
          return `<figure class="frame" style="width:${flexBasis}px">
  <figcaption>
    <span class="cls">${esc(cn)}</span>
    <span class="w">${vp.preview}<abbr>px</abbr></span>
  </figcaption>
  <div class="shot"><img loading="lazy" alt="${esc(key)} at ${vp.preview}px" src="data:image/jpeg;base64,${s.data}"></div>
  ${s.truncated ? `<p class="clip">first ${MAX_H}px of ${s.fullHeight}</p>` : ""}
</figure>`;
        })
        .join("\n");
      return `<section class="route">
  <header class="route-head">
    <h2>${esc(first.label)}</h2>
    <code>${esc(first.path)}</code>
  </header>
  <div class="frames">${frames}</div>
</section>`;
    })
    .join("\n");

  const totalWidths = VIEWPORT_CLASSES.reduce((n, c) => n + c.widths.length, 0);

  return `<title>SafeDeal Viewport Filmstrip</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;650&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500&display=swap">
<style>
  :root{
    --ground:#f7f8fa; --surface:#ffffff; --sunk:#eef1f5;
    --line:#e3e7ed; --line-firm:#cfd6e0;
    --ink:#101317; --ink-2:#4a525e; --ink-3:#838c99;
    --accent:#0f5bb3;
    --display:"Archivo",ui-sans-serif,-apple-system,"Segoe UI",Roboto,sans-serif;
    --body:"IBM Plex Sans",ui-sans-serif,-apple-system,"Segoe UI",Roboto,sans-serif;
    --mono:"IBM Plex Mono",ui-monospace,SFMono-Regular,Menlo,monospace;
  }
  @media (prefers-color-scheme:dark){
    :root:not([data-theme="light"]){
      --ground:#0c0f14; --surface:#141922; --sunk:#10151d;
      --line:#232b36; --line-firm:#33404f;
      --ink:#edf1f6; --ink-2:#b3bdca; --ink-3:#78838f;
      --accent:#5aa2f0;
    }
  }
  :root[data-theme="dark"]{
    --ground:#0c0f14; --surface:#141922; --sunk:#10151d;
    --line:#232b36; --line-firm:#33404f;
    --ink:#edf1f6; --ink-2:#b3bdca; --ink-3:#78838f;
    --accent:#5aa2f0;
  }
  *{box-sizing:border-box}
  body{
    margin:0; background:var(--ground); color:var(--ink);
    font:16px/1.6 var(--body); -webkit-font-smoothing:antialiased;
    padding-bottom:96px;
  }
  .wrap{max-width:1240px;margin:0 auto;padding:0 24px}
  .masthead{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:16px;padding:56px 0 20px}
  h1{font:650 30px/1.1 var(--display);letter-spacing:-.02em;margin:0;text-wrap:balance}
  .meta{font:400 13px/1.5 var(--mono);color:var(--ink-3);text-align:right}
  .legend{display:flex;flex-wrap:wrap;gap:8px;padding:0 0 4px}
  .legend span{
    font:500 11px/1 var(--mono);letter-spacing:.06em;text-transform:uppercase;
    color:var(--ink-2);background:var(--sunk);border:1px solid var(--line);
    border-radius:999px;padding:7px 11px;
  }
  .route{margin-top:36px;padding-top:22px;border-top:1px solid var(--line)}
  .route-head{display:flex;flex-wrap:wrap;align-items:baseline;gap:12px;margin-bottom:14px}
  h2{font:650 19px/1.2 var(--display);letter-spacing:-.01em;margin:0}
  .route-head code{font:400 12.5px/1 var(--mono);color:var(--ink-3);background:var(--sunk);border:1px solid var(--line);border-radius:6px;padding:5px 8px}
  .frames{display:flex;gap:18px;align-items:flex-start;overflow-x:auto;padding-bottom:10px}
  .frame{flex:0 0 auto;margin:0}
  figcaption{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-bottom:7px}
  .cls{font:500 10.5px/1 var(--mono);letter-spacing:.09em;text-transform:uppercase;color:var(--accent)}
  .w{font:500 12px/1 var(--mono);color:var(--ink-3);font-variant-numeric:tabular-nums}
  .w abbr{text-decoration:none;opacity:.6}
  .shot{
    border:1px solid var(--line-firm);border-radius:12px;overflow:hidden;
    background:var(--surface);max-height:560px;overflow-y:auto;
    box-shadow:0 1px 2px rgb(16 19 23 / .06), 0 8px 24px -12px rgb(16 19 23 / .18);
  }
  .shot img{display:block;width:100%;height:auto}
  .clip{margin:6px 0 0;font:400 11px/1.4 var(--mono);color:var(--ink-3)}
  .foot{margin-top:46px;padding-top:18px;border-top:1px solid var(--line);color:var(--ink-2);font-size:14px;max-width:68ch}
  .foot b{color:var(--ink);font-weight:500}
  a{color:var(--accent)}
  :focus-visible{outline:2px solid var(--accent);outline-offset:2px}
  @media (max-width:640px){
    .wrap{padding:0 16px}
    h1{font-size:24px}
    .masthead{padding-top:36px}
    .meta{text-align:left}
  }
</style>
<div class="wrap">
<header class="masthead">
  <div>
    <h1>SafeDeal Viewport Filmstrip</h1>
    <div class="legend">${classNames
      .map((n) => `<span>${n} ${VIEWPORT_CLASSES.find((c) => c.name === n).preview}px</span>`)
      .join("")}</div>
  </div>
  <div class="meta">${esc(meta.count)} screens<br>${esc(meta.when)}</div>
</header>
${cards}
<div class="foot">
  <p>Each frame is drawn at a width proportional to the viewport it was captured at, so the strip shows how much room a screen actually has at each class rather than four boxes of equal size.</p>
  <p><b>This page is for looking, not for passing.</b> The render audit is the gate: it measures all ${totalWidths} widths for viewport overflow, clipped content, glyphs escaping their box, undersized pointer targets and long lines, and it fails the build. A screen can look right here and still be flagged there.</p>
  ${meta.note ? `<p>${esc(meta.note)}</p>` : ""}
</div>
</div>`;
}

async function main() {
  chromium = await loadChromium();
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    executablePath: await resolveExecutable(),
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--ignore-certificate-errors",
      ...(PROXY ? ["--ssl-version-max=tls1.2"] : [])],
    ...(PROXY ? { proxy: PROXY } : {}),
  });

  const shots = [];
  const skipped = [];

  for (const vp of VIEWPORT_CLASSES) {
    const ctx = await browser.newContext(contextOptsFor(vp.preview));
    const page = await ctx.newPage();

    for (const r of PUBLIC_ROUTES) {
      try {
        shots.push({ key: `public${r.path}`, label: r.name, path: r.path, cls: vp.name, ...(await shoot(page, BASE + r.path)) });
      } catch (e) {
        skipped.push(`public ${r.path} at ${vp.preview}: ${e.message.slice(0, 70)}`);
      }
    }
    await ctx.close();
  }

  if (WITH_AUTH) {
    for (const [who, routes] of Object.entries(AUTH_ROUTES)) {
      if (!ROLES.includes(who)) continue;
      const email = process.env[`E2E_${who.toUpperCase()}_EMAIL`];
      const password = process.env[`E2E_${who.toUpperCase()}_PASSWORD`];
      if (!email || !password) {
        // Say it rather than quietly producing a gallery that looks complete.
        skipped.push(`${who}: no E2E_${who.toUpperCase()}_EMAIL/PASSWORD, ${routes.length} routes not previewed`);
        continue;
      }
      for (const vp of VIEWPORT_CLASSES) {
        const ctx = await browser.newContext(contextOptsFor(vp.preview));
        const page = await ctx.newPage();
        if (!(await signIn(page, BASE, email, password))) {
          skipped.push(`${who} at ${vp.preview}: sign-in failed`);
          await ctx.close();
          continue;
        }
        for (const path of routes) {
          try {
            shots.push({ key: `${who}${path}`, label: `${who} ${path}`, path, cls: vp.name, ...(await shoot(page, BASE + path)) });
          } catch (e) {
            skipped.push(`${who} ${path} at ${vp.preview}: ${e.message.slice(0, 70)}`);
          }
        }
        await ctx.close();
      }
    }
  }

  await browser.close();

  const file = `${OUT}/ui-preview.html`;
  const note = skipped.length ? `Not previewed: ${skipped.join("; ")}.` : "";
  writeFileSync(
    file,
    html(shots, {
      count: new Set(shots.map((s) => s.key)).size,
      when: new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC",
      note,
    }),
  );

  const mb = (Buffer.byteLength(await import("node:fs").then((fs) => fs.readFileSync(file))) / 1048576).toFixed(1);
  console.log(`${new Set(shots.map((s) => s.key)).size} screens, ${shots.length} frames -> ${file} (${mb} MB)`);
  for (const s of skipped) console.log(`  not previewed: ${s}`);
}

main();
