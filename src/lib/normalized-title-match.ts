// A single, shared case/whitespace-insensitive title-equality check. Two call
// sites in the LMS-tab syllabus buttons feature need the exact same
// normalization rule and must never drift apart from each other:
//   - the "Start Here" module lookup (src/lib/lms-start-here-module.ts),
//     matching steps.course-setup.materials.ts's own inline
//     `m.name.trim().toLowerCase() === "start here"` (docs/REGRESSION.md #248
//     check 3)
//   - the Syllabus Acknowledgement quiz's idempotency pre-check
//     (src/lib/syllabus-ack-quiz.ts), AC B1-5
// Pure - no I/O.

/** True when `a` and `b` are the same title once leading/trailing whitespace
 * is trimmed and case is ignored - e.g. "Start Here", " start here ", and
 * "START HERE" all match each other. */
export function normalizedTitleEquals(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}
