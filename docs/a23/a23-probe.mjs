// A23 probe. Run from the repo root: node docs/a23/a23-probe.mjs
// Relocated from docs/a23-criteria.md Appendix A.1 in round 3 (Ruling Y5) -
// a fenced code block is less re-runnable than a file; this is the fix.
// Guard 1: repoGradesFeedbackAndFiles.wiring.test.ts:258-263 + :295-301
// Guard 2: gradingResultsHelpersWiring.test.ts:128-131
import { readFileSync } from "node:fs";

const BANNED = [
  /from ["']@\/lib\/grade["']/,
  /from ["']@\/lib\/grade\//,
  /from ["']@\/lib\/supabase\/server["']/,
  /from ["']next\/headers["']/,
];

// Guard 1, verbatim from :295-301. true = the guard FLAGS the source.
const guard1Flags = (source) =>
  source
    .split("\n")
    .filter((line) => /^\s*import\b/.test(line) && !/^\s*import\s+type\b/.test(line))
    .some((line) => BANNED.some((pattern) => pattern.test(line)));

// Option (b): the whole-file sweep, unconditional.
const guard1SweepFlags = (source) => BANNED.some((pattern) => pattern.test(source));

// Guard 2, verbatim from :128-131. true = the guard PASSES (raises nothing).
const FROZEN = ['import type { CodeRunResult } from "../code-runner";'];
const guard2Passes = (source) => {
  const fromLines = source
    .split(/\r?\n/)
    .filter((line) => line.includes(' from "') && !/^\s*(\*|\/\/)/.test(line.trim()));
  return JSON.stringify(fromLines) === JSON.stringify(FROZEN);
};

const TAB = String.fromCharCode(9);
const g1 = (id, body, want, note) => ({ id, body, want, note });
const mk = (q) => [
  g1("P1", `import { composeOverallComment } from ${q}@/lib/grade${q};`, true, "single-line VALUE import"),
  g1("P2a", `import {\n  composeOverallComment,\n} from ${q}@/lib/grade${q};`, true, "WRAP inside the braces"),
  g1("P2b", `import { composeOverallComment } from\n  ${q}@/lib/grade${q};`, true, "WRAP between from and the specifier"),
  g1("P2c", `import { composeOverallComment }${TAB}from${TAB}${q}@/lib/grade${q};`, true, "TAB between from and the specifier"),
  g1("P3", `import { type RubricAreaResult } from ${q}@/lib/grade${q};`, false, "inline ALL-TYPE import"),
  g1("P4", `import { type RubricAreaResult, composeOverallComment } from ${q}@/lib/grade${q};`, true, "MIXED inline-type + value binding"),
  g1("P5", `import Grade, { type RubricAreaResult } from ${q}@/lib/grade${q};`, true, "DEFAULT value binding + inline-type binding"),
  g1("P6", `import ${q}@/lib/grade${q};`, true, "bare SIDE-EFFECT import"),
  g1("C1", `export * from ${q}@/lib/grade${q};`, true, "export * from"),
  g1("C2", `export { composeOverallComment } from ${q}@/lib/grade${q};`, true, "export { x } from"),
  g1("C3", `const g = require(${q}@/lib/grade${q});`, true, "require(<literal>)"),
  g1("C4", `const g = await import(${q}@/lib/grade${q});`, true, "await import(<literal>)"),
];

console.log("=== GUARD 1 (repo-grades line filter) : flagged? want? verdict ===");
for (const q of ['"', "'"]) {
  const label = q === '"' ? "DOUBLE" : "SINGLE";
  for (const p of mk(q)) {
    const flagged = guard1Flags(p.body);
    const verdict = flagged === p.want ? "OK" : flagged ? "FAIL(false positive)" : "FAIL(ESCAPES)";
    console.log(
      `G1 ${label} ${p.id.padEnd(4)} ${p.note.padEnd(46)} flagged=${String(flagged).padEnd(5)} want=${String(p.want).padEnd(5)} ${verdict}`
    );
  }
}

console.log("\n=== OPTION (b): whole-file BANNED sweep, unconditional ===");
for (const q of ['"', "'"]) {
  const label = q === '"' ? "DOUBLE" : "SINGLE";
  for (const p of mk(q)) {
    console.log(`SWEEP ${label} ${p.id.padEnd(4)} ${p.note.padEnd(46)} flagged=${guard1SweepFlags(p.body)}`);
  }
}
const realCellEdits = readFileSync("src/app/components/repo-grades/repoGradesCellEdits.ts", "utf8");
console.log(`SWEEP over the REAL repoGradesCellEdits.ts : flagged=${guard1SweepFlags(realCellEdits)} (a type-only barrel import lives at :30)`);

const typesSource = readFileSync("src/lib/grade/types.ts", "utf8");
const inject = (line) => `${line}\n${typesSource}`;
const SERVER = "@/lib/supabase/server";
const h = [
  ["H0", typesSource, "unmodified real types.ts"],
  ["H1", inject(`import { createServiceClient } from "${SERVER}";`), "DOUBLE-quoted server VALUE import"],
  ["H2", inject(`import { createServiceClient } from '${SERVER}';`), "SINGLE-quoted server VALUE import"],
  ["H3", inject(`const s = require("${SERVER}");`), "require(<literal>)"],
  ["H4", inject(`const s = await import("${SERVER}");`), "await import(<literal>)"],
  ["H5", inject(`export * from '${SERVER}';`), "SINGLE-quoted export * from"],
  ["H6", inject(`import {\n  createServiceClient,\n} from "${SERVER}";`), "WRAP inside the braces, double-quoted"],
  ["H7", inject(`import { createServiceClient } from\n  "${SERVER}";`), "WRAP between from and the specifier"],
  ["H8", inject(`import { createServiceClient }${TAB}from${TAB}"${SERVER}";`), "TAB between from and the specifier"],
  ["H9", inject(`import "${SERVER}";`), "bare SIDE-EFFECT import"],
  ["H10", inject(`export { createServiceClient } from "${SERVER}";`), "export { x } from, double-quoted"],
];
console.log("\n=== GUARD 2 (types.ts walled-set count) : passes? ===");
for (const [id, src, note] of h) {
  const passes = guard2Passes(src);
  const verdict = id === "H0" ? (passes ? "OK" : "FAIL") : passes ? "ESCAPES" : "caught";
  console.log(`G2 ${id.padEnd(4)} ${note.padEnd(46)} passes=${String(passes).padEnd(5)} ${verdict}`);
}
