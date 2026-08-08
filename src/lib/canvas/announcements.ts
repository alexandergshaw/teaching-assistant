/**
 * Canvas announcements and course information.
 */

import { canvasError, htmlToText, textToHtml, resolveCourse } from "../canvas-core";
import { parseNextLink } from "./pagination";

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

/**
 * List a course's announcements (sorted per the contract below). One page of
 * 50 by default - exactly today's behavior, unconditionally, for every
 * existing caller (the Canvas tab announcements panel, the
 * `list-announcements` step, and this function's own default). Pass
 * `{ allPages: true }` to follow Link-header pagination instead (AC4 of
 * docs/weekly-announcement-scheduling-acceptance-criteria.md) - an explicit
 * OPT-IN, never a change to the default: making this unconditional would
 * turn the announcements panel from one page of 50 into every announcement
 * the course has ever posted. KEEPS THE CURRENT ENDPOINT
 * (`discussion_topics?only_announcements=true`, not `/api/v1/announcements`,
 * which defaults to a 14-days-ago-through-28-days-later window and would
 * silently hide most of a term). Page size stays explicit (`per_page=50`) -
 * Canvas's own documented default is 10.
 */
export async function listAnnouncements(
  courseUrl: string,
  code?: string,
  opts?: { allPages?: boolean }
): Promise<CanvasAnnouncement[]> {
  const { courseId, institution, token, baseUrl } = resolveCourse(courseUrl, code);
  const topics: CanvasDiscussionTopicListItem[] = [];
  let url: string | null =
    `${baseUrl}/api/v1/courses/${courseId}/discussion_topics?only_announcements=true&per_page=50`;

  while (url) {
    const response: Response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) {
      throw canvasError(response.status, institution);
    }
    const page = (await response.json()) as CanvasDiscussionTopicListItem[];
    topics.push(...page);
    // Header NAME lookups (Headers.get) are already case-insensitive per the
    // Fetch spec - AC4 item 14's case-insensitivity applies to the rel
    // VALUE, which parseNextLink itself handles.
    url = opts?.allPages ? parseNextLink(response.headers.get("Link")) : null;
  }

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

// ── Weekly-announcement-scheduling support (AC6, AC7) ───────────────────────
//
// Three NEW functions, kept deliberately separate from createAnnouncement
// above rather than folded into it: docs/weekly-announcement-scheduling-
// acceptance-criteria.md's own instructions pin generate-weekly-
// announcements' existing behavior (REGRESSION.md #157 AC6) and forbid
// changing it, and createAnnouncement is that step's own Canvas call.
// Retrying is a benign, backward-compatible improvement in the abstract, but
// touching a function a pinned regression depends on is exactly the kind of
// change this feature was told not to make - so these are new, standalone
// functions instead of a shared retry wrapper bolted onto the old one.

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Bounded exponential-backoff retry for a single Canvas HTTP call (AC7).
 * Both 429 and 403 are treated as throttle signals: Canvas's own throttling
 * documentation writes the status as "429 Forbidden (Rate Limit Exceeded)" -
 * a quirk of their docs, since 429's real reason phrase is "Too Many
 * Requests" and "Forbidden" belongs to 403 - and third-party reports
 * describe 403 for the same condition, which is exactly why both are
 * handled rather than picking one. Canvas documents no `Retry-After` header
 * and publishes no numeric quota, so backoff is defensive by default (a
 * small fixed base, doubling, capped attempts) rather than tuned to a
 * published number. Returns the LAST response either way - the caller
 * decides what a still-failing final attempt means.
 */
async function fetchWithThrottleRetry(
  attempt: () => Promise<Response>,
  maxAttempts = 4
): Promise<Response> {
  let response = await attempt();
  let tries = 1;
  while ((response.status === 429 || response.status === 403) && tries < maxAttempts) {
    await sleep(500 * 2 ** (tries - 1));
    response = await attempt();
    tries += 1;
  }
  return response;
}

/**
 * Create a scheduled announcement for the weekly-scheduling reconciler
 * (scheduleWeeklyAnnouncementsAction, src/app/actions/canvas-inbox.ts) - the
 * same POST createAnnouncement makes, but issued through
 * fetchWithThrottleRetry (AC7). Always future-scheduled (delayedPostAtIso is
 * required, not optional): this feature never posts an announcement
 * immediately, only ever schedules one for a future in-session week.
 */
export async function createScheduledAnnouncementResilient(
  courseUrl: string,
  title: string,
  message: string,
  delayedPostAtIso: string,
  code?: string
): Promise<{ id: number }> {
  const { courseId, institution, token, baseUrl } = resolveCourse(courseUrl, code);
  const params = new URLSearchParams();
  params.append("title", title.trim());
  params.append("message", textToHtml(message.trim()));
  params.append("is_announcement", "true");
  params.append("delayed_post_at", delayedPostAtIso);

  const response = await fetchWithThrottleRetry(() =>
    fetch(`${baseUrl}/api/v1/courses/${courseId}/discussion_topics`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    })
  );
  if (!response.ok) {
    throw canvasError(response.status, institution);
  }
  const topic = (await response.json()) as CanvasDiscussionTopicListItem;
  if (typeof topic.id !== "number") {
    throw new Error("Canvas did not return an announcement id.");
  }
  return { id: topic.id };
}

/**
 * Reschedule an existing, not-yet-posted announcement's visibility time
 * (AC6's reschedule path - a start-date edit rewrites the SAME Canvas topic
 * rather than creating a new one). PUTs `delayed_post_at` only; the caller
 * (scheduleWeeklyAnnouncementsAction) is responsible for never calling this
 * on a topic Canvas has already posted (AC6 item 23 - Canvas's behavior
 * updating `delayed_post_at` on an already-posted topic is undocumented and
 * reported as buggy in production, so this feature does not depend on it).
 */
export async function updateAnnouncementSchedule(
  courseUrl: string,
  topicId: number,
  delayedPostAtIso: string,
  code?: string
): Promise<void> {
  const { courseId, institution, token, baseUrl } = resolveCourse(courseUrl, code);
  const params = new URLSearchParams();
  params.append("delayed_post_at", delayedPostAtIso);

  const response = await fetchWithThrottleRetry(() =>
    fetch(`${baseUrl}/api/v1/courses/${courseId}/discussion_topics/${topicId}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    })
  );
  if (!response.ok) {
    throw canvasError(response.status, institution);
  }
}

/**
 * Fetch a single discussion topic by id - the TARGETED read-back AC3 item 11
 * calls for when a pending row already carries a topic id (the crash landed
 * after Canvas responded but before the local confirm write committed). One
 * GET, never a list scan, so resolving that case costs a single request
 * instead of paging through the whole term. Returns null on 404 (the topic
 * id was never real, or the topic was since deleted) rather than throwing,
 * so the caller can safely fall back to creating; any other non-ok status
 * still throws.
 */
export async function getAnnouncementById(
  courseUrl: string,
  topicId: number,
  code?: string
): Promise<CanvasAnnouncement | null> {
  const { courseId, institution, token, baseUrl } = resolveCourse(courseUrl, code);
  const response = await fetchWithThrottleRetry(() =>
    fetch(`${baseUrl}/api/v1/courses/${courseId}/discussion_topics/${topicId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  );
  if (response.status === 404) return null;
  if (!response.ok) {
    throw canvasError(response.status, institution);
  }
  const topic = (await response.json()) as CanvasDiscussionTopicListItem;
  if (typeof topic.id !== "number") return null;
  return toAnnouncement(topic);
}
