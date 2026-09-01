// "Activate this recording from the Knowledge base" (the owner ask this
// closes: replies drafted with the instructor's selected standards pages as
// context) - the ONE hop in that feature with no test surface at all.
//
// useDiscussionReplies.ts's start() calls takeRecordingKnowledgeContext()
// (src/lib/recording-launch.ts) exactly once per run - a real, one-shot,
// module-level side effect that drains on read (already fully covered by
// recording-launch.test.ts's own "write-then-consume" suite). What was NOT
// covered - and what a sibling wave sabotaged (replaced that call with a
// hardcoded `null`) with zero test failures and a clean tsc - is everything
// AFTER the call returns: which context THIS run ends up using. vitest here
// is node-env and renders no hook, so that decision has to live in a plain
// function to be testable at all (mirrors useReplyResources.ts's
// isResourceLaneBusy/partitionResourceOutcome and discussion-capture.ts's
// shouldLoopContinue - the same "pull the decision out of the hook" move,
// applied to this feature's own untested hop).
//
// resolveStartKnowledgeContext owns exactly this rule:
//
//  - `taken` non-null (this Start immediately follows a real
//    openRecordingTool(...) launch): it always wins, replacing whatever this
//    table already held. A second "Start recording" from the Knowledge base
//    with a DIFFERENT page selection must not stay stuck showing the first
//    selection's context forever.
//  - `taken` null (the ordinary case for every Start that is not the one
//    immediately following a fresh launch - takeRecordingKnowledgeContext()
//    is a one-shot, so a second Start in the same table's life, or a Start
//    with no launch at all, both see null here) - `current` is returned
//    UNCHANGED. This is the take-once-per-run guarantee from the caller's
//    side: "never launched" (current is also null, stays null) and "already
//    launched once earlier this table's life, this is Stop-then-Start again
//    with no new launch in between" (current already holds that earlier
//    context, and must be PRESERVED, not cleared) resolve identically - both
//    are just "nothing new arrived this time".
//
// The caller (start()) still owns the actual one-shot call and its one
// side-effecting write (setKnowledgeContext + the persisted label) - this
// function only decides what value that write should use, so it is pure and
// needs no ref, no React import, and no browser global.
export function resolveStartKnowledgeContext<T>(current: T | null, taken: T | null): T | null {
  return taken ?? current;
}

/** The one visible signal that a run's drafts are using different context
 * than an ordinary run (DiscussionRepliesPanel.tsx renders this near the
 * controls that govern drafting). Null exactly when there is nothing to show
 * - no context was ever taken this session, or (after a reload) the context
 * did not survive - never a placeholder or a stale label for a context that
 * is no longer live. */
export function knowledgeContextLabelFor(context: { label?: string } | null): string | null {
  return context ? context.label ?? "Knowledge Base pages" : null;
}
