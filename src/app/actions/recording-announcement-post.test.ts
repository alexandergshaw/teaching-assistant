import { beforeEach, describe, expect, it, vi } from "vitest";
import { actionAuthClient, actionAuthUser } from "./action-auth.fixtures";
const readIdentity = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/server", () => ({ createClient: () => actionAuthClient(readIdentity) }));
vi.mock("@/lib/supabase/app-users", async (original) => ({
  ...await original<typeof import("@/lib/supabase/app-users")>(),
  getAppUser: async (id: string) => actionAuthUser(id, "instructor"),
}));
vi.mock("@/lib/canvas/announcement-image-upload", () => ({ resolveAnnouncementImage: vi.fn() }));
vi.mock("@/lib/canvas/announcements", () => ({ createAnnouncementFromSafeHtml: vi.fn(), RecordingAnnouncementRefusal: class RecordingAnnouncementRefusal extends Error {} }));
import { resolveAnnouncementImage } from "@/lib/canvas/announcement-image-upload";
import { createAnnouncementFromSafeHtml, RecordingAnnouncementRefusal } from "@/lib/canvas/announcements";
import { postRecordingAnnouncementAction } from "./recording-announcement-post";

describe("recording announcement posting", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    readIdentity.mockResolvedValue({ id: "owner" });
    vi.mocked(createAnnouncementFromSafeHtml).mockResolvedValue({ id: 1 } as never);
  });
  it("sends the exact reviewed value to the sanitized Canvas path after authentication", async () => {
    const html = "<h2>Today</h2><p><strong>Read</strong></p>";
    await postRecordingAnnouncementAction("course", "Week", html, "ABC");
    expect(readIdentity).toHaveBeenCalled();
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
    readIdentity.mockResolvedValue(null);
    expect(await postRecordingAnnouncementAction("course", "Week", "<p>Hi</p>")).toEqual({ error: "Not authorized. Sign in with an approved account." });
    expect(createAnnouncementFromSafeHtml).not.toHaveBeenCalled();
  });
  it("distinguishes explicit Canvas refusal from an ambiguous failure", async () => {
    vi.mocked(createAnnouncementFromSafeHtml).mockRejectedValueOnce(new RecordingAnnouncementRefusal("Refused"));
    expect(await postRecordingAnnouncementAction("course", "Week", "<p>Hi</p>")).toEqual({ error: "Refused", delivery: "refused" });
    vi.mocked(createAnnouncementFromSafeHtml).mockRejectedValueOnce(new Error("network failure"));
    expect(await postRecordingAnnouncementAction("course", "Week", "<p>Hi</p>")).toEqual({ error: "network failure" });
  });
});
