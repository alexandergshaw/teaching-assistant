// Tests for createAnnouncementAction's OPTIONAL image argument (this wave:
// "hand a recorded take's announcement image to Canvas, not just a download
// button"). Every I/O boundary is mocked (auth, and the two @/lib/canvas
// functions this action calls: createAnnouncement and
// resolveAnnouncementImage) - no test in this file may reach the network or
// real Canvas. Mirrors canvas-inbox.weekly-announcement-schedule.test.ts's
// mocking pattern (its own separate vi.mock("@/lib/canvas", ...) in that
// file is scoped to that file only; vitest mocks are per test file, so this
// file's narrower mock - only the two functions createAnnouncementAction
// itself calls - cannot collide with it).
//
// The upload-and-resolve-to-a-course-scoped-src work (including the
// filename default and the non-fatal-upload-failure catch) now lives in
// resolveAnnouncementImage (src/lib/canvas/announcement-image-upload.ts) -
// this file mocks that boundary and only proves createAnnouncementAction
// wires it correctly: calls it with the right arguments, forwards its
// `image` straight into createAnnouncement, and never lets an `imageError`
// stop the post. resolveAnnouncementImage's own behavior (the filename
// default, the course-scoped src, the non-Error-rejection message) is
// covered in announcement-image-upload.test.ts instead.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/auth", () => ({
  requireOwner: vi.fn(),
}));

vi.mock("@/lib/canvas", () => ({
  createAnnouncement: vi.fn(),
  resolveAnnouncementImage: vi.fn(),
}));

import { requireOwner } from "@/lib/supabase/auth";
import { createAnnouncement, resolveAnnouncementImage } from "@/lib/canvas";
import { createAnnouncementAction } from "./canvas-inbox";

const OWNER = { id: "owner-1", email: "owner@example.com" };
const COURSE_URL = "https://canvas.mccneb.edu/courses/123";

const FAKE_ANNOUNCEMENT = {
  id: 42,
  title: "Week 3 recap",
  message: "Here's what we covered.",
  postedAt: "2026-01-05T00:00:00Z",
  delayedPostAt: null,
  author: "Instructor",
  htmlUrl: "https://canvas.mccneb.edu/courses/123/discussion_topics/42",
};

describe("createAnnouncementAction - optional image argument", () => {
  beforeEach(() => {
    vi.mocked(requireOwner).mockReset().mockResolvedValue(OWNER as never);
    vi.mocked(createAnnouncement).mockReset().mockResolvedValue(FAKE_ANNOUNCEMENT);
    vi.mocked(resolveAnnouncementImage).mockReset();
  });

  it("with no image argument, calls createAnnouncement exactly as before and never touches resolveAnnouncementImage (every one of the five other callers' behavior)", async () => {
    const result = await createAnnouncementAction(COURSE_URL, "Week 3 recap", "Body text", "MCC", undefined);

    expect(resolveAnnouncementImage).not.toHaveBeenCalled();
    expect(createAnnouncement).toHaveBeenCalledTimes(1);
    expect(createAnnouncement).toHaveBeenCalledWith(COURSE_URL, "Week 3 recap", "Body text", "MCC", undefined);
    expect(result).toEqual({ announcement: FAKE_ANNOUNCEMENT });
    expect("imageError" in result).toBe(false);
  });

  it("with an image, resolves it first (courseUrl, image, acronym) and passes its `image` through to createAnnouncement as the 6th argument - the course-scoped src, not a raw upload url", async () => {
    // Frozen literal: the shape resolveAnnouncementImage actually returns on
    // success is a course-scoped download URL (see
    // announcement-image-upload.test.ts's own frozen-literal proof of this
    // shape) - this test only proves the action forwards it unmodified.
    vi.mocked(resolveAnnouncementImage).mockResolvedValue({
      image: {
        url: "https://canvas.mccneb.edu/courses/123/files/999/download",
        altText: "Illustration accompanying the announcement: Week 3 recap",
      },
    });

    const imageArg = {
      base64: "ZmFrZQ==",
      mimeType: "image/png",
      altText: "Illustration accompanying the announcement: Week 3 recap",
      fileName: "week-3-recap-image.png",
    };
    const result = await createAnnouncementAction(COURSE_URL, "Week 3 recap", "Body text", "MCC", undefined, imageArg);

    expect(resolveAnnouncementImage).toHaveBeenCalledTimes(1);
    expect(resolveAnnouncementImage).toHaveBeenCalledWith(COURSE_URL, imageArg, "MCC");
    expect(createAnnouncement).toHaveBeenCalledWith(
      COURSE_URL,
      "Week 3 recap",
      "Body text",
      "MCC",
      undefined,
      { url: "https://canvas.mccneb.edu/courses/123/files/999/download", altText: "Illustration accompanying the announcement: Week 3 recap" }
    );
    expect(result).toEqual({ announcement: FAKE_ANNOUNCEMENT });
  });

  it("an upload failure is NEVER fatal to the post: the announcement still posts as text-only (image undefined), and the result carries a specific imageError instead of an error", async () => {
    vi.mocked(resolveAnnouncementImage).mockResolvedValue({
      imageError: "Could not attach the image - Canvas did not return an upload URL for the image.. The announcement posted as text only.",
    });

    const result = await createAnnouncementAction(COURSE_URL, "Week 3 recap", "Body text", "MCC", undefined, {
      base64: "ZmFrZQ==",
      mimeType: "image/png",
      altText: "alt text",
      fileName: "img.png",
    });

    // createAnnouncement still runs, and runs with NO image (undefined) - the
    // post itself must be identical to the no-image path, not a broken or
    // partial post.
    expect(createAnnouncement).toHaveBeenCalledWith(COURSE_URL, "Week 3 recap", "Body text", "MCC", undefined, undefined);
    expect("error" in result).toBe(false);
    expect(result).toMatchObject({ announcement: FAKE_ANNOUNCEMENT });
    if (!("announcement" in result)) throw new Error("expected the success shape");
    expect(result.imageError).toBe(
      "Could not attach the image - Canvas did not return an upload URL for the image.. The announcement posted as text only."
    );
  });

  it("still returns { error } (never throws, never posts) when the announcement itself fails, image or no image", async () => {
    vi.mocked(createAnnouncement).mockReset().mockRejectedValue(new Error("Canvas request failed (HTTP 500)."));

    const result = await createAnnouncementAction(COURSE_URL, "T", "B", "MCC");

    expect(result).toEqual({ error: "Canvas request failed (HTTP 500)." });
  });

  it("sabotage check: the test's own imageError assertion actually distinguishes success-with-warning from the announcement-failed shape", () => {
    const successWithWarning: { announcement: unknown; imageError?: string } = {
      announcement: FAKE_ANNOUNCEMENT,
      imageError: "Could not attach the image - x. The announcement posted as text only.",
    };
    const hardFailure: { error: string } = { error: "Could not post the announcement." };
    expect("error" in successWithWarning).toBe(false);
    expect("announcement" in hardFailure).toBe(false);
  });
});
