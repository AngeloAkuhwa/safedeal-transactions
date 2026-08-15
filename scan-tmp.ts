import { scanRepo } from "./src/__tests__/helpers/touch-target-scan";
const v = scanRepo("src");
for (const x of v) console.log(`${x.file}:${x.line} <${x.tag}> ${x.reason} | ${x.snippet}`);
console.log("TOTAL", v.length);
