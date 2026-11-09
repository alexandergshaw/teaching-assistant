"use server";

import { requireUser } from "@/lib/supabase/auth";
import { resolveAnnouncementImage } from "@/lib/canvas";
import { createAnnouncementFromSafeHtml, RecordingAnnouncementRefusal, type CanvasAnnouncement } from "@/lib/canvas/announcements";

export async function postRecordingAnnouncementAction(
  courseUrl: string,
  title: string,
  html: string,
  acronym?: string,
  image?: { base64: string; mimeType: string; altText: string; fileName?: string },
): Promise<{ announcement: CanvasAnnouncement; imageError?: string } | { error: string; delivery?: "refused" }> {
  try {
    await requireUser();
    if (!image) return { announcement: await createAnnouncementFromSafeHtml(courseUrl, title, html, acronym) };
    const { image: uploadedImage, imageError } = await resolveAnnouncementImage(courseUrl, image, acronym);
    const announcement = await createAnnouncementFromSafeHtml(courseUrl, title, html, acronym, uploadedImage);
    return imageError ? { announcement, imageError } : { announcement };
  } catch (err) {
    if (err instanceof RecordingAnnouncementRefusal) return { error: err.message, delivery: "refused" };
    return { error: err instanceof Error ? err.message : "Could not post the announcement." };
  }
}
