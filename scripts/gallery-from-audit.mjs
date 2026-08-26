#!/usr/bin/env node
/**
 * Turn a downloaded `audit-out` directory into one readable page.
 *
 * CI photographs all 26 routes at seven widths on every run and now keeps them
 * (plan 7.6). That artifact is 182 loose PNGs, which is a directory listing
 * rather than something a person reviews: the pictures are available but not
 * legible. This assembles them into the same filmstrip `ui-preview.mjs`
 * produces, except from files rather than from a live render, so the
 * authenticated surface can be looked at by someone who does not hold the
 * credentials needed to produce it.
 *
 * It reads `report.json` rather than globbing the directory, and rebuilds each
 * filename with the audit's own rule. A gallery that globbed would show
 * whatever happened to be on disk; one that guessed at filenames would
 * silently omit whatever it guessed wrong, and a missing screen looks exactly
 * like a screen that was never captured. Driving from the report means a frame
 * the audit recorded but the directory lacks shows up as a labelled gap.
 *
 * Images are referenced by relative path, not embedded. Embedding ~69MB of PNG
 * as data URIs would produce a page too large to open comfortably and far past
 * what any sharing surface accepts. Leaving the file beside its images keeps it
 * instant and keeps the originals at full resolution, which is the point when
 * the question is "is that text actually clipped".
 *
 * Usage
 *   node scripts/gallery-from-audit.mjs ./audit-out
 *   node scripts/gallery-from-audit.mjs ./audit-out --out ./gallery.html
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith("--")) || "./audit-out";
const outArg = args.indexOf("--out");
const out = outArg === -1 ? path.join(dir, "gallery.html") : args[outArg + 1];

const reportPath = path.join(dir, "report.json");
if (!existsSync(reportPath)) {
  console.error(
    `No report.json in ${dir}.\n` +
      "Point this at an unzipped audit-screenshots artifact, or at the --out\n" +
      "directory of a local `node scripts/mobile-audit.mjs` run.",
  );
  process.exit(2);
}

const raw = JSON.parse(readFileSync(reportPath, "utf8"));
const rows = raw.rows || raw;

// The audit's naming rule, copied deliberately rather than imported: this
// script has to keep working against an artifact produced by an older revision
// of the audit, and an import would silently follow the current one.
const safeName = (p) => p.replace(/[/\\?:"<>|*\s]+/g, "_");
const PUBLIC_SLUG = {
  "/": "landing",
  "/marketplace": "marketplace",
  "/pricing": "pricing",
  "/auth": "auth",
};

function fileFor(row) {
  const base =
    row.who === "public"
      ? PUBLIC_SLUG[row.route] ?? safeName(row.route)
      : `${row.who}${safeName(row.route)}`;
  return `${base}-${row.width}.png`;
}

const FINDING_KEYS = ["overflow", "clipped", "glyph", "tiny", "small", "squashed", "prose"];

const screens = new Map();
let missing = 0;
for (const row of rows) {
  const key = `${row.who} ${row.route}`;
  if (!screens.has(key)) screens.set(key, { who: row.who, route: row.route, frames: [] });
  const file = fileFor(row);
  const present = existsSync(path.join(dir, file));
  if (!present) missing++;
  const findings = FINDING_KEYS.flatMap((k) =>
    (row.totals?.[k] ?? 0) > 0 ? [{ k, n: row.totals[k] }] : [],
  );
  screens.get(key).frames.push({
    width: row.width,
    file,
    present,
    findings,
    scroll: Boolean(row.horizScroll),
    errors: (row.errors || []).length,
  });
}
for (const s of screens.values()) s.frames.sort((a, b) => a.width - b.width);

const byRole = new Map();
for (const s of screens.values()) {
  if (!byRole.has(s.who)) byRole.set(s.who, []);
  byRole.get(s.who).push(s);
}
const ROLE_ORDER = ["public", "buyer", "seller", "admin"];
const rank = (r) => (ROLE_ORDER.indexOf(r) === -1 ? ROLE_ORDER.length : ROLE_ORDER.indexOf(r));
const roles = [...byRole.keys()].sort((a, b) => rank(a) - rank(b));

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const totalFrames = rows.length;
const flagged = rows.filter(
  (r) =>
    FINDING_KEYS.some((k) => (r.totals?.[k] ?? 0) > 0) ||
    r.horizScroll ||
    (r.errors || []).length,
).length;

const sections = roles
  .map((role) => {
    const cards = byRole
      .get(role)
      .map((s) => {
        const frames = s.frames
          .map((f) => {
            const badges = [
              ...f.findings.map((x) => `<span class="find">${x.n} ${esc(x.k)}</span>`),
              f.scroll ? '<span class="find bad">h-scroll</span>' : "",
              f.errors
                ? `<span class="find bad">${f.errors} error${f.errors > 1 ? "s" : ""}</span>`
                : "",
            ]
              .filter(Boolean)
              .join("");
            const img = f.present
              ? `<a href="./${esc(f.file)}" target="_blank" rel="noreferrer"><img loading="lazy" src="./${esc(f.file)}" alt="${esc(s.route)} at ${f.width} pixels"></a>`
              : `<div class="gone">not in this artifact<br><span class="mono">${esc(f.file)}</span></div>`;
            return `<figure class="frame${f.present ? "" : " absent"}">
          <figcaption><span class="w mono">${f.width}</span>${badges || '<span class="find ok">clean</span>'}</figcaption>
          ${img}
        </figure>`;
          })
          .join("");
        return `<article class="screen">
      <h3>${esc(s.route)}</h3>
      <div class="strip">${frames}</div>
    </article>`;
      })
      .join("");
    return `<section id="role-${esc(role)}">
    <h2>${esc(role)} <span class="count mono">${byRole.get(role).length} screens</span></h2>
    ${cards}
  </section>`;
  })
  .join("");

const html = `<title>SafeDeal Audit Gallery</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@600;700&family=Inter:wght@400;500&family=JetBrains+Mono:wght@400;500&display=swap">
<style>
  :root{--ground:#fafbfc;--panel:#fff;--sunk:#f1f4f8;--hair:#e2e8f0;--ink:#0f172a;
    --body:#475569;--muted:#64748b;--faint:#94a3b8;--accent:#0f56b3;
    --ok:#047857;--ok-wash:#d1fae5;--warn:#b45309;--warn-wash:#fef3c7;--bad:#b91c1c;--bad-wash:#fee2e2;}
  @media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
    --ground:#0a0f16;--panel:#111922;--sunk:#0d141d;--hair:#1e2a36;--ink:#f1f5f9;
    --body:#cbd5e1;--muted:#94a3b8;--faint:#64748b;--accent:#4d9aef;
    --ok:#34d399;--ok-wash:#06251f;--warn:#fbbf24;--warn-wash:#2a1f0a;--bad:#fca5a5;--bad-wash:#2b1214;}}
  :root[data-theme="dark"]{--ground:#0a0f16;--panel:#111922;--sunk:#0d141d;--hair:#1e2a36;--ink:#f1f5f9;
    --body:#cbd5e1;--muted:#94a3b8;--faint:#64748b;--accent:#4d9aef;
    --ok:#34d399;--ok-wash:#06251f;--warn:#fbbf24;--warn-wash:#2a1f0a;--bad:#fca5a5;--bad-wash:#2b1214;}
  *{box-sizing:border-box}
  body{margin:0;background:var(--ground);color:var(--body);
    font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:15px;line-height:1.55}
  .wrap{max-width:1400px;margin:0 auto;padding:44px 22px 80px}
  h1{font-family:Archivo,sans-serif;font-size:clamp(25px,4vw,34px);font-weight:700;color:var(--ink);
     margin:0;letter-spacing:-.02em}
  h2{font-family:Archivo,sans-serif;font-size:19px;font-weight:600;color:var(--ink);margin:0 0 14px;
     text-transform:capitalize;display:flex;align-items:baseline;gap:10px;
     position:sticky;top:0;background:var(--ground);padding:14px 0 10px;z-index:2;border-bottom:1px solid var(--hair)}
  h3{font-family:"JetBrains Mono",monospace;font-size:12.5px;font-weight:500;color:var(--accent);margin:0 0 9px}
  .count{font-size:11.5px;color:var(--faint);font-weight:400;text-transform:none}
  .mono{font-family:"JetBrains Mono",ui-monospace,monospace}
  header{display:flex;flex-direction:column;gap:13px;padding-bottom:24px;border-bottom:1px solid var(--hair)}
  .eyebrow{font-family:"JetBrains Mono",monospace;font-size:11px;letter-spacing:.13em;
    text-transform:uppercase;color:var(--faint);margin:0}
  p{margin:0;max-width:74ch}
  .nav{display:flex;gap:8px;flex-wrap:wrap;margin-top:4px}
  .nav a{font-family:"JetBrains Mono",monospace;font-size:11.5px;text-decoration:none;color:var(--accent);
    border:1px solid var(--hair);background:var(--panel);border-radius:999px;padding:5px 12px}
  .nav a:hover,.nav a:focus-visible{border-color:var(--accent);outline:none}
  section{margin-top:34px}
  .screen{margin:0 0 26px}
  .strip{display:flex;gap:12px;overflow-x:auto;padding-bottom:8px;align-items:flex-start}
  .frame{margin:0;background:var(--panel);border:1px solid var(--hair);border-radius:10px;overflow:hidden;
    flex:0 0 auto;width:230px}
  .frame.absent{opacity:.6}
  figcaption{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:8px 10px;
    border-bottom:1px solid var(--hair);background:var(--sunk)}
  .w{font-size:11.5px;font-weight:500;color:var(--ink)}
  .find{font-family:"JetBrains Mono",monospace;font-size:9.5px;padding:2px 6px;border-radius:999px;
    background:var(--warn-wash);color:var(--warn);white-space:nowrap}
  .find.ok{background:var(--ok-wash);color:var(--ok)}
  .find.bad{background:var(--bad-wash);color:var(--bad)}
  .frame img{display:block;width:100%;height:auto;background:var(--sunk)}
  .gone{padding:26px 12px;text-align:center;font-size:11.5px;color:var(--faint)}
  .gone .mono{font-size:9.5px;display:inline-block;margin-top:5px;word-break:break-all}
  footer{margin-top:44px;padding-top:20px;border-top:1px solid var(--hair);font-size:12.5px;color:var(--faint)}
</style>
<div class="wrap">
  <header>
    <p class="eyebrow">SafeDeal &middot; render audit gallery</p>
    <h1>${totalFrames} frames, ${screens.size} screens</h1>
    <p>
      Every route the audit photographs, at every width it photographs it. A width reads
      <b>clean</b> when the audit measured nothing wrong with it; anything else names what it
      found. Click a frame for the full resolution original, which is the one that answers
      whether something is actually clipped.
    </p>
    <nav class="nav">${roles.map((r) => `<a href="#role-${esc(r)}">${esc(r)}</a>`).join("")}</nav>
  </header>
  ${sections}
  <footer>
    <p>
      Built from <span class="mono">${esc(path.basename(dir))}/report.json</span>, which is the
      audit's own record, so a screen it captured cannot be silently dropped here.
      ${flagged} of ${totalFrames} frames carry at least one finding.
      ${missing ? `<b>${missing} frame${missing > 1 ? "s are" : " is"} named in the report but absent from this directory</b>, shown as gaps rather than skipped.` : "Every frame named in the report is present."}
    </p>
  </footer>
</div>`;

writeFileSync(out, html);
console.log(
  `${screens.size} screens, ${totalFrames} frames -> ${out}` +
    (missing ? `\n${missing} frame(s) named in report.json but absent from ${dir}` : ""),
);
