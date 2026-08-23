// The complete graded-discussion write: both Canvas paths, and the decision
// between them.
//
// See docs/intro-discussion-from-modules-acceptance-criteria.md AC11b,
// AC14/AC14e-AC14i, and section 5b D2 (the FINAL contract - D2 explicitly
// WITHDRAWS widening the shared `createGradable` helper in gradables.ts;
// this is a new, dedicated module instead).
//
// CHECKPOINTS ARE EXPLICIT OPT-IN, NOT THE PRIMARY PATH (H1, revised
// 2026-08-23). The 5b design above treated checkpoints as the default,
// always-attempted path. That is wrong: verified against
// instructure/canvas-lms master, `Mutations::CreateDiscussionTopic#resolve`
// is NOT transactional. It persists the parent assignment via
// `create_api_assignment` FIRST, then runs the checkpoint block - which is
// exactly where the flag-off error is raised - and `discussion_topic.save!`
// only runs AFTER that block. So on a flag-off account (the default; the
// flag is `state: allowed`), attempting checkpoints leaves a stray,
// unattached assignment behind in Canvas every single time, with nothing to
// roll it back. Attempting checkpoints speculatively is therefore never
// acceptable. The caller must opt in via `NewGradedDiscussion.useCheckpoints`
// - when false, this module never touches GraphQL at all and goes straight
// to the classic REST create.
//
// When the caller DOES opt in: a discussion built with two Canvas Discussion
// Checkpoints gets two separate due dates, two separate submissions, two
// independent late verdicts, and a Canvas-enforced required reply count -
// exactly the two-deadline ask this feature exists for. Checkpoints are
// GraphQL-only: config/routes.rb has zero "checkpoint" routes, and
// discussion_topics_controller.rb's API_ALLOWED_TOPIC_FIELDS whitelist has no
// checkpoint field. There is no REST route for this.
//
// The gating feature flag (`discussion_checkpoints`) is declared
// `applies_to: Account`, so a course-scoped
// `GET /api/v1/courses/:id/features/enabled` call cannot see it - the flag is
// simply ABSENT there, indistinguishable from "off". That is a false-negative
// trap this module does not fall into: when opted in, it attempts the
// mutation and branches on the result. When the flag is off, Canvas returns
// HTTP 200 with a TOP-LEVEL `errors` array (not
// `data.createDiscussionTopic.errors`) whose message is exactly
// "discussion_checkpoints feature flag must be enabled". On THAT message, and
// ONLY that message, this module falls back to the classic single-deadline
// REST create AND warns that the flag-off attempt may have already left a
// stray assignment behind (see the H1 comment above). Any other GraphQL
// error is a real failure and is thrown with its message intact - collapsing
// the two would hide a genuine defect behind a plausible-looking fallback.
//
// A second, separately-verified safeguard (reviewer finding #7): nobody has
// confirmed from canvas-lms source that a checkpoint `dates[]` entry with no
// `dueAt` is accepted - `Mutations::DiscussionCheckpointDate` and the
// checkpoint creator service were both read and neither settles it either
// way. Sending an unverified shape into the one path that can leave a stray
// assignment behind is not an acceptable gamble, so when opted into
// checkpoints but either deadline is missing, this module takes the classic
// path instead of attempting the mutation at all.

import { resolveCourse } from "../canvas-core";
import { createThrottleBudget } from "../canvas-throttle";
import { writeJson, type CourseContext } from "./fetch-helpers";
import { canvasGraphql } from "./graphql";

export type GradedDiscussionPath = "checkpoints" | "classic";

export interface NewGradedDiscussion {
  title: string;
  /** HTML, already through markdownLiteToHtml - do not escape it again. */
  message: string;
  pointsPossible: number;
  /** ISO8601 WITH OFFSET, or "" - the initial-post deadline (Thursday). */
  initialPostAt: string;
  /** ISO8601 WITH OFFSET, or "" - the replies deadline (Sunday). */
  repliesDueAt: string;
  /** How many replies students owe. Honoured only on the checkpoints path's
   * reply_to_entry checkpoint (Canvas validates 0-10). */
  requiredReplyCount: number;
  published: boolean;
  /** Opt-in. When false, go STRAIGHT to the classic REST create and never
   * touch GraphQL at all - see H1: a failed checkpoints mutation leaves an
   * orphaned Canvas assignment behind, so we must not attempt it
   * speculatively. */
  useCheckpoints: boolean;
  /** Points for each checkpoint. Passed in rather than derived from an
   * lms-generation constant - see M3. Must sum to pointsPossible; this
   * module validates that and throws loudly if it does not, so the
   * checkpoints path and the classic path can never silently post different
   * totals. */
  initialPostPoints: number;
  repliesPoints: number;
}

export interface GradedDiscussionResult {
  id: number;
  /** Which path actually ran. Surfaced to the instructor - never swallowed. */
  path: GradedDiscussionPath;
  /** Present only on "classic": why checkpoints were unavailable. */
  fallbackReason?: string;
}

/** The exact top-level GraphQL error Canvas returns when the
 * `discussion_checkpoints` account feature flag is off. Matched verbatim -
 * ANY other message is a real failure, not a fallback trigger. */
const CHECKPOINTS_UNAVAILABLE_MESSAGE = "discussion_checkpoints feature flag must be enabled";

/** Frozen per AC14f. Field names are camelCase (checkpointLabel,
 * pointsPossible, repliesRequired, forCheckpoints, dueAt, contextId,
 * contextType) - the GraphQL input's own names, NOT the snake_case of the
 * REST API. `reply_to_entry_required_count` is the database column
 * `repliesRequired` writes to; it is never sent as a parameter name. */
const CREATE_CHECKPOINTED_DISCUSSION_MUTATION = `
mutation CreateCheckpointedDiscussion($input: CreateDiscussionTopicInput!) {
  createDiscussionTopic(input: $input) {
    discussionTopic { _id title assignment { _id hasSubAssignments } }
    errors { attribute message }
  }
}
`;

interface CreateDiscussionTopicPayload {
  createDiscussionTopic: {
    discussionTopic: { _id: string } | null;
    errors: Array<{ attribute?: string; message?: string }> | null;
  } | null;
}

interface CheckpointDateEntry {
  type: "everyone";
  dueAt?: string;
}

/** A `dates[]` entry MUST carry `type: "everyone"` (or "override"), always -
 * omitting it raises Canvas's own DateTypeRequiredError. `dueAt` is omitted
 * entirely (not sent as "") when the caller has no date for this checkpoint
 * (AC21: no course start date, or no derivable week number).
 *
 * Exported only so a unit test can pin this shape directly: the public
 * `createGradedDiscussion` entry point now diverts to the classic path
 * BEFORE ever calling this (reviewer #7 - an unverified "no dueAt" shape must
 * never reach the one path that can leave a stray Canvas assignment behind),
 * so the omission behaviour is no longer reachable end to end and would
 * otherwise go untested. */
export function checkpointDate(dueAt: string): CheckpointDateEntry {
  return dueAt ? { type: "everyone", dueAt } : { type: "everyone" };
}

/**
 * Build the AC14f mutation variables. HARD RULES, all verified against
 * canvas-lms master (checked 2026-08-23), each with a pinning test:
 *
 * 1. EXACTLY TWO checkpoints, always - the creator service is gated on
 *    `count == DiscussionTopic::REQUIRED_CHECKPOINT_COUNT` (2). Sending one
 *    SILENTLY creates an ordinary graded discussion, no error at all.
 * 2. `assignment.forCheckpoints` is `true`.
 * 3. When `forCheckpoints` is true, `assignment.pointsPossible` / `dueAt` /
 *    `lockAt` / `unlockAt` are NOT sent - Canvas sums the checkpoints itself.
 * 4. Every `dates[]` entry carries `type: "everyone"`.
 * 5. `repliesRequired` goes ONLY on the `reply_to_entry` checkpoint.
 *
 * Points: the caller supplies `fields.initialPostPoints`/`fields.repliesPoints`
 * directly (M3 - this module no longer imports a split ratio from
 * lms-generation, the only import of its kind anywhere under
 * src/lib/canvas-modules/). `createGradedDiscussion` validates the two sum to
 * `fields.pointsPossible` before this function ever runs, so this function
 * can never disagree with the classic path below, which sends
 * `fields.pointsPossible` directly as its one assignment's total.
 */
function buildCheckpointsVariables(courseId: string, fields: NewGradedDiscussion) {
  return {
    input: {
      contextId: courseId,
      contextType: "Course",
      title: fields.title,
      message: fields.message,
      published: fields.published,
      discussionType: "threaded",
      requireInitialPost: true, // AC19c - students write before reading the room
      assignment: {
        courseId,
        name: fields.title,
        forCheckpoints: true,
        gradingType: "points",
      },
      checkpoints: [
        {
          checkpointLabel: "reply_to_topic",
          pointsPossible: fields.initialPostPoints,
          dates: [checkpointDate(fields.initialPostAt)],
        },
        {
          checkpointLabel: "reply_to_entry",
          pointsPossible: fields.repliesPoints,
          repliesRequired: fields.requiredReplyCount,
          dates: [checkpointDate(fields.repliesDueAt)],
        },
      ],
    },
  };
}

/** The classic, single-deadline REST fallback (AC14h). Corrected by AC13b:
 * Canvas stamps a discussion submission with the student's EARLIEST entry
 * (`DiscussionTopic#ensure_submission` uses `.minimum(:created_at)`, not
 * `.maximum`), so `due_at` = Thursday (the initial post) is the CORRECT
 * governing deadline for the one lateness verdict this path can express -
 * not a compromise. */
async function createClassicDiscussion(ctx: CourseContext, fields: NewGradedDiscussion): Promise<number> {
  const base = `${ctx.baseUrl}/api/v1/courses/${ctx.courseId}`;
  const params = new URLSearchParams();
  // Top-level topic params.
  params.append("title", fields.title);
  params.append("message", fields.message);
  params.append("published", String(fields.published));
  params.append("discussion_type", "threaded");
  params.append("require_initial_post", "true");
  // Nested assignment params. points_possible/due_at/lock_at have no
  // top-level equivalent on a discussion topic.
  params.append("assignment[points_possible]", String(fields.pointsPossible));
  if (fields.initialPostAt) params.append("assignment[due_at]", fields.initialPostAt);
  // CRITICAL: assignment[lock_at] only, NEVER also a top-level lock_at. The
  // controller's prefer_assignment_availability_dates NULLS the topic's own
  // lock_at whenever assignment[lock_at] is present - sending both produces a
  // discussion that locks at a date the caller did not choose.
  if (fields.repliesDueAt) params.append("assignment[lock_at]", fields.repliesDueAt);

  const data = await writeJson<{ id?: number }>(`${base}/discussion_topics`, "POST", ctx, params);
  if (typeof data.id !== "number") throw new Error("Canvas did not return the new discussion id.");
  return data.id;
}

/** M1 - this function is the ONE place that owns the fallback wording. The
 * consumer up in commit-execute.ts (owned by the sibling working the
 * lms-generation side of this feature) is instructed to pass this string
 * through verbatim and never append its own copy of the same warning - see
 * reviewer finding M1/#8. Do not shorten this: every sentence here is load
 * bearing for an instructor deciding what to check in Canvas.
 *
 * H1 addendum: when this fallback fires, checkpoints were actually attempted
 * and failed on the flag-off error - and per this file's header comment,
 * Canvas's own `CreateDiscussionTopic#resolve` had already persisted the
 * parent assignment before that failure, with nothing to roll it back. So
 * this reason also warns the instructor by name, so they know exactly what
 * to look for and delete. This module does NOT attempt to delete it itself -
 * a title-matched delete could just as easily destroy a legitimate
 * assignment an instructor created separately. */
function describeFallback(title: string): string {
  return (
    "Canvas checkpoints are not enabled for this account, so a single-deadline " +
    "discussion was created instead. Only the initial-post deadline is graded " +
    "by Canvas; the replies deadline is enforced by the thread closing, not by " +
    "a separate grade. Canvas may also have already created a stray, unattached " +
    `assignment named "${title}" before reporting this failure - check ` +
    "Assignments and the Gradebook and delete it by hand if it is there; it was " +
    "not deleted automatically, since a name match could also delete a " +
    "legitimate assignment."
  );
}

/** Reviewer finding #7 - checkpoints were opted into, but the caller is
 * missing one or both deadlines. Whether Canvas accepts a checkpoint
 * `dates[]` entry with no `dueAt` could not be confirmed from canvas-lms
 * source (see this file's header comment), so this module never attempts the
 * mutation in that shape: it takes the classic path instead, unconditionally
 * safe either way. This is a DIFFERENT reason than `describeFallback` - no
 * GraphQL call was made, so there is no stray-assignment risk to warn about. */
function describeMissingDatesFallback(): string {
  return (
    "Canvas checkpoints require both the initial-post and replies deadlines, " +
    "and at least one is missing, so a single-deadline discussion was created " +
    "instead. Only the initial-post deadline is graded by Canvas; the replies " +
    "deadline is enforced by the thread closing, not by a separate grade."
  );
}

/**
 * Create a graded discussion, choosing between Canvas's checkpoints path and
 * the classic single-deadline fallback. Never a silent fallback: the fallback
 * only fires on the exact `discussion_checkpoints feature flag must be
 * enabled` message, and any other GraphQL error is thrown with its message
 * intact.
 *
 * Checkpoints are attempted ONLY when `fields.useCheckpoints` is true AND
 * both deadlines are present (H1, reviewer #7). Any other case goes straight
 * to the classic REST create without ever calling GraphQL.
 */
export async function createGradedDiscussion(
  courseUrl: string,
  fields: NewGradedDiscussion,
  code?: string
): Promise<GradedDiscussionResult> {
  if (fields.requiredReplyCount < 0 || fields.requiredReplyCount > 10) {
    throw new Error(`requiredReplyCount must be between 0 and 10 (got ${fields.requiredReplyCount}).`);
  }
  // M3 anti-drift check: the checkpoints path and the classic path must never
  // be able to post two different totals for the same discussion.
  if (fields.initialPostPoints + fields.repliesPoints !== fields.pointsPossible) {
    throw new Error(
      `initialPostPoints (${fields.initialPostPoints}) + repliesPoints (${fields.repliesPoints}) ` +
        `must equal pointsPossible (${fields.pointsPossible}).`
    );
  }

  // Step-10 finding N3: one shared ThrottleBudget for this whole call, not
  // per-write. When checkpoints hit the flag-off error below, this function
  // makes TWO potentially-retried Canvas writes back to back (the GraphQL
  // attempt, then the classic REST fallback) - sharing one budget between
  // them bounds their COMBINED worst-case retry time instead of letting each
  // independently spend up to maxThrottleSleepMs(). See graphql.ts's and
  // fetch-helpers.ts's own header comments for the budget's shape and
  // meaning; CanvasGraphqlContext and CourseContext both accept the same
  // optional `throttleBudget` field, so the one object built here satisfies
  // both canvasGraphql and writeJson (via createClassicDiscussion) below.
  const ctx = { ...resolveCourse(courseUrl, code), throttleBudget: createThrottleBudget() };

  // H1: checkpoints are explicit opt-in. A failed checkpoints attempt leaves
  // an orphaned Canvas assignment behind (see header comment), so this
  // module never attempts it speculatively.
  if (!fields.useCheckpoints) {
    const id = await createClassicDiscussion(ctx, fields);
    return { id, path: "classic" };
  }

  // Reviewer #7: an unverified "no dueAt" checkpoint shape must never reach
  // Canvas. Divert before ever calling canvasGraphql.
  if (!fields.initialPostAt || !fields.repliesDueAt) {
    const id = await createClassicDiscussion(ctx, fields);
    return { id, path: "classic", fallbackReason: describeMissingDatesFallback() };
  }

  const variables = buildCheckpointsVariables(ctx.courseId, fields);

  const result = await canvasGraphql<CreateDiscussionTopicPayload>(
    ctx,
    CREATE_CHECKPOINTED_DISCUSSION_MUTATION,
    variables
  );

  const flagError = result.errors.find((e) => e.message === CHECKPOINTS_UNAVAILABLE_MESSAGE);
  if (flagError) {
    const id = await createClassicDiscussion(ctx, fields);
    return { id, path: "classic", fallbackReason: describeFallback(fields.title) };
  }

  if (result.errors.length > 0) {
    throw new Error(
      `Canvas GraphQL error: ${result.errors.map((e) => e.message).filter(Boolean).join("; ")}`
    );
  }

  const mutationErrors = result.data?.createDiscussionTopic?.errors ?? [];
  if (mutationErrors.length > 0) {
    throw new Error(
      `Canvas rejected the discussion checkpoints: ${mutationErrors
        .map((e) => e.message)
        .filter(Boolean)
        .join("; ")}`
    );
  }

  const topicId = result.data?.createDiscussionTopic?.discussionTopic?._id;
  if (!topicId) {
    throw new Error("Canvas did not return the new discussion topic id.");
  }

  return { id: Number(topicId), path: "checkpoints" };
}
