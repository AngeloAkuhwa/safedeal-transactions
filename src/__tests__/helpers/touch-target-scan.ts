/**
 * Touch-target / keyboard / legibility scanner (Phase 1e rewrite).
 *
 * The Phase 1d scanner reported 0/0/0 while real controls were failing. The
 * causes were all in the *mechanism*, not the allowlist:
 *   - `Link`/`NavLink`/`<a>` were exempt, so the whole bottom tab bar and every
 *     nav item was unmeasured;
 *   - the width failure was AND-gated with height, so 32x44 passed;
 *   - `h-auto`/`h-full` scored Infinity;
 *   - `before:-inset-*` was credited without the pseudo-element existing;
 *   - variant-prefixed classes were dropped, so `h-11 max-sm:h-6` measured 44;
 *   - branch awareness only understood `cond ? "a" : "b"`;
 *   - string concatenation was not modelled at all;
 *   - the padding heuristic hard-coded a `text-sm` line box;
 *   - the keyboard rule only looked at lowercase tags and never read values;
 *   - the font rule was px-only and `.tsx`-only.
 *
 * This version evaluates className expressions with a small recursive
 * evaluator that enumerates every class-set a tag can render (ternaries,
 * `&&`/`||` guards, `cn()` args, template literals, identifier references and
 * `+` concatenation, which is joined *without* a separator so a missing space
 * destroys the adjacent tokens exactly as it does at runtime) and scores the
 * worst branch. When an expression is too complex to enumerate it fails loudly
 * instead of silently dropping branches.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export const MIN_TARGET_PX = 44;
export const MIN_FONT_PX = 12;
const MAX_VARIANTS = 64;

/** Raw lowercase interactive elements. */
const RAW_TAGS = new Set(["button", "a", "input", "select", "textarea", "summary", "label"]);

/**
 * Capitalised components that render a real interactive control, mapped to the
 * height their own primitive guarantees when the call site declares no box.
 * `null` = the primitive declares no box of its own.
 */
const COMPONENT_DEFAULT_PX: Record<string, number | null> = {
  Button: 44,
  Input: 44,
  Checkbox: 44,
  Switch: 44,
  Toggle: 44,
  ToggleGroupItem: 44,
  SelectTrigger: 44,
  SelectItem: 44,
  DropdownMenuItem: 44,
  DropdownMenuCheckboxItem: 44,
  MenubarItem: 44,
  CommandItem: 44,
  TabsTrigger: 44,
  AccordionTrigger: 44,
  RadioGroupItem: 44,
  PaginationLink: 44,
  PaginationPrevious: 44,
  PaginationNext: 44,
  AlertDialogAction: 44,
  AlertDialogCancel: 44,
  InputOTPSlot: 44,
  BreadcrumbLink: 44,
  // Wrappers with no box of their own — they inherit whatever the child is.
  DropdownMenuTrigger: null,
  PopoverTrigger: null,
  TooltipTrigger: null,
  SheetTrigger: null,
  DialogTrigger: null,
  // Render-prop wrapper from react-hook-form: it renders no DOM of its own.
  FormField: null,
  // Router links are measured when they are block-level controls (see
  // `isInlineTextLink`); the WCAG 2.5.5 exception is for links inline in prose.
  Link: null,
  NavLink: null,
};
const COMPONENT_TAGS = new Set(Object.keys(COMPONENT_DEFAULT_PX));

/** Components whose primitive owns the hit area, so a bare call site is fine. */
const PRIMITIVE_SAFE = new Set(
  Object.entries(COMPONENT_DEFAULT_PX).filter(([, v]) => v !== null).map(([k]) => k),
);

/** Wrappers that delegate their box to their child (asChild / render-prop style). */
const DELEGATING = new Set([
  "DropdownMenuTrigger", "PopoverTrigger", "TooltipTrigger", "SheetTrigger", "DialogTrigger", "FormField",
]);

/** Link-like tags: measured unless they are inline links inside a sentence. */
const LINK_TAGS = new Set(["a", "Link", "NavLink"]);

/** shadcn Button size variants -> height in px. */
const BUTTON_SIZE_PX: Record<string, number> = { default: 44, sm: 44, lg: 44, icon: 44 };

export interface Violation {
  file: string;
  line: number;
  tag: string;
  reason: string;
  snippet: string;
}

export function sourceFiles(dir: string, exts: string[]): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path, exts);
    return exts.some((e) => path.endsWith(e)) ? [path] : [];
  });
}

export const tsxFiles = (dir: string) => sourceFiles(dir, [".tsx"]);

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

/* ------------------------------------------------------------------ */
/* className expression evaluation                                      */
/* ------------------------------------------------------------------ */

export class TooComplex extends Error {}

type Consts = Map<string, string>;

function stripOuter(s: string): string {
  let t = s.trim();
  for (;;) {
    if ((t.startsWith("(") && matchesEnd(t, "(", ")")) || (t.startsWith("{") && matchesEnd(t, "{", "}"))) {
      t = t.slice(1, -1).trim();
      continue;
    }
    return t;
  }
}

function matchesEnd(t: string, open: string, close: string): boolean {
  let depth = 0;
  let quote: string | null = null;
  for (let i = 0; i < t.length; i += 1) {
    const ch = t[i];
    if (quote) {
      if (ch === "\\") i += 1;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") quote = ch;
    else if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return i === t.length - 1;
    }
  }
  return false;
}

/** Positions of a top-level operator (depth 0, outside strings). */
function topLevelIndexes(s: string, op: string): number[] {
  const out: number[] = [];
  let depth = 0;
  let quote: string | null = null;
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (quote) {
      if (ch === "\\") i += 1;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") quote = ch;
    else if (ch === "(" || ch === "{" || ch === "[") depth += 1;
    else if (ch === ")" || ch === "}" || ch === "]") depth -= 1;
    else if (depth === 0 && s.startsWith(op, i)) {
      // avoid `?.` and `??`
      if (op === "?" && (s[i + 1] === "." || s[i + 1] === "?" || s[i - 1] === "?")) continue;
      out.push(i);
      i += op.length - 1;
    }
  }
  return out;
}

function splitTop(s: string, sep: string): string[] {
  const parts: string[] = [];
  let last = 0;
  for (const i of topLevelIndexes(s, sep)) {
    parts.push(s.slice(last, i));
    last = i + sep.length;
  }
  parts.push(s.slice(last));
  return parts;
}

function cross(a: string[], b: string[], glue: string): string[] {
  const out: string[] = [];
  for (const x of a) for (const y of b) out.push(`${x}${glue}${y}`);
  if (out.length > MAX_VARIANTS) throw new TooComplex("too many className branches to enumerate");
  return out;
}

/** Enumerate every string the expression can evaluate to. */
export function evalExpr(raw: string, consts: Consts = new Map(), depth = 0): string[] {
  if (depth > 12) throw new TooComplex("className expression nested too deeply");
  const s = stripOuter(raw);
  if (!s) return [""];

  // ternary (lowest precedence)
  const q = topLevelIndexes(s, "?")[0];
  if (q !== undefined) {
    const colons = topLevelIndexes(s.slice(q + 1), ":");
    // pick the colon that balances nested ternaries
    let nested = 0;
    let chosen = -1;
    const tail = s.slice(q + 1);
    for (const c of topLevelIndexes(tail, "?")) void c;
    const qs = topLevelIndexes(tail, "?");
    for (const c of colons) {
      nested = qs.filter((p) => p < c).length;
      const priorColons = colons.filter((p) => p < c).length;
      if (priorColons === nested) { chosen = c; break; }
    }
    if (chosen !== -1) {
      const a = evalExpr(tail.slice(0, chosen), consts, depth + 1);
      const b = evalExpr(tail.slice(chosen + 1), consts, depth + 1);
      const out = [...a, ...b];
      if (out.length > MAX_VARIANTS) throw new TooComplex("too many ternary branches");
      return out;
    }
  }

  // nullish coalescing -> either side
  const nullish = topLevelIndexes(s, "??");
  if (nullish.length) {
    const parts = splitTop(s, "??");
    const out = parts.flatMap((p) => evalExpr(p, consts, depth + 1));
    if (out.length > MAX_VARIANTS) throw new TooComplex("too many ?? branches");
    return out;
  }

  // logical OR -> either side
  const ors = topLevelIndexes(s, "||");
  if (ors.length) {
    const parts = splitTop(s, "||");
    const out = parts.flatMap((p) => evalExpr(p, consts, depth + 1));
    if (out.length > MAX_VARIANTS) throw new TooComplex("too many || branches");
    return out;
  }

  // logical AND -> the guarded value is either present or absent
  const ands = topLevelIndexes(s, "&&");
  if (ands.length) {
    const parts = splitTop(s, "&&");
    const guarded = evalExpr(parts[parts.length - 1], consts, depth + 1);
    return ["", ...guarded];
  }

  // string concatenation — joined with NO separator, exactly like the runtime
  const plus = topLevelIndexes(s, "+");
  if (plus.length) {
    const parts = splitTop(s, "+");
    let acc = evalExpr(parts[0], consts, depth + 1);
    for (const p of parts.slice(1)) acc = cross(acc, evalExpr(p, consts, depth + 1), "");
    return acc;
  }

  // array literal joined into a class string: ["a", cond && "b"].join(" ")
  const arr = /^\[([\s\S]*)\]\s*(?:\.\s*(?:filter|join)\s*\([^)]*\)\s*)*$/.exec(s);
  if (arr) {
    let acc = [""];
    for (const item of splitTop(arr[1], ",")) {
      if (!item.trim()) continue;
      acc = cross(acc, evalExpr(item, consts, depth + 1), " ");
    }
    return acc;
  }

  // cn()/clsx()/twMerge() call
  const call = /^(cn|clsx|classNames|twMerge|cva)\s*\(/.exec(s);
  if (call && s.endsWith(")")) {
    const inner = s.slice(call[0].length, -1);
    let acc = [""];
    for (const arg of splitTop(inner, ",")) {
      if (!arg.trim()) continue;
      acc = cross(acc, evalExpr(arg, consts, depth + 1), " ");
    }
    return acc;
  }

  // template literal
  if (s.startsWith("`") && s.endsWith("`")) {
    const body = s.slice(1, -1);
    let acc = [""];
    let buf = "";
    for (let i = 0; i < body.length; i += 1) {
      if (body[i] === "$" && body[i + 1] === "{") {
        acc = cross(acc, [buf], "");
        buf = "";
        let d = 0;
        let j = i + 1;
        for (; j < body.length; j += 1) {
          if (body[j] === "{") d += 1;
          else if (body[j] === "}") { d -= 1; if (!d) break; }
        }
        acc = cross(acc, evalExpr(body.slice(i + 2, j), consts, depth + 1), "");
        i = j;
        continue;
      }
      buf += body[i];
    }
    return cross(acc, [buf], "");
  }

  // plain string literal
  const lit = /^"([^"]*)"$|^'([^']*)'$/.exec(s);
  if (lit) return [lit[1] ?? lit[2] ?? ""];

  // identifier -> resolve local const
  const ident = /^[A-Za-z_$][\w$]*$/.exec(s);
  if (ident) {
    const value = consts.get(s);
    if (value !== undefined) return evalExpr(value, new Map(consts), depth + 1);
    return [""]; // unknown identifier contributes nothing (worst case)
  }

  // member access / call / object literal: unknown contribution
  return [""];
}

/** Collect `const X = <expr>` bindings so identifier arms can be resolved. */
export function collectConsts(source: string): Consts {
  const consts: Consts = new Map();
  const re = /\bconst\s+([A-Za-z_$][\w$]*)\s*(?::[^=\n]+)?=\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`[^`]*`|cn\()/g;
  for (const m of source.matchAll(re)) {
    if (m[2] === "cn(") {
      const open = source.indexOf("(", m.index + m[0].length - 1);
      consts.set(m[1], readBalancedParen(source, open, "cn"));
    } else {
      consts.set(m[1], m[2]);
    }
  }
  return consts;
}

function readBalancedParen(source: string, openIndex: number, prefix: string): string {
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
    else if (ch === "(") depth += 1;
    else if (ch === ")") {
      depth -= 1;
      if (depth === 0) return `${prefix}${source.slice(openIndex, i + 1)}`;
    }
  }
  return `${prefix}()`;
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

/** Index of the tag's *own* attribute (depth 0 only, so nested JSX props are ignored). */
function ownAttrIndex(tagText: string, attr: string): number {
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
    else if (depth === 0 && tagText.startsWith(attr, i)) return i;
  }
  return -1;
}

/** Every class-set the tag can render; `[]` when it declares no className at all. */
export function classNameVariants(tagText: string, consts: Consts = new Map()): string[][] {
  const idx = ownAttrIndex(tagText, "className="); if (idx === -1) return []; const after = idx +"className=".length; const ch = tagText[after]; if (ch === '"') {
    const end = tagText.indexOf('"', after + 1);
    return [tagText.slice(after + 1, end).split(/\s+/).filter(Boolean)];
  }
  if (ch === "{") {
    const expr = readBalanced(tagText, after);
    return evalExpr(expr, consts).map((s) => s.split(/\s+/).filter(Boolean));
  }
  return [];
}

/** Flat union of every class the tag can render (used by the self-tests). */
export function classNamesOf(tagText: string): string[] {
  return Array.from(new Set(classNameVariants(tagText).flat()));
}

/* ------------------------------------------------------------------ */
/* measurement                                                          */
/* ------------------------------------------------------------------ */

function unit(token: string): number | null {
  if (token === "px") return 1;
  // `full`/`auto`/`screen` are not a measurement — the box depends on content
  // or on an ancestor. Unknown, not "infinitely large".
  if (token === "full" || token === "auto" || token === "screen" || token === "fit" || token === "min" || token === "max") {
    return null;
  }
  const bracket = /^\[(\d+(?:\.\d+)?)(px|rem)\]$/.exec(token);
  if (bracket) return Number(bracket[1]) * (bracket[2] === "rem" ? 16 : 1);
  const n = Number(token);
  return Number.isFinite(n) ? n * 4 : null;
}

/** Variants that still apply at a 360px viewport. */
const MOBILE_VARIANTS = new Set(["max-sm", "max-md", "max-lg", "max-xl", "max-2xl", "dark", "hover", "focus", "focus-visible", "active", "disabled", "group-hover"]);

/**
 * Resolve a utility for the mobile viewport. Unprefixed classes apply; the
 * min-width variants (`sm:`/`md:`/…) do not; `max-*:` variants override.
 */
function pick(classes: string[], prefix: string): number | null {
  let base: number | null = null;
  let override: number | null = null;
  for (const c of classes) {
    let token = c;
    let mobileOverride = false;
    if (c.includes(":")) {
      const parts = c.split(":");
      const variants = parts.slice(0, -1);
      token = parts[parts.length - 1];
      if (!variants.every((v) => MOBILE_VARIANTS.has(v))) continue; // sm:/md:/lg: do not apply at 360px
      mobileOverride = variants.some((v) => v.startsWith("max-"));
    }
    if (!token.startsWith(prefix)) continue;
    const v = unit(token.slice(prefix.length));
    if (v === null) continue;
    if (mobileOverride) override = v;
    else base = v;
  }
  return override ?? base;
}

function has(classes: string[], token: string): boolean {
  return classes.some((c) => c === token || (c.includes(":") && c.split(":").pop() === token));
}

/**
 * A `before:-inset-*` hit-area expansion only renders when the pseudo-element
 * actually exists and is positioned against a positioned parent.
 */
function insetBonus(classes: string[]): number {
  const wired =
    classes.some((c) => /^(?:[\w-]+:)*before:absolute$/.test(c)) &&
    classes.some((c) => /^(?:[\w-]+:)*before:content-\[/.test(c)) &&
    classes.some((c) => /^(?:[\w-]+:)*(relative|absolute|fixed|sticky)$/.test(c));
  if (!wired) return 0;
  let bonus = 0;
  for (const c of classes) {
    const m = c.match(/before:-inset-(\S+)$/);
    if (m) {
      const v = unit(m[1]);
      if (v && Number.isFinite(v)) bonus = Math.max(bonus, v * 2);
    }
  }
  return bonus;
}

const TEXT_LINE_PX: Record<string, number> = {
  "text-xs": 16, "text-sm": 20, "text-base": 24, "text-lg": 28, "text-xl": 28, "text-2xl": 32,
};

/** Line box of the control's own text, or of its first child's text class. */
function lineBox(classes: string[], body: string): number {
  const from = (list: string[]): number | null => {
    for (const c of list) {
      const token = c.includes(":") ? (c.split(":").pop() as string) : c;
      if (TEXT_LINE_PX[token]) return TEXT_LINE_PX[token];
      const arb = /^text-\[(\d+(?:\.\d+)?)px\]$/.exec(token);
      if (arb) return Math.round(Number(arb[1]) * 1.35);
    }
    return null;
  };
  const own = from(classes);
  if (own !== null) return own;
  const childClasses = Array.from(body.slice(0, 400).matchAll(/className="([^"]*)"/g)).flatMap((m) => m[1].split(/\s+/));
  return from(childClasses) ?? 20;
}

function attrValue(tagText: string, name: string): string | null {
  const m = tagText.match(new RegExp(`${name}=(?:"([^"]*)"|\\{"([^"]*)"\\})`));
  return m ? (m[1] ?? m[2] ?? null) : null;
}

/**
 * Horizontal content estimate. A text button is as wide as its label, so the
 * old `px * 2 + 20` guess flagged every `px-2` label button. Only icon-only
 * controls and very short literal labels are narrow enough to matter; anything
 * with dynamic content is unknown and is not guessed at.
 */
export function contentWidthPx(body: string): number | null {
  const closing = body.search(/<\/[A-Za-z]/);
  const inner = closing === -1 ? body : body.slice(0, closing);
  if (/\{/.test(inner)) return null; // dynamic label: unknown width
  const text = inner.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
  if (text.length) return Math.round(text.length * 7);
  const icon = /\bh-(\d+(?:\.\d+)?)\b/.exec(inner);
  if (icon) return Number(icon[1]) * 4;
  return null;
}

function measureClasses(tagText: string, tag: string, classes: string[], body: string) {
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

  if (height === null && (tag === "Button" || tag === "Input" || tag === "SelectTrigger" || tag === "Textarea")) {
    const variant = attrValue(tagText, "size") ?? "default";
    height = BUTTON_SIZE_PX[variant] ?? 44;
  }
  if (height === null && PRIMITIVE_SAFE.has(tag)) height = COMPONENT_DEFAULT_PX[tag] ?? 44;

  if (height === null && py !== null) height = py * 2 + lineBox(classes, body);
  if (width === null && px !== null) {
    const content = contentWidthPx(body);
    width = content === null ? null : px * 2 + content;
  }
  // A full-width control spans the viewport; that dimension is not the risk.
  if (width === null && (has(classes, "w-full") || has(classes, "flex-1") || has(classes, "grow"))) width = 360;

  return {
    classes,
    height: height === null ? null : height + bonus,
    width: width === null ? null : width + bonus,
    bonus,
  };
}

/** Worst-case measurement across every branch the className can take. */
export function measure(tagText: string, tag: string, body = "", consts: Consts = new Map()) {
  const variants = classNameVariants(tagText, consts);
  if (!variants.length) return measureClasses(tagText, tag, [], body);
  let worst = measureClasses(tagText, tag, variants[0], body);
  for (const classes of variants.slice(1)) {
    const candidate = measureClasses(tagText, tag, classes, body);
    const a = Math.min(candidate.height ?? Number.POSITIVE_INFINITY, candidate.width ?? Number.POSITIVE_INFINITY);
    const b = Math.min(worst.height ?? Number.POSITIVE_INFINITY, worst.width ?? Number.POSITIVE_INFINITY);
    if (a < b) worst = candidate;
  }
  return worst;
}

interface Tag {
  tag: string;
  text: string;
  index: number;
  end: number;
}

function* eachTag(source: string): Generator<Tag> {
  for (let i = 0; i < source.length; i += 1) {
    if (source[i] !== "<") continue;
    const nameMatch = /^<([A-Za-z][A-Za-z0-9_.]*)/.exec(source.slice(i, i + 40));
    if (!nameMatch) continue;
    const read = readOpeningTag(source, i);
    if (!read) continue;
    yield { tag: nameMatch[1], text: read.text, index: i, end: read.end };
  }
}

const lineOf = (source: string, index: number) => source.slice(0, index).split("\n").length;

/** Links inline in a sentence are exempt from WCAG 2.5.5; block links are not. */
function isInlineTextLink(tagText: string, classes: string[]): boolean {
  if (/\basChild\b/.test(tagText)) return true; // the child is the control and is scanned on its own
  if (!/className=/.test(tagText)) return true; // bare inline link
  const blockish = ["flex", "inline-flex", "grid", "block", "inline-block", "absolute", "fixed", "sticky"];
  if (blockish.some((c) => has(classes, c))) return false;
  if (classes.some((c) => /^(h|w|min-h|min-w|size|p|px|py)-/.test(c.split(":").pop() as string))) return false;
  return true;
}

export function scanSource(rawSource: string, file: string): Violation[] {
  const out: Violation[] = [];
  const source = rawSource;
  const consts = collectConsts(source);
  for (const { tag, text, index, end } of eachTag(source)) {
    const clickable = /\bonClick=/.test(text) || /\bonChange=/.test(text) || /\brole="button"/.test(text);
    const interactive = RAW_TAGS.has(tag) || COMPONENT_TAGS.has(tag) || clickable;
    if (!interactive) continue;
    if (tag === "input" && /type="hidden"/.test(text)) continue;
    if (tag === "textarea" || tag === "Textarea") continue; // multi-line inputs are sized by rows
    if (/\bclassName="(?:[^"]*\s)?(hidden|sr-only)(?:\s[^"]*)?"/.test(text)) continue;
    if (tag === "label" && !clickable && !/cursor-pointer/.test(text)) continue;
    if (DELEGATING.has(tag)) continue; // the child owns the box; the child is scanned on its own

    const body = source.slice(end, end + 500);
    let measured;
    try {
      measured = measure(text, tag, body, consts);
    } catch (error) {
      out.push({
        file,
        line: lineOf(source, index),
        tag,
        reason: `className expression could not be enumerated: ${(error as Error).message}`,
        snippet: text.replace(/\s+/g, " ").slice(0, 150),
      });
      continue;
    }
    const { height, width, classes } = measured;

    if (LINK_TAGS.has(tag) && isInlineTextLink(text, classes)) continue;

    if (height === null && width === null) {
      if (COMPONENT_TAGS.has(tag) && !LINK_TAGS.has(tag)) {
        out.push({
          file,
          line: lineOf(source, index),
          tag,
          reason: "interactive component declares no box (no className, no primitive default)",
          snippet: text.replace(/\s+/g, " ").slice(0, 150),
        });
        continue;
      }
      if (!RAW_TAGS.has(tag) && !LINK_TAGS.has(tag)) continue;
      const sole = /^\s*<([A-Z][A-Za-z0-9]*)\s+className="([^"]*)"\s*\/>\s*<\//.exec(body);
      if (sole && !COMPONENT_TAGS.has(sole[1])) {
        const iconPx = Number(/\bh-([0-9.]+)/.exec(sole[2])?.[1] ?? "0") * 4;
        out.push({
          file,
          line: lineOf(source, index),
          tag,
          reason: `icon-only, no box declared (icon≈${iconPx}px)`,
          snippet: `${classes.join(" ")} :: ${text.replace(/\s+/g, " ").slice(0, 150)}`,
        });
        continue;
      }
      out.push({
        file,
        line: lineOf(source, index),
        tag,
        reason: "no box declared (height collapses to the text line)",
        snippet: `${classes.join(" ")} :: ${text.replace(/\s+/g, " ").slice(0, 150)}`,
      });
      continue;
    }

    const failed: string[] = [];
    if (height !== null && height < MIN_TARGET_PX) failed.push(`height≈${height}px`);
    if (width !== null && width < MIN_TARGET_PX) failed.push(`width≈${width}px`);
    if (!failed.length) continue;
    out.push({
      file,
      line: lineOf(source, index),
      tag,
      reason: failed.join(" "),
      snippet: `${classes.join(" ")} :: ${text.replace(/\s+/g, " ").slice(0, 150)}`,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* rule 2 — keyboard operability                                        */
/* ------------------------------------------------------------------ */

/** Tags that are focusable and key-activatable by the platform. */
const NATIVE_INTERACTIVE = new Set([
  ...RAW_TAGS, "Link", "NavLink", ...Array.from(COMPONENT_TAGS).filter((t) => !DELEGATING.has(t)),
]);

/**
 * Elements that render real, non-interactive DOM. An `onClick` on any of these
 * is a mouse-only control. Capitalised shadcn wrappers are included because
 * `<Card onClick>` and `<TableRow onClick>` are plain `div`/`tr` at runtime —
 * the lowercase-only list is what kept `storefront/ProductCard` invisible.
 * Locally defined or imported *application* components are excluded: there the
 * `onClick` is a prop, and the DOM it lands on is scanned in its own file.
 */
const KEYBOARD_DOM_TAGS = new Set([
  "div", "span", "li", "ul", "ol", "tr", "td", "th", "p", "section", "article", "header", "footer",
  "nav", "img", "figure", "main", "aside", "form", "table", "tbody", "thead", "svg", "path",
  "Card", "CardHeader", "CardContent", "CardFooter", "CardTitle", "CardDescription",
  "TableRow", "TableCell", "TableHead", "Badge", "Avatar", "AvatarImage", "Separator", "Alert",
]);

/** Container roles: not controls, but they must still be escapable. */
const CONTAINER_ROLES = new Set(["dialog", "alertdialog", "menu", "listbox", "tablist", "grid"]);

const INTERACTIVE_ROLES = new Set([
  "button", "link", "menuitem", "menuitemcheckbox", "menuitemradio", "option", "tab", "checkbox",
  "radio", "switch", "combobox", "treeitem",
]);

export function scanKeyboardSource(rawSource: string, file: string): Violation[] {
  const out: Violation[] = [];
  for (const { tag, text, index } of eachTag(rawSource)) {
    if (NATIVE_INTERACTIVE.has(tag) || DELEGATING.has(tag)) continue;
    if (!KEYBOARD_DOM_TAGS.has(tag)) continue;
    if (ownAttrIndex(text, "onClick=") === -1) continue;
    const missing: string[] = [];
    const role = attrValue(text, "role");
    // A dialog/menu container is dismissed with Escape, not activated: it needs
    // a key handler, but not a control role.
    if (role !== null && CONTAINER_ROLES.has(role)) {
      if (/onKey(?:Down|Up)=/.test(text)) continue;
      out.push({
        file,
        line: lineOf(rawSource, index),
        tag,
        reason: `clickable <${tag}> with role="${role}" has no key handler`,
        snippet: text.replace(/\s+/g, " ").slice(0, 150),
      });
      continue;
    }
    if (role === null || !INTERACTIVE_ROLES.has(role)) missing.push(role === null ? "role" : `interactive role (got "${role}")`);
    const tabIndexRaw = text.match(/tabIndex=\{(-?\d+)\}|tabIndex="(-?\d+)"/);
    const tabIndex = tabIndexRaw ? Number(tabIndexRaw[1] ?? tabIndexRaw[2]) : null;
    if (tabIndex === null) missing.push("tabIndex");
    else if (tabIndex < 0) missing.push(`tabIndex >= 0 (got ${tabIndex})`);
    const keyHandler = text.match(/onKey(?:Down|Up|Press)=\{([^}]*)\}/);
    if (!keyHandler) missing.push("onKeyDown");
    else if (/^\s*\(\s*\)\s*=>\s*(\{\s*\}|undefined|null)\s*$/.test(keyHandler[1])) missing.push("a real key handler");
    if (!missing.length) continue;
    out.push({
      file,
      line: lineOf(rawSource, index),
      tag,
      reason: `clickable <${tag}> missing ${missing.join(", ")}`,
      snippet: text.replace(/\s+/g, " ").slice(0, 150),
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* rule 3 — legibility floor                                            */
/* ------------------------------------------------------------------ */

function toPx(value: number, unitName: string): number {
  switch (unitName) {
    case "rem":
    case "em":
      return value * 16;
    case "pt":
      return value * (96 / 72);
    default:
      return value;
  }
}

/** Print/PDF surfaces laid out at a fixed paper width, never on a phone. */
const FONT_EXEMPT = new Set(["src/components/transactions/TransactionReceipt.tsx"]);

export function scanFontSource(rawSource: string, file: string): Violation[] {
  const out: Violation[] = [];
  if (FONT_EXEMPT.has(file)) return out;
  const push = (line: number, reason: string, snippet: string) =>
    out.push({ file, line, tag: "text", reason, snippet: snippet.trim().slice(0, 150) });

  rawSource.split("\n").forEach((line, i) => {
    for (const m of line.matchAll(/text-\[(\d+(?:\.\d+)?)(px|rem|pt|em)\]/g)) {
      const px = toPx(Number(m[1]), m[2]);
      if (px < MIN_FONT_PX) push(i + 1, `font ${px}px below the ${MIN_FONT_PX}px floor`, line);
      else if (m[0] === "text-xs" || px === MIN_FONT_PX) push(i + 1, `${m[0]} duplicates the \`text-xs\` token — use \`text-xs\``, line);
    }
    for (const m of line.matchAll(/fontSize(?::\s*|=\{)(?:"|')?(\d+(?:\.\d+)?)(px|rem|pt|em)?(?:"|')?/g)) {
      const px = toPx(Number(m[1]), m[2] ?? "px");
      if (px < MIN_FONT_PX) push(i + 1, `inline fontSize ${px}px below the ${MIN_FONT_PX}px floor`, line);
    }
    if (file.endsWith(".css")) {
      for (const m of line.matchAll(/font-size:\s*(\d+(?:\.\d+)?)(px|rem|pt|em)/g)) {
        const px = toPx(Number(m[1]), m[2]);
        if (px < MIN_FONT_PX) push(i + 1, `css font-size ${px}px below the ${MIN_FONT_PX}px floor`, line);
      }
    }
  });
  return out;
}

function scanAll(root: string, fn: (source: string, file: string) => Violation[], exts = [".tsx"]): Violation[] {
  return sourceFiles(root, exts).flatMap((absolute) =>
    fn(readFileSync(absolute, "utf8"), relative(process.cwd(), absolute).replace(/\\/g, "/")),
  );
}

export const scanRepo = (root: string) => scanAll(root, scanSource);
export const scanKeyboardRepo = (root: string) => scanAll(root, scanKeyboardSource);
export const scanFontRepo = (root: string) => scanAll(root, scanFontSource, [".tsx", ".ts", ".css"]);
