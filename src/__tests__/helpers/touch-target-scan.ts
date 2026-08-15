/**
 * Touch-target scanner.
 *
 * Parses full JSX opening tags (brace/string aware, so `onClick={() => …}` does
 * not terminate the tag), understands capitalised shadcn components, resolves
 * `cn(...)` / template-literal className arguments down to their string
 * literals, and models h-/w-/size-/min-h-/padding utilities plus shadcn
 * `size="sm" | "icon"` variants.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export const MIN_TARGET_PX = 44;

/** Raw lowercase interactive elements. */
const RAW_TAGS = new Set(["button", "a", "input", "select", "textarea", "summary", "label"]);

/** Capitalised components that render a real interactive control. */
const COMPONENT_TAGS = new Set([
  "Button", "Input", "Checkbox", "Switch", "Textarea", "Toggle", "ToggleGroupItem",
  "SelectTrigger", "DropdownMenuTrigger", "DropdownMenuItem", "TabsTrigger",
  "PopoverTrigger", "TooltipTrigger", "AccordionTrigger", "RadioGroupItem",
  "PaginationLink", "PaginationPrevious", "PaginationNext", "AlertDialogAction",
  "AlertDialogCancel", "CommandItem", "MenubarItem", "BreadcrumbLink", "Link", "NavLink",
]);

/** shadcn Button size variants -> height in px. */
const BUTTON_SIZE_PX: Record<string, number> = { default: 44, sm: 44, lg: 44, icon: 44 };

export interface Violation {
  file: string;
  line: number;
  tag: string;
  reason: string;
  snippet: string;
}

export function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? tsxFiles(path) : path.endsWith(".tsx") ? [path] : [];
  });
}

/** Scan forward from `<` to the real end of the opening tag, honouring strings and braces. */
export function readOpeningTag(source: string, start: number): { text: string; end: number } | null {
  let i = start + 1;
  let depth = 0;
  let quote: string | null = null;
  while (i < source.length) {
    const ch = source[i];
    if (quote) {
      if (ch === "\\") i += 1;
      else if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
    } else if (ch === "{") depth += 1;
    else if (ch === "}") depth -= 1;
    else if (ch === ">" && depth === 0) return { text: source.slice(start, i + 1), end: i + 1 };
    else if (ch === "<" && depth === 0) return null; // malformed / not a tag
    i += 1;
  }
  return null;
}

/** Collect every string literal inside a balanced `{ ... }` expression. */
function literalsInExpression(expr: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|`([^`]*)`/g;
  for (const m of expr.matchAll(re)) out.push(m[1] ?? m[2] ?? m[3] ?? "");
  return out;
}

function readBalanced(source: string, openIndex: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let i = openIndex; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (ch === "\\") i += 1;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") quote = ch;
    else if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(openIndex, i + 1);
    }
  }
  return source.slice(openIndex);
}

/** Index of the tag's *own* className attribute (depth 0 only, so nested JSX props are ignored). */
function ownClassNameIndex(tagText: string): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = 0; i < tagText.length; i += 1) {
    const ch = tagText[i];
    if (quote) {
      if (ch === "\\") i += 1;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") quote = ch;
    else if (ch === "{") depth += 1;
    else if (ch === "}") depth -= 1;
    else if (depth === 0 && tagText.startsWith("className=", i)) return i;
  }
  return -1;
}

export function classNamesOf(tagText: string): string[] {
  const idx = ownClassNameIndex(tagText);
  if (idx === -1) return [];
  const after = idx + "className=".length;
  const ch = tagText[after];
  if (ch === '"') {
    const end = tagText.indexOf('"', after + 1);
    return tagText.slice(after + 1, end).split(/\s+/).filter(Boolean);
  }
  if (ch === "{") {
    const expr = readBalanced(tagText, after);
    return literalsInExpression(expr).flatMap((s) => s.split(/\s+/)).filter(Boolean);
  }
  return [];
}

function unit(token: string): number | null {
  if (token === "px") return 1;
  if (token === "full" || token === "auto" || token === "screen") return Number.POSITIVE_INFINITY;
  const n = Number(token);
  return Number.isFinite(n) ? n * 4 : null;
}

function pick(classes: string[], prefix: string): number | null {
  let value: number | null = null;
  for (const c of classes) {
    if (c.includes(":")) continue; // responsive/state variants handled separately
    if (!c.startsWith(prefix)) continue;
    const v = unit(c.slice(prefix.length));
    if (v !== null) value = v;
  }
  return value;
}

function insetBonus(classes: string[]): number {
  let bonus = 0;
  for (const c of classes) {
    const m = c.match(/^before:-inset-(\S+)$/);
    if (m) {
      const v = unit(m[1]);
      if (v && Number.isFinite(v)) bonus = Math.max(bonus, v * 2);
    }
  }
  return bonus;
}

function attrValue(tagText: string, name: string): string | null {
  const m = tagText.match(new RegExp(`${name}=(?:"([^"]*)"|\\{"([^"]*)"\\})`));
  return m ? (m[1] ?? m[2] ?? null) : null;
}

export function measure(tagText: string, tag: string) {
  const classes = classNamesOf(tagText);
  const bonus = insetBonus(classes);

  const h = pick(classes, "h-");
  const minH = pick(classes, "min-h-");
  const size = pick(classes, "size-");
  const w = pick(classes, "w-");
  const minW = pick(classes, "min-w-");
  const py = pick(classes, "py-") ?? pick(classes, "p-");
  const px = pick(classes, "px-") ?? pick(classes, "p-");

  let height = [h, minH, size].filter((v): v is number => v !== null).reduce((a, b) => Math.max(a, b), 0) || null;
  let width = [w, minW, size].filter((v): v is number => v !== null).reduce((a, b) => Math.max(a, b), 0) || null;

  // shadcn size variant default when no explicit height class
  if (height === null && (tag === "Button" || tag === "Input" || tag === "SelectTrigger" || tag === "Textarea")) {
    const variant = attrValue(tagText, "size") ?? "default";
    height = BUTTON_SIZE_PX[variant] ?? 44;
  }
  if (height === null && tag === "Checkbox") height = 44;

  // padding-derived box for raw elements
  if (height === null && py !== null) height = py * 2 + 20;
  if (width === null && px !== null) width = px * 2 + 20;

  return {
    classes,
    height: height === null ? null : height + bonus,
    width: width === null ? null : width + bonus,
    bonus,
  };
}

export function scanSource(source: string, file: string): Violation[] {
  const out: Violation[] = [];
  for (let i = 0; i < source.length; i += 1) {
    if (source[i] !== "<") continue;
    const nameMatch = /^<([A-Za-z][A-Za-z0-9_.]*)/.exec(source.slice(i, i + 40));
    if (!nameMatch) continue;
    const tag = nameMatch[1];
    const read = readOpeningTag(source, i);
    if (!read) continue;
    const text = read.text;

    const clickable = /\bonClick=/.test(text) || /\bonChange=/.test(text) || /\brole="button"/.test(text);
    const interactive = RAW_TAGS.has(tag) || COMPONENT_TAGS.has(tag) || clickable;
    if (!interactive) continue;
    if (tag === "input" && /type="hidden"/.test(text)) continue;
    if (tag === "textarea" || tag === "Textarea") continue; // multi-line inputs are sized by rows
    if (tag === "a" && !/className=/.test(text) && !clickable) continue;

    const { height, width, classes } = measure(text, tag);
    if (height === null && width === null) {
      // Icon-only controls that declare no box at all: the icon size *is* the
      // hit area. Flag them so they get an explicit target.
      const body = source.slice(read.end, read.end + 300);
      const sole = /^\s*<([A-Z][A-Za-z0-9]*)\s+className="([^"]*)"\s*\/>\s*<\//.exec(body);
      if (!sole || COMPONENT_TAGS.has(sole[1])) continue;
      const iconPx = Number(/\bh-([0-9.]+)/.exec(sole[2])?.[1] ?? "0") * 4;
      if (iconPx >= MIN_TARGET_PX) continue;
      out.push({
        file,
        line: source.slice(0, i).split("\n").length,
        tag,
        reason: `icon-only, no box declared (icon≈${iconPx}px)`,
        snippet: `${classes.join(" ")} :: ${text.replace(/\s+/g, " ").slice(0, 150)}`,
      });
      continue;
    }

    const line = source.slice(0, i).split("\n").length;
    const snippet = text.replace(/\s+/g, " ").slice(0, 150);
    const failed: string[] = [];
    if (height !== null && height < MIN_TARGET_PX) failed.push(`height≈${height}px`);
    if (width !== null && width < MIN_TARGET_PX && height !== null && height < MIN_TARGET_PX) failed.push(`width≈${width}px`);
    if (!failed.length) continue;
    out.push({ file, line, tag, reason: failed.join(" "), snippet: `${classes.join(" ")} :: ${snippet}` });
  }
  return out;
}

export function scanRepo(root: string): Violation[] {
  return tsxFiles(root).flatMap((absolute) =>
    scanSource(readFileSync(absolute, "utf8"), relative(process.cwd(), absolute).replace(/\\/g, "/")),
  );
}
