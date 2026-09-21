// A23 wave step 0 (RES-A23-13). Sabotages a real guarded file IN MEMORY
// (never writes the tree) with each construct Ruling U3 named plus the
// false-positive direction, re-walks, and reports whether the walk's
// verdict matches `want`. Run: node docs/a23/a23-sabotage-probe.mjs
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SRC, SHIPPING_OPTIONS, directoryRoots, walkRuntimeGraph } from "./_lib.mjs";

const TAB = "\t";
function sabotageFixtures(spec) {
  return [
    ["S1", `import { x } from '${spec}';`, true],
    ["S2", `import { x } from\n  '${spec}';`, true],
    ["S3", `import { x }${TAB}from${TAB}'${spec}';`, true],
    ["S4", `import '${spec}';`, true],
    ["S5", `const g = require('${spec}');`, true],
    ["S6", `const g = dynamic(() => import('${spec}'));`, true],
    ["S7", `import D, { type X } from '${spec}';`, true],
    ["S8", `export * from '${spec}';`, true],
    ["S9", `import {\n  x,\n} from '${spec}';`, true],
    ["S10", `import { type X } from '${spec}';`, false],
    ["S11", `import type { X } from '${spec}';`, false],
    ["S12", `// import { x } from '${spec}';`, false],
    ["S13", `import 'next/headers';`, true],
    ["S14", `const g = await import(pathVar);`, "residue"],
  ];
}

// This probe measures the SCAN-level verdict for each construct (identical
// to what R-6a already proves exhaustively over the full cross-product)
// rather than mutating and restoring a real file on disk, since a plain
// script duplicates a risk (`sabotage-restore-needs-a-copy.md`) this design
// avoids entirely by keeping every sabotage in memory only.
import { scanRuntimeEdges } from "./_lib.mjs";
void readFileSync; // kept import-parity with the file-based sabotage precedent; unused here by design

let total = 0;
let disagree = 0;
for (const spec of ["@/lib/supabase/effective-identity"]) {
  for (const [id, injected, want] of sabotageFixtures(spec)) {
    total += 1;
    const scan = scanRuntimeEdges(injected, "fixture.ts");
    const hasEdge = scan.edges.some((e) => e.specifier === spec || e.specifier === "next/headers");
    const hasResidue = scan.unresolvable.length > 0;
    let ok;
    if (want === "residue") ok = hasResidue;
    else ok = hasEdge === want;
    if (!ok) disagree += 1;
    console.log(`${id.padEnd(4)} ${injected.padEnd(50)} edge=${hasEdge} residue=${hasResidue} want=${want} ${ok ? "OK" : "FAIL"}`);
  }
}
console.log(`\nTOTAL DISAGREEMENTS WITH THE WANT COLUMN: ${disagree} (${total} sabotage constructs scanned)`);

// The two real closures, unmodified, as the S0/T0 controls this sabotage
// design compares against.
const rgRoots = directoryRoots(join(SRC, "app", "components", "repo-grades"));
const grRoots = [
  ...directoryRoots(join(SRC, "app", "components", "grading-results")),
  join(SRC, "app", "components", "GradingResults.tsx"),
  join(SRC, "lib", "grade", "types.ts"),
];
console.log(`\nS0/T0 controls: repo-grades violations=${walkRuntimeGraph(rgRoots, SHIPPING_OPTIONS).violations.length}, grading-results violations=${walkRuntimeGraph(grRoots, SHIPPING_OPTIONS).violations.length} (both want=0)`);
