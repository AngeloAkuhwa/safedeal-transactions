import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { stripComments } from "./touch-target-scan";

/**
 * Rule: a loading branch that replaces page content must preserve the layout.
 *
 * A centred spinner tells the user "something is happening" and nothing else.
 * It destroys the layout, so the page jumps when data lands (layout shift), it
 * gives no clue what is coming, and under `prefers-reduced-motion` this app
 * stops `animate-spin` entirely: leaving a motionless icon and no progress
 * signal at all.
 *
 * shadcn's own guidance is explicit: "Skeleton matching content layout", never
 * "Spinner for card loading". This scan enforces that for *layout-replacing*
 * branches only. Inline spinners inside a button, a chip or a table cell are
 * correct and are not flagged: they sit beside content rather than replacing it.
 */

/** A container that occupies the content area rather than sitting inside it. */
const LAYOUT_AREA = [
  /\bmin-h-\[100dvh\]/,
  /\bmin-h-screen\b/,
  /\bh-screen\b/,
  /\bh-\[100dvh\]/,
  /\bh-(?:48|56|64|72|80|96)\b/,
  /\bpy-(?:8|10|12|16|20|24|32)\b/,
  /\bmin-h-\[\d{3,}px\]/,
];

const SPINNER = /\bLoader2\b|\banimate-spin\b/;
const SKELETON = /\bSkeleton\b|\bsd-skeleton\b/;

export interface LoadingViolation {
  file: string;
  line: number;
  snippet: string;
  reason: string;
}

export function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith(".tsx") ? [path] : [];
  });
}

/** Text of the element opened at `index`, up to its matching close tag. */
function elementBody(source: string, index: number): string {
  const nameMatch = /^<([A-Za-z][A-Za-z0-9_.]*)/.exec(source.slice(index, index + 40));
  if (!nameMatch) return "";
  const tag = nameMatch[1];
  const open = new RegExp(`<${tag}(?=[\\s/>])`, "g");
  const close = new RegExp(`</${tag}>`, "g");
  let depth = 0;
  let cursor = index;
  while (cursor < source.length) {
    open.lastIndex = cursor;
    close.lastIndex = cursor;
    const o = open.exec(source);
    const c = close.exec(source);
    if (!c) break;
    if (o && o.index < c.index) {
      depth += 1;
      cursor = o.index + o[0].length;
      continue;
    }
    depth -= 1;
    if (depth <= 0) return source.slice(index, c.index);
    cursor = c.index + c[0].length;
  }
  return source.slice(index, Math.min(source.length, index + 1200));
}

const lineOf = (source: string, index: number) => source.slice(0, index).split("\n").length;

export function scanLoadingSource(source: string, file: string): LoadingViolation[] {
  const out: LoadingViolation[] = [];
  // A comment describing markup is not markup.
  source = stripComments(source);
  const seen = new Set<number>();

  for (const m of source.matchAll(/<div\b[^>]*className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
    const classes = m[1] ?? m[2] ?? "";
    if (!LAYOUT_AREA.some((r) => r.test(classes))) continue;
    // Centring is what makes it a spinner well rather than a content region.
    if (!/\bitems-center\b/.test(classes) || !/\bjustify-center\b/.test(classes)) {
      if (!/\btext-center\b/.test(classes)) continue;
    }
    const body = elementBody(source, m.index!);
    if (SKELETON.test(body)) continue;
    // A spinner *inside a control* is correct: it sits beside content rather
    // than replacing it, so a retry button on an error card is not a finding.
    // Strip every <Button> subtree before deciding whether this branch spins.
    const withoutControls = body
      .replace(/<Button\b[^]*?<\/Button>/g, "")
      .replace(/<button\b[^]*?<\/button>/g, "");
    if (!SPINNER.test(withoutControls)) continue;
    if (seen.has(m.index!)) continue;
    seen.add(m.index!);
    out.push({
      file,
      line: lineOf(source, m.index!),
      snippet: classes.replace(/\s+/g, " ").slice(0, 90),
      reason: "layout-replacing branch shows only a spinner; use a Skeleton that mirrors the content",
    });
  }
  return out;
}

export function scanLoadingRepo(root: string, exempt: Set<string> = new Set()): LoadingViolation[] {
  return sourceFiles(join(process.cwd(), root)).flatMap((abs) => {
    const rel = abs.slice(process.cwd().length + 1);
    if (rel.includes("__tests__")) return [];
    if (exempt.has(rel)) return [];
    return scanLoadingSource(readFileSync(abs, "utf8"), rel);
  });
}
