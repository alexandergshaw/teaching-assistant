// A23 wave step 0 (RES-A23-13). Reconstructs docs/a23-architecture.md
// section 3.2's shape probe: the AST classifier against valueImportSpecifiers,
// guard 1's line classifier and the unconditional sweep, over the construct
// list, both quote styles. Run: node docs/a23/a23-shape-probe.mjs
import { scanRuntimeEdges } from "./_lib.mjs";

const SPEC = "@/lib/grade";
const BANNED = [
  /from ["']@\/lib\/grade["']/,
  /from ["']@\/lib\/grade\//,
  /from ["']@\/lib\/supabase\/server["']/,
  /from ["']next\/headers["']/,
];
const IMPORT_RE = /^\s*(?:import|export)\s+(type\s+)?(?:[\w*{}\s,]*?)\s*from\s+"([^"]+)"/gm;
function valueImportSpecifiers(source) {
  const found = [];
  for (const match of source.matchAll(IMPORT_RE)) {
    if (match[1]) continue;
    const braces = /\{([^}]*)\}/.exec(match[0]);
    if (braces) {
      const parts = braces[1].split(",").map((p) => p.trim()).filter(Boolean);
      if (parts.length > 0 && parts.every((p) => p.startsWith("type "))) continue;
    }
    found.push(match[2]);
  }
  return found;
}
function guard1Flags(source) {
  return source
    .split("\n")
    .filter((line) => /^\s*import\b/.test(line) && !/^\s*import\s+type\b/.test(line))
    .some((line) => BANNED.some((p) => p.test(line)));
}
function sweepFlags(source) {
  return BANNED.some((p) => p.test(source));
}

function mk(q) {
  const TAB = "\t";
  return [
    ["named-value", `import { x } from ${q}${SPEC}${q};`, "edge"],
    ["brace-wrap", `import {\n  x,\n} from ${q}${SPEC}${q};`, "edge"],
    ["from-wrap", `import { x } from\n  ${q}${SPEC}${q};`, "edge"],
    ["tab", `import { x }${TAB}from${TAB}${q}${SPEC}${q};`, "edge"],
    ["inline-all-type", `import { type X } from ${q}${SPEC}${q};`, "erased"],
    ["mixed", `import { type X, y } from ${q}${SPEC}${q};`, "edge"],
    ["default-inline-type", `import D, { type X } from ${q}${SPEC}${q};`, "edge"],
    ["side-effect", `import ${q}${SPEC}${q};`, "edge"],
    ["export-star", `export * from ${q}${SPEC}${q};`, "edge"],
    ["export-named", `export { x } from ${q}${SPEC}${q};`, "edge"],
    ["require", `const g = require(${q}${SPEC}${q});`, "edge"],
    ["dynamic-import", `const g = await import(${q}${SPEC}${q});`, "edge"],
  ];
}

let astDisagree = 0;
let visDisagree = 0;
let g1Disagree = 0;
let sweepDisagree = 0;
for (const q of ['"', "'"]) {
  for (const [, src, want] of mk(q)) {
    const astEdge = scanRuntimeEdges(src, "fixture.ts").edges.some((e) => e.specifier === SPEC);
    const wantEdge = want === "edge";
    if (astEdge !== wantEdge) astDisagree += 1;
    const visFlag = valueImportSpecifiers(src).includes(SPEC);
    if (visFlag !== wantEdge) visDisagree += 1;
    const g1Flag = guard1Flags(src);
    if (g1Flag !== wantEdge) g1Disagree += 1;
    const sweepFlag = sweepFlags(src);
    if (sweepFlag !== wantEdge) sweepDisagree += 1;
  }
}
console.log(`DISAGREEMENTS WITH THE WANT COLUMN, over ${mk('"').length * 2} fixtures:`);
console.log(`  AST classifier            ${astDisagree}`);
console.log(`  valueImportSpecifiers     ${visDisagree}`);
console.log(`  guard 1 line classifier   ${g1Disagree}`);
console.log(`  unconditional sweep       ${sweepDisagree}`);
