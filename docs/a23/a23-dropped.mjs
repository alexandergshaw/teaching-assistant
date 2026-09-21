// A23 wave step 0 (RES-A23-13). Census of literal bare specifiers that
// resolve to nothing (the pre-Z1 `continue` hole) over both real closures.
// Run: node docs/a23/a23-dropped.mjs
//
// FIXED (as-built verification, 2026-09-21): this probe used to hand-roll its
// own visit() with NO "use server" wall, NO forbidden-path stop and no asset
// counting - so it walked 472 nodes instead of the shipped walk's 149, and
// its census did not reproduce. That was wrongly attributed to tree growth.
// It now walks under the SAME THREE RULES the shipped walkRuntimeGraph
// applies (the "use server" wall, the forbidden-path recursion stop, both
// read from SHIPPING_OPTIONS - the exact object the guard files pass), so
// its census is over the shipped walk's own closure, not a second, looser
// visitor's. It still counts every package/node-builtin specifier seen,
// allow-listed or not - a different question from walkRuntimeGraph's
// `unallowed` (which only reports the NOT-allow-listed ones), so it is
// re-derived here rather than read off a WalkResult.
import { readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { SRC, scanRuntimeEdges, classifySpecifier, directoryRoots, SHIPPING_OPTIONS } from "./_lib.mjs";

function census(label, roots) {
  const visited = new Set();
  const dropped = [];
  const toRel = (abs) => relative(SHIPPING_OPTIONS.srcRoot, abs).split(sep).join("/");
  const isForbidden = (relPath) =>
    SHIPPING_OPTIONS.forbiddenPathPrefixes.some((p) => relPath.startsWith(p)) &&
    !SHIPPING_OPTIONS.browserSafeModules.includes(relPath);

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
    if (SHIPPING_OPTIONS.treatUseServerAsWall && scan.directives.includes("use server")) return;
    for (const edge of scan.edges) {
      const disposition = classifySpecifier(edge.specifier, abs, SRC);
      if (disposition.kind === "module") {
        const relPath = toRel(disposition.resolved);
        if (!isForbidden(relPath)) visit(disposition.resolved);
        continue;
      }
      if (disposition.kind === "package" || disposition.kind === "node-builtin" || disposition.kind === "asset") {
        // pre-Z1: these were the specifiers a bare `continue` on a null
        // resolveSpecifier() silently dropped - bare npm/node specifiers AND
        // on-disk assets (e.g. a ".css" import) alike, per
        // client-boundary-policy.ts's own corrected comment: the ALLOW list's
        // "18 distinct" figure is 14 bare specifiers plus 4 CSS assets, not
        // 18 bare specifiers.
        dropped.push(edge.specifier);
      }
    }
  }
  for (const r of roots) visit(r);
  const distinct = new Set(dropped);
  console.log(
    `${label} DROPPED literal specifiers: instances=${dropped.length} distinct=${distinct.size} nodes=${visited.size}`
  );
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
