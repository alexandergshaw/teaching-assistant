import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/supabase/auth", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/canvas", () => ({ resolveAnnouncementImage: vi.fn() }));
vi.mock("@/lib/canvas/announcements", () => ({ createAnnouncementFromSafeHtml: vi.fn() }));
import { requireUser } from "@/lib/supabase/auth";
import { resolveAnnouncementImage } from "@/lib/canvas";
import { createAnnouncementFromSafeHtml } from "@/lib/canvas/announcements";
import { postRecordingAnnouncementAction } from "./recording-announcement-post";

describe("recording announcement posting", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(requireUser).mockResolvedValue({ id: "owner" } as never);
    vi.mocked(createAnnouncementFromSafeHtml).mockResolvedValue({ id: 1 } as never);
  });
  it("sends the exact reviewed value to the sanitized Canvas path after authentication", async () => {
    const html = "<h2>Today</h2><p><strong>Read</strong></p>";
    await postRecordingAnnouncementAction("course", "Week", html, "ABC");
    expect(requireUser).toHaveBeenCalled();
    expect(createAnnouncementFromSafeHtml).toHaveBeenCalledWith("course", "Week", html, "ABC");
    expect(resolveAnnouncementImage).not.toHaveBeenCalled();
  });
  it("forwards a resolved course image and surfaces image errors", async () => {
    const image = { base64: "bytes", mimeType: "image/png", altText: "Illustration" };
    vi.mocked(resolveAnnouncementImage).mockResolvedValue({ image: undefined, imageError: "Image failed" });
    const result = await postRecordingAnnouncementAction("course", "Week", "<p>Hi</p>", "ABC", image);
    expect(resolveAnnouncementImage).toHaveBeenCalledWith("course", image, "ABC");
    expect(createAnnouncementFromSafeHtml).toHaveBeenCalledWith("course", "Week", "<p>Hi</p>", "ABC", undefined);
    expect(result).toEqual({ announcement: { id: 1 }, imageError: "Image failed" });
  });
  it("does not post if authentication fails", async () => {
    vi.mocked(requireUser).mockRejectedValue(new Error("Not signed in"));
    expect(await postRecordingAnnouncementAction("course", "Week", "<p>Hi</p>")).toEqual({ error: "Not signed in" });
    expect(createAnnouncementFromSafeHtml).not.toHaveBeenCalled();
  });
});
