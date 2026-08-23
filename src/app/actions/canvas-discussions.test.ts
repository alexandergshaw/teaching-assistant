// Tests createGradedDiscussionAction's wiring only: requireOwner guard,
// success passthrough, and the try/catch-to-{error} shape createGradableAction
// uses (src/app/actions/canvas-files-bulk.ts:395). The actual Canvas write
// behaviour (checkpoints vs classic, the mutation shape) is pinned by
// src/lib/canvas-modules/graded-discussion.test.ts - mocked here so this file
// tests only the action's own responsibility.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/auth", () => ({ requireOwner: vi.fn() }));
vi.mock("@/lib/canvas-modules/graded-discussion", () => ({ createGradedDiscussion: vi.fn() }));

import { requireOwner } from "@/lib/supabase/auth";
import { createGradedDiscussion } from "@/lib/canvas-modules/graded-discussion";
import { createGradedDiscussionAction } from "./canvas-discussions";

const FIELDS = {
  title: "Introduce Yourself",
  message: "<p>Hi</p>",
  pointsPossible: 20,
  initialPostPoints: 10,
  repliesPoints: 10,
  // M6: fixtures use the "...Z" with milliseconds shape Date.prototype.toISOString()
  // actually produces - the only producer in the app.
  initialPostAt: "2026-09-10T23:59:00.000Z",
  repliesDueAt: "2026-09-13T23:59:00.000Z",
  requiredReplyCount: 2,
  published: false,
  useCheckpoints: true,
};

beforeEach(() => {
  vi.mocked(requireOwner).mockReset();
  vi.mocked(createGradedDiscussion).mockReset();
});

describe("createGradedDiscussionAction", () => {
  it("checks ownership before writing to Canvas", async () => {
    vi.mocked(requireOwner).mockResolvedValue(undefined as never);
    vi.mocked(createGradedDiscussion).mockResolvedValue({ id: 1, path: "checkpoints" });

    await createGradedDiscussionAction("https://canvas.mccneb.edu/courses/1", FIELDS);

    expect(requireOwner).toHaveBeenCalledTimes(1);
    expect(createGradedDiscussion).toHaveBeenCalledWith(
      "https://canvas.mccneb.edu/courses/1",
      FIELDS,
      undefined
    );
  });

  it("passes the acronym through to the write layer", async () => {
    vi.mocked(requireOwner).mockResolvedValue(undefined as never);
    vi.mocked(createGradedDiscussion).mockResolvedValue({ id: 1, path: "checkpoints" });

    await createGradedDiscussionAction("https://canvas.mccneb.edu/courses/1", FIELDS, "MCC");

    expect(createGradedDiscussion).toHaveBeenCalledWith(
      "https://canvas.mccneb.edu/courses/1",
      FIELDS,
      "MCC"
    );
  });

  it("returns the write layer's result on success, classic path included", async () => {
    vi.mocked(requireOwner).mockResolvedValue(undefined as never);
    vi.mocked(createGradedDiscussion).mockResolvedValue({
      id: 42,
      path: "classic",
      fallbackReason: "checkpoints unavailable",
    });

    const result = await createGradedDiscussionAction("https://canvas.mccneb.edu/courses/1", FIELDS);

    expect(result).toEqual({ id: 42, path: "classic", fallbackReason: "checkpoints unavailable" });
  });

  it("converts a thrown Error into { error } instead of rejecting", async () => {
    vi.mocked(requireOwner).mockResolvedValue(undefined as never);
    vi.mocked(createGradedDiscussion).mockRejectedValue(new Error("Canvas rejected the discussion checkpoints: boom"));

    const result = await createGradedDiscussionAction("https://canvas.mccneb.edu/courses/1", FIELDS);

    expect(result).toEqual({ error: "Canvas rejected the discussion checkpoints: boom" });
  });

  it("never calls the write layer when requireOwner rejects", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new Error("Not signed in."));

    const result = await createGradedDiscussionAction("https://canvas.mccneb.edu/courses/1", FIELDS);

    expect(result).toEqual({ error: "Not signed in." });
    expect(createGradedDiscussion).not.toHaveBeenCalled();
  });
});
