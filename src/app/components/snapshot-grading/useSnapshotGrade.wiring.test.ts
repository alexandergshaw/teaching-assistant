// R1 (Ruling R1-B item 2, the cross-file invariant). No test in this repo
// exercised useSnapshotGrade.ts's own wiring before this file - there is no
// useSnapshotGrade.test.ts. `handleGrade` is a `useCallback` return value
// (useSnapshotGrade.ts:83) - React throws "Invalid hook call... Hooks can
// only be called inside of the body of a function component" the moment
// `useCallback` runs outside React's render machinery, and this repo's
// vitest is node-env with no renderer (docs/loop/this-repo.md section 2:
// no component is ever rendered by any test here). Confirmed by running
// exactly that call during this wave: `TypeError: Cannot read properties of
// null (reading 'useCallback')` at useSnapshotGrade.ts:83. RULING R1-H is
// explicit that this file must not claim otherwise - the design document did,
// in a different section from where it also correctly said the opposite, and
// the ruling singles that contradiction out.
//
// So this file is SOURCE-TEXT ONLY - this repo's own *.wiring.test.ts
// convention (docs/loop/this-repo.md section 2: 64 such files, "the only
// mechanism that can check wiring" here) - reading useSnapshotGrade.ts as
// TEXT and pinning the FACTS that make the R1-B mapping correct, never the
// runtime behaviour those facts imply (that is what
// snapshot-shot.test.ts's buildIdByGlobalIndex oracle, snapshot-row.test.ts's
// resolveCitationShotPosition/buildShotReports oracles, and
// snapshot-citations.test.ts's shotId assertions cover, all of them real
// unit tests over plain functions this hook merely calls).

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const HOOK_PATH = join(process.cwd(), "src/app/components/snapshot-grading/useSnapshotGrade.ts");
const hookSource = readFileSync(HOOK_PATH, "utf8");

// BLOCKER 3 (round 3 remediation, restated a THIRD time): this was the last
// of three stripComments copies still blind to a TRAILING comment - the old
// `.replace(/^[ \t]*\/\/.*$/gm, "")` only strips a comment that starts at
// the beginning of a line. Matches snapshot-grading.structure.test.ts's and
// useSnapshotAutoGrade.wiring.test.ts's own copies exactly: split on
// /\r?\n/ (CRLF-safe - a bare `.` never matches "\r"), then strip a
// trailing "//" anywhere on each line, not just at its start.
// EXECUTED DEFEAT: replacing useSnapshotGrade.ts:275 with
// `void 0; // if (!controller.signal.aborted && mountedRef.current)
// setGrading(false);` left every assertion below green under the old
// stripComments, because the real code text survived as an un-stripped
// trailing comment and still matched the SHOULD-FIX 8 regex.
function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

const stripped = stripComments(hookSource);

// CANARY (BLOCKER 3), built with String.fromCharCode(13) (never a \r escape
// in source text - Write/Edit materialize that as a literal character).
// Sabotage proof: reverting to the line-start-only regex above makes this
// fail on a trailing comment.
describe("stripComments handles CRLF line endings and trailing comments (BLOCKER 3 canary)", () => {
  const CR = String.fromCharCode(13);

  it("strips both a trailing and a whole-line // comment on CRLF-terminated lines", () => {
    const fixture = `const x = 1;${CR}\nconst y = 2; // trailing comment must go${CR}\n// whole-line comment must go${CR}\nconst z = 3;`;
    const result = stripComments(fixture);
    expect(result).not.toContain("trailing comment must go");
    expect(result).not.toContain("whole-line comment must go");
    expect(result).toContain("const y = 2;");
    expect(result).toContain("const z = 3;");
  });
});

describe("R1-B: idByGlobalIndex is built from `gradeShots`, never from a ref", () => {
  // N15c (Ruling D2): the signature now takes an optional explicit shot
  // list, and `gradeShots = explicitShots ?? shots` is what every line
  // below actually reads - these four assertions are RENAMED from `shots`
  // to `gradeShots` (section 3.4 of the design), not newly invented; left
  // matching bare `shots` they would fail on a CORRECT implementation.
  it("calls buildIdByGlobalIndex(gradeShots) - the explicit-shots-or-fallback binding, not shotsRef.current", () => {
    expect(stripped).toMatch(/buildIdByGlobalIndex\(\s*gradeShots\s*\)/);
  });

  it("never reads shotsRef.current anywhere in this file - RULING R1-G: the controlled form of the grep the ruling kept, after deleting the uncontrolled standalone form (which returns 0 today and would pass whether or not the map is correct). UNCHANGED, UNMOVED by N15c - D2 explicitly forbids re-specifying handleGrade to read a ref.", () => {
    expect(stripped).not.toMatch(/shotsRef\.current/);
  });

  it("idByGlobalIndex is built in the same synchronous stretch as shotsForGrade, before the `await` that is this function's only yield point - the closure-safety argument (carried forward from the checker) that lets `gradeShots` be read safely without a ref at all", () => {
    const shotsForGradeIdx = stripped.indexOf("const shotsForGrade =");
    const idByGlobalIndexIdx = stripped.indexOf("const idByGlobalIndex = buildIdByGlobalIndex(gradeShots);");
    const awaitIdx = stripped.indexOf("const result = await snapshotGradeAction(");
    expect(shotsForGradeIdx).toBeGreaterThan(-1);
    expect(idByGlobalIndexIdx).toBeGreaterThan(shotsForGradeIdx);
    expect(awaitIdx).toBeGreaterThan(idByGlobalIndexIdx);
  });

  // N15c (Ruling D2, section 3.4's new assertion): the actual crux of D2 -
  // gradeShots is computed from the explicit parameter (never a ref) and
  // BEFORE shotsForGrade/idByGlobalIndex/the await.
  it("gradeShots is explicitShots ?? shots, computed before shotsForGrade and the await", () => {
    const gradeShotsIdx = stripped.indexOf("const gradeShots = explicitShots ?? shots;");
    const shotsForGradeIdx = stripped.indexOf("const shotsForGrade =");
    expect(gradeShotsIdx).toBeGreaterThan(-1);
    expect(shotsForGradeIdx).toBeGreaterThan(gradeShotsIdx);
  });
});

describe("R1-B: verifySnapshotCitations receives idByGlobalIndex as its fifth argument", () => {
  it("passes idByGlobalIndex as the last argument to verifySnapshotCitations", () => {
    const callStart = stripped.indexOf("verifySnapshotCitations(");
    expect(callStart).toBeGreaterThan(-1);
    const callEnd = stripped.indexOf(");", callStart);
    const call = stripped.slice(callStart, callEnd);
    expect(call).toMatch(/idByGlobalIndex\s*$/);
  });
});

describe("R1-B: buildShotReports replaces the inline shotReports construction", () => {
  it("calls buildShotReports(gradeShots, shotReads) rather than re-deriving the report array inline", () => {
    expect(stripped).toMatch(/const shotReports = buildShotReports\(\s*gradeShots\s*,\s*shotReads\s*\)/);
  });
});

// ---------------------------------------------------------------------------
// SHOULD-FIX 8 (N15c instruction 6): the try/finally around the grade call
// was shipped with no assertion anywhere in this repo. Before this fix, a
// REJECTING snapshotGradeAction call (never reaching the "error" in result
// branch, which is inside the try) left `grading` stuck true forever -
// disabling both the Grade button and the auto-grade trigger for the rest of
// the session with no message. The finally clears it unconditionally, but
// ONLY for a call this controller still owns (not aborted, still mounted) -
// a call already superseded by a newer one must not clear state the newer
// call owns.
// ---------------------------------------------------------------------------

describe("SHOULD-FIX 8: the grade call's try/finally clears `grading` even when the call rejects before reaching its own 'error' in result branch", () => {
  it("the snapshotGradeAction await sits inside a try block, not merely followed by a .catch chain", () => {
    const tryIdx = stripped.indexOf("try {");
    const awaitIdx = stripped.indexOf("const result = await snapshotGradeAction(");
    expect(tryIdx).toBeGreaterThan(-1);
    expect(awaitIdx).toBeGreaterThan(tryIdx);
  });

  it("that try has a matching finally which calls setGrading(false), guarded by this call's own controller/mounted check - so a call already superseded (aborted, or unmounted) does not clear a NEWER call's state", () => {
    const finallyIdx = stripped.indexOf("} finally {");
    expect(finallyIdx).toBeGreaterThan(-1);
    const finallyBody = stripped.slice(finallyIdx, stripped.indexOf("}", finallyIdx + "} finally {".length) + 1);
    expect(finallyBody).toMatch(/if\s*\(\s*!controller\.signal\.aborted\s*&&\s*mountedRef\.current\s*\)\s*setGrading\(false\);/);
  });

  it("setGrading(false) is called from ONLY the finally block - never a second time inside the try's own success path (the finally is the single place this call's grading state is cleared)", () => {
    const setGradingFalseCalls = stripped.match(/setGrading\(false\)/g) ?? [];
    expect(setGradingFalseCalls.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// BLOCKER C (round 2 remediation): the cross-student overwrite. Next student
// is not gated on `grading`, so a grade for student A can still be in flight
// when the boundary is crossed (activeRowIdRef already null, shots/
// transcriptText already cleared). Without this guard, A's belated
// resolution mints/re-points a row via resolveGradeTarget(rows, null, mint),
// and B's own later grade resolves THAT row - overwriting A's persisted
// assessment. Proven, not merely asserted: reverting the two `startGeneration`
// lines below (keeping everything else) makes every assertion in this block
// fail, since the identifiers being pinned would no longer exist in the file
// at all.
// ---------------------------------------------------------------------------

describe("BLOCKER C: a stale student-boundary generation discards the grade resolution, without wedging `grading`", () => {
  it("captures studentGenerationRef.current into startGeneration BEFORE beginGradeAbort/setGrading(true), never after", () => {
    const captureIdx = stripped.indexOf("const startGeneration = studentGenerationRef.current;");
    const controllerIdx = stripped.indexOf("const controller = beginGradeAbort();");
    expect(captureIdx).toBeGreaterThan(-1);
    expect(controllerIdx).toBeGreaterThan(captureIdx);
  });

  it("checks studentGenerationRef.current !== startGeneration AFTER the snapshotGradeAction await and BEFORE the 'error' in result branch", () => {
    const awaitIdx = stripped.indexOf("const result = await snapshotGradeAction(");
    const checkIdx = stripped.indexOf("if (studentGenerationRef.current !== startGeneration) {", awaitIdx);
    const errorBranchIdx = stripped.indexOf('if ("error" in result)', awaitIdx);
    expect(awaitIdx).toBeGreaterThan(-1);
    expect(checkIdx).toBeGreaterThan(awaitIdx);
    expect(errorBranchIdx).toBeGreaterThan(checkIdx);
  });

  it("the generation check sits AFTER the existing aborted/mounted check - a stale generation is discarded the same way an aborted/unmounted call already is, not as a competing first check", () => {
    const abortedCheckIdx = stripped.indexOf("if (controller.signal.aborted || !mountedRef.current) return;");
    const generationCheckIdx = stripped.indexOf(
      "if (studentGenerationRef.current !== startGeneration) {"
    );
    expect(abortedCheckIdx).toBeGreaterThan(-1);
    expect(generationCheckIdx).toBeGreaterThan(abortedCheckIdx);
  });

  // ---------------------------------------------------------------------------
  // SHOULD-FIX 4 (round 3 remediation): the generation check used to be a
  // bare `return;` - a completed, correct grade discarded with no signal at
  // all. This pins that the discard is now announced, without changing the
  // discard's own semantics (still no row write, still no re-point of
  // activeRowIdRef).
  // ---------------------------------------------------------------------------

  describe("SHOULD-FIX 4: the stale-generation discard is announced, not silently dropped", () => {
    it("the generation check's own block calls announce( before its own return, and mentions the discard in its copy", () => {
      const checkIdx = stripped.indexOf("if (studentGenerationRef.current !== startGeneration) {");
      expect(checkIdx).toBeGreaterThan(-1);
      const blockEnd = stripped.indexOf("return;", checkIdx);
      expect(blockEnd).toBeGreaterThan(checkIdx);
      const block = stripped.slice(checkIdx, blockEnd);
      expect(block).toMatch(/announce\(/);
      expect(block).toMatch(/moved on/);
      expect(block).toMatch(/not saved/);
    });
  });

  it("the naive-fix trap is NOT taken: the finally block's setGrading(false) guard checks only controller.signal.aborted and mountedRef.current - never studentGenerationRef - so a stale-generation call still clears `grading` correctly instead of relying on an abort that would wedge it true forever", () => {
    const finallyIdx = stripped.indexOf("} finally {");
    expect(finallyIdx).toBeGreaterThan(-1);
    const finallyBody = stripped.slice(finallyIdx, stripped.indexOf("}", finallyIdx + "} finally {".length) + 1);
    expect(finallyBody).toMatch(
      /if\s*\(\s*!controller\.signal\.aborted\s*&&\s*mountedRef\.current\s*\)\s*setGrading\(false\);/
    );
    expect(finallyBody).not.toMatch(/studentGenerationRef/);
  });

  it("UseSnapshotGradeParams declares studentGenerationRef: MutableRefObject<number> - the panel's own boundary-crossing signal, never re-derived from activeRowIdRef or `grading`", () => {
    expect(hookSource).toMatch(/studentGenerationRef:\s*MutableRefObject<number>;/);
  });
});

describe("R1-E: the transcript lookup is matched by shot.id, not by read-time position alone", () => {
  it("builds an id-keyed transcript map from shotReads before deriving the index-keyed one verifySnapshotCitations reads", () => {
    const idMapIdx = stripped.indexOf("const transcriptsByShotId = new Map<string, string>();");
    const indexMapIdx = stripped.indexOf("const transcriptsByShotIndex = new Map<number, string>();");
    expect(idMapIdx).toBeGreaterThan(-1);
    expect(indexMapIdx).toBeGreaterThan(idMapIdx);
  });

  it("the index-keyed map is populated by walking the CURRENT `gradeShots` array and looking each one up by its own id - not by re-keying shotReads' own (read-time) numeric keys directly", () => {
    const indexMapIdx = stripped.indexOf("const transcriptsByShotIndex = new Map<number, string>();");
    const afterIdx = stripped.slice(indexMapIdx, indexMapIdx + 300);
    expect(afterIdx).toMatch(/gradeShots\.forEach\(\s*\(\s*shot\s*,\s*i\s*\)/);
    expect(afterIdx).toMatch(/transcriptsByShotId\.get\(\s*shot\.id\s*\)/);
  });
});
