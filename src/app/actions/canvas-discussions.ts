"use server";

// Server action wrapping the graded-discussion Canvas write layer
// (src/lib/canvas-modules/graded-discussion.ts) - see
// docs/intro-discussion-from-modules-acceptance-criteria.md section 5b D2,
// AC15. Same requireOwner()-guarded try/catch shape as
// createGradableAction (src/app/actions/canvas-files-bulk.ts:395).
//
// Exports only async functions - a type re-export from a "use server" file
// is caught only by `next build`, so none is attempted here; callers import
// NewGradedDiscussion/GradedDiscussionResult directly from
// @/lib/canvas-modules/graded-discussion.

import { requireOwner } from "@/lib/supabase/auth";
import { createGradedDiscussion } from "@/lib/canvas-modules/graded-discussion";
import type { NewGradedDiscussion, GradedDiscussionResult } from "@/lib/canvas-modules/graded-discussion";

/** Create a graded discussion (checkpoints when available, else the classic
 * single-deadline fallback - see graded-discussion.ts). */
export async function createGradedDiscussionAction(
  courseUrl: string,
  fields: NewGradedDiscussion,
  acronym?: string
): Promise<GradedDiscussionResult | { error: string }> {
  try {
    await requireOwner();
    return await createGradedDiscussion(courseUrl, fields, acronym);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not create the discussion." };
  }
}
