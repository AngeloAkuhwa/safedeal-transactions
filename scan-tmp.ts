import { scanRepo, scanKeyboardRepo, scanFontRepo } from "./src/__tests__/helpers/touch-target-scan";
const mode = process.argv[2] ?? "size";
const fn = mode === "kbd" ? scanKeyboardRepo : mode === "font" ? scanFontRepo : scanRepo;
const v = fn("src").filter((x) => !x.file.includes("__tests__"));
for (const x of v) console.log(`${x.file}:${x.line} <${x.tag}> ${x.reason} | ${x.snippet.slice(0, 120)}`);
console.log("TOTAL", v.length);
