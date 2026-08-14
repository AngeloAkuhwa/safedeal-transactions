// @vitest-environment node
/**
 * HOOK-ORDER CLASS GUARD.
 *
 * A hook called after an early `return` inside a component renders a different
 * number of hooks on the loading pass than on the loaded pass, and React throws
 * "Rendered more hooks than during the previous render". This has shipped twice
 * (CartCheckoutReview, StorefrontCheckout), so it is enforced as a class here:
 * eslint's `react-hooks/rules-of-hooks` is run over the whole app on every test
 * run, not just in an editor.
 */
import { describe, it, expect } from "vitest";
import path from "node:path";
import { ESLint } from "eslint";

const PROJECT = path.resolve(__dirname, "..", "..");

describe("no component calls a hook after an early return", () => {
  it("passes react-hooks/rules-of-hooks across src/", async () => {
    const eslint = new ESLint({
      cwd: PROJECT,
      overrideConfigFile: path.join(PROJECT, "eslint.config.js"),
      overrideConfig: [
        { rules: { "react-hooks/rules-of-hooks": "error" } },
      ],
      ignore: true,
    });
    const results = await eslint.lintFiles(["src/**/*.{ts,tsx}"]);
    const offenders = results.flatMap((r) =>
      r.messages
        .filter((m) => m.ruleId === "react-hooks/rules-of-hooks")
        .map((m) => `${path.relative(PROJECT, r.filePath)}:${m.line} ${m.message}`),
    );
    expect(offenders).toEqual([]);
  }, 180_000);
});
