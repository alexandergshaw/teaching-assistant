// The "course not linked" error message - built AND detected here, in one
// pure leaf (no "@/app/actions" import, no Supabase import, no fetch - the
// same rule commit-plan.ts/kinds.ts/post-content.ts already document for
// themselves) - so the producer and the detector can never drift apart.
//
// DEFECT A (adversarial verification, closing wave): before this, the
// message was BUILT inline in lms-syllabus-buttons.ts's courseNotLinkedError
// and DETECTED by a prefix match copied independently into two other files
// (this file's own isCourseNotLinkedMessage, and a second, separately
// spelled COURSE_NOT_LINKED_PREFIX in deck/route.ts). Every test that touched
// either side mocked one of them or used a fixture string, so nothing ever
// proved the real producer's output actually satisfied the real detector - a
// wording change to the message's opening words would have silently turned
// `courseNotLinked` off with every test still green. The message text itself
// was already rewritten twice in this file's history (see the git log for
// this comment's predecessors), so that was not a theoretical risk.
//
// The fix: `buildCourseNotLinkedMessage` is now the ONLY place this message
// is composed. lms-syllabus-buttons.ts calls it instead of building the
// string itself (a "use server" module may export only async functions, so
// the builder cannot live there - it has to live in a plain leaf like this
// one, imported by the async action). deck/route.ts imports
// isCourseNotLinkedMessage from here instead of holding its own independently-
// spelled prefix. And course-not-linked.test.ts feeds this builder's REAL
// output into this detector's REAL function - no mocks, no independently-
// spelled fixture - so a future rewrite that changes the opening words fails
// that test directly, the same day it happens, instead of only failing
// silently in production.
export const COURSE_NOT_LINKED_PREFIX = "No saved course is linked to";

/**
 * The exact "not linked" error message for a Canvas URL with no matching
 * saved course row (AC S2 - a specific, actionable message naming the URL,
 * never a generic failure). The sole owner of this wording; every caller
 * that used to build it inline now calls this instead.
 *
 * M13 (docs/module-intro-video-script-acceptance-criteria.md, finding 14):
 * the old advice - "Set this course's Canvas URL on its course row" - was
 * actively harmful. Following it the natural way (pasting the full
 * https://... URL from the Canvas address bar into AddCourseForm.tsx's
 * free-text field) stores a FULL url, which per finding 12 can never match a
 * host-less tab URL - the ONE shape CoursePicker.tsx/LmsCell.tsx ever emit.
 *
 * M14 (adversarial review of M12/M13 - "FIX WAVE 7", DEFECT 2): M13's own
 * rewrite - "open the Courses table and link it there" - became the SAME
 * class of unachievable advice M13 itself was written to eliminate. Linking
 * a course from the Courses table's LMS cell runs LmsCell.tsx's `commit()`,
 * which saves ONLY `canvasUrl` - it never writes `institution` (see
 * course-canvas-url-match.ts's own header comment for the regression this
 * caused). An instructor who followed M13's advice literally - re-linking
 * from the LMS cell - would see this identical error again, because that
 * action cannot be what was actually missing.
 *
 * With course-canvas-url-match.ts's M14 fix, a host-less link from the LMS
 * cell DOES now resolve on its own whenever this course's Canvas course
 * number is not shared by any OTHER saved course - the common case, and the
 * only one LmsCell alone can ever produce. This error can therefore still
 * legitimately fire two different ways: (1) the course genuinely has not
 * been linked from the LMS cell yet, or (2) it HAS been linked, but another
 * saved course shares the same numeric Canvas course id, so the two need
 * their own `institution` value to be told apart - the ONE thing LmsCell
 * itself cannot write. The wording below covers both, pointing at the
 * Courses table for either fix: the LMS cell for (1), and the table's own
 * (directly editable, CourseRow.tsx) Institution column for (2).
 *
 * D1/F4 (docs/import-course-export-to-intro-video-acceptance-criteria.md):
 * the two remediations above assume a LIVE Canvas connection exists to link
 * in the first place. An instructor holding only a course export (no Canvas
 * session, no live URL to paste anywhere) had no remedy this message could
 * name - the only path that could help them, importing the export from the
 * Course Content source picker (Part B of that doc), was NINE undiscoverable
 * clicks away and this message never mentioned it. The wording below adds
 * that as a third, independent remedy - not a replacement for the Courses
 * table advice above, which is still correct for the live-course case.
 *
 * The opening words must keep starting with COURSE_NOT_LINKED_PREFIX below -
 * isCourseNotLinkedMessage matches on that stable prefix, and this function
 * is now that prefix's only producer, so the two can no longer drift apart by
 * accident. They can still be changed together, deliberately, in one commit.
 */
export function buildCourseNotLinkedMessage(canvasUrl: string): string {
  return `${COURSE_NOT_LINKED_PREFIX} ${canvasUrl}. Open the Courses table and link this course from its LMS cell, or import this course's export from the Course Content source picker. If another saved course shares this same Canvas course number, also set this course's Institution column so the two can be told apart.`;
}

/**
 * True when `message` is buildCourseNotLinkedMessage's own output (as
 * returned by resolveLmsCourseRowAction / lms-syllabus-buttons.ts's
 * courseNotLinkedError, which now calls that builder directly). Matches on
 * the message's stable prefix, not full equality, so trailing detail (the
 * URL, the remediation sentence) never has to be reconstructed by the
 * detector - only the opening words have to agree, and buildCourseNotLinkedMessage
 * is the only place that spells them.
 */
export function isCourseNotLinkedMessage(message: string): boolean {
  return message.startsWith(COURSE_NOT_LINKED_PREFIX);
}
