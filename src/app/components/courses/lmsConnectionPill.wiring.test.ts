// F1/F2 (LMS connection status pill): confirms the discarded live-Canvas-
// check error actually reaches LmsCell's pill, all the way through
// useCoursesData -> CoursesTab -> CoursesTable -> CourseRow -> LmsCell. Each
// of those is a plain data-plumbing hop (no new logic), but a hop dropped
// anywhere in that chain would leave the pill rendering "unknown" forever
// even though useCoursesData.ts itself now keeps the error - "a capability
// can ship dead with every gate green; trace it from the control to the
// code." lmsConnectionStatusFor and splitCourseNotifResults each already
// have their own direct unit coverage (courses-table-helpers.lms-connection-
// status.test.ts / courses-table-helpers.notif-split.test.ts); this file is
// the reachability check across the component chain, which - per this
// repo's vitest setup (node-env, *.test.ts only, no component rendering) -
// has to be a source-text check rather than a render.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

function read(relPath: string): string {
  return readFileSync(join(process.cwd(), relPath), "utf8");
}

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

describe("stripComments (canary)", () => {
  it("removes a reference that only exists in a comment while keeping real code", () => {
    const source = "// lmsErrorByCourse should be threaded here\nconst real = lmsErrorByCourse;";
    const cleaned = stripComments(source);
    expect(cleaned).not.toMatch(/should be threaded/);
    expect(cleaned).toMatch(/const real = lmsErrorByCourse;/);
  });
});

describe("the discarded live-check error reaches LmsCell's connection pill end to end", () => {
  it("useCoursesData.ts keeps errors via splitCourseNotifResults and returns lmsErrorByCourse", () => {
    const source = stripComments(read("src/app/components/courses/useCoursesData.ts"));
    expect(source).toMatch(/splitCourseNotifResults\(/);
    expect(source).toMatch(/setLmsErrorByCourse\(/);
    // The hook's return object must actually expose it - a helper that is
    // called but never returned is just as dead as one that is discarded.
    expect(source).toMatch(/\breturn\s*\{[\s\S]*lmsErrorByCourse[\s\S]*\}/);
  });

  it("CoursesTab.tsx reads lmsErrorByCourse from the hook and forwards it into CoursesTable", () => {
    const source = stripComments(read("src/app/components/CoursesTab.tsx"));
    expect(source).toMatch(/lmsErrorByCourse/);
    expect(source).toMatch(/lmsErrorByCourse=\{lmsErrorByCourse\}/);
  });

  it("CoursesTable.tsx accepts lmsErrorByCourse and passes a per-course value into CourseRow as lmsLiveError", () => {
    const source = stripComments(read("src/app/components/courses/CoursesTable.tsx"));
    expect(source).toMatch(/lmsErrorByCourse:\s*Record<string,\s*string>/);
    expect(source).toMatch(/lmsLiveError=\{lmsErrorByCourse\[c\.id\]\}/);
  });

  it("CourseRow.tsx accepts lmsLiveError/lmsLiveCheck and passes them into LmsCell as liveError/liveCheck", () => {
    const source = stripComments(read("src/app/components/courses/CourseRow.tsx"));
    expect(source).toMatch(/lmsLiveError/);
    expect(source).toMatch(/liveError=\{lmsLiveError\}/);
    expect(source).toMatch(/liveCheck=\{lmsLiveCheck\}/);
  });

  it("LmsCell.tsx accepts liveCheck/liveError and feeds them into lmsConnectionStatusFor for the at-rest pill", () => {
    const source = stripComments(read("src/app/components/courses/LmsCell.tsx"));
    expect(source).toMatch(/liveCheck\?:/);
    expect(source).toMatch(/liveError\?:/);
    expect(source).toMatch(/lmsConnectionStatusFor\(course,\s*liveCheck,\s*liveError\)/);
    // The pill itself must actually render inside the non-editing branch,
    // not only be computed and discarded.
    expect(source).toMatch(/<LmsStatusPill status=\{status\}\s*\/>/);
  });
});
