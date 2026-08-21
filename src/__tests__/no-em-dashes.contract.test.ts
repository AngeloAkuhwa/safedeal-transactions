/**
 * No em dashes in prose.
 *
 * A house rule, and one that is easy to reintroduce without noticing: the
 * character is a normal keystroke on macOS, editors substitute it
 * automatically, and it reads as fine English right up until someone points
 * out that every other sentence has one. 677 of them had accumulated across
 * 242 files before this guard existed.
 *
 * What is banned is the em dash as *punctuation*: spaced between clauses, or
 * pressed against a word on either side. The replacement is a colon when the
 * left side is a label, a full stop when both sides are sentences, or
 * parentheses for a trailing qualifier. Never a comma, which produces a comma
 * splice whenever the right side is independent.
 *
 * What is NOT banned, yet, is the standalone `"—"` used as an empty-value
 * marker in tables and field cards. There are around 380 of those, plus a
 * `formatMoneyOrDash` helper built around it. That is a typographic convention
 * for "no value here" rather than prose punctuation, and swapping it changes
 * the empty state of every admin table at once. It is a product decision that
 * has not been made, so this guard deliberately permits it rather than
 * pretending the question is settled. If the answer becomes "replace it",
 * widen the pattern below and sweep in one commit.
 *
 * Scope is src/ and supabase/functions/. Comments count: the rule says
 * anywhere, and a comment is still writing someone reads. The edge functions
 * are in scope because `src/lib/admin-mappers.ts` and
 * `supabase/functions/_shared/admin-mappers.ts` are asserted to be byte
 * identical, so sweeping one and not the other breaks that mirror. It did,
 * on the first run of this sweep.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const ROOTS = [path.join(ROOT, "src"), path.join(ROOT, "supabase/functions")];

/** This file quotes the character it bans, so it cannot check itself. */
const SELF = path.basename(__filename);

function walk(dir: string, out: string[]): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry.name) && entry.name !== SELF) out.push(full);
  }
  return out;
}

const sourceFiles = () => ROOTS.reduce<string[]>((acc, r) => walk(r, acc), []);

/**
 * An em dash acting as punctuation: spaced on both sides, or touching a word
 * character on either side. The bare placeholder matches none of these, which
 * is the exemption described above.
 *
 * Written as `—` rather than the character itself, and deliberately so.
 * The first version of this line spelled the pattern literally, and the sweep
 * script that removed 677 em dashes from the codebase promptly rewrote the
 * guard's own pattern into a colon, disarming it. A rule that cannot survive
 * its own enforcement is not a rule.
 */
const EM = "—";
const PROSE_DASH = new RegExp(`( ${EM} |\\w${EM}|${EM}\\w)`);

describe("no em dashes in prose", () => {
  const files = sourceFiles();

  it("finds the sources to check", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it("has no em dash used as punctuation anywhere in src/", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const lines = fs.readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (PROSE_DASH.test(line)) {
          offenders.push(`${path.relative(ROOT, file)}:${i + 1}  ${line.trim().slice(0, 90)}`);
        }
      });
    }
    expect(
      offenders,
      `em dash used as punctuation in ${offenders.length} place(s):\n  ${offenders
        .slice(0, 25)
        .join("\n  ")}\n` +
        (offenders.length > 25 ? `  ...and ${offenders.length - 25} more\n` : "") +
        "Use a colon when the left side is a label, a full stop when both sides " +
        "are sentences, or parentheses for a trailing qualifier. Not a comma: " +
        "that splices two independent clauses.",
    ).toEqual([]);
  });
});
