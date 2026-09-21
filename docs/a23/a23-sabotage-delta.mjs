// A23 wave step 0 (RES-A23-13). Re-run of a23-sabotage-probe.mjs's construct
// list under the SHIPPING configuration, to confirm the verdicts are
// unchanged by the widened prefix / allow list (only violation COUNTS on the
// real tree move, per docs/a23-architecture.md:786-804).
// Run: node docs/a23/a23-sabotage-delta.mjs
import { join } from "node:path";
import { SRC, SHIPPING_OPTIONS, directoryRoots, walkRuntimeGraph, scanRuntimeEdges } from "./_lib.mjs";

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

let total = 0;
let disagree = 0;
for (const spec of ["@/lib/supabase/effective-identity"]) {
  for (const [id, injected, want] of sabotageFixtures(spec)) {
    total += 1;
    const scan = scanRuntimeEdges(injected, "fixture.ts");
    const hasEdge = scan.edges.some((e) => e.specifier === spec || e.specifier === "next/headers");
    const hasResidue = scan.unresolvable.length > 0;
    const ok = want === "residue" ? hasResidue : hasEdge === want;
    if (!ok) disagree += 1;
    console.log(`${id.padEnd(4)} edge=${hasEdge} residue=${hasResidue} want=${want} ${ok ? "OK" : "FAIL"}`);
  }
}
console.log(`\nTOTAL DISAGREEMENTS WITH THE WANT COLUMN: ${disagree} (${total} sabotage constructs, unchanged from a23-sabotage-probe.mjs)`);

const barrel = walkRuntimeGraph([join(SRC, "lib", "grade.ts")], SHIPPING_OPTIONS);
console.log(`\nbarrel violations under SHIPPING config = ${barrel.violations.length} (narrow-prefix probe measured 5; shipping widened prefix stops one hop earlier)`);

const rgRoots = directoryRoots(join(SRC, "app", "components", "repo-grades"));
const grRoots = [
  ...directoryRoots(join(SRC, "app", "components", "grading-results")),
  join(SRC, "app", "components", "GradingResults.tsx"),
  join(SRC, "lib", "grade", "types.ts"),
];
console.log(`real closures under SHIPPING config: repo-grades violations=${walkRuntimeGraph(rgRoots, SHIPPING_OPTIONS).violations.length}, grading-results violations=${walkRuntimeGraph(grRoots, SHIPPING_OPTIONS).violations.length}`);
