import { describe, it, expect, vi } from "vitest";
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

  // REQ-8: a reply's parentName resolves to the display name of the entry it
  // replied to (via the existing names map), not the name of the reply's own
  // author. Bob's reply (author id 2) is under Alice's thread (parentUserId 1),
  // so parentName must be Alice's name, never Bob's.
  it("records the parent's display name on a reply (REQ-8)", () => {
    const bob = byUser.get(2)!;
    expect(bob.replies[0].parentName).toBe("Alice Adams");
  });
});

// REQ-4 (AC-3, shape-only): fetchDiscussion sets initialPostCount/replyCount
// from activity.initialPosts.length / activity.replies.length. This must go
// through fetchDiscussion (the only writer of these fields), which dials
// canvasGet (a node:https path vitest.setup.ts's global-fetch stub does not
// catch) - so canvasGet, not fetch, is mocked here.
vi.mock("./canvas-fetch-response", () => ({
  canvasGet: vi.fn(),
}));

describe("fetchDiscussion", () => {
  it("sets distinct initialPostCount and replyCount (REQ-4)", async () => {
    const { canvasGet } = await import("./canvas-fetch-response");
    const { fetchDiscussion } = await import("./canvas/discussions");

    // Bob: 1 initial post + 2 replies (both under Alice's thread), so the two
    // counts are distinct and non-equal.
    const viewWithTwoBobReplies = {
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
            { id: 102, user_id: 2, message: "Following up, Alice.", created_at: "2026-02-09T10:00:00Z" },
          ],
        },
        { id: 103, user_id: 2, message: "Bob's own opening post.", created_at: "2026-02-08T11:00:00Z" },
      ],
    };

    vi.mocked(canvasGet).mockImplementation(async (url: string) => {
      if (url.endsWith("/view")) {
        return {
          ok: true,
          json: async () => viewWithTwoBobReplies,
        } as Response;
      }
      // The due-date canvasGet call (discussion_topics/{id}).
      return {
        ok: true,
        json: async () => ({ assignment: null, lock_at: null, todo_date: null }),
      } as Response;
    });

    const { students } = await fetchDiscussion(
      "https://canvas.example.edu",
      "token",
      { code: "MCC", name: "Metropolitan Community College", host: "canvas.example.edu" },
      "123",
      "456"
    );

    const bob = students.find((s) => s.userId === 2)!;
    expect(bob.initialPostCount).toBe(1);
    expect(bob.replyCount).toBe(2);
    expect(bob.initialPostCount).not.toBe(bob.replyCount);
  });
});
