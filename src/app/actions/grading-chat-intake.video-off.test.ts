// VIDEO-GRADING W1: the OFF half of the gate. With the flag driven EXPLICITLY
// to false (the shipped constant is now true, W4; this keeps the disabled
// branch covered for a future toggle) a video behaves exactly as before the
// feature: the original worded "isn't supported" refusal, no sniff, no new message.
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/grade/constants", async () => {
  const actual = await vi.importActual<typeof import("@/lib/grade/constants")>("@/lib/grade/constants");
  return { ...actual, VIDEO_GRADING_ENABLED: false };
});

vi.mock("@/lib/supabase/auth", () => ({
  requireAppOwner: vi.fn().mockResolvedValue({ id: "owner-1", email: "owner@example.com" }),
  requireUser: vi.fn().mockRejectedValue(new Error("requireUser should never be called by this action")),
}));
vi.mock("@/lib/grade/extraction", () => ({
  ingestZipEntries: vi.fn(),
  extractStudentEntries: vi.fn(),
  extractCanvasEntries: vi.fn(),
}));
vi.mock("@/lib/grade/repo-content", () => ({ fetchGradableRepoContent: vi.fn() }));

import { prepareChatSubmissionAction } from "./grading-chat-intake";
import { VIDEO_PENDING_MESSAGE } from "@/lib/grade/video-grading";

describe("resolveOnePart kind file - video (flag explicitly OFF)", () => {
  it("is the unchanged unsupported-type refusal", async () => {
    const bytes = new Uint8Array(64);
    bytes.set([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
    const fd = new FormData();
    fd.set("kind", "file");
    fd.set("file", new File([bytes as BlobPart], "walkthrough.mp4", { type: "video/mp4" }));
    const outcome = await prepareChatSubmissionAction(fd);
    expect(outcome).toEqual({
      kind: "refused",
      reason: "This file type isn't supported for grading. Upload a text file, document, image, or a zip archive.",
    });
    if (outcome.kind === "refused") expect(outcome.reason).not.toBe(VIDEO_PENDING_MESSAGE);
  });
});
