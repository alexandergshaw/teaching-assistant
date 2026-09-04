// Tests for listConversationsAction's OPTIONAL `opts` argument
// (docs/message-replies-acceptance-criteria.md M15: "listConversationsAction
// gains the same options; existing callers are byte-unaffected"). Mirrors
// canvas-inbox.announcement-image.test.ts's own mocking pattern: auth and
// the single @/lib/canvas function this action calls (listConversations) are
// mocked - no test in this file reaches the network or real Canvas. The real
// pagination/filter-building behaviour of listConversations itself is
// covered in src/lib/canvas/inbox.test.ts; this file only proves
// listConversationsAction threads `opts` through unchanged and stays
// byte-unaffected when it is omitted.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/auth", () => ({
  requireOwner: vi.fn(),
}));

vi.mock("@/lib/canvas", () => ({
  listConversations: vi.fn(),
}));

import { requireOwner } from "@/lib/supabase/auth";
import { listConversations } from "@/lib/canvas";
import { listConversationsAction } from "./canvas-inbox";

const OWNER = { id: "owner-1", email: "owner@example.com" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireOwner).mockResolvedValue(OWNER as never);
  vi.mocked(listConversations).mockResolvedValue([]);
});

describe("listConversationsAction", () => {
  it("requires ownership - a rejected requireOwner is caught and returned as { error }, never thrown", async () => {
    vi.mocked(requireOwner).mockRejectedValueOnce(new Error("Not authorized. Sign in with an approved account."));
    await expect(listConversationsAction()).resolves.toEqual({
      error: "Not authorized. Sign in with an approved account.",
    });
    expect(listConversations).not.toHaveBeenCalled();
  });

  it("calling with no arguments at all stays byte-unaffected - listConversations receives (undefined, undefined)", async () => {
    await listConversationsAction();
    expect(listConversations).toHaveBeenCalledWith(undefined, undefined);
  });

  it("an existing caller passing only an acronym stays byte-unaffected - opts arrives as undefined", async () => {
    await listConversationsAction("MCC");
    expect(listConversations).toHaveBeenCalledWith("MCC", undefined);
  });

  it("threads a new opts argument straight through to listConversations, unchanged", async () => {
    const opts = { courseId: "456", scope: "archived" as const, perPage: 100 };
    await listConversationsAction("MCC", opts);
    expect(listConversations).toHaveBeenCalledWith("MCC", opts);
  });

  it("returns whatever listConversations resolves, wrapped in { conversations }", async () => {
    const conversations = [
      { id: 1, subject: "Grades", lastMessage: "", participants: ["Priya"], messageCount: 2, workflowState: "read", lastMessageAt: null },
    ];
    vi.mocked(listConversations).mockResolvedValueOnce(conversations as never);
    const result = await listConversationsAction("MCC", { courseId: "456" });
    expect(result).toEqual({ conversations });
  });

  it("a thrown error is caught and returned as { error }, never thrown", async () => {
    vi.mocked(listConversations).mockRejectedValueOnce(new Error("Canvas returned an unexpected error."));
    const result = await listConversationsAction("MCC", { courseId: "456" });
    expect(result).toEqual({ error: "Canvas returned an unexpected error." });
  });
});
