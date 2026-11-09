import { describe, expect, it } from "vitest";
import { discussionAxesMatchContent } from "./discussion-axes-consistency";

describe("discussion axes and displayed evidence", () => {
  const initial = "=== INITIAL POST ===\n\nA student's post";
  const replies = "=== REPLIES TO CLASSMATES ===\n\n--- Reply to Taylor ---\n\nA reply";
  const manifest = "This submission is a discussion contribution: 1 initial post and 1 reply to classmates. A reply is engagement with a classmate, not a second initial post; evaluate each contribution for what it is.";
  const axes = {
    initialPostContent: `This is the initial-post portion of a discussion contribution: 1 initial post. Evaluate only the initial post.\n\n${initial}`,
    replyContent: `This is the replies portion of a discussion contribution: 1 reply to classmates. Evaluate only these replies.\n\n${replies}`,
    replyCount: 1,
  };
  it("accepts Canvas-shaped matching evidence and rejects stale content or axis text", () => {
    const content = [manifest, initial, replies].join("\n\n");
    expect(discussionAxesMatchContent(content, axes)).toBe(true);
    expect(discussionAxesMatchContent(content + " changed", axes)).toBe(false);
    expect(discussionAxesMatchContent(content, { ...axes, replyContent: axes.replyContent + " changed" })).toBe(false);
  });
  it("refuses missing initial posts rather than letting the model assign points for an absence marker", () => {
    const missing = { initialPostContent: "This is the initial-post portion of a discussion contribution: 0 initial posts. Evaluate only the initial post.\n\n=== INITIAL POST ===\n\n[This student did not write an initial post.]", replyContent: "", replyCount: 0 };
    expect(discussionAxesMatchContent(missing.initialPostContent, missing)).toBe(false);
  });
});
