// DEFECT A (adversarial verification, closing wave): buildCourseNotLinkedMessage
// and isCourseNotLinkedMessage are the producer and detector of the same
// "course not linked" error. Before this module existed, they were coupled
// only by a hand-maintained comment saying "these must start the same way" -
// nothing enforced that. Every other test touching this error mocks one side
// (lms-syllabus-buttons.test.ts never calls the real detector) or builds its
// own fixture string (lms-generation.fixtures.ts, lms-generation-refine.test.ts,
// deck/route.test.ts's NOT_LINKED_ERROR - all three now call
// buildCourseNotLinkedMessage directly rather than hand-spelling it), so a
// rewrite of the message's opening words could once have passed every
// existing test while silently breaking the `courseNotLinked` flag every
// caller of isCourseNotLinkedMessage depends on.
//
// M15 (adversarial review, WAVE 11C, DEFECT 2): what actually makes the two
// impossible to drift apart silently is that they both reference the SAME
// exported COURSE_NOT_LINKED_PREFIX constant below, rather than each
// independently spelling it - a rewrite of the prefix changes it for both
// sides at once, by construction, with no test needed to catch a mismatch
// that structurally cannot occur. A runtime assertion that the builder's
// output "starts with COURSE_NOT_LINKED_PREFIX" therefore cannot fail for
// any value of that constant - two such tests used to live here and were
// removed for adding nothing beyond what the shared constant already
// guarantees. What the tests below verify instead are facts the shared
// constant does NOT guarantee on its own: that the detector's match is a
// genuine prefix check, not a substring search (the decoy test), that an
// unrelated message is rejected (the unrelated-message test), and that the
// built message actually contains the specific remediation facts an
// instructor needs (the remediation-facts test).
//
// D1/D2 (docs/import-course-export-to-intro-video-acceptance-criteria.md):
// the remediation-facts test below now also asserts the import route
// (Course Content source picker) that Part B of that doc adds, alongside the
// pre-existing Courses table / LMS cell / Institution column facts. Still no
// full-string equality assertion anywhere in this file, per D2 - this repo
// has twice had source-text assertions force a contorted implementation.
import { describe, it, expect } from "vitest";
import { buildCourseNotLinkedMessage, isCourseNotLinkedMessage, COURSE_NOT_LINKED_PREFIX } from "./course-not-linked";

describe("buildCourseNotLinkedMessage / isCourseNotLinkedMessage binding", () => {
  it("names the URL and points at the Courses table's LMS cell, the Course Content import route, and the Institution column - the real remediation actions (facts, not exact prose, per this repo's own over-specification history)", () => {
    const url = "https://school.instructure.com/courses/10287";
    const message = buildCourseNotLinkedMessage(url);
    expect(message.startsWith(COURSE_NOT_LINKED_PREFIX)).toBe(true);
    expect(message).toContain(url);
    expect(message).toContain("Courses table");
    expect(message.toLowerCase()).toContain("lms cell");
    expect(message.toLowerCase()).toContain("import");
    expect(message).toContain("Course Content");
    expect(message).toContain("Institution column");
    expect(isCourseNotLinkedMessage(message)).toBe(true);
  });

  it("a message that merely CONTAINS the prefix, rather than starting with it, is correctly rejected - proves the detector is a prefix match, not a substring search", () => {
    const decoy = `Some other error mentions "${COURSE_NOT_LINKED_PREFIX}" in passing but is not this error.`;
    expect(isCourseNotLinkedMessage(decoy)).toBe(false);
  });

  it("an unrelated error message is not mistaken for this one", () => {
    expect(isCourseNotLinkedMessage("Canvas is down.")).toBe(false);
  });
});
