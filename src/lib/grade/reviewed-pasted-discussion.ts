/** Explicitly reviewed text, never inferred identity or a parser guess. */
export interface ReviewedPastedDiscussion {
  initialPosts: readonly string[];
  replies: readonly string[];
  initialAbsenceConfirmed: boolean;
  sourceCompleteConfirmed: boolean;
  attachmentsAccountedFor: boolean;
}

export type ReviewedDiscussionResult =
  | { ok: true; content: string; discussionAxes: { initialPostContent: string; replyContent: string; replyCount: number; initialPostAbsentConfirmed?: boolean } }
  | { ok: false; reason: "incomplete-source" | "unaccounted-attachments" | "initial-unknown" | "empty-contribution" | "too-large" };

/**
 * Construct the existing grader's two axes only from reviewed contributions.
 * A zero reply count is meaningful only when the instructor has confirmed the
 * source is complete; no missing or unclassified content is inferred away.
 * `maxChars` is supplied by the caller's actual grading budget; fail rather
 * than silently dropping text. Each contribution is retained verbatim.
 */
export function buildReviewedPastedDiscussion(input: ReviewedPastedDiscussion, maxChars: number): ReviewedDiscussionResult {
  if (!input.sourceCompleteConfirmed) return { ok: false, reason: "incomplete-source" };
  if (!input.attachmentsAccountedFor) return { ok: false, reason: "unaccounted-attachments" };
  if (!input.initialPosts.length && !input.initialAbsenceConfirmed) return { ok: false, reason: "initial-unknown" };
  if (input.initialPosts.length && input.initialAbsenceConfirmed) return { ok: false, reason: "initial-unknown" };
  if (!input.initialPosts.length && !input.replies.length) return { ok: false, reason: "empty-contribution" };
  if ([...input.initialPosts, ...input.replies].some((text) => !text.trim())) return { ok: false, reason: "empty-contribution" };
  const initial = input.initialPosts.length
    ? input.initialPosts.map((text, index) => `--- Initial post ${index + 1} ---\n${text}`).join("\n\n")
    : "[The instructor confirmed no initial post was present.]";
  const replies = input.replies.map((text, index) => `--- Reply ${index + 1} ---\n${text}`).join("\n\n");
  const initialPostContent = `=== INITIAL POST ===\n${initial}`;
  const replyContent = replies ? `=== REPLIES TO CLASSMATES ===\n${replies}` : "";
  const content = [initialPostContent, replyContent].filter(Boolean).join("\n\n");
  if (!Number.isSafeInteger(maxChars) || maxChars < 1 || content.length > maxChars) return { ok: false, reason: "too-large" };
  return { ok: true, content, discussionAxes: { initialPostContent, replyContent, replyCount: input.replies.length, ...(!input.initialPosts.length ? { initialPostAbsentConfirmed: true } : {}) } };
}
