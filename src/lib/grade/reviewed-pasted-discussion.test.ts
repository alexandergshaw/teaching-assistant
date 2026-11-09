import { describe, expect, it } from "vitest";
import { buildReviewedPastedDiscussion, type ReviewedPastedDiscussion } from "./reviewed-pasted-discussion";

const reviewed: ReviewedPastedDiscussion = { initialPosts: ["First paragraph.\n\nSecond paragraph."], replies: ["Reply one.", "Reply two."], initialAbsenceConfirmed: false, sourceCompleteConfirmed: true, attachmentsAccountedFor: true };

describe("reviewed pasted discussion", () => {
  it("retains each contribution and keeps replies out of the initial axis", () => {
    const result = buildReviewedPastedDiscussion(reviewed, 10_000);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.discussionAxes.initialPostContent).toContain(reviewed.initialPosts[0]);
    expect(result.discussionAxes.initialPostContent).not.toContain("Reply one.");
    expect(result.discussionAxes.replyContent).toContain("Reply one.");
    expect(result.discussionAxes.replyContent).toContain("Reply two.");
    expect(result.discussionAxes.replyCount).toBe(2);
    expect(result.content).toBe(`${result.discussionAxes.initialPostContent}\n\n${result.discussionAxes.replyContent}`);
  });
  it("does not infer zero replies from an incomplete source", () => {
    expect(buildReviewedPastedDiscussion({ ...reviewed, replies: [], sourceCompleteConfirmed: false }, 10_000)).toEqual({ ok: false, reason: "incomplete-source" });
    const complete = buildReviewedPastedDiscussion({ ...reviewed, replies: [] }, 10_000);
    expect(complete.ok && complete.discussionAxes.replyCount).toBe(0);
  });
  it("requires explicit initial absence and rejects unaccounted attachments", () => {
    expect(buildReviewedPastedDiscussion({ ...reviewed, initialPosts: [] }, 10_000)).toEqual({ ok: false, reason: "initial-unknown" });
    expect(buildReviewedPastedDiscussion({ ...reviewed, attachmentsAccountedFor: false }, 10_000)).toEqual({ ok: false, reason: "unaccounted-attachments" });
    expect(buildReviewedPastedDiscussion({ ...reviewed, initialPosts: [], initialAbsenceConfirmed: true }, 10_000)).toEqual({ ok: false, reason: "initial-unknown" });
  });
  it("refuses empty and oversized contributions rather than dropping them", () => {
    expect(buildReviewedPastedDiscussion({ ...reviewed, replies: [" "] }, 10_000)).toEqual({ ok: false, reason: "empty-contribution" });
    expect(buildReviewedPastedDiscussion(reviewed, 10)).toEqual({ ok: false, reason: "too-large" });
    expect(buildReviewedPastedDiscussion(reviewed, Number.NaN)).toEqual({ ok: false, reason: "too-large" });
  });
});
