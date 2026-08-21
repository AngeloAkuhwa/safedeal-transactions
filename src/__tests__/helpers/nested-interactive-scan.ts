import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { stripComments } from "./touch-target-scan";

/**
 * Interactive content must not be nested inside other interactive content.
 *
 * `<a>` inside `<button>`, `<button>` inside `<a>`, or any control inside an
 * element with `role="button"` is invalid HTML. The consequences are concrete
 * rather than theoretical:
 *
 *  - two tab stops where the user expects one, on every instance;
 *  - browsers disagree about which control a click activates;
 *  - a screen reader announces a button whose contents include another button.
 *
 * This repo has produced the defect three separate ways: a wrapping `<Link>`
 * around a card that later grew a stretched `<button>` (which also left that
 * button dead, because the page never passed it a handler), six KPI cards each
 * wrapping an info `<button>` in a `<Link>`, and evidence thumbnails that were
 * a `<button>` containing a download `<a>`.
 *
 * The correct shape is the stretched link: the container stays a plain
 * positioned element, one real control is stretched over it with
 * `after:absolute after:inset-0`, and sibling controls sit above that on a
 * higher z tier.
 */

// The lookahead matters: `\b` alone matches `<a.icon />`, a member-expression
// component that is not an anchor at all. Requiring whitespace, `/` or `>`
// after the name keeps `<a>` and `<a href=...>` while dropping `<a.icon>`,
// `<article>` and `<aside>`.
const OUTER = /<(a|button|Link|NavLink)(?=[\s/>])(?![^>]*\basChild\b)/g;
const INNER = /<(?:a|button|Link|NavLink)(?=[\s/>])|role="(?:button|link|menuitem|tab|option|checkbox|switch)"/;

export interface NestedViolation {
  file: string;
  line: number;
  outer: string;
  reason: string;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith(".tsx") ? [path] : [];
  });
}

/** Body of the element opened at `index`, up to its matching close tag. */
function body(source: string, tag: string, index: number): string | null {
  const openTagEnd = source.indexOf(">", index);
  if (openTagEnd === -1) return null;
  // Self-closing: no children, nothing to nest.
  if (source[openTagEnd - 1] === "/") return null;
  const open = new RegExp(`<${tag}(?=[\\s/>])`, "g");
  const close = new RegExp(`</${tag}>`, "g");
  let depth = 0;
  let cursor = index;
  while (cursor < source.length) {
    open.lastIndex = cursor;
    close.lastIndex = cursor;
    const o = open.exec(source);
    const c = close.exec(source);
    if (!c) return null;
    if (o && o.index < c.index) {
      depth += 1;
      cursor = o.index + o[0].length;
      continue;
    }
    depth -= 1;
    if (depth <= 0) return source.slice(openTagEnd + 1, c.index);
    cursor = c.index + c[0].length;
  }
  return null;
}

const lineOf = (source: string, index: number) => source.slice(0, index).split("\n").length;

export function scanNestedSource(source: string, file: string): NestedViolation[] {
  const out: NestedViolation[] = [];
  // A comment describing markup is not markup.
  source = stripComments(source);
  for (const m of source.matchAll(OUTER)) {
    const tag = m[1];
    const inner = body(source, tag, m.index!);
    if (!inner) continue;
    if (!INNER.test(inner)) continue;
    out.push({
      file,
      line: lineOf(source, m.index!),
      outer: tag,
      reason: `<${tag}> contains another interactive element. Use the stretched-link pattern instead`,
    });
  }
  return out;
}

export function scanNestedRepo(root: string, exempt: Set<string> = new Set()): NestedViolation[] {
  return sourceFiles(join(process.cwd(), root)).flatMap((abs) => {
    const rel = abs.slice(process.cwd().length + 1);
    if (rel.includes("__tests__")) return [];
    if (exempt.has(rel)) return [];
    return scanNestedSource(readFileSync(abs, "utf8"), rel);
  });
}
