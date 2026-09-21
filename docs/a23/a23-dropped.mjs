// A23 wave step 0 (RES-A23-13). Census of literal bare specifiers that
// resolve to nothing (the pre-Z1 `continue` hole) over both real closures.
// Run: node docs/a23/a23-dropped.mjs
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SRC, scanRuntimeEdges, classifySpecifier, directoryRoots } from "./_lib.mjs";

function census(label, roots) {
  const visited = new Set();
  const dropped = [];
  function visit(abs) {
    if (visited.has(abs)) return;
    visited.add(abs);
    let source;
    try {
      source = readFileSync(abs, "utf8");
    } catch {
      return;
    }
    const scan = scanRuntimeEdges(source, abs);
    for (const edge of scan.edges) {
      const disposition = classifySpecifier(edge.specifier, abs, SRC);
      if (disposition.kind === "module") visit(disposition.resolved);
      else if (disposition.kind === "package" || disposition.kind === "node-builtin") {
        // pre-Z1: these were the specifiers a bare `continue` on a null
        // resolveSpecifier() silently dropped.
        dropped.push(edge.specifier);
      }
    }
  }
  for (const r of roots) visit(r);
  const distinct = new Set(dropped);
  console.log(`${label} DROPPED literal specifiers: instances=${dropped.length} distinct=${distinct.size}`);
  return distinct;
}

const rgRoots = directoryRoots(join(SRC, "app", "components", "repo-grades"));
const grRoots = [
  ...directoryRoots(join(SRC, "app", "components", "grading-results")),
  join(SRC, "app", "components", "GradingResults.tsx"),
  join(SRC, "lib", "grade", "types.ts"),
];
const a = census("SITE 1+3 repo-grades   ", rgRoots);
const b = census("SITE 2+3 grading-results", grRoots);
const union = new Set([...a, ...b]);
const shared = [...a].filter((s) => b.has(s));
console.log(`UNION distinct=${union.size}, SHARED between the two=${shared.length}`);
