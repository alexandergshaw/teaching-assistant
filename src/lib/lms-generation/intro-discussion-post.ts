// A8's pure leaf (docs/intro-discussion-from-modules-acceptance-criteria.md,
// section 5b, wave 2): a single, caller-facing plan for "what deadlines (if
// any) should this post carry, and what should the instructor be told about
// it." No @/app/actions, no Supabase, no Date.now(), no randomness - every
// date comes from the caller's own `startDate`/`targetModuleName`, and this
// file calls A1's intro-discussion-deadlines.ts functions exclusively rather
// than re-deriving any of the week/weekday arithmetic itself.
//
// CALLED FROM THE BROWSER, NOT THE SERVER (step-10 fixer round, Finding 1 and
// Finding 4 - this comment block used to say the opposite; that was the bug).
// `.toISOString()` on a Date built from local wall-clock components (year,
// month, day, hour, minute) encodes whatever timezone the CALLING PROCESS is
// running in - Vercel runs UTC, so a server call to this function would
// silently turn "11:59pm" into 11:59pm UTC (AC14i). The two callers today:
//   - useLmsGeneration.ts's `post()` ("use client"), which runs this function
//     IN THE BROWSER, where the instructor's own local timezone is exactly
//     the course's working timezone - the one place this computation is
//     actually correct. Finding 4: `post()` used to duplicate this file's
//     "Initial post due X. Replies due Y." template inline instead of calling
//     this leaf directly; that copy is gone now, consolidated onto this one.
//   - This module's own test file, directly.
//
// src/app/actions/lms-generation.ts's postGeneratedArtifactAction does NOT
// call this function (Finding 1's fix removed that server-side fallback
// entirely): the server must have no path that can send a computed instant to
// Canvas, so when a caller posts an introDiscussion with no
// `discussionDeadlines` supplied at all, it emits "" dates and a note saying
// plainly that no deadlines were supplied - never a real computed date.
//
// NOT used by generateFromSelectionAction's own "introDiscussion" case: that
// case needs the initial-post and replies deadline TEXTS separately (to
// interpolate into two distinct prompt sentences - AC19/AC21), not the single
// combined `note` this function returns, so it calls planIntroDiscussionDeadlines/
// formatDeadlineForPrompt directly instead. See that case's own comment. That
// call site is server-side but never converts a Date to an ISO instant - it
// only builds DISPLAY TEXT (formatDeadlineForPrompt), which is pure local
// arithmetic and identical in any process timezone (AC14i).
import {
  planIntroDiscussionDeadlines,
  formatDeadlineForPrompt,
  describeMissingDeadlines,
} from "./intro-discussion-deadlines";

export interface IntroDiscussionPostPlan {
  /** ISO8601 with an implicit UTC offset ("Z", from `Date.toISOString()`) -
   * correct because this function is called IN THE BROWSER (see this file's
   * own header comment): the Date is built from the instructor's own local
   * wall-clock components, so converting it to its UTC equivalent produces
   * the right absolute instant. "" / "" when `startDate`/`targetModuleName`
   * carry no usable deadline. */
  deadlines: { initialPostAt: string; repliesDueAt: string };
  /** Always non-empty. Either both dates stated in full, or the SPECIFIC
   * reason none were set (describeMissingDeadlines' own two distinct
   * messages) - the two causes must never collapse into one generic string. */
  note: string;
}

/**
 * Plan a graded discussion's post-time deadlines and the note describing them
 * - called from the BROWSER (see this file's own header comment), never the
 * server. `startDate`/`targetModuleName` are handed straight to
 * planIntroDiscussionDeadlines/describeMissingDeadlines (A1) - this function
 * performs no date arithmetic of its own.
 */
export function planIntroDiscussionPost(args: {
  startDate: string | null | undefined;
  targetModuleName: string;
}): IntroDiscussionPostPlan {
  const planned = planIntroDiscussionDeadlines({ startDate: args.startDate, moduleName: args.targetModuleName });
  if (!planned) {
    return {
      deadlines: { initialPostAt: "", repliesDueAt: "" },
      note:
        describeMissingDeadlines({ startDate: args.startDate, moduleName: args.targetModuleName }) ??
        "No due or lock dates were set on the discussion.",
    };
  }

  return {
    deadlines: {
      initialPostAt: planned.initialPostAt.toISOString(),
      repliesDueAt: planned.repliesDueAt.toISOString(),
    },
    note: `Initial post due ${formatDeadlineForPrompt(planned.initialPostAt)}. Replies due ${formatDeadlineForPrompt(planned.repliesDueAt)}.`,
  };
}
