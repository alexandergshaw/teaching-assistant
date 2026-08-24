// Pure leaf: constants, title derivation and note-building for the
// current-events research assignment created per selected module
// (docs/current-events-assignment-from-modules-acceptance-criteria.md,
// section 3b is the final contract; section 0b is the bar-model amendment).
// No React, no MUI, no @/app/actions, no Supabase, no Date.now(), no
// randomness. Every date this file formats is a LOCAL Date passed in by the
// caller - describeCurrentEventsDeadline never calls .toISOString(), so its
// output is identical no matter what timezone the running process is in.
// The ONLY .toISOString() in this whole chunk lives in wave 2's plan module,
// which runs in the browser (see the AC's D4).

import { WEEKDAYS, WEEKDAY_LABELS } from "./assignment-due-rule";

/** Total points for the graded assignment (W3: a fixed value, never bulkAddPoints
 * and never null - see the AC for why both of the AC8 alternatives were rejected). */
export const CURRENT_EVENTS_POINTS = 20;

/** Phrased RELATIVELY (AC10) so the assignment text stays correct no matter
 * how long after generation a student reads it - never a hardcoded date. */
export const CURRENT_EVENTS_RECENCY_WINDOW = "in the last 30 days";

/** A concrete range, per AC9, so the model (and the student) has an
 * unambiguous target instead of a vague "a few paragraphs". */
export const CURRENT_EVENTS_LENGTH_TARGET = "3-4 paragraphs (roughly 300-500 words)";

// Detects a module/week label sitting at the very START of a module name,
// e.g. "Module 07:", "Week 3 -", "Module07". Anchored with `^` so a name
// that merely mentions "module" or "week" later in its text is never
// mistaken for carrying a leading label. Deliberately UNCONDITIONAL - unlike
// module-title.ts's stripLeadingRedundantLabel, this file has no target week
// to match the label's number against, and does not need one: it is only
// ever asked to recover the bare topic text a module name carries, not to
// judge whether a label's number is consistent with a position.
//
// The dash alternatives are written as escaped code points (U+2013 en dash,
// U+2014 em dash) rather than literal glyphs, so the source file stays plain
// ASCII (repo invariant - this area had a mojibake incident).
const LEADING_MODULE_LABEL_PATTERN = /^(?:module|week)\s*0*\d+\s*(?:[:\-\u2013\u2014]\s*)?/i;

/**
 * Strip a leading "Module NN" / "Week NN" label off a Canvas module name,
 * returning the remaining topic text. "Module 07: Loops" -> "Loops"; "Week 3
 * - Recursion" -> "Recursion". A name with no such leading label (including
 * one that uses a different word, like "Unit 2 Arrays") is returned trimmed
 * and otherwise unchanged, since there is nothing recognized to strip. A
 * name that is nothing but the label itself (e.g. "Module 07") falls back to
 * the trimmed original rather than returning an empty string, so a caller
 * composing a title from this never produces a title with nothing before
 * the separator.
 */
export function moduleTopicFromName(moduleName: string): string {
  const trimmed = (moduleName ?? "").trim();
  const stripped = trimmed.replace(LEADING_MODULE_LABEL_PATTERN, "").trim();
  return stripped.length > 0 ? stripped : trimmed;
}

/**
 * The Canvas assignment title for a module's current-events assignment, and
 * - per the AC's D2 - THE IDEMPOTENCY KEY. A future run pre-checks this exact
 * string (case/trim-insensitive) against the already-loaded module tree
 * before spending a model call or a Canvas write, so it must be a pure
 * function of `moduleName` alone: same input, same output, always. This is
 * the one deliberate divergence from the sibling intro-discussion generator,
 * which takes the model's own title - a model-authored title differs between
 * runs, which would make the pre-check never match and every re-run
 * duplicate every module that already succeeded.
 */
export function currentEventsAssignmentTitle(moduleName: string): string {
  return `${moduleTopicFromName(moduleName)} - Current Events Research`;
}

/** The three distinguishable reasons a module's assignment can end up with no
 * due date (W2 - there are three, not two, correcting the original AC7).
 * "ok" is not a failure reason; it exists so callers building a
 * `CurrentEventsOutcomeCounts.noDeadline` entry only ever do so with one of
 * the other three, and TypeScript's `Exclude` on that field enforces it. */
export type CurrentEventsDeadlineReason = "ok" | "no-course-row" | "no-course-start-date" | "no-week-number";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * "Thursday, September 10, 2026 at 11:59 PM" for a concrete due date, or ""
 * when there is none. Deterministic and timezone-free by construction: every
 * field is read off the Date object's own LOCAL getters (getDay, getMonth,
 * getDate, getFullYear, getHours, getMinutes) - never .toISOString(), never
 * .toLocaleDateString() (locale-dependent). The empty-string case is not a
 * placeholder sentence like "no due date set" - it is empty ON PURPOSE, so
 * buildCurrentEventsRequirementsBlock below can tell "no date to state" apart
 * from "a date, rendered", and omit the whole due-date sentence rather than
 * ever rendering something like "This assignment is due ." or "due null".
 */
export function describeCurrentEventsDeadline(due: Date | null): string {
  if (!due) return "";

  const weekdayLabel = WEEKDAY_LABELS[WEEKDAYS[due.getDay()]];
  const monthLabel = MONTH_NAMES[due.getMonth()];
  const day = due.getDate();
  const year = due.getFullYear();

  const hour24 = due.getHours();
  const period = hour24 >= 12 ? "PM" : "AM";
  const hour12raw = hour24 % 12;
  const hour12 = hour12raw === 0 ? 12 : hour12raw;
  const minute = String(due.getMinutes()).padStart(2, "0");

  return `${weekdayLabel}, ${monthLabel} ${day}, ${year} at ${hour12}:${minute} ${period}`;
}

export interface CurrentEventsRequirements {
  /** Output of describeCurrentEventsDeadline - "" when there is no due date. */
  deadlineText: string;
  pointsPossible: number;
  recencyWindow: string;
  lengthTarget: string;
}

/**
 * The SOLE place in the whole generated assignment that states the deadline,
 * the point value, the recency window and the length target (W5/W7). The
 * model prompt (owned by the sibling generator, 1B) is forbidden from
 * stating any of these four facts itself - entry 328's shipped defect was
 * exactly two copies of one deadline drifting apart, and this function is
 * the fix: one authoritative, code-authored statement, appended after the
 * model's prose, exactly as buildDeadlinesBlock is appended in the sibling
 * intro-discussion generator.
 *
 * Returns PLAIN TEXT with no angle brackets anywhere. This matters
 * structurally, not just stylistically: descriptionToHtml
 * (src/lib/canvas-modules/gradables.ts) takes a PASS-THROUGH branch whenever
 * its input matches `/<\/?[a-z][\s\S]*>/i` and treats the text as already-HTML
 * verbatim; if this block ever contained something that matched that pattern,
 * it would be injected into the assignment description as raw, uncontrolled
 * HTML instead of being escaped like ordinary text.
 *
 * When `deadlineText` is "" (no due date could be computed for this module),
 * the due-date sentence is omitted entirely rather than rendered with a
 * placeholder - see describeCurrentEventsDeadline's own doc comment.
 */
export function buildCurrentEventsRequirementsBlock(req: CurrentEventsRequirements): string {
  const lines: string[] = [];

  if (req.deadlineText.trim().length > 0) {
    lines.push(`This assignment is due ${req.deadlineText}.`);
  }

  lines.push(`It is worth ${req.pointsPossible} points.`);
  lines.push(`Use a news item or development ${req.recencyWindow}.`);
  lines.push(`Submit ${req.lengthTarget}.`);

  return lines.join("\n\n");
}

export interface CurrentEventsOutcomeCounts {
  created: number;
  skippedExisting: number;
  /** Identifies (e.g. by module name) each module whose generation call
   * failed or returned nothing usable. Kept separate from `canvasFailed` so
   * the two different failure causes never collapse into one indistinguishable
   * bucket (AC15 / W6 / docs/DEV_LOOP.md step 8's most-repeated defect). */
  generationFailed: string[];
  /** Identifies each module whose Canvas write (create or link) failed,
   * after generation for that module succeeded. */
  canvasFailed: string[];
  /** Per-module reasons a module's assignment was created with no due date -
   * kept as data (module name + reason), not pre-rendered text, so the
   * caller-supplied wording stays entirely inside this file. */
  noDeadline: Array<{ moduleName: string; reason: Exclude<CurrentEventsDeadlineReason, "ok"> }>;
}

const NO_DEADLINE_REASON_TEXT: Record<Exclude<CurrentEventsDeadlineReason, "ok">, string> = {
  "no-course-row": "the course could not be loaded",
  "no-course-start-date": "this course has no start date",
  "no-week-number": "the module name carries no week number",
};

/**
 * Render the final outcome note for a current-events-assignment run. Keeps
 * FOUR outcomes distinguishable - created, skippedExisting, generationFailed,
 * canvasFailed - plus a per-module reason for every no-deadline case (AC15 /
 * W6): "the model returned nothing for Module 3" and "Canvas did not finish
 * creating the assignment for Module 3" are different problems with
 * different fixes, and collapsing them is the defect this repo's loop
 * catches most often.
 *
 * `canvasFailed`'s wording is deliberately non-committal about WHAT went
 * wrong on the Canvas side: the caller (useCurrentEventsAssignments.ts)
 * pushes both an outright write failure and an "orphaned" result (created in
 * Canvas, only the module link failed) into this same bucket, and "rejected"
 * would be false for the orphan case - Canvas did create something there.
 * "did not finish" is true either way, and the separate `orphansClause`
 * appended below is what tells an orphan apart from an outright failure for
 * a human who needs to go look.
 *
 * `orphansClause` is a caller-supplied, already-rendered clause (from the
 * existing `describeOrphans`, which this file deliberately does NOT import -
 * that helper lives in a "use client" hook module, and this file must stay a
 * pure leaf) and is appended VERBATIM, last, with no re-wording and no extra
 * separator: `describeOrphans` already returns either "" or a string that
 * starts with its own leading space, so simple concatenation is correct.
 *
 * `kind` is "error" when anything failed - a generation failure, a Canvas
 * failure, or a non-empty `orphansClause` (an assignment created but left
 * unlinked is exactly the kind of thing a human still needs to go act on,
 * the same tier as an outright failure). Skips alone, even a re-run that is
 * entirely skips, are a "success": nothing needs fixing when every module
 * already has its assignment.
 */
export function describeCurrentEventsOutcome(
  counts: CurrentEventsOutcomeCounts,
  orphansClause: string
): { kind: "success" | "error"; text: string } {
  const parts: string[] = [`${counts.created} created`];

  if (counts.skippedExisting > 0) {
    parts.push(`${counts.skippedExisting} already existed and were skipped`);
  }
  if (counts.generationFailed.length > 0) {
    parts.push(`generation failed for ${counts.generationFailed.join(", ")}`);
  }
  if (counts.canvasFailed.length > 0) {
    parts.push(`Canvas did not finish creating the assignment for ${counts.canvasFailed.join(", ")}`);
  }

  let text = `Current events assignments: ${parts.join("; ")}.`;

  if (counts.noDeadline.length > 0) {
    const noDeadlineList = counts.noDeadline
      .map((n) => `${n.moduleName} (${NO_DEADLINE_REASON_TEXT[n.reason]})`)
      .join("; ");
    text += ` No due date was set for: ${noDeadlineList}.`;
  }

  text += orphansClause;

  const kind: "success" | "error" =
    counts.generationFailed.length > 0 || counts.canvasFailed.length > 0 || orphansClause.trim().length > 0
      ? "error"
      : "success";

  return { kind, text };
}
