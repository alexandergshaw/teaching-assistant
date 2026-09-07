// docs/course-student-intelligence-acceptance-criteria.md D21d: course
// scoping. useGradingRows.ts is a hook (this repo's vitest is node-env and
// renders nothing). These are source-text checks for the wiring a
// pure-function unit test (grading-row.test.ts's own "course scoping (D21d)"
// block) cannot reach: that setAllRows scopes its whole-table replace to the
// current course rather than clobbering every other course's rows, and that
// clearTable FILTERS rather than resetting the whole table.

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const SOURCE = fs.readFileSync(path.resolve(process.cwd(), "src/app/components/grading-recording/useGradingRows.ts"), "utf-8");

describe("useGradingRows.ts D21d course-scoping wiring", () => {
  it('takes an optional courseId defaulting to "", collapsed to the undefined scope', () => {
    expect(SOURCE).toMatch(/export function useGradingRows\(courseId: string\): UseGradingRowsReturn \{/);
    expect(SOURCE).toMatch(/const courseScope = courseId\.length > 0 \? courseId : undefined;/);
  });

  it("setAllRows replaces only THIS course's own slice - it stamps new rows with the current scope via stampGradingRowsWithCourse and recombines with every OTHER scope's rows, never a bare commitRows(next)", () => {
    expect(SOURCE).not.toMatch(/const setAllRows = useCallback\(\s*\(next: GradingRow\[\]\) => \{\s*commitRows\(next\);/);
    expect(SOURCE).toMatch(/const stamped = stampGradingRowsWithCourse\(next, previousScoped, courseScope\);/);
    expect(SOURCE).toMatch(/const otherScopes = rowsRef\.current\.filter\(\(r\) => !gradingRowMatchesCourse\(r, courseScope\)\);\s*\n\s*commitRows\(\[\.\.\.otherScopes, \.\.\.stamped\]\);/);
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
