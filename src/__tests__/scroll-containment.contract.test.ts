/**
 * Scrolling stays where it started.
 *
 * 87 scrollable regions in this app and not one of them set
 * `overscroll-behavior`. The default is `auto`, which means scroll chaining:
 * reach the end of an inner list and the gesture keeps going, scrolling
 * whatever is behind it.
 *
 * That is the clearest "this is a website" tell on a phone. Flick through the
 * items in a sheet, hit the bottom, and the page behind it starts moving. On
 * iOS the whole document rubber-bands underneath a modal that is supposed to
 * be holding your attention.
 *
 * The rule lives on the Tailwind overflow utilities rather than on any one
 * component, so the 87 sites are covered without touching one of them and the
 * eighty-eighth is covered the moment it is written.
 *
 * Two things this asserts beyond the rule existing, because both are ways the
 * fix could be quietly undone:
 *
 *   - `contain`, not `none`. The region has to keep its own bounce at the
 *     boundary: that is the feedback telling a finger it has reached the end.
 *     Only the chain to the ancestor is cut.
 *   - nothing sets overscroll on `body` or `html`. Containing the document
 *     also disables pull-to-refresh, which is a browser affordance this app
 *     has no business taking away.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const CSS = fs.readFileSync(path.join(ROOT, "src/index.css"), "utf8");

/** Comments quote the rule they explain, so they cannot be the evidence. */
const code = CSS.replace(/\/\*[\s\S]*?\*\//g, "");

describe("scrolling is contained to the region it started in", () => {
  it("gives every overflow utility overscroll containment", () => {
    const block = code.match(/\.overflow-[^{]*\{[^}]*overscroll-behavior[^}]*\}/);
    expect(
      block,
      "src/index.css has no overscroll-behavior rule on the overflow " +
        "utilities. Without it a gesture that reaches the end of an inner " +
        "list chains to whatever is behind it, which is what makes a sheet " +
        "feel like a web page instead of an app.",
    ).toBeTruthy();

    const selectors = block![0].split("{")[0];
    for (const util of [
      "overflow-auto",
      "overflow-scroll",
      "overflow-x-auto",
      "overflow-x-scroll",
      "overflow-y-auto",
      "overflow-y-scroll",
    ]) {
      expect(selectors, `${util} is not covered by the containment rule`).toContain(`.${util}`);
    }
  });

  it("contains rather than blocking, so the region keeps its own bounce", () => {
    const block = code.match(/\.overflow-[^{]*\{([^}]*)\}/);
    expect(block![1]).toMatch(/overscroll-behavior:\s*contain/);
    expect(
      block![1],
      "overscroll-behavior: none also removes the boundary bounce, which is " +
        "the only feedback a finger gets that the list has ended.",
    ).not.toMatch(/overscroll-behavior:\s*none/);
  });

  it("leaves the document alone so pull-to-refresh still works", () => {
    const onDocument = code.match(
      /(^|\})\s*(html|body)[^{}]*\{[^}]*overscroll-behavior[^}]*\}/m,
    );
    expect(
      onDocument,
      "Something sets overscroll-behavior on html or body. That disables " +
        "pull-to-refresh, which belongs to the browser rather than to this app.",
    ).toBeNull();
  });
});
