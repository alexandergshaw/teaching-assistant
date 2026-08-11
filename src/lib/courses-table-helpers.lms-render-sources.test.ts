// lmsRenderSourcesFor's own coverage - split out rather than appended to
// courses-table-helpers.exports.test.ts so that file's existing canLms/
// canImport tests (docs/REGRESSION.md entry 196) stay focused on the
// exclusive-or import-eligibility rule, while this file pins the newer,
// deliberately NON-exclusive predicate the Course Content tab's source
// picker is built on (docs/REGRESSION.md entry 263's Limits: "the picker...
// lands next").

import { describe, it, expect } from "vitest";
import { lmsRenderSourcesFor } from "./courses-table-helpers";
import { makeCourse } from "./courses-table-helpers.fixtures";

describe("lmsRenderSourcesFor", () => {
  it("is {live:false, export:false} for a course with neither source", () => {
    expect(lmsRenderSourcesFor(makeCourse({ canvasUrl: null, institution: null, exportFiles: [] }))).toEqual({
      live: false,
      export: false,
    });
  });

  it("is {live:true, export:false} for a course with only a live Canvas connection", () => {
    expect(
      lmsRenderSourcesFor(makeCourse({ canvasUrl: "https://x/courses/1", institution: "MCC", exportFiles: [] }))
    ).toEqual({ live: true, export: false });
  });

  it("is {live:false, export:true} for a course with only a source export - the case canLms alone cannot reach", () => {
    expect(
      lmsRenderSourcesFor(
        makeCourse({
          canvasUrl: null,
          institution: null,
          exportFiles: [{ name: "a.imscc", path: "p/a", size: 10, addedAt: "2024-01-01T00:00:00.000Z" }],
        })
      )
    ).toEqual({ live: false, export: true });
  });

  it("is {live:true, export:true} when a course has both - deliberately NOT exclusive-or, unlike canImport", () => {
    expect(
      lmsRenderSourcesFor(
        makeCourse({
          canvasUrl: "https://x/courses/1",
          institution: "MCC",
          exportFiles: [{ name: "a.imscc", path: "p/a", size: 10, addedAt: "2024-01-01T00:00:00.000Z" }],
        })
      )
    ).toEqual({ live: true, export: true });
  });

  it("export is false when every export file is app-generated (mirrors latestSourceExportFile, not raw exportFiles.length)", () => {
    expect(
      lmsRenderSourcesFor(
        makeCourse({
          canvasUrl: null,
          institution: null,
          exportFiles: [
            { name: "built.imscc", path: "p/built", size: 10, addedAt: "2024-01-01T00:00:00.000Z", generated: true },
          ],
        })
      )
    ).toEqual({ live: false, export: false });
  });
});
