// RULING 135. Proves the two-instrument counter in ./count.ts against
// SYNTHETIC, inline source fixtures - never a frozen count pulled from a
// live file in this tree, because a legitimate edit to that file (adding or
// removing a guard call) would change the true count and make the assertion
// wrong for a reason that has nothing to do with a defect in this tool
// (RULING 135's own instruction: "do not pin source SPELLING as a
// requirement... your tests must not freeze a count that legitimate edits
// would change"). The four real-file historical instances the ruling asks
// for are demonstrated in this file's header comment instead (a report, not
// a frozen assertion) and in this agent's final report, both with the exact
// commands run - see the two relational tests near the bottom of this file
// for the one honest way to assert something about a live file: a structural
// INEQUALITY that stays true across any edit that keeps the file's shape
// (an import line plus at least one real call), never an exact number.
//
// REAL-HISTORY REPRODUCTION (paste of the commands run against this tree on
// 2026-09-28, not asserted here as a literal - see this agent's final report
// for the same output):
//
//   src/app/actions/repo-grades.ts, symbols {requireUser, requireAppOwner}:
//     grep -cE "requireUser|requireAppOwner" repo-grades.ts        -> 3
//     countSymbolOccurrences(...).callCount summed over both symbols -> 2
//     (line 24's import statement is the extra line grep counted)
//
//   src/app/actions/course-hub-integrations.ts, symbols {requireUser,
//   requireAppOwner, requireOwner}:
//     grep -cE "requireUser|requireAppOwner|requireOwner" ...      -> 15
//     countSymbolOccurrences(...).callCount summed over the three  -> 10
//     (1 import line + 4 comment lines discussing the deprecated
//     requireOwner() alias inflate the naive count)
//
//   src/app/actions/grading.ts, symbols {requireUser, requireAppOwner}:
//     grep -c "requireUser" grading.ts  -> 18   grep -c "requireAppOwner" -> 4
//     naively SUMMED (the mistake: each grep recounts the shared import
//     line)                                      -> 22
//     countSymbolOccurrences(...).callCount summed over both symbols -> 20
//
//   Area-slug instance (a comment stating what NOT to name an area): no
//   surviving file in this tree still carries the exact wording the ruling
//   describes, so this one is SYNTHESIZED per RULING 135's own allowance
//   ("pick fixtures that are stable for a structural reason, or synthesize
//   them") - see the "synthesized area-slug instance" test below.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { countSymbolOccurrences, countSymbolOccurrencesAcrossFiles } from "./count";

describe("countSymbolOccurrences - AST instrument classifies every real occurrence", () => {
  it("counts an import specifier as a declaration, not a call", () => {
    const source = `import { guardFn } from "@/lib/auth";\n`;
    const report = countSymbolOccurrences(source, "fixture.ts", "guardFn");
    expect(report.declarationCount).toBe(1);
    expect(report.callCount).toBe(0);
    expect(report.codeOccurrences).toBe(1);
  });
  // MUTATION KILLED: removed the ImportSpecifier branch in classify() (made
  // it fall through to "reference"). Result: declarationCount became 0 and
  // referenceCount became 1 - this test went RED
  // ("expected declarationCount to be 1, got 0"). Restored from the
  // out-of-repo backup and diffed clean before continuing.

  it("counts a direct call `guardFn()` as a call, not a reference", () => {
    const source = `async function run() {\n  await guardFn();\n}\n`;
    const report = countSymbolOccurrences(source, "fixture.ts", "guardFn");
    expect(report.callCount).toBe(1);
    expect(report.referenceCount).toBe(0);
  });
  // MUTATION KILLED: changed `if (ts.isCallExpression(parent) &&
  // parent.expression === node) return "call";` to `return "reference";`
  // unconditionally in that branch. Result: callCount became 0,
  // referenceCount became 1 - RED ("expected callCount to be 1, got 0").
  // Restored and diffed clean.

  it("counts a method-style call `guard.check()` as a call site for `check`", () => {
    const source = `async function run() {\n  await guard.check();\n}\n`;
    const report = countSymbolOccurrences(source, "fixture.ts", "check");
    expect(report.callCount).toBe(1);
    expect(report.referenceCount).toBe(0);
  });
  // MUTATION KILLED: deleted the PropertyAccessExpression branch in
  // classify() entirely. Result: `check` in `guard.check()` fell through to
  // "reference" - callCount became 0 - RED ("expected callCount to be 1, got
  // 0"). Restored and diffed clean.

  it("does not count a property access that is not itself called", () => {
    const source = `const value = guard.check;\n`;
    const report = countSymbolOccurrences(source, "fixture.ts", "check");
    expect(report.callCount).toBe(0);
    expect(report.referenceCount).toBe(1);
  });

  it("counts a bare reference (passed as a value, never called) as a reference", () => {
    const source = `import { guardFn } from "@/lib/auth";\nconst table = { guardFn };\n`;
    const report = countSymbolOccurrences(source, "fixture.ts", "guardFn");
    expect(report.declarationCount).toBe(1);
    expect(report.callCount).toBe(0);
    expect(report.referenceCount).toBe(1);
    expect(report.codeOccurrences).toBe(2);
  });

  it("the three roles always sum to codeOccurrences (partition invariant)", () => {
    const source = `
      import { guardFn } from "@/lib/auth";
      async function a() { await guardFn(); }
      async function b() { await guardFn(); }
      const ref = guardFn;
    `;
    const report = countSymbolOccurrences(source, "fixture.ts", "guardFn");
    expect(report.declarationCount + report.callCount + report.referenceCount).toBe(report.codeOccurrences);
    expect(report.declarationCount).toBe(1);
    expect(report.callCount).toBe(2);
    expect(report.referenceCount).toBe(1);
  });
});

describe("countSymbolOccurrences - lexical instrument excludes comments and strings from code", () => {
  it("does not let a JSDoc mention of the symbol inflate codeOccurrences", () => {
    const source = `
      /** Deprecated: callers used to invoke guardFn() directly. */
      async function run() {}
    `;
    const report = countSymbolOccurrences(source, "fixture.ts", "guardFn");
    expect(report.codeOccurrences).toBe(0);
    expect(report.excludedAsComment).toBe(1);
  });
  // MUTATION KILLED: replaced `COMMENT_KINDS.has(kind)` with `false` in
  // scanCommentsAndStrings. Result: excludedAsComment became 0 - RED
  // ("expected excludedAsComment to be 1, got 0"). Restored and diffed
  // clean.

  it("does not let a line comment mention of the symbol inflate codeOccurrences", () => {
    const source = `
      // guardFn() was removed from the public API in v2.
      async function run() {}
    `;
    const report = countSymbolOccurrences(source, "fixture.ts", "guardFn");
    expect(report.codeOccurrences).toBe(0);
    expect(report.excludedAsComment).toBe(1);
  });

  it("does not let a string literal mention of the symbol inflate codeOccurrences", () => {
    const source = `const message = "call guardFn before proceeding";\n`;
    const report = countSymbolOccurrences(source, "fixture.ts", "guardFn");
    expect(report.codeOccurrences).toBe(0);
    expect(report.excludedAsString).toBe(1);
  });
  // MUTATION KILLED: removed StringLiteral from STRING_LIKE_KINDS. Result:
  // excludedAsString became 0 - RED ("expected excludedAsString to be 1, got
  // 0"). Restored and diffed clean.

  it("does not let a template-literal mention of the symbol inflate codeOccurrences", () => {
    const source = "const message = `please call guardFn first`;\n";
    const report = countSymbolOccurrences(source, "fixture.ts", "guardFn");
    expect(report.codeOccurrences).toBe(0);
    expect(report.excludedAsString).toBe(1);
  });

  it("reproduces the exact class of defect from the four historical instances: grep-style import-plus-comment inflation vs a single real call", () => {
    const source = `
      // guardFn() replaced the old check in this module.
      import { guardFn } from "@/lib/auth";

      export async function run(): Promise<void> {
        await guardFn();
      }
    `;
    const report = countSymbolOccurrences(source, "fixture.ts", "guardFn");
    // The naive grep-style number: every line containing the word, which is
    // what the four historical mistakes actually reported.
    expect(report.naiveGrepLineCount).toBe(3); // comment line, import line, call line
    // The number that should have gone in the brief: real call sites only.
    expect(report.callCount).toBe(1);
    expect(report.declarationCount).toBe(1);
    expect(report.excludedAsComment).toBe(1);
    // codeOccurrences (declaration + call) is what the AST instrument
    // trusts; naiveGrepLineCount is what grep -c reported and was wrong.
    expect(report.codeOccurrences).toBe(2);
    expect(report.naiveGrepLineCount).toBeGreaterThan(report.callCount);
  });
});

describe("countSymbolOccurrences - naive grep-style comparator uses whole-word matching", () => {
  it("does not let a longer identifier that merely contains the symbol as a substring count", () => {
    const source = `const guardFnExtended = 1;\nconst other = guardFn();\n`;
    const report = countSymbolOccurrences(source, "fixture.ts", "guardFn");
    // Only the second line is a real whole-word occurrence.
    expect(report.naiveGrepLineCount).toBe(1);
    expect(report.callCount).toBe(1);
  });
  // MUTATION KILLED: removed the `\\b` word-boundary anchors from the regex
  // built in countWholeWordOccurrences (built the pattern from `symbol`
  // alone, no boundaries). Result: naiveGrepLineCount became 2 (the
  // `guardFnExtended` line now matched as a bare substring) - RED
  // ("expected naiveGrepLineCount to be 1, got 2"). Restored and diffed
  // clean.
});

describe("countSymbolOccurrences - instrumentsReconcile flags real disagreement", () => {
  it("is true for a well-formed fixture (both instruments agree on the split)", () => {
    const source = `
      // guardFn() is deprecated.
      import { guardFn } from "@/lib/auth";
      async function run() { await guardFn(); }
    `;
    const report = countSymbolOccurrences(source, "fixture.ts", "guardFn");
    expect(report.instrumentsReconcile).toBe(true);
  });
  // MUTATION KILLED: changed the reconciliation formula from
  // `codeOccurrences + comment + string === totalWholeWordInFile` to
  // `codeOccurrences === totalWholeWordInFile` (dropping comment/string from
  // the sum). Result: instrumentsReconcile became false on this same
  // well-formed fixture (2 code + 1 comment = 3, but the mutated check
  // compared 2 to 3) - RED ("expected instrumentsReconcile to be true, got
  // false"). Restored and diffed clean.
});

describe("countSymbolOccurrences - stated blind spot", () => {
  it("always reports the blind-spot notice", () => {
    const report = countSymbolOccurrences("const x = 1;\n", "fixture.ts", "guardFn");
    expect(report.blindSpot.length).toBeGreaterThan(0);
    expect(report.blindSpot).toMatch(/concatenation|template literal/);
  });

  it("cannot see a symbol assembled by string concatenation (documented limitation, not a defect)", () => {
    const source = `const name = "guard" + "Fn";\nconst fn = window[name];\n`;
    const report = countSymbolOccurrences(source, "fixture.ts", "guardFn");
    // This is the honest, documented failure to see - asserted here so a
    // future change that accidentally starts "seeing" it (and silently
    // trusting a heuristic) is noticed and reconsidered, not celebrated.
    expect(report.codeOccurrences).toBe(0);
    expect(report.callCount).toBe(0);
  });
});

describe("countSymbolOccurrencesAcrossFiles - the multi-file case a real brief needs", () => {
  it("sums call counts and code occurrences across files", () => {
    const files = [
      { fileName: "a.ts", source: `import { guardFn } from "x";\nasync function a() { await guardFn(); }\n` },
      { fileName: "b.ts", source: `import { guardFn } from "x";\nasync function b() { await guardFn(); await guardFn(); }\n` },
    ];
    const result = countSymbolOccurrencesAcrossFiles(files, "guardFn");
    expect(result.perFile).toHaveLength(2);
    expect(result.perFile[0].callCount).toBe(1);
    expect(result.perFile[1].callCount).toBe(2);
    expect(result.totalCallCount).toBe(3);
    expect(result.totalCodeOccurrences).toBe(5); // 2 declarations + 3 calls
  });
  // MUTATION KILLED: changed `sum + r.callCount` to `sum + r.codeOccurrences`
  // in the totalCallCount reduce. Result: totalCallCount became 6 instead of
  // 3 - RED ("expected totalCallCount to be 3, got 6"). Restored and diffed
  // clean.
});

describe("synthesized area-slug instance (instance 4 - a comment explaining what NOT to name a thing)", () => {
  // No file in the current tree still carries the exact wording RULING 135's
  // fourth instance describes (a slug taken from "a comment explaining what
  // not to name an area"), so this is a SYNTHETIC reproduction of the same
  // SHAPE, not a claim that this exact source exists in the tree today -
  // consistent with RULING 135's own allowance to synthesize a fixture that
  // is otherwise stable.
  it("does not let the forbidden example inside a naming-convention comment count as a real use of that name", () => {
    const source = `
      // Area slugs must be short nouns. Never name an area "legacy-import" -
      // that name was retired after A12 and is reserved.
      export const AREAS = ["grading", "recording", "workflows"];
    `;
    const report = countSymbolOccurrences(source, "fixture.ts", "legacy");
    // "legacy" appears only inside the comment's cautionary example, never as
    // a real AREAS entry or identifier - a naive grep -c would report 1 line
    // matched and a careless read could file a row against "legacy" as if it
    // were a live area. The AST instrument correctly finds zero real code
    // occurrences.
    expect(report.naiveGrepLineCount).toBe(1);
    expect(report.codeOccurrences).toBe(0);
    expect(report.excludedAsComment).toBe(1);
  });
});

describe("countSymbolOccurrences - relational (non-frozen) checks against real, live files in this tree", () => {
  // These two tests read REAL files and assert a STRUCTURAL INEQUALITY, never
  // an exact count - per RULING 135's instruction not to pin a count that a
  // legitimate future edit would change. The inequality holds as long as the
  // file imports the guard by name (one non-call line) and calls it at least
  // once - both true today and expected to stay true for as long as the file
  // guards its actions this way at all, independent of how many call sites
  // it grows or loses.
  it("repo-grades.ts: the naive grep-style line count exceeds the real call-site count (the import line is not a call)", () => {
    const path = join(process.cwd(), "src/app/actions/repo-grades.ts");
    const source = readFileSync(path, "utf8");
    const report = countSymbolOccurrences(source, "repo-grades.ts", "requireUser");
    expect(report.declarationCount).toBeGreaterThanOrEqual(1); // the import
    expect(report.callCount).toBeGreaterThanOrEqual(1); // at least one real guard call
    expect(report.naiveGrepLineCount).toBeGreaterThan(report.callCount);
  });

  it("grading.ts: summing two guards' naive grep counts double-counts their shared import line", () => {
    const path = join(process.cwd(), "src/app/actions/grading.ts");
    const source = readFileSync(path, "utf8");
    const userReport = countSymbolOccurrences(source, "grading.ts", "requireUser");
    const ownerReport = countSymbolOccurrences(source, "grading.ts", "requireAppOwner");
    const naiveSummed = userReport.naiveGrepLineCount + ownerReport.naiveGrepLineCount;
    const trueCallSites = userReport.callCount + ownerReport.callCount;
    // Both guards are imported on the same line, so summing each symbol's
    // own naive line count counts that shared import line twice - the exact
    // mistake RULING 135's third instance describes.
    expect(naiveSummed).toBeGreaterThan(trueCallSites);
  });
});
