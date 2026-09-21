// A23 wave step 0 (RES-A23-13). Walks both real root sets under the SHIPPING
// configuration (Z1 allow list, Z3 extra root, m4 widened prefix) and prints
// roots/nodes/violations/residue/unallowed, plus the CONTROL that the walk
// discriminates at all (the @/lib/grade barrel itself).
// Run: node docs/a23/a23-walk-probe.mjs
import { join } from "node:path";
import { SRC, SHIPPING_OPTIONS, directoryRoots, walkRuntimeGraph } from "./_lib.mjs";

const t0 = Date.now();
const rgRoots = directoryRoots(join(SRC, "app", "components", "repo-grades"));
const rg = walkRuntimeGraph(rgRoots, SHIPPING_OPTIONS);
console.log("===== SITE 1+3 repo-grades (whole dir, tree-derived) =====");
console.log(
  `roots=${rgRoots.length} nodes=${rg.nodes} ${Date.now() - t0}ms violations=${rg.violations.length} residue=${rg.unresolvable.length} unallowed=${rg.unallowed.length}`
);

const t1 = Date.now();
const grRoots = [
  ...directoryRoots(join(SRC, "app", "components", "grading-results")),
  join(SRC, "app", "components", "GradingResults.tsx"),
  join(SRC, "lib", "grade", "types.ts"),
];
const gr = walkRuntimeGraph(grRoots, SHIPPING_OPTIONS);
console.log("===== SITE 2+3 grading-results (dir + GradingResults.tsx + types.ts AS A ROOT [Z3]) =====");
console.log(
  `roots=${grRoots.length} nodes=${gr.nodes} ${Date.now() - t1}ms violations=${gr.violations.length} residue=${gr.unresolvable.length} unallowed=${gr.unallowed.length}`
);

const t2 = Date.now();
const typesOnly = walkRuntimeGraph([join(SRC, "lib", "grade", "types.ts")], SHIPPING_OPTIONS);
console.log("===== Z3 CONTROL: types.ts alone =====");
console.log(
  `roots=1 nodes=${typesOnly.nodes} ${Date.now() - t2}ms violations=${typesOnly.violations.length} residue=${typesOnly.unresolvable.length} unallowed=${typesOnly.unallowed.length}`
);

const t3 = Date.now();
const barrel = walkRuntimeGraph([join(SRC, "lib", "grade.ts")], SHIPPING_OPTIONS);
console.log("===== CONTROL: the @/lib/grade barrel itself (must be NON-ZERO) =====");
console.log(`violations=${barrel.violations.length} nodes=${barrel.nodes} ${Date.now() - t3}ms`);
if (barrel.violations[0]) {
  console.log(`  trail: ${barrel.violations[0].trail.join(" -> ")}`);
  console.log(`  value-imports "${barrel.violations[0].specifier}" -> ${barrel.violations[0].resolved}`);
}
