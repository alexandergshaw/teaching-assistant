// A23 wave step 0 (RES-A23-13). Proves the deny list (FORBIDDEN_BARE_SPECIFIERS)
// is not load-bearing: with it emptied, every real hazard still fails via
// node-builtin or "not on the allow list", and the allowed cases still pass.
// Also times the whole-src parse this file's client-bundle guard needs
// (m2's cost measurement). Run: node docs/a23/a23-x4-proof.mjs
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { builtinModules } from "node:module";
import { SRC, ALLOWED_BARE_SPECIFIERS, ALLOWED_ASSET_EXTENSIONS, classifySpecifier, scanRuntimeEdges, walkSrc } from "./_lib.mjs";

function verdict(specifier, importerAbs) {
  const disposition = classifySpecifier(specifier, importerAbs, SRC);
  if (disposition.kind === "module") return "ALLOWED module (followed edge)";
  if (disposition.kind === "asset")
    return ALLOWED_ASSET_EXTENSIONS.includes(disposition.ext) ? "ALLOWED asset" : "FAIL asset not on allowed extensions";
  if (disposition.kind === "node-builtin") return "FAIL node-builtin";
  if (disposition.kind === "missing") return "FAIL missing";
  return ALLOWED_BARE_SPECIFIERS.includes(specifier) ? "ALLOWED package" : "FAIL package not on allow list";
}

console.log("===== X4: FORBIDDEN_BARE_SPECIFIERS = [] (deny list emptied entirely) =====");
const importer = join(SRC, "app", "x.ts");
const cases = [
  "node:async_hooks",
  "async_hooks",
  "next/headers",
  "server-only",
  "node:fs",
  "fs",
  "crypto",
  "node:crypto",
  "react",
  "@mui/material/Dialog",
  "./repo-grades.module.css",
];
for (const spec of cases) {
  if (spec.endsWith(".module.css")) {
    // Resolved against a real importer in repo-grades, so the relative
    // asset actually exists on disk (LinkUsernamesPanel.tsx:77).
    const realImporter = join(SRC, "app", "components", "repo-grades", "LinkUsernamesPanel.tsx");
    console.log(`  ${JSON.stringify(spec).padEnd(28)} -> ${verdict(spec, realImporter)}`);
    continue;
  }
  console.log(`  ${JSON.stringify(spec).padEnd(28)} -> ${verdict(spec, importer)}`);
}
console.log(`(builtinModules includes "async_hooks": ${builtinModules.includes("async_hooks")})`);

console.log("\n===== m2: whole-src parse cost (the leaf's own client-bundle guard) =====");
const files = walkSrc(SRC).filter((f) => !/\.test\.(ts|tsx)$/.test(f));
const t0 = Date.now();
for (const file of files) {
  const source = readFileSync(file, "utf8");
  scanRuntimeEdges(source, file);
}
console.log(`files=${files.length} elapsed=${Date.now() - t0}ms`);
