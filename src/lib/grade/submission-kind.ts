// The closed union recognizing that a screen-capture submission may be a
// reply to another student's post rather than an original post - the owner's
// own words in docs/backlog.yml row A8: "canvas split out the initial posts
// from the replies, but this app should recognize the replies as being
// replies and ot mark them as original posts".
//
// A FRESH LEAF, not a reuse of SnapshotRole (src/app/components/
// snapshot-grading/snapshot-shot.ts) - read in full before writing this file.
// SnapshotRole has six members (assignment/rubric/post/replies/submission/
// other), roles of a SHOT, not kinds of a submission; importing it here would
// force this feature to carry four members it can never produce, and would
// make the LMS grading path (A8-P, which imports this file) transitively
// depend on a capture surface it has nothing to do with. See docs/a8r-scope.md
// section 2.3 for the full argument.
//
// PURE, no "use server", no node builtins: GradingTableRow.tsx (a "use
// client" component) imports this leaf directly, the same way seven other
// client components under src/app/components already import from
// @/lib/grade/* (docs/a8r-scope.md section 2.3).
//
// "unknown" maps to today's pre-A8-R strings everywhere this union is
// composed into a label or a prompt header (the label Records live in this
// same leaf, wave 2) - that single fact is what makes A8-R a no-op on the
// model request body and the on-screen label until an instructor confirms
// something (docs/a8r-scope.md section 3).
export type GradingSubmissionKind = "initial-post" | "reply" | "other" | "unknown";

export const SUBMISSION_KINDS: readonly GradingSubmissionKind[] = ["initial-post", "reply", "other", "unknown"];

/** Coerces an arbitrary stored or model-returned value to a real
 * GradingSubmissionKind, defaulting to "unknown" for anything outside the
 * four-member set - mirrors VALID_NAME_MATCHES's own coercion
 * (grading-row-serialization.ts), so a legacy stored row with none of this
 * union's members, or a model response that returned something unexpected,
 * reads as "unknown" rather than as `undefined` or a runtime crash. */
export function coerceSubmissionKind(raw: unknown): GradingSubmissionKind {
  return typeof raw === "string" && (SUBMISSION_KINDS as readonly string[]).includes(raw)
    ? (raw as GradingSubmissionKind)
    : "unknown";
}

// ---------------------------------------------------------------------------
// docs/a8r-scope.md (A8-R) section 3: "unknown" maps to today's pre-A8-R
// strings everywhere - the single fact that makes G-R0/G-R1/G-R2 provable.
// Every OTHER member maps to something else. The call-site canary
// (submission-kind-callsites.structure.test.ts) pins which files may ever
// reference these two Records - the composers (grading-feedback-prompt.ts,
// grading-submission-grade.ts, GradingRecordingPanel.tsx, this file) must
// contain zero references to `suggestedSubmissionKind`/`submissionKindCue`,
// so the suggestion physically cannot reach a label or a prompt without an
// instructor's confirmation.
// ---------------------------------------------------------------------------

/** G-R2: the on-screen label. "unknown" is the literal word this surface has
 * always shown - see GradingTableRow.tsx's own "Submission" span before
 * A8-R, now replaced by `submissionKindLabel(row.submissionKind)`. */
export const SUBMISSION_KIND_LABELS: Record<GradingSubmissionKind, string> = {
  "initial-post": "Initial post",
  reply: "Reply",
  other: "Other work",
  unknown: "Submission",
};

/** G-R1: the request body's header, composed by buildGradingRecordingPrompt
 * (grading-feedback-prompt.ts) as `${SUBMISSION_KIND_PROMPT_LABELS[kind]}:`.
 * "unknown" reproduces today's literal "Submission:" byte for byte (G-R0). */
export const SUBMISSION_KIND_PROMPT_LABELS: Record<GradingSubmissionKind, string> = {
  "initial-post": "Initial post",
  reply: "Reply",
  other: "Other work",
  unknown: "Submission",
};

export function submissionKindLabel(kind: GradingSubmissionKind): string {
  return SUBMISSION_KIND_LABELS[kind];
}
