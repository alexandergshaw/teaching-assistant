// A14 rulings, "THE WIRING DETECTOR IS NOT OPTIONAL" (B3): every unit test
// of parseSubmissionFileName/groupSubmissionsByStudent calls them with an
// explicit literal zipParents/zipChain argument - none of them prove the two
// real production callers (extraction.ts's extractStudentEntries and
// engine.ts's gradeSubmissions) actually THREAD that value from
// extractSubmissions through to groupSubmissionsByStudent. A fix that only
// changes utils.ts's signature can ship with both call sites unwired, with
// lint, tsc, next build and the whole vitest suite green, and production
// completely unchanged - the exact failure mode this repo has shipped a
// guard test for before (docs/loop's own recorded lesson). This is a
// source-text test in the style of grade-result-doors.wiring.test.ts and
// src/app/actions/githubRepoGrading.wiring.test.ts: it reads the real files
// and checks the CALL, not the behavior (vitest is node-env and renders
// nothing, and neither extractSubmissions' real JSZip parsing nor a live
// Gemini call is worth mocking just to prove a call site forwards a value).
//
// A14 rulings v2 CONDITION 1 hardens this beyond the original version: the
// original callForwardsZipParents only checked whether the string
// "zipParents" appeared inside the FIRST groupSubmissionsByStudent(...)
// call's own parens. Two measured evasions still passed that: (a) a locally
// fabricated `const zipParents = {};` forwarded instead of the real value
// extractSubmissions produced, and (b) a second, unwired
// groupSubmissionsByStudent call appended after the wired one (`.match`
// only ever sees the first). Neither is an omission (the string
// "zipParents" really is present) so the fix here is TWO independent checks,
// both required: the file must destructure zipParents FROM the
// extractSubmissions() call, and EVERY groupSubmissionsByStudent(...) call
// in the file must forward it, not just the first one found.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

function readSource(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}

const EXTRACTION = readSource("src/lib/grade/extraction.ts");
const ENGINE = readSource("src/lib/grade/engine.ts");

/** True when `source` destructures `zipParents` directly out of an
 *  `await extractSubmissions(...)` call - i.e. the value is the REAL one
 *  extraction produced, not a locally fabricated stand-in that merely
 *  happens to share the name. Tolerant of the destructure and the
 *  `extractSubmissions(` call spanning multiple lines (both real call sites
 *  do), since `\s` matches newlines and `[^}]*` does not stop at them. */
function destructuresZipParentsFromExtractSubmissions(source: string): boolean {
  return /const\s*\{[^}]*\bzipParents\b[^}]*\}\s*=\s*await\s+extractSubmissions\(/.test(source);
}

/** True when `source` contains at least one call to
 *  groupSubmissionsByStudent(...) and EVERY such call's own argument list
 *  (scoped to that call's own parens, so an unrelated comment or a
 *  same-named local declared elsewhere cannot produce a false positive)
 *  mentions `zipParents`. Checking ALL calls (not just the first, as the
 *  original single `.match` did) is what catches a second, unwired call
 *  appended after a correctly wired one. */
function allCallsForwardZipParents(source: string): boolean {
  const calls = [...source.matchAll(/groupSubmissionsByStudent\(([\s\S]*?)\)\s*;/g)];
  if (calls.length === 0) return false;
  return calls.every((call) => /\bzipParents\b/.test(call[1]));
}

/** The combined wiring check: real value in, forwarded on every call out. */
function isWiredToRealZipParents(source: string): boolean {
  return destructuresZipParentsFromExtractSubmissions(source) && allCallsForwardZipParents(source);
}

describe("canary: the wiring checks can actually tell hit from miss", () => {
  it("passes a genuinely wired file: zipParents destructured from extractSubmissions and forwarded", () => {
    const wired = [
      "async function run(buf) {",
      "  const { submissions, rawData, zipParents } = await extractSubmissions(buf);",
      "  const g = groupSubmissionsByStudent(submissions, undefined, rawData, zipParents);",
      "  return g;",
      "}",
    ].join("\n");
    expect(destructuresZipParentsFromExtractSubmissions(wired)).toBe(true);
    expect(allCallsForwardZipParents(wired)).toBe(true);
    expect(isWiredToRealZipParents(wired)).toBe(true);
  });

  it("passes a wired file even when the destructure and the call are split across multiple lines", () => {
    const wired = [
      "async function run(buf) {",
      "  const { submissions, rawData, attemptedSupportedFiles, failedSupportedFiles, zipParents } =",
      "    await extractSubmissions(buf);",
      "  const studentSubmissions = groupSubmissionsByStudent(",
      "    submissions,",
      "    inferredFileNameLookup,",
      "    rawData,",
      "    zipParents",
      "  );",
      "  return studentSubmissions;",
      "}",
    ].join("\n");
    expect(isWiredToRealZipParents(wired)).toBe(true);
  });

  it("catches evasion (a): a locally fabricated zipParents stand-in, never sourced from extractSubmissions", () => {
    const evaded = [
      "async function run(buf) {",
      "  const { submissions, rawData } = await extractSubmissions(buf);",
      "  const zipParents = {};",
      "  const g = groupSubmissionsByStudent(submissions, undefined, rawData, zipParents);",
      "  return g;",
      "}",
    ].join("\n");
    // The string "zipParents" really is in the call's own parens, so the
    // ORIGINAL (unhardened) check would have passed this - it must fail now.
    expect(allCallsForwardZipParents(evaded)).toBe(true);
    expect(destructuresZipParentsFromExtractSubmissions(evaded)).toBe(false);
    expect(isWiredToRealZipParents(evaded)).toBe(false);
  });

  it("catches evasion (b): a second, unwired groupSubmissionsByStudent call appended after the wired one", () => {
    const evaded = [
      "async function run(buf) {",
      "  const { submissions, rawData, zipParents } = await extractSubmissions(buf);",
      "  const wired = groupSubmissionsByStudent(submissions, undefined, rawData, zipParents);",
      "  const unwired = groupSubmissionsByStudent(submissions, undefined, rawData);",
      "  return unwired;",
      "}",
    ].join("\n");
    // The original check used a single (non-global) .match, which only ever
    // sees the FIRST call - it would have passed this file too.
    expect(destructuresZipParentsFromExtractSubmissions(evaded)).toBe(true);
    expect(allCallsForwardZipParents(evaded)).toBe(false);
    expect(isWiredToRealZipParents(evaded)).toBe(false);
  });

  it("misses a file with no groupSubmissionsByStudent call at all", () => {
    expect(allCallsForwardZipParents("// no call here, just a mention of zipParents")).toBe(false);
  });
});

describe("A14: both real callers of groupSubmissionsByStudent are wired to the REAL zipParents value, on every call site", () => {
  it("extraction.ts's extractStudentEntries destructures zipParents from extractSubmissions and forwards it", () => {
    expect(EXTRACTION).toMatch(/groupSubmissionsByStudent\(/);
    expect(isWiredToRealZipParents(EXTRACTION)).toBe(true);
  });

  it("engine.ts's gradeSubmissions destructures zipParents from extractSubmissions and forwards it", () => {
    expect(ENGINE).toMatch(/groupSubmissionsByStudent\(/);
    expect(isWiredToRealZipParents(ENGINE)).toBe(true);
  });
});
