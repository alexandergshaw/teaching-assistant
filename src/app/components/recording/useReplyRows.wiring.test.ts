// docs/course-student-intelligence-acceptance-criteria.md D21d: course
// scoping. useReplyRows.ts is a hook (this repo's vitest is node-env and
// renders nothing - see that file's own header). These are source-text
// checks for the wiring a pure-function unit test
// (discussion-serialization.test.ts's own "course scoping (D21d)" block)
// cannot reach: that clearTable actually FILTERS rather than resetting the
// whole table, that mergeIncoming stamps through stampNewRowsWithCourse
// rather than committing mergeCapturedPosts's raw output, and that moveRow
// operates on the scoped slice rather than the whole table.

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const SOURCE = fs.readFileSync(path.resolve(process.cwd(), "src/app/components/recording/useReplyRows.ts"), "utf-8");

describe("useReplyRows.ts D21d course-scoping wiring", () => {
  it('takes an optional courseId defaulting to "", collapsed to the undefined scope', () => {
    expect(SOURCE).toMatch(/export function useReplyRows\(courseId: string\): UseReplyRowsReturn \{/);
    expect(SOURCE).toMatch(/const courseScope = courseId\.length > 0 \? courseId : undefined;/);
  });

  it("mergeIncoming stamps the merge's own output through stampNewRowsWithCourse before computing `changed`, never committing mergeCapturedPosts's raw rows directly", () => {
    expect(SOURCE).toMatch(
      /const merged = mergeCapturedPosts\(rowsRef\.current, incoming, now\);[\s\S]{0,200}const finalRows = stampNewRowsWithCourse\(merged\.rows, merged\.addedIds, courseScope\);/
    );
  });

  it("moveRow sorts/filters the COURSE-SCOPED rows, not the whole table, then splices the reordered result back in among every other scope", () => {
    expect(SOURCE).toMatch(/const scopedRows = rowsRef\.current\.filter\(\(r\) => replyRowMatchesCourse\(r, courseScope\)\);\s*\n\s*const displayed = sortReplyRowsForTable\(scopedRows, curSort\);/);
    expect(SOURCE).toMatch(/const otherRows = rowsRef\.current\.filter\(\(r\) => !replyRowMatchesCourse\(r, courseScope\)\);\s*\n\s*commitRows\(\[\.\.\.otherRows, \.\.\.result\.rows\]\);/);
  });

  it("clearTable FILTERS the table down to rows outside the current scope - it never resets to an empty array, which would erase every other course's rows", () => {
    expect(SOURCE).not.toMatch(/const clearTable = useCallback\(\(\) => \{\s*editSeqRef\.current\.clear\(\);\s*resourceSeqRef\.current\.clear\(\);\s*tableEpochRef\.current \+= 1;\s*commitRows\(\[\]\);/);
    expect(SOURCE).toMatch(/commitRows\(rowsRef\.current\.filter\(\(r\) => !replyRowMatchesCourse\(r, courseScope\)\)\);/);
  });

  it("clearTable drops editSeq/resourceSeq only for the ids actually in scope - never a blanket .clear() that would also hit another course's rows", () => {
    expect(SOURCE).toMatch(
      /const idsInScope = rowsRef\.current\.filter\(\(r\) => replyRowMatchesCourse\(r, courseScope\)\)\.map\(\(r\) => r\.id\);\s*\n\s*idsInScope\.forEach\(\(id\) => \{\s*\n\s*editSeqRef\.current\.delete\(id\);\s*\n\s*resourceSeqRef\.current\.delete\(id\);/
    );
  });

  it("the returned rawRows/totalCount/rows are built from scopedRawRows, never the whole-table rawRows state, and unattributedCount is exposed", () => {
    expect(SOURCE).toMatch(/totalCount: scopedRawRows\.length,/);
    expect(SOURCE).toMatch(/rawRows: scopedRawRows,/);
    expect(SOURCE).toMatch(/unattributedCount,/);
  });

  it("unattributedCount is derived from the WHOLE table (rawRows), not the scoped slice - it must stay visible regardless of which course is selected", () => {
    expect(SOURCE).toMatch(/const unattributedCount = useMemo\(\(\) => countUnattributedReplyRows\(rawRows\), \[rawRows\]\);/);
  });
});
