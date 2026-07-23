/**
 * Canvas announcements and course information.
 */

import { canvasError, htmlToText, textToHtml, resolveCourse } from "../canvas-core";

/** One announcement, ready for the UI. The message is plain text. */
export interface CanvasAnnouncement {
  id: number;
  title: string;
  message: string;
  postedAt: string | null;
  // When set and in the future, the announcement is scheduled: students cannot
  // see it until this time (Canvas delayed_post_at). Null for immediate posts.
  delayedPostAt: string | null;
  author: string;
  htmlUrl: string;
}

interface CanvasDiscussionTopicListItem {
  id?: number;
  title?: string;
  message?: string | null;
  posted_at?: string | null;
  delayed_post_at?: string | null;
  html_url?: string;
  author?: { display_name?: string } | null;
  user_name?: string;
}

function toAnnouncement(
  topic: CanvasDiscussionTopicListItem,
  fallback?: { title?: string; message?: string }
): CanvasAnnouncement {
  return {
    id: topic.id ?? 0,
    title: (topic.title ?? fallback?.title ?? "(untitled)").trim() || "(untitled)",
    message: topic.message
      ? htmlToText(topic.message)
      : (fallback?.message ?? "").trim(),
    postedAt: topic.posted_at ?? null,
    delayedPostAt: topic.delayed_post_at ?? null,
    author: topic.author?.display_name?.trim() || topic.user_name?.trim() || "",
    htmlUrl: topic.html_url ?? "",
  };
}

/** Fetch the course's display name for a heading. */
export async function getCourseName(courseUrl: string, code?: string): Promise<string> {
  const { courseId, institution, token, baseUrl } = resolveCourse(courseUrl, code);
  const response = await fetch(`${baseUrl}/api/v1/courses/${courseId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw canvasError(response.status, institution);
  }
  const course = (await response.json()) as { name?: string; course_code?: string };
  return course.name?.trim() || course.course_code?.trim() || `Course ${courseId}`;
}

/** Fetch course metadata: name, start date (ISO), and syllabus body (HTML). */
export async function getCourseInfo(
  courseUrl: string,
  code?: string
): Promise<{ name: string; startAt: string | null; syllabusBody: string }> {
  const { courseId, institution, token, baseUrl } = resolveCourse(courseUrl, code);
  const response = await fetch(`${baseUrl}/api/v1/courses/${courseId}?include[]=syllabus_body`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw canvasError(response.status, institution);
  }
  const data = (await response.json()) as { name?: string; start_at?: string | null; syllabus_body?: string | null };
  return {
    name: data.name ?? "",
    startAt: data.start_at ?? null,
    syllabusBody: data.syllabus_body ?? "",
  };
}

/**
 * Export a course as an IMS Common Cartridge (.imscc).
 * Returns the cartridge filename and base64-encoded content.
 * Polls the export status up to 3 minutes before timing out.
 */
export async function exportCourseCartridge(
  courseUrl: string,
  code?: string
): Promise<{ fileName: string; base64: string }> {
  const { courseId, institution, token, baseUrl } = resolveCourse(courseUrl, code);

  const exportResponse = await fetch(
    `${baseUrl}/api/v1/courses/${courseId}/content_exports?export_type=common_cartridge&skip_notifications=true`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  if (!exportResponse.ok) {
    throw canvasError(exportResponse.status, institution);
  }

  const exportData = (await exportResponse.json()) as { id?: string };
  if (!exportData.id) {
    throw new Error("The LMS did not return an export ID.");
  }

  let attachment: { url?: string; filename?: string } | null = null;
  const maxAttempts = 36;
  const pollIntervalMs = 5000;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const statusResponse = await fetch(
      `${baseUrl}/api/v1/courses/${courseId}/content_exports/${exportData.id}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!statusResponse.ok) {
      throw canvasError(statusResponse.status, institution);
    }

    const status = (await statusResponse.json()) as {
      workflow_state?: string;
      attachment?: { url?: string; filename?: string } | null;
    };
    if (status.workflow_state === "exported") {
      attachment = status.attachment ?? null;
      break;
    }
    if (status.workflow_state === "failed") {
      throw new Error("The LMS reported the export failed.");
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  if (!attachment?.url) {
    throw new Error("Timed out waiting for the LMS export (try again in a minute).");
  }

  let attachmentResponse = await fetch(attachment.url);
  if (!attachmentResponse.ok) {
    attachmentResponse = await fetch(attachment.url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!attachmentResponse.ok) {
      throw new Error("Could not download the export from the LMS.");
    }
  }

  const arrayBuffer = await attachmentResponse.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  return {
    fileName: attachment.filename ?? "export.imscc",
    base64,
  };
}

/** List a course's recent announcements (newest first), one page of 50. */
export async function listAnnouncements(
  courseUrl: string,
  code?: string
): Promise<CanvasAnnouncement[]> {
  const { courseId, institution, token, baseUrl } = resolveCourse(courseUrl, code);
  const response = await fetch(
    `${baseUrl}/api/v1/courses/${courseId}/discussion_topics?only_announcements=true&per_page=50`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!response.ok) {
    throw canvasError(response.status, institution);
  }
  const topics = (await response.json()) as CanvasDiscussionTopicListItem[];
  const announcements = topics
    .filter((t) => typeof t.id === "number")
    .map((t) => toAnnouncement(t));

  // Sort: upcoming scheduled recaps must surface at the top of the panel.
  // Scheduled items (no postedAt, delayedPostAt set) sort first by soonest delayedPostAt.
  // Posted items (has postedAt) sort second by newest postedAt.
  announcements.sort((a, b) => {
    const aIsScheduled = !a.postedAt && a.delayedPostAt;
    const bIsScheduled = !b.postedAt && b.delayedPostAt;

    // Both scheduled: sort by delayedPostAt ascending (soonest first)
    if (aIsScheduled && bIsScheduled) {
      return (a.delayedPostAt ?? "").localeCompare(b.delayedPostAt ?? "");
    }
    // Only a is scheduled: a comes first
    if (aIsScheduled) return -1;
    // Only b is scheduled: b comes first
    if (bIsScheduled) return 1;
    // Both posted: sort by postedAt descending (newest first)
    return (b.postedAt ?? "").localeCompare(a.postedAt ?? "");
  });

  return announcements;
}

/**
 * Post a new announcement to the course. When `delayedPostAt` is set to a future
 * time, Canvas schedules it: students cannot see it until then. Returns the
 * created announcement.
 */
export async function createAnnouncement(
  courseUrl: string,
  title: string,
  message: string,
  code?: string,
  delayedPostAt?: string | null
): Promise<CanvasAnnouncement> {
  if (!title.trim()) throw new Error("An announcement needs a title.");
  if (!message.trim()) throw new Error("An announcement needs a message.");
  const { courseId, institution, token, baseUrl } = resolveCourse(courseUrl, code);

  const params = new URLSearchParams();
  params.append("title", title.trim());
  params.append("message", textToHtml(message.trim()));
  params.append("is_announcement", "true");
  if (delayedPostAt && delayedPostAt.trim()) {
    const when = new Date(delayedPostAt.trim());
    if (Number.isNaN(when.getTime())) {
      throw new Error("Could not read the scheduled visibility time.");
    }
    // Canvas hides the announcement from students until this time (ISO 8601).
    params.append("delayed_post_at", when.toISOString());
  }

  const response = await fetch(
    `${baseUrl}/api/v1/courses/${courseId}/discussion_topics`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    }
  );
  if (!response.ok) {
    throw canvasError(response.status, institution);
  }
  const topic = (await response.json()) as CanvasDiscussionTopicListItem;
  return toAnnouncement(topic, { title, message });
}
