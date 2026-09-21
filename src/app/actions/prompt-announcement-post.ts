"use server";

// A21 (docs/a21-scope.md sections 4.7, 5.1): posts a Markdown-rendered
// prompt-driven draft to Canvas. ALONE in this file, separate from
// prompt-announcement-draft.ts, so the draft endpoint's own transitive
// import closure can be walled off from every Canvas capability (AC-9a) -
// co-locating the two actions would make that wall unsatisfiable by
// construction.
//
// Reuses `createAnnouncementFromMarkdown` unchanged, including its
// `delayedPostAt` fifth parameter - unlike `postWalkthroughAnnouncementAction`
// (RES-8/RES-11, docs/a21-scope.md section 5.3), which drops it.

import { requireUser } from "@/lib/supabase/auth";
import { createAnnouncementFromMarkdown } from "@/lib/canvas/announcements";
import type { CanvasAnnouncement } from "@/lib/canvas";

export async function postPromptAnnouncementAction(
  courseUrl: string,
  title: string,
  markdownBody: string,
  acronym?: string,
  delayedPostAt?: string
): Promise<{ announcement: CanvasAnnouncement } | { error: string }> {
  try {
    await requireUser();
    const announcement = await createAnnouncementFromMarkdown(courseUrl, title, markdownBody, acronym, delayedPostAt);
    return { announcement };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not post the announcement." };
  }
}
