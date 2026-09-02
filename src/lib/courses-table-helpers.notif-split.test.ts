// F2: useCoursesData.ts's per-course live Canvas check
// (getCourseNotificationsAction) already runs on every page load for every
// course with both a canvasUrl and an institution - but its error branch was
// being discarded entirely (`if (!("error" in r)) map[id] = r;`), so a
// course whose live check failed (a malformed course URL, a revoked token,
// or - before F1 broadened who gets called - a missing institution) rendered
// identically to one that was never checked. splitCourseNotifResults is the
// extracted pure function behind the fix; this is its direct coverage.

import { describe, it, expect } from "vitest";
import { splitCourseNotifResults, type CourseNotifResult } from "./courses-table-helpers";

describe("splitCourseNotifResults", () => {
  it("returns empty maps for an empty batch", () => {
    expect(splitCourseNotifResults([])).toEqual({ ok: {}, errors: {} });
  });

  it("keys a successful result into ok, keyed by course id", () => {
    const entries: (readonly [string, CourseNotifResult])[] = [["c1", { needsGrading: 2, unread: 1 }]];
    expect(splitCourseNotifResults(entries)).toEqual({
      ok: { c1: { needsGrading: 2, unread: 1 } },
      errors: {},
    });
  });

  // This is the exact regression this function exists to fix: before it, an
  // error entry was silently dropped rather than surfaced anywhere.
  it("keys an error result into errors, keyed by course id - not discarded", () => {
    const entries: (readonly [string, CourseNotifResult])[] = [
      ["c2", { error: "Course URL must look like .../courses/123." }],
    ];
    expect(splitCourseNotifResults(entries)).toEqual({
      ok: {},
      errors: { c2: "Course URL must look like .../courses/123." },
    });
  });

  it("splits a mixed batch correctly, one course per outcome", () => {
    const entries: (readonly [string, CourseNotifResult])[] = [
      ["ok1", { needsGrading: 0, unread: 3 }],
      ["err1", { error: "Set this course's institution to load notifications." }],
      ["ok2", { needsGrading: 1, unread: 0 }],
    ];
    expect(splitCourseNotifResults(entries)).toEqual({
      ok: { ok1: { needsGrading: 0, unread: 3 }, ok2: { needsGrading: 1, unread: 0 } },
      errors: { err1: "Set this course's institution to load notifications." },
    });
  });

  it("keeps ok and errors disjoint for a batch where every course id appears once (the real caller's shape - useCoursesData maps one entry per course)", () => {
    const entries: (readonly [string, CourseNotifResult])[] = [
      ["a", { needsGrading: 0, unread: 0 }],
      ["b", { error: "Course URL must look like .../courses/123." }],
      ["c", { needsGrading: 1, unread: 2 }],
    ];
    const { ok, errors } = splitCourseNotifResults(entries);
    for (const key of Object.keys(ok)) {
      expect(Object.prototype.hasOwnProperty.call(errors, key)).toBe(false);
    }
    for (const key of Object.keys(errors)) {
      expect(Object.prototype.hasOwnProperty.call(ok, key)).toBe(false);
    }
  });
});
