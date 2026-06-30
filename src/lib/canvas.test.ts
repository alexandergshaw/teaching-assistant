import { describe, it, expect } from "vitest";
import { extractDiscussionActivity } from "./canvas";

// A small synthetic discussion /view response: one thread (Alice's post with two
// replies) plus Bob's own top-level post, and a deleted entry that must be ignored.
const view = {
  participants: [
    { id: 1, display_name: "Alice Adams" },
    { id: 2, display_name: "Bob Smith" },
  ],
  view: [
    {
      id: 100,
      user_id: 1,
      message: "<p>My initial thoughts on the prompt.</p>",
      created_at: "2026-02-08T10:00:00Z",
      replies: [
        { id: 101, user_id: 2, message: "Good point, Alice.", created_at: "2026-02-09T09:00:00Z" },
        { id: 102, user_id: 1, message: "Thanks, Bob.", created_at: "2026-02-09T12:00:00Z" },
      ],
    },
    { id: 103, user_id: 2, message: "Bob's own opening post.", created_at: "2026-02-08T11:00:00Z" },
    { id: 104, user_id: 3, message: "", deleted: true },
  ],
};

describe("extractDiscussionActivity", () => {
  const { names, byUser } = extractDiscussionActivity(view);

  it("maps participant names", () => {
    expect(names.get(1)).toBe("Alice Adams");
    expect(names.get(2)).toBe("Bob Smith");
  });

  it("separates initial posts from replies and strips HTML", () => {
    const alice = byUser.get(1)!;
    expect(alice.initialPosts).toHaveLength(1);
    expect(alice.initialPosts[0].text).toBe("My initial thoughts on the prompt.");
    expect(alice.initialPosts[0].isReply).toBe(false);
    expect(alice.initialPosts[0].parentUserId).toBeNull();
    expect(alice.replies).toHaveLength(1); // her "Thanks, Bob." reply
    expect(alice.replies[0].isReply).toBe(true);
  });

  it("records the parent author of each reply", () => {
    const bob = byUser.get(2)!;
    expect(bob.initialPosts).toHaveLength(1);
    expect(bob.replies).toHaveLength(1);
    expect(bob.replies[0].parentUserId).toBe(1); // replied under Alice's thread
    expect(bob.replies[0].createdAt).toBe("2026-02-09T09:00:00Z");
  });

  it("ignores deleted entries", () => {
    expect(byUser.has(3)).toBe(false);
  });
});
