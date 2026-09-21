// A23 wave step 0 (RES-A23-13). The DELTA walk under the shipping
// configuration - same as a23-walk-probe.mjs plus the two Z2 canary roots
// (the grade barrel, and the owner-context X4 path) reported with their
// unallowed counts. Run: node docs/a23/a23-delta-probe.mjs
import { join } from "node:path";
import { SRC, SHIPPING_OPTIONS, directoryRoots, walkRuntimeGraph } from "./_lib.mjs";

const rgRoots = directoryRoots(join(SRC, "app", "components", "repo-grades"));
const t0 = Date.now();
const rg = walkRuntimeGraph(rgRoots, SHIPPING_OPTIONS);
console.log("===== SITE 1+3 repo-grades (whole dir, tree-derived) =====");
console.log(`roots=${rgRoots.length} nodes=${rg.nodes} ${Date.now() - t0}ms violations=${rg.violations.length} residue=${rg.unresolvable.length} unallowed=${rg.unallowed.length}`);

const grRoots = [
  ...directoryRoots(join(SRC, "app", "components", "grading-results")),
  join(SRC, "app", "components", "GradingResults.tsx"),
  join(SRC, "lib", "grade", "types.ts"),
];
const t1 = Date.now();
const gr = walkRuntimeGraph(grRoots, SHIPPING_OPTIONS);
console.log("===== SITE 2+3 grading-results (dir + GradingResults.tsx + types.ts AS A ROOT [Z3]) =====");
console.log(`roots=${grRoots.length} nodes=${gr.nodes} ${Date.now() - t1}ms violations=${gr.violations.length} residue=${gr.unresolvable.length} unallowed=${gr.unallowed.length}`);

const t2 = Date.now();
const typesOnly = walkRuntimeGraph([join(SRC, "lib", "grade", "types.ts")], SHIPPING_OPTIONS);
console.log("===== Z3 CONTROL: types.ts alone =====");
console.log(`roots=1 nodes=${typesOnly.nodes} ${Date.now() - t2}ms violations=${typesOnly.violations.length} residue=${typesOnly.unresolvable.length} unallowed=${typesOnly.unallowed.length}`);

const t3 = Date.now();
const barrel = walkRuntimeGraph([join(SRC, "lib", "grade.ts")], SHIPPING_OPTIONS);
console.log("===== Z2 CANARY grade barrel (src/lib/grade.ts) =====");
console.log(`violations=${barrel.violations.length} nodes=${barrel.nodes} unallowed=${barrel.unallowed.length} ${Date.now() - t3}ms`);
if (barrel.violations[0]) {
  console.log("  first violation trail:");
  console.log(`  ${barrel.violations[0].trail.join("\n      -> ")}`);
  console.log(`      value-imports "${barrel.violations[0].specifier}" -> ${barrel.violations[0].resolved}`);
}
if (barrel.unallowed[0]) {
  console.log("  first unallowed:");
  console.log(`  ${barrel.unallowed[0].trail.join("\n      -> ")}`);
  console.log(`      ${barrel.unallowed[0].reason.toUpperCase()} "${barrel.unallowed[0].specifier}"`);
}

const t4 = Date.now();
const owner = walkRuntimeGraph([join(SRC, "lib", "supabase", "owner-context.ts")], SHIPPING_OPTIONS);
console.log("===== Z2 CANARY owner-context (the X4 path) (src/lib/supabase/owner-context.ts) =====");
console.log(`violations=${owner.violations.length} nodes=${owner.nodes} unallowed=${owner.unallowed.length} ${Date.now() - t4}ms`);
if (owner.violations[0]) {
  console.log("  first violation trail:");
  console.log(`  ${owner.violations[0].trail.join("\n      -> ")}`);
  console.log(`      value-imports bare "${owner.violations[0].specifier}"`);
}
