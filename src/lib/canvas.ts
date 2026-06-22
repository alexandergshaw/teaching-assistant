/**
 * Client for the Canvas LMS REST API.
 *
 * Canvas has no UI export for discussion boards, but its API exposes the full
 * threaded discussion in one call. We use that to pull every student's posts and
 * replies so they can be fed into the existing grading pipeline.
 *
 * Server-only: reads the instructor API token from the environment and never
 * exposes it to the client.
 */

const DEFAULT_CANVAS_URL = "https://canvas.mccneb.edu";

export function getCanvasUrl(): string {
  return (process.env.CANVAS_URL ?? DEFAULT_CANVAS_URL).replace(/\/+$/, "");
}

export function getCanvasApiToken(): string | undefined {
  return process.env.CANVAS_API_TOKEN || undefined;
}

/** One student's flattened contribution to a discussion. */
export interface CanvasDiscussionStudent {
  student: string;
  userId: number;
  /** All of the student's posts/replies, HTML-stripped and joined. */
  text: string;
  /** Number of separate posts/replies the student made. */
  contributionCount: number;
}

/** Pull course + topic ids out of a Canvas discussion URL. */
export function parseCanvasDiscussionUrl(
  url: string
): { courseId: string; topicId: string } | null {
  const match = url.match(/\/courses\/(\d+)\/discussion_topics\/(\d+)/);
  return match ? { courseId: match[1], topicId: match[2] } : null;
}

// Minimal HTML-to-text for Canvas message bodies (which are stored as HTML).
function htmlToText(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*(p|div|li|h[1-6]|tr)\s*>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

interface CanvasViewEntry {
  id?: number;
  user_id?: number;
  message?: string | null;
  deleted?: boolean;
  replies?: CanvasViewEntry[];
}

interface CanvasViewResponse {
  participants?: Array<{ id?: number; display_name?: string }>;
  view?: CanvasViewEntry[];
}

function canvasError(status: number): Error {
  switch (status) {
    case 401:
    case 403:
      return new Error(
        "Canvas rejected the request: the API token is missing, invalid, or lacks access to this course (CANVAS_API_TOKEN)."
      );
    case 404:
      return new Error(
        "Canvas could not find that discussion. Check the course/discussion URL and that the token's account can see it."
      );
    default:
      return new Error(`Canvas request failed (HTTP ${status}).`);
  }
}

/**
 * Fetch a discussion's full threaded view and flatten it into one entry per
 * student (their posts + replies, HTML-stripped). Sorted by student name.
 */
export async function fetchCanvasDiscussion(
  url: string
): Promise<CanvasDiscussionStudent[]> {
  const token = getCanvasApiToken();
  if (!token) {
    throw new Error(
      "Canvas API token is not configured. Set CANVAS_API_TOKEN in the environment."
    );
  }

  const ids = parseCanvasDiscussionUrl(url);
  if (!ids) {
    throw new Error(
      "Could not read the course and discussion ids from that URL. Expected a link like .../courses/123/discussion_topics/456."
    );
  }

  const endpoint = `${getCanvasUrl()}/api/v1/courses/${ids.courseId}/discussion_topics/${ids.topicId}/view`;
  const response = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw canvasError(response.status);
  }

  const data = (await response.json()) as CanvasViewResponse;

  const names = new Map<number, string>();
  for (const participant of data.participants ?? []) {
    if (typeof participant.id === "number") {
      names.set(participant.id, participant.display_name?.trim() || `User ${participant.id}`);
    }
  }

  // Walk the (recursively nested) entry tree, collecting each student's text.
  const byUser = new Map<number, string[]>();
  const walk = (entries: CanvasViewEntry[] | undefined, depth: number) => {
    for (const entry of entries ?? []) {
      if (!entry.deleted && typeof entry.user_id === "number" && entry.message) {
        const text = htmlToText(entry.message);
        if (text) {
          const label = depth === 0 ? "Post" : "Reply";
          const bucket = byUser.get(entry.user_id) ?? [];
          bucket.push(`${label}: ${text}`);
          byUser.set(entry.user_id, bucket);
        }
      }
      if (entry.replies?.length) {
        walk(entry.replies, depth + 1);
      }
    }
  };
  walk(data.view, 0);

  const students: CanvasDiscussionStudent[] = [];
  for (const [userId, texts] of byUser) {
    students.push({
      student: names.get(userId) ?? `User ${userId}`,
      userId,
      text: texts.join("\n\n---\n\n"),
      contributionCount: texts.length,
    });
  }
  students.sort((a, b) => a.student.localeCompare(b.student));
  return students;
}
