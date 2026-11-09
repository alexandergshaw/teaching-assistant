import { buildReviewedPastedDiscussion, type ReviewedPastedDiscussion } from "./reviewed-pasted-discussion";

/** Group membership and role must be chosen by the instructor for every row. */
export interface ReviewedDiscussionRow {
  content: string;
  group: string;
  role: "initial" | "reply" | "unassigned";
  authorConfirmed: boolean;
}

export interface ReviewedDiscussionGroup {
  id: string;
  student: string;
  samePersonConfirmed: boolean;
  sourceCompleteConfirmed: boolean;
  attachmentsAccountedFor: boolean;
}

export function buildReviewedDiscussionGroups(rows: readonly ReviewedDiscussionRow[], groups: readonly ReviewedDiscussionGroup[], maxChars: number) {
  if (!rows.length || !groups.length || new Set(groups.map((group) => group.id)).size !== groups.length) return { ok: false as const, reason: "unassigned" as const };
  const normalizedNames = groups.map((group) => group.student.trim().normalize("NFKC").toLocaleLowerCase());
  if (new Set(normalizedNames).size !== normalizedNames.length) return { ok: false as const, reason: "identity" as const };
  if (rows.some((row) => !row.authorConfirmed || row.role === "unassigned" || !groups.some((group) => group.id === row.group))) return { ok: false as const, reason: "unassigned" as const };
  const entries: { student: string; content: string; discussionAxes: { initialPostContent: string; replyContent: string; replyCount: number }; reviewedDiscussion: ReviewedPastedDiscussion }[] = [];
  for (const group of groups) {
    const members = rows.filter((row) => row.group === group.id);
    if (!group.id || !group.student.trim() || !members.length || (members.length > 1 && !group.samePersonConfirmed)) return { ok: false as const, reason: "identity" as const };
    const reviewedDiscussion: ReviewedPastedDiscussion = { initialPosts: members.filter((row) => row.role === "initial").map((row) => row.content), replies: members.filter((row) => row.role === "reply").map((row) => row.content), initialAbsenceConfirmed: false, sourceCompleteConfirmed: group.sourceCompleteConfirmed, attachmentsAccountedFor: group.attachmentsAccountedFor };
    const result = buildReviewedPastedDiscussion(reviewedDiscussion, maxChars);
    if (!result.ok) return result;
    entries.push({ student: group.student.trim(), content: result.content, discussionAxes: result.discussionAxes, reviewedDiscussion });
  }
  return { ok: true as const, entries };
}
