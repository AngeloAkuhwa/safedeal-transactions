/**
 * Full height means `dvh`, never `vh`.
 *
 * On iOS Safari, `100vh` is the height of the viewport with the browser chrome
 * hidden, which is taller than what you can actually see while the address bar
 * is showing. A dialog capped at `max-h-[90vh]` therefore extends past the
 * bottom of the screen, and the row it puts down there is usually the row with
 * the buttons in it. The user sees a form they cannot submit and no indication
 * that anything is below the fold.
 *
 * `dvh` is the dynamic viewport height: it tracks the chrome as it hides and
 * reveals, so 90dvh is 90% of what is on screen right now.
 *
 * 32 arbitrary `vh` values across 23 files, mostly `max-h-[85vh]` on dialogs
 * and sheets, which is exactly the case that breaks.
 *
 * `lg:h-screen` is deliberately not covered. It resolves to `100vh` too, but
 * every use of it in this codebase is behind an `lg:` prefix, and a desktop
 * browser has no dynamic chrome for the two units to disagree about.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const SRC = path.join(ROOT, "src");

function sources(dir = SRC, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sources(full, out);
    else if (/\.(tsx|css)$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** A Tailwind arbitrary height in `vh`: `h-[90vh]`, `max-h-[85vh]`, `min-h-[100vh]`. */
const VH = /\b(?:max-h|min-h|h)-\[\d+vh\]/g;

describe("full height means dvh", () => {
  const files = sources();

  it("finds the sources to check", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it("has no arbitrary vh height left", () => {
    const offenders: string[] = [];
    for (const file of files) {
      if (file.includes("__tests__")) continue;
      const lines = fs.readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        for (const m of line.matchAll(VH)) {
          offenders.push(`${path.relative(ROOT, file)}:${i + 1}  ${m[0]}`);
        }
      });
    }

    expect(
      offenders,
      `arbitrary vh height in ${offenders.length} place(s):\n  ${offenders.join("\n  ")}\n` +
        "Use dvh. On iOS, vh is measured against the viewport with the browser " +
        "chrome hidden, so a dialog sized in vh puts its buttons below the " +
        "bottom of the screen while the address bar is showing.",
    ).toEqual([]);
  });
});
