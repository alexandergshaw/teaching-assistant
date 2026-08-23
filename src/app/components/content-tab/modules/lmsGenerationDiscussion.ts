// Pure, dependency-free helpers extracted from useLmsGeneration.ts (step-10
// fixer round of docs/intro-discussion-from-modules-acceptance-criteria.md -
// Findings 1, 2 and 4, plus the frozen contract's checkpoints checkbox) to
// keep that file under this repo's 1000-line ceiling - a STRUCTURAL split
// only, matching this directory's own established pattern
// (lmsGenerationKindHelpers.ts/lmsGenerationSelection.ts/etc. - see
// useLmsGeneration.ts's own header comment). Re-exported from
// useLmsGeneration.ts is NOT needed here (nothing outside that file's own
// `post()` calls these), so - unlike the other sibling modules - there is no
// re-export block for this one.
import { GENERATION_KIND_CONFIGS, type GenerationKindId } from "@/lib/lms-generation/kinds";
import { planIntroDiscussionPost } from "@/lib/lms-generation/intro-discussion-post";
import type { ModuleTarget } from "@/lib/lms-generation/commit-plan";
import type { CanvasModule } from "@/lib/canvas-modules";

/** Same predicate the server uses (lms-generation.ts's
 * postGeneratedArtifactAction reads `config.commitMeta.canvasObjectKind`) -
 * Finding 1: this used to be a literal `kindId === "introDiscussion"` check,
 * which silently stops matching the moment a second discussion kind exists.
 * Reading the SAME registry the server reads keeps the two ends from
 * drifting apart again. */
export function isDiscussionKind(kindId: GenerationKindId): boolean {
  return GENERATION_KIND_CONFIGS[kindId].commitMeta?.canvasObjectKind === "discussion";
}

/** REPO INVARIANT: persists per course under a `ta-` key, following
 * scriptMinutesKey's own read-on-init/write-on-change idiom (see that
 * function's own doc comment, lmsGenerationKindHelpers.ts). */
export function discussionCheckpointsKey(courseUrl: string): string {
  return `ta-lms-discussion-checkpoints-${courseUrl}`;
}

export interface DiscussionDeadlinesForPost {
  initialPostAt: string;
  repliesDueAt: string;
  note: string;
}

/**
 * `post()`'s own `discussionDeadlines` argument, computed client-side
 * (D3/AC14i - this calls planIntroDiscussionPost, whose `.toISOString()`
 * must run IN THE BROWSER, not on the server). `undefined` for every kind but
 * a discussion one, or before a target has been resolved.
 *
 * Finding 4: consolidates onto planIntroDiscussionPost (intro-discussion-
 * post.ts) rather than re-deriving the same "Initial post due X. Replies due
 * Y." template and describeMissingDeadlines call inline, as `post()` used to.
 *
 * Finding 2: an "existing" target whose id is not found in `modules` (a
 * stale/mismatched prop - should not happen in practice, since the
 * post-target picker is built from this same array) refuses to guess a name
 * rather than defaulting to "", which used to feed describeMissingDeadlines
 * a blank name and produce the FALSE reason `The module name "" carries no
 * week number...` even though the real module very likely has one.
 */
export function resolveDiscussionDeadlinesForClientPost(
  kindId: GenerationKindId,
  target: ModuleTarget | undefined,
  modules: CanvasModule[],
  courseStartDate: string | null | undefined
): DiscussionDeadlinesForPost | undefined {
  if (!isDiscussionKind(kindId) || !target) return undefined;

  const moduleName = target.kind === "new" ? target.name : modules.find((m) => m.id === target.moduleId)?.name;
  if (moduleName === undefined) {
    return {
      initialPostAt: "",
      repliesDueAt: "",
      note: "Could not resolve the target module's name, so no due or lock dates were set on the discussion.",
    };
  }

  const plan = planIntroDiscussionPost({ startDate: courseStartDate, targetModuleName: moduleName });
  return { initialPostAt: plan.deadlines.initialPostAt, repliesDueAt: plan.deadlines.repliesDueAt, note: plan.note };
}
