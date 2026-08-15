import { readFileSync, writeFileSync } from "node:fs";
import { scanSource, readOpeningTag, measure, tsxFiles } from "./src/__tests__/helpers/touch-target-scan";
import { relative } from "node:path";

function insetFor(px: number) { const n = Math.ceil((44 - px) / 2 / 4); return n <= 2 ? "2" : n <= 3 ? "3" : n <= 4 ? "4" : "5"; }

let edits = 0;
for (const abs of tsxFiles("src")) {
  const file = relative(process.cwd(), abs).replace(/\\/g, "/");
  if (file.includes("__tests__")) continue;
  let source = readFileSync(abs, "utf8");
  for (let pass = 0; pass < 4; pass += 1) {
    if (!scanSource(source, file).length) break;
    const positions: number[] = [];
    for (let i = 0; i < source.length; i += 1) {
      if (source[i] !== "<") continue;
      if (!/^<([A-Za-z][A-Za-z0-9_.]*)/.test(source.slice(i, i + 40))) continue;
      const read = readOpeningTag(source, i);
      if (!read || !scanSource(read.text + "</x>", file).length) continue;
      positions.push(i);
    }
    if (!positions.length) break;
    let did = false;
    for (const start of positions.reverse()) {
      const tag = /^<([A-Za-z][A-Za-z0-9_.]*)/.exec(source.slice(start, start + 40))![1];
      const text = readOpeningTag(source, start)!.text;
      const { height, width, classes } = measure(text, tag);
      const h = height ?? 0, w = width ?? 0;
      const hasH = classes.some((c) => /^(h|size)-[\d.]+$/.test(c));
      let add: string[] = [];
      if (hasH && w && Math.abs(h - w) <= 4 && h < 44) add = ["relative", "before:absolute", `before:-inset-${insetFor(h)}`, "before:content-['']"];
      else if (!hasH) add = ["min-h-11", ...(w < 44 && width !== null && !classes.some((c) => c.startsWith("w-")) ? ["min-w-11", "justify-center"] : [])];

      // own className index
      let idx = -1, depth = 0, quote: string | null = null;
      for (let i = 0; i < text.length; i += 1) {
        const ch = text[i];
        if (quote) { if (ch === "\\") i += 1; else if (ch === quote) quote = null; continue; }
        if (ch === '"' || ch === "'" || ch === "`") quote = ch;
        else if (ch === "{") depth += 1; else if (ch === "}") depth -= 1;
        else if (depth === 0 && text.startsWith("className=", i)) { idx = i; break; }
      }
      if (idx === -1) continue;
      const after = idx + "className=".length;
      if (text[after] !== "{") continue;
      // balanced expression
      let d = 0, q: string | null = null, expr = "";
      for (let i = after; i < text.length; i += 1) {
        const ch = text[i];
        if (q) { if (ch === "\\") i += 1; else if (ch === q) q = null; continue; }
        if (ch === '"' || ch === "'" || ch === "`") q = ch;
        else if (ch === "{") d += 1;
        else if (ch === "}") { d -= 1; if (!d) { expr = text.slice(after, i + 1); break; } }
      }
      const bt = expr.indexOf("`");
      if (bt === -1) continue;
      const btEnd = expr.lastIndexOf("`");
      let tpl = expr.slice(bt + 1, btEnd);
      // 1. strip classes previously injected inside ${ } branches
      tpl = tpl.replace(/\$\{[\s\S]*?\}/g, (seg) => seg.replace(/\s*\bmin-h-11\b/g, ""));
      // 2. normalise heights in the static parts
      const staticFix = (s: string) => s.replace(/(^|\s)(h|size)-[\d.]+(?=\s|$)/g, (m, sp) => (hasH && !(w && Math.abs(h - w) <= 4 && h < 44) ? `${sp}h-11` : m));
      tpl = tpl.split(/(\$\{[\s\S]*?\})/).map((part) => (part.startsWith("${") ? part : staticFix(part))).join("");
      // 3. append the needed utilities to the static tail
      const missing = add.filter((a) => !tpl.includes(a));
      if (missing.length) tpl = `${tpl}${tpl.endsWith(" ") ? "" : " "}${missing.join(" ")}`;
      const newExpr = expr.slice(0, bt + 1) + tpl + expr.slice(btEnd);
      if (newExpr === expr) continue;
      const newText = text.slice(0, after) + newExpr + text.slice(after + expr.length);
      source = source.slice(0, start) + newText + source.slice(start + text.length);
      edits += 1; did = true;
    }
    if (!did) break;
  }
  writeFileSync(abs, source);
}
console.log("edits", edits);
