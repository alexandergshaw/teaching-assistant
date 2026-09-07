// docs/course-student-intelligence-acceptance-criteria.md D21d: course
// scoping. useGradingRows.ts is a hook (this repo's vitest is node-env and
// renders nothing). These are source-text checks for the wiring a
// pure-function unit test (grading-row.test.ts's own "course scoping (D21d)"
// block) cannot reach: that setAllRows scopes its whole-table replace to the
// current course rather than clobbering every other course's rows, and that
// clearTable FILTERS rather than resetting the whole table.
//
// D22b/D23e (this task): assessmentId joined courseId as a second required
// parameter, and setAllRows now composes stampGradingRowsWithCourse THEN
// stampGradingRowsWithAssessment on the same `previousScoped` lookup before
// the final commitRows - see useGradingRows.ts's own ASSESSMENT SCOPING
// header section. The assertions below were re-verified against the actual
// source after this change (not just carried over) - see this task's own
// report for the sabotage log.

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const SOURCE = fs.readFileSync(path.resolve(process.cwd(), "src/app/components/grading-recording/useGradingRows.ts"), "utf-8");

describe("useGradingRows.ts D21d course-scoping wiring", () => {
  it('takes courseId AND assessmentId, each collapsed "" -> the undefined scope', () => {
    expect(SOURCE).toMatch(/export function useGradingRows\(courseId: string, assessmentId: string\): UseGradingRowsReturn \{/);
    expect(SOURCE).toMatch(/const courseScope = courseId\.length > 0 \? courseId : undefined;/);
    expect(SOURCE).toMatch(/const assessmentScope = assessmentId\.length > 0 \? assessmentId : undefined;/);
  });

  it("setAllRows replaces only THIS course's own slice - it stamps new rows with the current scope via stampGradingRowsWithCourse and recombines with every OTHER scope's rows, never a bare commitRows(next)", () => {
    expect(SOURCE).not.toMatch(/const setAllRows = useCallback\(\s*\(next: GradingRow\[\]\) => \{\s*commitRows\(next\);/);
    expect(SOURCE).toMatch(/const stampedCourse = stampGradingRowsWithCourse\(next, previousScoped, courseScope\);/);
    expect(SOURCE).toMatch(/const otherScopes = rowsRef\.current\.filter\(\(r\) => !gradingRowMatchesCourse\(r, courseScope\)\);\s*\n\s*commitRows\(\[\.\.\.otherScopes, \.\.\.stamped\]\);/);
  });

  it("D22b/D23e: setAllRows ALSO stamps the assessment axis via stampGradingRowsWithAssessment, composed on top of stampedCourse using the SAME previousScoped lookup - not a second, independently-scoped array", () => {
    expect(SOURCE).toMatch(/const stamped = stampGradingRowsWithAssessment\(stampedCourse, previousScoped, assessmentScope\);/);
  });

  it("clearTable FILTERS the table down to rows outside the current scope - it never resets to an empty array, which would erase every other course's rows", () => {
    expect(SOURCE).not.toMatch(/const clearTable = useCallback\(\(\) => \{\s*commitRows\(\[\]\);/);
    expect(SOURCE).toMatch(/commitRows\(rowsRef\.current\.filter\(\(r\) => !gradingRowMatchesCourse\(r, courseScope\)\)\);/);
  });

  it("the returned rawRows/totalCount/rows are built from scopedRawRows, never the whole-table rawRows state, and unattributedCount is exposed", () => {
    expect(SOURCE).toMatch(/totalCount: scopedRawRows\.length,/);
    expect(SOURCE).toMatch(/rawRows: scopedRawRows,/);
    expect(SOURCE).toMatch(/unattributedCount,/);
  });

  it("unattributedCount is derived from the WHOLE table (rawRows), not the scoped slice", () => {
    expect(SOURCE).toMatch(/const unattributedCount = useMemo\(\(\) => countUnattributedGradingRows\(rawRows\), \[rawRows\]\);/);
  });
});

// ---------------------------------------------------------------------------
// docs/course-student-intelligence-acceptance-criteria.md D23c: late marking.
// markSubmissionLate is built and returned by this hook but has no caller
// yet (see useGradingRows.ts's own LATE MARKING header section for the
// honest reachability finding: a real per-row control needs GradingTable.tsx,
// which is outside this task's file set). These checks pin the wiring that
// DOES exist - the function's own correctness (never a timestamp, a real
// no-op for a missing id) - so a future caller inherits a mutator that
// already behaves correctly rather than one that merely compiles.
// ---------------------------------------------------------------------------

describe("useGradingRows.ts D23c markSubmissionLate wiring", () => {
  it("sets submissionTimeStatus to the literal 'marked-late' and clears submittedAt - never derives a timestamp from a clock read", () => {
    expect(SOURCE).toMatch(/i === idx \? \{ \.\.\.r, submissionTimeStatus: "marked-late" as const, submittedAt: undefined \} : r/);
    expect(SOURCE).not.toMatch(/submittedAt:\s*new Date\(/);
  });

  it("is a no-op when the id is not found - mirrors editField/applyRosterMatch's own guard, not a silent full-table rewrite", () => {
    expect(SOURCE).toMatch(/const markSubmissionLate = useCallback\(\s*\(id: string\) => \{\s*const raw = rowsRef\.current;\s*const idx = raw\.findIndex\(\(r\) => r\.id === id\);\s*if \(idx === -1\) return;/);
  });

  it("is threaded through to the hook's return value", () => {
    expect(SOURCE).toMatch(/markSubmissionLate,\s*\n\s*persistError,/);
  });
});
