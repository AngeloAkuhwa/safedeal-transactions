/**
 * Touch-target / mobile-affordance scanner.
 *
 * Parses full JSX opening tags (brace/string aware, so `onClick={() => …}` does
 * not terminate the tag), understands capitalised shadcn components, resolves
 * `cn(...)` / template-literal className arguments down to their string
 * literals, and models h-/w-/size-/min-h-/padding utilities plus shadcn
 * `size="sm" | "icon"` variants.
 *
 * Branch awareness (Phase 1d): a className expression containing `cond ? "a" : "b"`
 * produces one class-set per branch and the *worst* branch is scored. Crediting
 * a hit-area expansion that only exists in one state is how a 16px unselected
 * radio row passed the previous scanner.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export const MIN_TARGET_PX = 44;
export const MIN_FONT_PX = 12;

/** Raw lowercase interactive elements. */
const RAW_TAGS = new Set(["button", "a", "input", "select", "textarea", "summary", "label"]);

/** Non-interactive tags that become controls the moment they take an onClick. */
const NON_INTERACTIVE_TAGS = new Set([
  "div", "span", "li", "tr", "td", "p", "section", "article", "header", "footer", "nav", "img", "figure",
]);

/**
 * Capitalised components that render a real interactive control, mapped to the
 * height their own primitive guarantees when the call site declares no box.
 * `null` = the primitive declares no box, so a call site without sizing classes
 * is a violation (this is what kept `BreadcrumbLink` invisible for two rounds).
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
  // Router links: the box belongs to whatever they wrap (a Button, a card, or
  // prose). WCAG 2.5.5 exempts links inline in a block of text, and the child
  // control is scanned on its own, so the wrapper itself is not measured.
  Link: null,
  NavLink: null,
  // Render-prop wrapper from react-hook-form: it renders no DOM of its own.
  FormField: null,
};
const COMPONENT_TAGS = new Set(Object.keys(COMPONENT_DEFAULT_PX));

/** Components whose primitive owns the hit area, so a bare call site is fine. */
const PRIMITIVE_SAFE = new Set(
  Object.entries(COMPONENT_DEFAULT_PX).filter(([, v]) => v !== null).map(([k]) => k),
);

/** Wrappers that delegate their box to their child (asChild / render-prop style). */
const DELEGATING = new Set([
  "DropdownMenuTrigger", "PopoverTrigger", "TooltipTrigger", "SheetTrigger", "DialogTrigger",
  "Link", "NavLink", "FormField",
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

const LITERAL_RE = /"([^"]*)"|'([^']*)'|`([^`]*)`/g;

/**
 * Enumerate the class-sets an expression can produce, one per ternary branch
 * combination. Literals outside any ternary are shared by every variant.
 */
export function literalVariants(expr: string): string[][] {
  // Replace `? <literal> : <literal>` pairs with placeholders and record options.
  const branches: Array<[string, string]> = [];
  const reduced = expr.replace(
    /\?\s*(?:"([^"]*)"|'([^']*)'|`([^`]*)`)\s*:\s*(?:"([^"]*)"|'([^']*)'|`([^`]*)`)/g,
    (_m, a1, a2, a3, b1, b2, b3) => {
      branches.push([a1 ?? a2 ?? a3 ?? "", b1 ?? b2 ?? b3 ?? ""]);
      return "?__BRANCH__:__BRANCH__";
    },
  );
  const base: string[] = [];
  for (const m of reduced.matchAll(LITERAL_RE)) base.push(m[1] ?? m[2] ?? m[3] ?? "");
  if (!branches.length) return [base];
  let variants: string[][] = [base];
  for (const pair of branches.slice(0, 4)) {
    variants = variants.flatMap((v) => pair.map((choice) => [...v, choice]));
  }
  return variants;
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
export function classNameVariants(tagText: string): string[][] {
  const idx = ownAttrIndex(tagText, "className=");
  if (idx === -1) return [];
  const after = idx + "className=".length;
  const ch = tagText[after];
  if (ch === '"') {
    const end = tagText.indexOf('"', after + 1);
    return [tagText.slice(after + 1, end).split(/\s+/).filter(Boolean)];
  }
  if (ch === "{") {
    const expr = readBalanced(tagText, after);
    return literalVariants(expr).map((lits) => lits.flatMap((s) => s.split(/\s+/)).filter(Boolean));
  }
  return [];
}

/** Flat union of every class the tag can render (used by the self-tests). */
export function classNamesOf(tagText: string): string[] {
  const variants = classNameVariants(tagText);
  return Array.from(new Set(variants.flat()));
}

function unit(token: string): number | null {
  if (token === "px") return 1;
  if (token === "full" || token === "auto" || token === "screen") return Number.POSITIVE_INFINITY;
  const bracket = /^\[(\d+(?:\.\d+)?)px\]$/.exec(token);
  if (bracket) return Number(bracket[1]);
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

function measureClasses(tagText: string, tag: string, classes: string[]) {
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

  if (height === null && py !== null) height = py * 2 + 20;
  if (width === null && px !== null) width = px * 2 + 20;

  return {
    classes,
    height: height === null ? null : height + bonus,
    width: width === null ? null : width + bonus,
    bonus,
  };
}

/** Worst-case measurement across every ternary branch the className can take. */
export function measure(tagText: string, tag: string) {
  const variants = classNameVariants(tagText);
  if (!variants.length) return measureClasses(tagText, tag, []);
  let worst = measureClasses(tagText, tag, variants[0]);
  for (const classes of variants.slice(1)) {
    const candidate = measureClasses(tagText, tag, classes);
    const a = candidate.height ?? Number.POSITIVE_INFINITY;
    const b = worst.height ?? Number.POSITIVE_INFINITY;
    if (a < b) worst = candidate;
  }
  return worst;
}

function inlineConstants(rawSource: string): string {
  const consts = new Map<string, string>();
  for (const m of rawSource.matchAll(/\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*"([^"\n]*)"/g)) consts.set(m[1], m[2]);
  let source = rawSource;
  for (const [name, value] of consts) {
    source = source.split(`className={${name}}`).join(`className="${value}"`);
    source = source.split("${" + name + "}").join(value);
  }
  return source;
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

export function scanSource(rawSource: string, file: string): Violation[] {
  const out: Violation[] = [];
  const source = inlineConstants(rawSource);
  for (const { tag, text, index, end } of eachTag(source)) {
    const clickable = /\bonClick=/.test(text) || /\bonChange=/.test(text) || /\brole="button"/.test(text);
    const interactive = RAW_TAGS.has(tag) || COMPONENT_TAGS.has(tag) || clickable;
    if (!interactive) continue;
    if (tag === "input" && /type="hidden"/.test(text)) continue;
    if (tag === "textarea" || tag === "Textarea") continue; // multi-line inputs are sized by rows
    if (tag === "a" && !/className=/.test(text) && !clickable) continue;
    // Visually hidden proxies (file pickers, sr-only inputs): a visible control
    // triggers them, and that control is measured on its own.
    if (/\bclassName="(?:[^"]*\s)?(hidden|sr-only)(?:\s[^"]*)?"/.test(text)) continue;
    // A caption <label> is not a tap target; only labels that are themselves the
    // control surface (wrapping a checkbox, or carrying a handler) count.
    if (tag === "label" && !clickable && !/cursor-pointer/.test(text)) continue;
    if (DELEGATING.has(tag)) continue; // the child owns the box; the child is scanned on its own

    const { height, width, classes } = measure(text, tag);

    if (height === null && width === null) {
      if (COMPONENT_TAGS.has(tag)) {
        // A capitalised interactive component that declares no box and whose
        // primitive declares none either. Previously skipped silently.
        out.push({
          file,
          line: lineOf(source, index),
          tag,
          reason: "interactive component declares no box (no className, no primitive default)",
          snippet: text.replace(/\s+/g, " ").slice(0, 150),
        });
        continue;
      }
      if (!RAW_TAGS.has(tag) || tag === "a") continue;
      const body = source.slice(end, end + 300);
      const sole = /^\s*<([A-Z][A-Za-z0-9]*)\s+className="([^"]*)"\s*\/>\s*<\//.exec(body);
      if (sole && !COMPONENT_TAGS.has(sole[1])) {
        const iconPx = Number(/\bh-([0-9.]+)/.exec(sole[2])?.[1] ?? "0") * 4;
        const inset = Number(/before:-inset-([0-9.]+)/.exec(classes.join(" "))?.[1] ?? "0") * 4;
        if (iconPx + inset * 2 >= MIN_TARGET_PX) continue;
        out.push({
          file,
          line: lineOf(source, index),
          tag,
          reason: `icon-only, no box declared (icon≈${iconPx}px)`,
          snippet: `${classes.join(" ")} :: ${text.replace(/\s+/g, " ").slice(0, 150)}`,
        });
        continue;
      }
      // Text control with no height, min-height or vertical padding of its own:
      // the box collapses to the line-box (≈16-20px). Previously skipped.
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
    if (width !== null && width < MIN_TARGET_PX && height !== null && height < MIN_TARGET_PX) failed.push(`width≈${width}px`);
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

/**
 * Rule 2 — keyboard operability. A non-interactive element carrying `onClick`
 * must declare `role`, `tabIndex` and a key handler, or it cannot be reached
 * without a pointer.
 */
export function scanKeyboardSource(rawSource: string, file: string): Violation[] {
  const out: Violation[] = [];
  for (const { tag, text, index } of eachTag(rawSource)) {
    if (!NON_INTERACTIVE_TAGS.has(tag)) continue;
    if (!/\bonClick=/.test(text)) continue;
    if (ownAttrIndex(text, "onClick=") === -1) continue;
    const missing: string[] = [];
    if (ownAttrIndex(text, "role=") === -1) missing.push("role");
    if (ownAttrIndex(text, "tabIndex=") === -1) missing.push("tabIndex");
    if (!/\bonKey(Down|Up|Press)=/.test(text)) missing.push("onKeyDown");
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

/** Rule 3 — arbitrary font sizes below the legibility floor. */
export function scanFontSource(rawSource: string, file: string): Violation[] {
  const out: Violation[] = [];
  rawSource.split("\n").forEach((line, i) => {
    for (const m of line.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)) {
      if (Number(m[1]) >= MIN_FONT_PX) continue;
      out.push({
        file,
        line: i + 1,
        tag: "text",
        reason: `font ${m[1]}px below the ${MIN_FONT_PX}px floor`,
        snippet: line.trim().slice(0, 150),
      });
    }
  });
  return out;
}

function scanAll(root: string, fn: (source: string, file: string) => Violation[]): Violation[] {
  return tsxFiles(root).flatMap((absolute) =>
    fn(readFileSync(absolute, "utf8"), relative(process.cwd(), absolute).replace(/\\/g, "/")),
  );
}

export const scanRepo = (root: string) => scanAll(root, scanSource);
export const scanKeyboardRepo = (root: string) => scanAll(root, scanKeyboardSource);
export const scanFontRepo = (root: string) => scanAll(root, scanFontSource);
