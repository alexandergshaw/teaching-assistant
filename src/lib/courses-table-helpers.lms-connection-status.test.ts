// F1/F2 (LMS connection status pill): the reframe behind this feature is
// that LmsCell was rendering "Canvas" + "Open LMS course" for a row whose
// canLms was FALSE (canvasUrl set, institution empty), silently disabling
// five other controls with no message. lmsConnectionStatusFor is the pure
// function that decides the pill's state; this file is its direct coverage,
// split out from courses-table-helpers.test.ts by topic the way
// courses-table-helpers.exports.test.ts and
// courses-table-helpers.lms-render-sources.test.ts already are.

import { describe, it, expect } from "vitest";
import { lmsConnectionStatusFor } from "./courses-table-helpers";
import { makeCourse } from "./courses-table-helpers.fixtures";

describe("lmsConnectionStatusFor", () => {
  it("reports not-linked when there is no canvasUrl at all, regardless of institution", () => {
    expect(lmsConnectionStatusFor(makeCourse({ canvasUrl: null, institution: null }))).toEqual({ kind: "not-linked" });
    expect(lmsConnectionStatusFor(makeCourse({ canvasUrl: "  ", institution: "MCC" }))).toEqual({ kind: "not-linked" });
  });

  // Highest-value case named in the brief: a row with a canvasUrl and no
  // institution is exactly the state canLms silently treats as false while
  // LmsCell used to render as if fully connected.
  it("reports needs-institution for a row with a canvasUrl and no institution - the exact bug this feature reports on", () => {
    const course = makeCourse({ canvasUrl: "https://x.instructure.com/courses/123", institution: null });
    expect(lmsConnectionStatusFor(course)).toEqual({ kind: "needs-institution" });
  });

  it("reports needs-institution when institution is present but blank", () => {
    const course = makeCourse({ canvasUrl: "https://x.instructure.com/courses/123", institution: "   " });
    expect(lmsConnectionStatusFor(course)).toEqual({ kind: "needs-institution" });
  });

  it("reports unknown when canLms is true but no live result has landed yet (neither liveCheck nor liveError)", () => {
    const course = makeCourse({ canvasUrl: "https://x.instructure.com/courses/123", institution: "MCC" });
    expect(lmsConnectionStatusFor(course)).toEqual({ kind: "unknown" });
  });

  it("reports connected when the live check succeeded", () => {
    const course = makeCourse({ canvasUrl: "https://x.instructure.com/courses/123", institution: "MCC" });
    expect(lmsConnectionStatusFor(course, { needsGrading: 2, unread: 1 })).toEqual({
      kind: "connected",
      needsGrading: 2,
      unread: 1,
    });
  });

  it("reports failed with the reason when the live check errored", () => {
    const course = makeCourse({ canvasUrl: "https://x.instructure.com/courses/123", institution: "MCC" });
    expect(lmsConnectionStatusFor(course, undefined, "Course URL must look like .../courses/123.")).toEqual({
      kind: "failed",
      reason: "Course URL must look like .../courses/123.",
    });
  });

  it("prefers a live error over a live check when both are somehow present (they are mutually exclusive in practice)", () => {
    const course = makeCourse({ canvasUrl: "https://x.instructure.com/courses/123", institution: "MCC" });
    expect(lmsConnectionStatusFor(course, { needsGrading: 0, unread: 0 }, "Could not load notifications.")).toEqual({
      kind: "failed",
      reason: "Could not load notifications.",
    });
  });

  it("needs-institution takes priority over any live result - a live result should never occur for this state, but the local fact must win regardless", () => {
    const course = makeCourse({ canvasUrl: "https://x.instructure.com/courses/123", institution: null });
    expect(lmsConnectionStatusFor(course, { needsGrading: 5, unread: 5 }, "some error")).toEqual({
      kind: "needs-institution",
    });
  });
});
