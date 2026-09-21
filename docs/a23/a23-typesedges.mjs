// A23 wave step 0 (RES-A23-13). Ruling Z3: splits every edge INTO
// src/lib/grade/types.ts (from the grading-results closure) by whether it is
// a runtime edge or a type-only (erased) one, over the closure walked on
// RUNTIME edges only (the same walk the guard performs).
// Run: node docs/a23/a23-typesedges.mjs
import { readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { SRC, SHIPPING_OPTIONS, directoryRoots, walkRuntimeGraph, scanRuntimeEdges, classifySpecifier } from "./_lib.mjs";

const grRoots = [
  ...directoryRoots(join(SRC, "app", "components", "grading-results")),
  join(SRC, "app", "components", "GradingResults.tsx"),
];
const result = walkRuntimeGraph(grRoots, SHIPPING_OPTIONS);
console.log(`closure nodes (runtime edges only) = ${result.nodes}`);

// Re-derive the visited set the same way, then look at every file's RAW
// edges (including type-only, via a second, unfiltered scan) for anything
// resolving to types.ts.
const typesAbs = join(SRC, "lib", "grade", "types.ts");
const visited = new Set();
(function collect(roots) {
  const stack = [...roots];
  while (stack.length) {
    const abs = stack.pop();
    if (visited.has(abs)) continue;
    visited.add(abs);
    let source;
    try {
      source = readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    const scan = scanRuntimeEdges(source, abs);
    if (scan.directives.includes("use server")) continue;
    for (const edge of scan.edges) {
      const disposition = classifySpecifier(edge.specifier, abs, SRC);
      if (disposition.kind === "module") stack.push(disposition.resolved);
    }
  }
})(grRoots);

function relFrom(abs, specifier) {
  return specifier;
}
void relFrom;

const runtimeEdgesIn = [];
const typeOnlyEdgesIn = [];
for (const abs of visited) {
  const source = readFileSync(abs, "utf8");
  // A second, TYPE-INCLUSIVE scan via a lightweight regex over `from "..."`
  // lines, cross-checked against the AST scan's runtime edges for the same
  // file, to find edges the AST scan (correctly) erased.
  for (const match of source.matchAll(/(?:^|\n)\s*(export|import)\s+(type\s+)?[^\n;]*?from\s*(['"])([^'"]+)\3/g)) {
    const [, , isTypeKeyword, , specifier] = match;
    const disposition = classifySpecifier(specifier, abs, SRC);
    if (disposition.kind !== "module" || disposition.resolved !== typesAbs) continue;
    const scan = scanRuntimeEdges(source, abs);
    const isRuntimeEdge = scan.edges.some((e) => e.specifier === specifier);
    const relPath = `${relative(SRC, abs).split(sep).join("/")}`;
    if (isRuntimeEdge) runtimeEdgesIn.push([relPath, specifier]);
    else if (isTypeKeyword || true) typeOnlyEdgesIn.push([relPath, specifier]);
  }
}
console.log(`\nRUNTIME edges into src/lib/grade/types.ts : ${runtimeEdgesIn.length}`);
for (const [f, s] of runtimeEdgesIn) console.log(`  ${f}  "${s}"`);
console.log(`\nTYPE-ONLY edges into it (contribute nothing) : ${typeOnlyEdgesIn.length}`);
for (const [f, s] of typeOnlyEdgesIn) console.log(`  ${f}  "${s}"`);
console.log(`\ntypes.ts in the closure? ${result.nodes > 0 && [...visited].some((p) => p === typesAbs)}`);
