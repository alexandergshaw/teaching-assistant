// A23 wave step 0 (RES-A23-13). Whole-src residue census: parses every
// non-test file under src/ and counts import/require/dynamic-import sites
// whose specifier is NOT a string literal (UNCLASSIFIABLE / computed).
// Run: node docs/a23/a23-reach.mjs
import { readFileSync } from "node:fs";
import { SRC, scanRuntimeEdges, walkSrc } from "./_lib.mjs";

const files = walkSrc(SRC).filter((f) => !/\.test\.(ts|tsx)$/.test(f));
let sites = 0;
const t0 = Date.now();
for (const file of files) {
  const source = readFileSync(file, "utf8");
  const scan = scanRuntimeEdges(source, file);
  sites += scan.unresolvable.length;
}
console.log(`whole-src files=${files.length} nodes=${files.length} UNCLASSIFIABLE (computed) import sites=${sites}`);
console.log(`elapsed=${Date.now() - t0}ms`);
