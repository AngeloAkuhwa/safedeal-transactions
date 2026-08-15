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

describe("mobile table fallbacks", () => {
  it("every table has a card fallback or is stacked", () => {
    const violations: string[] = [];
    for (const absolute of tsxFiles(ROOT)) {
      const file = relative(process.cwd(), absolute).replace(/\\/g, "/");
      if (IGNORED.has(file) || file.includes("__tests__")) continue;
      const source = readFileSync(absolute, "utf8");
      const tables = [...source.matchAll(/<(table|Table)(\s|>)/g)];
      if (!tables.length) continue;
      const stacked = (source.match(/sd-stack/g) ?? []).length;
      const hasCardPath = /md:hidden|sm:hidden|lg:hidden/.test(source);
      if (hasCardPath) continue;
      if (stacked >= tables.length) continue;
      violations.push(`${file}: ${tables.length} table(s), ${stacked} stacked, no card fallback`);
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
});
