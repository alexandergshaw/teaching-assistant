import { describe, expect, it } from "vitest";
import { buildReviewedDiscussionGroups, type ReviewedDiscussionGroup, type ReviewedDiscussionRow } from "./reviewed-discussion-groups";

describe("explicit discussion grouping", () => {
  const group: ReviewedDiscussionGroup = { id: "g1", student: "Alex", samePersonConfirmed: true, sourceCompleteConfirmed: true, attachmentsAccountedFor: true };
  const rows: ReviewedDiscussionRow[] = [{ content: "Initial text", group: "g1", role: "initial", authorConfirmed: true }, { content: "Reply text", group: "g1", role: "reply", authorConfirmed: true }];
  it("retains all contributions in the explicitly chosen group and axes", () => {
    const result = buildReviewedDiscussionGroups(rows, [group], 10000);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries[0].discussionAxes.initialPostContent).toContain("Initial text");
    expect(result.entries[0].discussionAxes.replyContent).toContain("Reply text");
  });
  it("refuses missing role, missing author confirmation, and unconfirmed grouping", () => {
    expect(buildReviewedDiscussionGroups([{ ...rows[0], role: "unassigned" }], [group], 10000).ok).toBe(false);
    expect(buildReviewedDiscussionGroups([{ ...rows[0], authorConfirmed: false }], [group], 10000).ok).toBe(false);
    expect(buildReviewedDiscussionGroups(rows, [{ ...group, samePersonConfirmed: false }], 10000).ok).toBe(false);
  });
  it("refuses incomplete sources and contributions assigned to nonexistent groups", () => {
    expect(buildReviewedDiscussionGroups(rows, [{ ...group, sourceCompleteConfirmed: false }], 10000).ok).toBe(false);
    expect(buildReviewedDiscussionGroups([...rows, { ...rows[1], group: "unknown" }], [group], 10000).ok).toBe(false);
  });
});
