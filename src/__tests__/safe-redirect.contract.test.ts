/**
 * @vitest-environment node
 *
 * The redirect target has one validator, and everything goes through it.
 *
 * An audit found three consumers of the `redirect` query param and the
 * `safedeal_redirect` sessionStorage key, of which exactly one validated the
 * value before navigating to it. Auth.tsx stored whatever arrived in the URL
 * and navigated it; LoginForm did the same on login. React Router's history
 * layer happens to reject cross-origin pushState, so this was not a working
 * open redirect, but that protection is the browser's accident rather than
 * this codebase's decision, and one future `window.location = stored` would
 * have armed it.
 *
 * Two contracts below:
 *
 * 1. The validator itself refuses the shapes that matter: protocol-relative
 *    URLs ("//evil.com"), absolute URLs, scheme smuggling, empty values.
 *
 * 2. No file outside src/lib/safe-redirect.ts touches the storage key
 *    directly. A consumer that reaches around the module and reads
 *    sessionStorage itself is exactly how the original three-way drift
 *    happened, so the single copy is enforced rather than hoped for.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { isSafeRelativePath } from "@/lib/safe-redirect";

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__") continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe("safe redirect", () => {
  it("accepts app-internal paths", () => {
    expect(isSafeRelativePath("/dashboard")).toBe(true);
    expect(isSafeRelativePath("/t/abc123/pay")).toBe(true);
    expect(isSafeRelativePath("/store/shop/item?qty=2")).toBe(true);
  });

  it("refuses everything that could leave the app", () => {
    // Protocol-relative: the browser reads "//evil.com" as scheme-inherited
    // https://evil.com. This is the shape the single leading "/" check exists
    // to catch, and the one a naive startsWith("/") test lets through.
    expect(isSafeRelativePath("//evil.com")).toBe(false);
    expect(isSafeRelativePath("//evil.com/dashboard")).toBe(false);
    expect(isSafeRelativePath("https://evil.com")).toBe(false);
    expect(isSafeRelativePath("http://evil.com/x")).toBe(false);
    // A scheme needs ":" before the first "/", so requiring a leading "/"
    // forecloses javascript: and data: without naming them.
    expect(isSafeRelativePath("javascript:alert(1)")).toBe(false);
    expect(isSafeRelativePath("")).toBe(false);
    expect(isSafeRelativePath(null)).toBe(false);
    expect(isSafeRelativePath(undefined)).toBe(false);
  });

  it("is the only owner of the storage key", () => {
    const offenders: string[] = [];
    for (const file of walk("src")) {
      if (file.endsWith("lib/safe-redirect.ts")) continue;
      const src = readFileSync(file, "utf8");
      if (src.includes('"safedeal_redirect"') || src.includes("'safedeal_redirect'")) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});
