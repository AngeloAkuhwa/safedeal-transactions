import { readFileSync, writeFileSync } from "node:fs";
import { scanSource, tsxFiles, readOpeningTag, measure } from "./src/__tests__/helpers/touch-target-scan";
import { relative } from "node:path";

const files = tsxFiles("src");
let changed = 0, edits = 0;

function insetFor(px: number) {
  const need = Math.ceil((44 - px) / 2 / 4); // tailwind units of 4px
  return need <= 2 ? "2" : need <= 3 ? "3" : need <= 4 ? "4" : "5";
}

for (const abs of files) {
  const file = relative(process.cwd(), abs).replace(/\\/g, "/");
  if (file.includes("__tests__")) continue;
  let source = readFileSync(abs, "utf8");
  let touched = false;

  for (let pass = 0; pass < 6; pass += 1) {
    const v = scanSource(source, file);
    if (!v.length) break;
    let didOne = false;
    // apply from the end so offsets stay valid; one pass rewrites all
    const positions: number[] = [];
    for (let i = 0; i < source.length; i += 1) {
      if (source[i] !== "<") continue;
      const nm = /^<([A-Za-z][A-Za-z0-9_.]*)/.exec(source.slice(i, i + 40));
      if (!nm) continue;
      const read = readOpeningTag(source, i);
      if (!read) continue;
      if (!scanSource(read.text + "</x>", file).length) continue;
      positions.push(i);
    }
    for (const start of positions.reverse()) {
      const nm = /^<([A-Za-z][A-Za-z0-9_.]*)/.exec(source.slice(start, start + 40))!;
      const tag = nm[1];
      const read = readOpeningTag(source, start)!;
      const text = read.text;
      const { height, width, classes } = measure(text, tag);
      const h = height ?? 0;
      const w = width ?? 0;
      const hasH = classes.some((c) => /^h-[\d.]+$/.test(c) || /^size-[\d.]+$/.test(c));
      let add: string[] = [];
      let replaceH: string | null = null;

      if (tag === "Checkbox") {
        // never shrink the 44px primitive
        replaceH = "__DROP__";
      } else if (hasH && w && Math.abs(h - w) <= 4 && h < 44) {
        if (classes.some((c) => c.startsWith("before:-inset-"))) continue;
        add = ["relative", `before:absolute`, `before:-inset-${insetFor(h)}`, `before:content-['']`];
        if (classes.includes("relative")) add = add.slice(1);
      } else if (hasH) {
        replaceH = "h-11";
      } else {
        add = ["min-h-11"];
        if ((tag === "a" || tag === "Link" || tag === "NavLink" || tag === "li") && !classes.some((c) => c.includes("flex"))) add.push("inline-flex", "items-center");
      }

      // locate own className value
      const idx = (() => {
        let depth = 0, quote: string | null = null;
        for (let i = 0; i < text.length; i += 1) {
          const ch = text[i];
          if (quote) { if (ch === "\\") i += 1; else if (ch === quote) quote = null; continue; }
          if (ch === '"' || ch === "'" || ch === "`") quote = ch;
          else if (ch === "{") depth += 1;
          else if (ch === "}") depth -= 1;
          else if (depth === 0 && text.startsWith("className=", i)) return i;
        }
        return -1;
      })();

      let newText = text;
      const mutate = (literal: string) => {
        let parts = literal.split(/\s+/).filter(Boolean);
        if (replaceH === "__DROP__") {
          parts = parts.filter((c) => !/^(h|w|size)-[\d.]+$/.test(c));
        } else if (replaceH) {
          parts = parts.map((c) => (/^h-[\d.]+$/.test(c) ? "h-11" : /^size-[\d.]+$/.test(c) ? "h-11" : c));
          parts = parts.filter((c) => !/^min-h-[\d.]+$/.test(c) || Number(c.slice(6)) >= 11);
        }
        for (const a of add) if (!parts.includes(a)) parts.push(a);
        return parts.join(" ");
      };

      if (idx === -1) {
        if (replaceH === "__DROP__") continue;
        const selfClose = newText.endsWith("/>");
        newText = newText.slice(0, selfClose ? -2 : -1).trimEnd() + ` className="${add.join(" ")}"` + (selfClose ? " />" : ">");
      } else {
        const after = idx + "className=".length;
        if (text[after] === '"') {
          const end = text.indexOf('"', after + 1);
          newText = text.slice(0, after + 1) + mutate(text.slice(after + 1, end)) + text.slice(end);
        } else if (text[after] === "{") {
          // rewrite the first string literal that carries a height/size class, else the first literal
          const expr = (() => { let d = 0, q: string | null = null; for (let i = after; i < text.length; i += 1) { const ch = text[i]; if (q) { if (ch === "\\") i += 1; else if (ch === q) q = null; continue; } if (ch === '"' || ch === "'" || ch === "`") q = ch; else if (ch === "{") d += 1; else if (ch === "}") { d -= 1; if (!d) return text.slice(after, i + 1); } } return text.slice(after); })();
          const lits = [...expr.matchAll(/"([^"]*)"|'([^']*)'|`([^`\$]*)`/g)];
          if (!lits.length) continue;
          const target = lits.find((m) => /(^|\s)(h|size|min-h)-[\d.]+(\s|$)/.test(m[1] ?? m[2] ?? m[3] ?? "")) ?? lits[0];
          const raw = target[1] ?? target[2] ?? target[3] ?? "";
          const q = target[0][0];
          const replaced = expr.slice(0, target.index!) + q + mutate(raw) + q + expr.slice(target.index! + target[0].length);
          newText = text.slice(0, after) + replaced + text.slice(after + expr.length);
        } else continue;
      }
      if (newText === text) continue;
      source = source.slice(0, start) + newText + source.slice(start + text.length);
      touched = true; didOne = true; edits += 1;
    }
    if (!didOne) break;
  }
  if (touched) { writeFileSync(abs, source); changed += 1; }
}
console.log("files changed", changed, "edits", edits);
