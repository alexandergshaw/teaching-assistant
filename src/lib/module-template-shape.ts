/**
 * A value shared by module-template.ts (a "use server" module) and its
 * callers, kept OUTSIDE that file for the same hard technical reason
 * src/lib/knowledge-check-shape.ts documents: a "use server" file may export
 * nothing but async functions and type-only exports. A plain `export const`
 * inside module-template.ts is a build error that typecheck and unit tests
 * both pass straight through (neither a type error nor a runtime one) -
 * src/lib/use-server-exports.test.ts is what actually catches it, by
 * scanning real source rather than executing anything.
 *
 * Step-10 review, C7 (docs/carry-module-pattern-forward-acceptance-
 * criteria.md, chunk D): the reason every Discussion-kind item is refused
 * (module-template.ts's `checkpointsUnknown`, unconditionally true for every
 * Discussion - see that file's header) needs one honest, instructor-facing
 * wording. See this file's own export below for what "honest" means here.
 */

/** The honest, instructor-facing reason every Discussion-kind item is
 * refused rather than carried. Deliberately NOT phrased as "this discussion
 * may carry a checkpoint split": that wording describes a property of the
 * instructor's discussion, when the true and only reason is a limitation of
 * THIS APP - it cannot read a discussion's checkpoint structure back from
 * Canvas at all, for any discussion, so it refuses every one rather than
 * risk silently flattening a checkpointed one. Exported so the caller that
 * actually surfaces refusal copy to an instructor
 * (src/app/actions/carry-module-pattern.ts's `refused-checkpoint-unknown`
 * outcome and CarryModulePatternReviewModal.tsx, both outside this brief's
 * ownership) can quote this instead of re-describing the limitation as
 * theirs - see module-template.ts's report for the exact wording those two
 * currently use instead. */
export const DISCUSSION_CHECKPOINTS_UNREADABLE_REASON =
  "This app cannot read a discussion's graded-checkpoint structure (for example a Thursday/Sunday split) back " +
  "from Canvas - there is no REST or GraphQL read for it anywhere in this codebase. Every discussion is " +
  "refused here rather than risk carrying a checkpointed discussion forward as a flat one.";
