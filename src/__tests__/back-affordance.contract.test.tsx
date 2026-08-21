/**
 * Every back control says where it goes.
 *
 * 43 of them are hand-rolled across the app, and they disagree on radius,
 * padding, element type and hover treatment. Three of them said nothing at
 * all: an icon-only `<Button variant="ghost" size="icon">` wrapped around a
 * bare arrow, which a screen reader announces as "button" and nothing else. On
 * the seller storefront pages, that was the only way back.
 *
 * `BackLink` is the fix for the class: it takes `label` as a required prop, so
 * TypeScript refuses to compile the unlabelled version. This file is the fix
 * for everything that has not been migrated to it yet, and for the next
 * hand-rolled one somebody adds.
 *
 * The rule is about the accessible name, not about the component. A back
 * control is fine as it stands if it carries an `aria-label`, an `sr-only`
 * caption, or visible text. Most of them do. What is banned is an arrow on its
 * own with no name in any form.
 *
 * A note on measuring this, because the first two attempts were both wrong and
 * the second one was wrong in a way that reads as authoritative:
 *
 *   - `<ArrowLeft[^>]*\/>` also matches `<ArrowLeftRight />`, a different icon
 *     used for transactions, so admin tables full of perfectly good buttons
 *     were reported as defects. The lookahead below fixes that.
 *   - Visible text is often a JSX expression rather than a literal:
 *     `{isAuthenticated ? "Back to Marketplace" : ...}`. A check that only
 *     looked for literal text called those unnamed too.
 *
 * Between them those two bugs turned 3 real findings into 41. A guard that
 * cries wolf gets deleted, so the detection is deliberately conservative: when
 * it cannot tell, it treats the control as named.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const SRC = path.join(ROOT, "src");

function tsxFiles(dir = SRC, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) tsxFiles(full, out);
    else if (entry.name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

/** `(?=[\s/>])` so `ArrowLeftRight` is not mistaken for `ArrowLeft`. */
const ARROW = /<ArrowLeft(?=[\s/>])[^>]*\/>/g;
const CONTROL = /<(Button|button|Link|a)\b/g;

/** Any of the three ways a control can carry a name. */
function isNamed(openTag: string, inner: string): boolean {
  if (/aria-label=/.test(openTag)) return true;
  if (/sr-only/.test(inner)) return true;
  // Visible text, as a literal or inside a JSX expression. Anything that puts
  // words on screen next to the arrow gives the control its name.
  if (/[A-Za-z]{3,}/.test(inner.replace(/<[^>]*>/g, " ").replace(/className=("[^"]*"|\{[^}]*\})/g, " ")))
    return true;
  return false;
}

describe("back controls have an accessible name", () => {
  const files = tsxFiles();

  it("finds the components to check", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it("has no arrow-only control without a name", () => {
    const offenders: string[] = [];

    for (const file of files) {
      const src = fs.readFileSync(file, "utf8");
      for (const m of src.matchAll(ARROW)) {
        const i = m.index ?? 0;
        const before = src.slice(Math.max(0, i - 700), i);
        const opens = [...before.matchAll(CONTROL)];
        if (!opens.length) continue;
        const openTag = before.slice(opens[opens.length - 1].index ?? 0);

        const after = src.slice(i + m[0].length, i + m[0].length + 700);
        const closeAt = after.search(/<\/(Button|button|Link|a)>/);
        const inner = closeAt === -1 ? after : after.slice(0, closeAt);

        if (!isNamed(openTag, inner)) {
          const line = src.slice(0, i).split("\n").length;
          offenders.push(`${path.relative(ROOT, file)}:${line}`);
        }
      }
    }

    expect(
      offenders,
      `back control with no accessible name:\n  ${offenders.join("\n  ")}\n` +
        "A screen reader announces this as an unnamed control, and on some " +
        "pages it is the only way back. Use <BackLink to=... label=... /> from " +
        "@/components/common/BackLink, which requires the label, or add an " +
        "aria-label, an sr-only caption, or visible text.",
    ).toEqual([]);
  });
});
