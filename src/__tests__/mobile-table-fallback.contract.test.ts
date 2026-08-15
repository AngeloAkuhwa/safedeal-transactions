/**
 * Inverted contract: no data table may ship without a mobile path.
 * A file passes when every table it renders either has a hand-written
 * card fallback (a `md:hidden` block next to a `hidden md:` table) or opts
 * into the shared stacked-table treatment (`sd-stack`, see index.css).
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(process.cwd(), "src");

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? tsxFiles(path) : path.endsWith(".tsx") ? [path] : [];
  });
}

const IGNORED = new Map<string, string>([
  ["src/components/ui/table.tsx", "shadcn primitive; consumers opt into sd-stack"],
  [
    "src/components/transactions/TransactionReceipt.tsx",
    "print/PDF receipt rendered with inline styles at a fixed paper width, never laid out on a phone viewport",
  ],
]);

/** Read the opening tag text starting at a `<table`/`<Table` match. */
function readOpeningTag(source: string, start: number): string {
  let i = start;
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
    else if (ch === ">" && depth === 0) return source.slice(start, i + 1);
    i += 1;
  }
  return source.slice(start);
}

/**
 * Does this specific table have its own mobile fallback? The tag itself may
 * carry `sd-stack`, or be `hidden md:table`/`hidden sm:table`; more commonly
 * in this codebase the table is wrapped in an ancestor `<div className="hidden
 * ... md:block">` a short distance above it, with a sibling `md:hidden`/
 * `sm:hidden` card block elsewhere in the file — both count.
 */
function tableTagHasFallback(tagText: string, source: string, tableStart: number): boolean {
  if (/\bsd-stack\b/.test(tagText)) return true;
  const ownTagHidden = /hidden\s+(?:md|sm):table\b/.test(tagText);
  const ancestorWindow = source.slice(Math.max(0, tableStart - 400), tableStart);
  const ancestorHidden = /className="[^"]*\bhidden\b[^"]*\b(?:md|sm|lg|xl):block\b[^"]*"/.test(ancestorWindow)
    || /className="[^"]*\b(?:md|sm|lg|xl):block\b[^"]*\bhidden\b[^"]*"/.test(ancestorWindow);
  if (!ownTagHidden && !ancestorHidden) return false;
  return /\b(md|sm|lg|xl):hidden\b/.test(source);
}

describe("mobile table fallbacks", () => {
  it("every table has a card fallback or is stacked", () => {
    const violations: string[] = [];
    for (const absolute of tsxFiles(ROOT)) {
      const file = relative(process.cwd(), absolute).replace(/\\/g, "/");
      if (IGNORED.has(file) || file.includes("__tests__")) continue;
      const source = readFileSync(absolute, "utf8");
      const tableStarts = [...source.matchAll(/<(table|Table)(\s|>)/g)].map((m) => m.index!);
      if (!tableStarts.length) continue;
      for (const start of tableStarts) {
        const tag = readOpeningTag(source, start);
        if (!tableTagHasFallback(tag, source, start)) {
          violations.push(`${file}: <table> at offset ${start} has no sd-stack and no hidden md:table/md:hidden sibling`);
        }
      }
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("documents a reason for every exempt file", () => {
    for (const reason of IGNORED.values()) expect(reason.length).toBeGreaterThan(20);
  });

  it("the stacked-table labeller mirrors headers into cells", async () => {
    document.body.innerHTML = `
      <table class="sd-stack">
        <thead><tr><th>Ref</th><th>Amount</th></tr></thead>
        <tbody><tr><td>ABC</td><td>N100</td></tr></tbody>
      </table>`;
    const { labelStackedTables } = await import("@/lib/stacked-tables");
    labelStackedTables();
    const cells = Array.from(document.querySelectorAll("td")).map((c) => c.getAttribute("data-label"));
    expect(cells).toEqual(["Ref", "Amount"]);
  });

  it("the labeller advances past colSpan and never mislabels a spanning cell", async () => {
    document.body.innerHTML = `
      <table class="sd-stack">
        <thead><tr><th>Ref</th><th>Amount</th><th>Status</th></tr></thead>
        <tbody>
          <tr><td colspan="2">Header row</td><td>OK</td></tr>
          <tr><td>ABC</td><td>N100</td><td>Pending</td></tr>
        </tbody>
      </table>`;
    const { labelStackedTables } = await import("@/lib/stacked-tables");
    labelStackedTables();
    const rows = Array.from(document.querySelectorAll("tbody tr"));
    const [spanningRow, plainRow] = rows;
    const spanningCells = Array.from(spanningRow.cells);
    expect(spanningCells[0].hasAttribute("data-label")).toBe(false);
    expect(spanningCells[1].getAttribute("data-label")).toBe("Status");
    const plainCells = Array.from(plainRow.cells).map((c) => c.getAttribute("data-label"));
    expect(plainCells).toEqual(["Ref", "Amount", "Status"]);
  });

  it("every desktop-only field also appears in the file's mobile card branch", () => {
    const violations: string[] = [];
    for (const absolute of tsxFiles(ROOT)) {
      const file = relative(process.cwd(), absolute).replace(/\\/g, "/");
      if (IGNORED.has(file) || file.includes("__tests__")) continue;
      const source = readFileSync(absolute, "utf8");
      if (!/<(table|Table)(\s|>)/.test(source)) continue;

      // Split the file into a "desktop" region (inside hidden md:block / TableCell)
      // and a "mobile" region (inside md:hidden / sm:hidden) using the same
      // marker comments/classes the codebase already uses to separate them.
      const mobileMarker = /(md:hidden|sm:hidden)/;
      if (!mobileMarker.test(source)) continue; // sd-stack tables have no separate mobile branch to check

      // crude but effective: find the desktop block (everything from the first
      // `hidden md:block`/`hidden md:table`/Table opening down to its matching
      // sibling), and the mobile block (`md:hidden`/`sm:hidden` container).
      const desktopIdx = source.search(/hidden\s+(?:md|lg):block|<Table[\s>]/);
      const mobileIdx = source.search(mobileMarker);
      if (desktopIdx === -1 || mobileIdx === -1) continue;

      const [mobileRegion, desktopRegion] = mobileIdx < desktopIdx
        ? [source.slice(mobileIdx, desktopIdx), source.slice(desktopIdx)]
        : [source.slice(0, desktopIdx), source.slice(desktopIdx)];

      // Identifiers referenced as `x.y` or `x?.y` inside TableCell/<td> blocks
      // on the desktop side — this is a heuristic scan, not a full parser.
      const idents = new Set<string>();
      const cellRe = /<(?:TableCell|td)\b[^>]*>([\s\S]*?)<\/(?:TableCell|td)>/g;
      let m: RegExpExecArray | null;
      while ((m = cellRe.exec(desktopRegion))) {
        const body = m[1];
        for (const im of body.matchAll(/\b([a-zA-Z_$][\w$]*(?:\??\.[a-zA-Z_$][\w$]*)+)\b/g)) {
          idents.add(im[1]);
        }
      }
      for (const ident of idents) {
        // The leaf property name is what matters for parity (e.g. `isUrgent`
        // out of `d.isUrgent`); the mobile branch may reach it via a
        // differently-named local variable derived from the same field.
        const leaf = ident.split(/\??\./).pop()!;
        if (!mobileRegion.includes(leaf)) {
          violations.push(`${file}: desktop-only field "${leaf}" (from ${ident}) missing from the mobile card branch`);
        }
      }
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });
});
