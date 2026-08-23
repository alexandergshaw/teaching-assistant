// Pure, dependency-free helpers extracted from
// src/app/actions/lms-generation.ts (step-10 fixer round of
// docs/intro-discussion-from-modules-acceptance-criteria.md - Findings 1 and
// 12, plus the researcher's otherModuleNames finding) purely to keep that
// file under this project's 1000-line ceiling - see post-content.ts's own
// header comment for the identical split rationale. No "@/app/actions"
// import, no Supabase, no fetch: every function here is a straight
// structural computation over data the caller already has.
import type { PostStepOutcome } from "./commit-plan";

/**
 * Finding 12: harvest anything an executed outcome recorded that
 * postGeneratedArtifactAction's `notes` needs but `summary.text` has no
 * channel for - today, only the create-discussion classic-fallback detail
 * (AC14g: never silent). Called by BOTH of that action's return paths
 * (course-level and module-item) - it used to be inlined only in the
 * module-item path, an asymmetric-swallow shape this loop keeps catching,
 * even though it is unreachable today (a discussion is always module-item
 * placement, never course-level).
 */
export function harvestPostOutcomeNotes(outcomes: PostStepOutcome[]): string[] {
  const discussionFallbackDetail = outcomes.find(
    (o) => o.step.step === "create-discussion" && o.status === "done" && o.detail
  )?.detail;
  return discussionFallbackDetail ? [discussionFallbackDetail] : [];
}

/**
 * Finding 1 (fix): the server must never compute a real Canvas instant for a
 * discussion's deadlines - `.toISOString()` on a server-built Date encodes
 * whatever timezone the SERVER runs in (Vercel: UTC), silently shifting every
 * 11:59pm (AC14i). The client (useLmsGeneration.ts's `post()`, in the
 * browser) always supplies `discussionDeadlines` for this kind; a caller
 * that omits it (a bypass, a stale client, a test - never the real UI) gets
 * no dates at all, with a note saying plainly why, rather than a wrong one.
 * This function performs NO date arithmetic and calls `.toISOString()`
 * nowhere - it only threads through what the caller already computed, or
 * emits the fixed "not supplied" fallback.
 */
export function resolveDiscussionDeadlinesForPost(
  discussionDeadlines: { initialPostAt: string; repliesDueAt: string; note: string } | undefined
): { deadlines: { initialPostAt: string; repliesDueAt: string }; note: string } {
  if (discussionDeadlines) {
    return {
      deadlines: { initialPostAt: discussionDeadlines.initialPostAt, repliesDueAt: discussionDeadlines.repliesDueAt },
      note: discussionDeadlines.note,
    };
  }
  return {
    deadlines: { initialPostAt: "", repliesDueAt: "" },
    note: "The client did not supply computed deadlines for this discussion, so no due or lock dates were set.",
  };
}

/**
 * Researcher finding (fix): AC18's "every OTHER module's name" used to
 * exclude the target by matching `moduleLabel` as a STRING, which leaks the
 * checkmarked module's own name into the list whenever no `moduleLabel` was
 * supplied (it then falls back to DEFAULT_MODULE_LABEL, which matches no real
 * module name). Excludes by IDENTITY (the checkmarked `moduleIds`) whenever a
 * real target module is known - exactly the "checkmarked module" case the
 * ask itself describes; an items-only selection (W5) has no single target
 * module id to exclude at all (`moduleIds` is empty there), so it keeps the
 * name-based fallback, which is what every existing items-only test already
 * relies on.
 */
export function otherModuleNamesFor(
  courseModules: Array<{ id: number; name: string }>,
  moduleIds: number[],
  moduleLabel: string
): string[] {
  const targetModuleIds = new Set(moduleIds);
  return courseModules
    .filter((m) => (targetModuleIds.size > 0 ? !targetModuleIds.has(m.id) : m.name !== moduleLabel))
    .map((m) => m.name);
}
