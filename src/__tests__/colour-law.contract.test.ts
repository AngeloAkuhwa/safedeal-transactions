/**
 * Raw colour may only ever decrease.
 *
 * `src/index.css` defines a complete HSL token set for both themes, and the
 * colour law says components route through it: `bg-background`,
 * `text-muted-foreground`, `border-border`, one accent, and success, warning
 * and destructive reserved for states that are genuinely complete or genuinely
 * wrong. A literal `bg-emerald-500` does not follow the theme, does not follow
 * a rebrand, and does not respond to dark mode unless someone remembered to
 * write the `dark:` variant too. Most did not.
 *
 * There are thousands of them, so this is a ratchet rather than a ban, in the
 * same shape as the lint baseline this repo already runs: parity is the gate,
 * and the number only goes down. A ban would have to be either dishonest or
 * red on the day it landed.
 *
 * Where they are matters more than the total, so the budget is per area:
 *
 *   admin      the back office. 94% of the problem, and the surface no buyer
 *              or seller ever sees, which is why it is not the first thing to
 *              fix despite being the biggest.
 *   customer   everything else: landing, marketplace, checkout, buyer and
 *              seller. This is the budget that should reach zero first, because
 *              these are the screens customers see. The three heaviest files
 *              (SellerAnalytics 67, SellerUpdateDelivery 62, TransactionSuccess
 *              51) are now at zero via `src/lib/tone.ts`; what is left is a long
 *              tail of ten-to-twenty per file.
 *   ui         the shadcn primitives.
 *
 * Splitting it this way stops a hundred admin fixes from paying for one new
 * raw colour on a checkout screen.
 *
 * Comments are stripped before counting. A file that explains which raw colour
 * it replaced would otherwise be charged for the explanation, and that is a
 * good way to teach people not to write the explanation.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");

const PALETTES =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const RAW_COLOUR = new RegExp(
  `\\b(?:bg|text|border|from|to|via|ring|fill|stroke)-(?:${PALETTES})-[0-9]{2,3}\\b` +
    `|\\b(?:bg|text|border)-(?:white|black)\\b`,
  "g",
);

/**
 * The other half, and the half that got past the first version of this file.
 *
 * A Tailwind class is not the only way to write a colour outside the system.
 * `SellerAnalytics` drew its fee series with `stroke="#f59e0b"`, a literal amber
 * passed straight to recharts, which the class regex above structurally cannot
 * see: there is no class there to match. It sat in the middle of a chart whose
 * every other value already read from `hsl(var(--...))`, so the file scored zero
 * on the utility count while still shipping a hard-coded hue that ignored the
 * theme in exactly the way this test exists to stop.
 *
 * Print stylesheets are the legitimate exception and the reason this is a
 * ratchet rather than a ban: `TransactionReceipt` sets `#fff` and `#111` inside
 * an `@media print` block, and a sheet of paper has no dark mode to follow.
 */
const RAW_HEX = /#[0-9a-fA-F]{3,8}\b/g;

const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    // .ts as well as .tsx. The original walk read .tsx only, and an audit
    // found what that missed: alertConfig.ts carried 43 raw palette
    // utilities (a complete hand-built amber accent and a sky accent) that
    // rendered on the customer-facing seller alert surfaces while every
    // colour gate reported green. A className is a className wherever the
    // string lives; the file extension was never the right scope.
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

/**
 * Files that live outside the admin path but whose every importer is under
 * components/admin or pages/Admin*. Verified by hand when each was added;
 * they count against the admin budget because that is the only surface that
 * renders them. Add a file here only after checking its importers the same
 * way.
 */
const ADMIN_SURFACE_TS = new Set([
  "src/services/permission-approval-rules.ts",
  "src/services/admin-access-control.service.ts",
]);

/**
 * The one admin colour DEFINITION site (plan 4.5): the module call sites
 * consume tones from by meaning. Its raw utilities are the vocabulary being
 * defined, not a screen speaking colour inline, so it is excluded from the
 * admin call-site budget the same way format.ts is allowed its Intl currency
 * literals. Excluding it is safe against gaming: any NEW raw colour on a
 * screen still lands in the budget, and this set is closed. A second entry
 * here needs the same argument this one carries.
 */
const ADMIN_COLOUR_DEFINITION_FILES = new Set([
  "src/components/admin/palette.ts",
]);

describe("the admin colour definition exemption cannot rot", () => {
  it("every exempted file exists and still defines colour", () => {
    for (const rel of ADMIN_COLOUR_DEFINITION_FILES) {
      const full = path.join(ROOT, rel);
      expect(fs.existsSync(full), `${rel} no longer exists; drop the exemption`).toBe(true);
      const hits = (stripComments(fs.readFileSync(full, "utf8")).match(RAW_COLOUR) ?? []).length;
      expect(hits, `${rel} defines no raw colour; drop the exemption`).toBeGreaterThan(0);
    }
  });
});

const isAdmin = (rel: string) =>
  rel.startsWith("src/components/admin/") ||
  /^src\/pages\/Admin/.test(rel) ||
  rel.startsWith("src/services/admin-") ||
  rel.startsWith("src/lib/admin-") ||
  ADMIN_SURFACE_TS.has(rel);
const isUi = (rel: string) => rel.startsWith("src/components/ui/");

/**
 * The counts on the day this landed. Lower them as areas are converted; never
 * raise them. A rise means a component was written outside the token system.
 *
 * Re-anchored once when the walk widened from .tsx to .ts as well: the same
 * code, seen through a wider lens, so the floor moved to what the wider lens
 * measures. admin absorbed the .ts helper files under components/admin plus
 * the two verified admin-surface services above. customer stayed at 12: the
 * only customer .ts offender the wider walk found (alertConfig.ts, 43 raw
 * utilities) was converted to the tone system in the same change rather than
 * budgeted for.
 */
/*
 * admin ratchet history under plan 4.5: 4278 to 4236 (batch 1, badges.tsx
 * shed its triads to the palette definition file, which is excluded above
 * as the vocabulary's one definition site); 4236 to 4137 (batch 2,
 * PayoutsTable's buttons, tone tiles, menus and table chrome now compose
 * from ADMIN_TONE / ADMIN_SOLID / ADMIN_GROUND with identical class sets);
 * 4137 to 4092 (batch 3, UsersTable chrome, tone glyphs and solid CTAs;
 * its softer /10-/20 badge maps stay verbatim because converting them to
 * the badge triad would move pixels, which a mechanical batch never does);
 * 4092 to 4045 (batch 4, FlaggedUsersTable chrome and tone glyphs; its
 * orange-300 accents stay verbatim, matching neither elevated nor warning);
 * 4045 to 4002 (batch 5, PayoutDetailDrawer text roles, surfaces and tone
 * accents); 4002 to 3971 (batch 6, EscrowRecordsTable chrome and glyphs);
 * 3971 to 3948 (batch 7, UsersMobileFeed text roles and panels; its solid
 * CTAs stay verbatim because they lack the hover pair ADMIN_SOLID carries,
 * so no palette entry is an identical set); 3948 to 3909 (batch 8,
 * AdminNotifications: the recurring interactive chip triad earned a
 * palette entry, and the queue's chips, warning solids, glyphs and dots
 * now compose from it); 3909 to 3824 (batch 9, AdminTransactionDetail:
 * its status maps, tone switch and pill fallbacks held the badge triads
 * as inline strings, and those plus the danger and warning panels, tone
 * glyphs and dot ternaries now read from the palette; the yellow triad,
 * /40 borders, /20 wash pills, 500/600 solids and timeline icon triads
 * match no palette entry and stay verbatim); 3824 to 3664 (batch 10,
 * AdminUserDetail: the largest single-file drop so far because the page
 * is mostly ground chrome, and every slate panel, border, raised surface
 * and text role plus the tone glyphs, badge-set pill buttons, activity
 * badge map, dot ternaries and danger/info solid CTAs were exact palette
 * sets; the /20 washes, yellow and orange solids, slate-950 shell and
 * hover shades match no entry and stay verbatim); 3664 to 3523 (batch 11,
 * AdminDisputeDetail slice 1: status and tone maps, panel-plus-text
 * triads, sidebar iconColor props, tab chrome and ground roles; the
 * yellow triads, /20 washes, 500-step dots and 600/500 hover solids
 * match no entry and wait for slice 2 or the convergence pass. A prop
 * lesson recorded: a quoted tone string can live in ANY prop, not just
 * className, so expression passes wrap prop values in braces); 3523 to
 * 3411 (batch 12: AdminDisputeDetail slice 2 finishes that file's exact
 * sets (badge-plus-border triads, the emerald solid, dots, body texts;
 * 202 non-matching raws remain for convergence), and a cross-file glyph
 * sweep converts every admin className whose only colour token is a
 * bare tone-400 text amid layout chrome, the one shape where a single
 * token IS the palette entry character for character); 3411 to 3291
 * (6.2 batch 2, after the yellow fold made dozens of amber compositions
 * exact warning sets: badge and chip triads in either member order,
 * panel-plus-text composites, and the guarded shorts text-amber-300 and
 * bg-amber-400 across 39 files. text-amber-400 stays raw on purpose:
 * warning.text is amber-300, so no entry is an identical set. A second
 * import lesson recorded: inserting after the last line starting with
 * "import " lands inside a MULTILINE import; the opener line is not the
 * import's end); 3291 to 3253 (6.2 batch 3, a deliberate step change:
 * 38 standalone caution texts and glyphs at amber-400 fold into
 * warning.text amber-300, one step brighter on the slate-900 ground,
 * so caution text reads at one intensity everywhere. Pill-internal
 * text beside /15 and /20 washes keeps its 400 inside its composite,
 * the RolePicker favourite star keeps its hover pair, and both wait
 * for the wash batch); 3253 to 3194 (6.2 batch 4, the orange mirror of
 * batch 2: the elevated badge and chip triads in either member order,
 * the panel pair, the chip hover, and the guarded shorts
 * text-orange-400 and bg-orange-400, across 17 files. One asymmetry
 * makes this NOT a copy of the amber pass and is the reason it was
 * written fresh: warning.text is amber-300, so a panel-plus-amber-300
 * composite was an exact set; elevated.text is orange-400, so a
 * panel-plus-orange-300 composite is NOT, and folding one here would
 * have been a silent visual change wearing a mechanical pass's
 * clothes. Those sites, and the eight standalone orange-300 texts,
 * stay raw for the fold batch); 3194 to 3186 (6.2 batch 5, the orange
 * fold, after D10 resolved the step question in favour of the palette
 * as written: seven standalone orange-300 texts conform DOWN to
 * elevated.text at orange-400, the opposite direction from batch 3's
 * amber fold, because in each case the call sites conform to the
 * palette rather than the palette to them. Three sites are held back
 * deliberately: AdminCaseTimeline and AdminDisputeDetail tint their
 * timeline headers emerald-300 / orange-300 / red-300 as a family, and
 * AdminTransactionDetail pairs a red-300 failure reason with an
 * orange-300 blocked reason. Folding one hue out of a multi-hue 300
 * family would break the set, so those converge as sets in the family
 * batch); 3186 to 3168 (6.2 batch 6, the multi-hue 300 families. Reading
 * them turned up a rule 7 defect rather than a colour one: TIMELINE_TONE
 * was defined TWICE, character for character, in AdminCaseTimeline and
 * AdminDisputeDetail, and each carried its own copy of the four-hue
 * header tint beside it. So the fix went into the palette, not into the
 * two call sites: ADMIN_TIMELINE now owns the dot and the header tint,
 * and both timelines consume it. The header tint converges from the 300
 * step to each tone's .text in the same motion, and AdminTransactionDetail's
 * red-300 / orange-300 payout pair conforms with it. Ten of the eighteen
 * shed are consolidation into the exempt definition file rather than
 * elimination, the same shape as batch 1's badges.tsx, and are called out
 * here so the number is not read as more than it is. The dots keep their
 * 500 step: no palette entry carries a 500 dot, and a consolidation is
 * not where one gets invented); 3168 to 3102 (6.2 batch 7, the solid
 * CTAs, mechanical: every occurrence of bg-X-600 hover:bg-X-700
 * text-white is character for character an ADMIN_SOLID entry, whether it
 * stands alone as a className or sits inside a longer one, so standalone
 * ones became the expression and embedded ones became a template with
 * the entry interpolated. ADMIN_SOLID gained an `elevated` entry: orange
 * had committing actions and no entry, which is why its buttons were
 * hand-written, and it was added at the 600/700 pattern every other tone
 * already follows rather than as a new idea. Held back: solids missing
 * text-white, which are not identical sets, and orange's
 * hover:bg-orange-500 buttons, which hover LIGHTER against a system
 * where every other tone darkens. That last one is a real inconsistency
 * and a deliberate fix, so it is recorded here rather than folded in
 * under a mechanical pass); 3102 to 3081 (6.2 batch 8, the heavy pill.
 * The wash question was answered by reading where the 20% actually
 * lands rather than by folding it away: the flagged-user risk tiers all
 * use ONE recipe, a 20% wash with a 40% border, so ADMIN_BADGE_STRONG
 * records it, Partial like ADMIN_SOLID because only three tones carry a
 * heavier form. risk.ts consumes it, and `medium` converges from
 * amber-200 to its tone's 300 in the same motion, which is the batch's
 * one deliberate pixel move: one tier a step lighter than its
 * neighbours was the only thing keeping the three from being a single
 * recipe. `low` stays raw because a solid slate chip is not a wash
 * pill. FlaggedUserCard stops inlining the four-branch ternary it was
 * writing beside an import of the very module that exports it, which is
 * pixel-identical and the third rule 7 duplication this arc has turned
 * up. Recorded and NOT done: the borderless 20% washes have no palette
 * home at all, because every entry carries a border, so folding them
 * would add one. Giving them an entry or a border is a shape decision,
 * not a wash decision, and it is not this batch's); 3081 to 3010 (6.2
 * batch 9, hover direction. The orange note above understated it. Counted
 * across the whole surface there are 86 resting/hover pairs and they
 * disagreed 27 to 32 about which way a hover moves, which is close enough
 * to even that it took counting rather than reading: two buttons sat side
 * by side on AdminDisputes, one deepening and one brightening under the
 * same pointer. Two conventions were already there and each is internally
 * perfect, so the fix conformed to them rather than inventing a third: the
 * neutral slate ground LIFTS one step (29 sites, no exceptions), and
 * saturated solids DARKEN, which is what ADMIN_SOLID has encoded since
 * batch 7. The 27 strays flipped to 700, and where the flip made the set
 * exact the site now consumes ADMIN_SOLID instead of restating it.
 * hover-direction.contract holds the rule, red-verified on all 27. Held
 * back and still raw, each for a stated reason: two sky buttons, because
 * sky is a real admin hue at 85 sites with no palette tone at all and
 * inventing one is not a hover fix; three solids that set text-foreground
 * where the palette says text-white; and two whose triad is split across a
 * long utility string, where reordering would be eyeballing rather than a
 * mechanical rule); 3010 to 2677 (6.1 tail, every complete palette set
 * consumed. The per-tone batches each took one hue, so tones nobody had a
 * reason to open kept restating the palette verbatim: 131 complete sets
 * were still written as literal class strings, 37 success, 23 danger, 22
 * warning, 19 info, 17 special, 5 neutral, 2 elevated, and 6
 * ADMIN_CATEGORY.cyan. The cyan six are the finding. No batch had ever
 * touched the category map, because every pass was scoped by TONE and a
 * category is not a tone, so a whole shelf of the palette sat unconsumed
 * while the tones around it were swept twice. Pixel identity here is a
 * property of the transform rather than a claim about it: each rewritten
 * string was re-expanded, substituting each palette expression back for
 * its literal tokens, and the token multiset compared with the original,
 * with any mismatch aborting the run. palette-sets-consumed.contract now
 * holds the floor, red-verified on all 131. Complete sets only, on
 * purpose: a partial set is bespoke work, and sweeping those would be a
 * visual change wearing a mechanical pass's clothes); 2677 to 2566 (batch
 * 10, the guard reads the whole palette. The previous batch shipped this
 * contract claiming it reads the sets from the palette itself. It read TWO
 * of the palette's six class-bearing maps, ADMIN_TONE and ADMIN_CATEGORY,
 * and was blind to ADMIN_SOLID, ADMIN_BADGE_STRONG, ADMIN_GROUND and
 * ADMIN_TIMELINE. A guard written to close a scoping hole had the same
 * scoping hole one level up, which is the failure repeating at the level
 * above the one it was built for. Behind it: 50 complete sets, 39 of them
 * restatements of ADMIN_GROUND.panel, the page-level card and the single
 * most repeated entry in the palette, plus 11 ADMIN_SOLID solids that
 * batches 7 and 9 both missed because each was scoped to one shape. All 50
 * consumed under the same round-trip identity proof, three of them inside
 * interpolated templates by tokenising only the literal spans so an inner
 * ternary cannot be torn apart. One tone sets stay unpoliced deliberately
 * and the guard says why: demanding ADMIN_GROUND.heading be consumed would
 * flag every legitimate text-white in the back office).
 */
const BUDGET = {
  admin: 2566,
  ui: 4,
  customer: 12,
};

/**
 * The convergence pass (plan 6.2) retires hues, not just call sites, and a
 * retired hue needs a ban rather than a ratchet: zero is the honest floor.
 *
 * Yellow went first. The admin surface spoke three caution hues at once
 * (amber for warning, orange for elevated, and 127 yellow utilities that
 * meant warning but drifted a step greener), and two screens disagreeing
 * about one meaning is exactly the defect the palette exists to end. Every
 * yellow folded into its amber equivalent in the same change, so yellow now
 * carries no meaning here, and a new one would be a regression, not debt.
 */
const ADMIN_BANNED_HUES = /\b[a-z:]*(?:bg|text|border|ring|fill|stroke|from|to|via)-(?:yellow)-[0-9]{2,3}\b/g;

describe("retired admin hues stay retired", () => {
  it("no admin file speaks yellow", () => {
    const offenders: string[] = [];
    for (const file of walk(path.join(ROOT, "src"))) {
      const rel = path.relative(ROOT, file);
      if (rel.includes("__tests__") || !isAdmin(rel)) continue;
      const hits = stripComments(fs.readFileSync(file, "utf8")).match(ADMIN_BANNED_HUES) ?? [];
      if (hits.length) offenders.push(`${rel}: ${hits.join(", ")}`);
    }
    expect(
      offenders,
      "Yellow was retired from the admin surface in the 6.2 convergence " +
        "pass: caution is warning (amber) or elevated (orange), through " +
        "ADMIN_TONE. Fold the new utility into its tone instead.\n" +
        offenders.join("\n"),
    ).toEqual([]);
  });
});

/*
 * ui dropped 7 to 4 in the same change: the destructive toast close button's
 * red-* utilities became destructive tokens. The remaining four are the
 * bg-black/80 overlay scrims in dialog, alert-dialog, sheet and drawer: a
 * dimming layer is deliberately black in both themes, because its job is to
 * darken whatever is behind it, and a theme-following scrim would lighten in
 * dark mode and stop dimming.
 */
/**
 * Literal hex, anywhere in a component. Same rule: it only goes down.
 * Re-anchored with the .ts widening for exactly two hexes, each checked:
 * image-quality.ts flattens transparency onto "#ffffff" before JPEG encode
 * (JPEG has no alpha, and the paper-white flatten has no dark mode to
 * follow), and admin-consistency.ts styles a devtools console.log line.
 */
const HEX_BUDGET = 109;

describe("the colour law ratchets", () => {
  const files = walk(path.join(ROOT, "src"));

  it("finds the components to count", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  const counts = { admin: 0, ui: 0, customer: 0 };
  const worst: Record<string, number> = {};

  for (const file of files) {
    const rel = path.relative(ROOT, file);
    if (rel.includes("__tests__")) continue;
    if (ADMIN_COLOUR_DEFINITION_FILES.has(rel)) continue;
    const hits = (stripComments(fs.readFileSync(file, "utf8")).match(RAW_COLOUR) ?? []).length;
    if (!hits) continue;
    const area = isAdmin(rel) ? "admin" : isUi(rel) ? "ui" : "customer";
    counts[area] += hits;
    worst[rel] = hits;
  }

  it(`no more than ${HEX_BUDGET} literal hex colours`, () => {
    const perFile: string[] = [];
    let total = 0;
    for (const file of files) {
      const rel = path.relative(ROOT, file);
      if (rel.includes("__tests__")) continue;
      const n = (stripComments(fs.readFileSync(file, "utf8")).match(RAW_HEX) ?? []).length;
      if (!n) continue;
      total += n;
      perFile.push(`${n}  ${rel}`);
    }

    expect(
      total,
      `literal hex count is ${total}, budget ${HEX_BUDGET}.\n` +
        "A hex value does not follow the theme and does not follow a rebrand. " +
        "Use hsl(var(--primary)) and friends, which work everywhere a hex does, " +
        "including inside recharts props and inline styles.\n" +
        `files:\n  ${perFile.sort((a, b) => parseInt(b) - parseInt(a)).join("\n  ")}`,
    ).toBeLessThanOrEqual(HEX_BUDGET);
  });

  for (const area of ["customer", "ui", "admin"] as const) {
    it(`${area}: no more than ${BUDGET[area]} raw colour utilities`, () => {
      const top = Object.entries(worst)
        .filter(([rel]) =>
          area === "admin" ? isAdmin(rel) : area === "ui" ? isUi(rel) : !isAdmin(rel) && !isUi(rel),
        )
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([rel, n]) => `${n}  ${rel}`);

      expect(
        counts[area],
        `${area} raw colour count is ${counts[area]}, budget ${BUDGET[area]}.\n` +
          (counts[area] > BUDGET[area]
            ? "Something was written outside the token system. Use the semantic " +
              "tokens: primary for the accent, success only for a completed state, " +
              "warning and destructive only for real problems, muted and " +
              "foreground for everything else.\n"
            : "This is below budget, which is the point. Lower the number in " +
              "BUDGET to lock the gain in.\n") +
          `heaviest files in this area:\n  ${top.join("\n  ")}`,
      ).toBeLessThanOrEqual(BUDGET[area]);
    });
  }
});
