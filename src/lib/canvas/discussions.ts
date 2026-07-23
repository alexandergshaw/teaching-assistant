/**
 * Canvas discussion APIs: fetching and extracting discussion thread activity.
 */

import { canvasError, htmlToText, type CanvasInstitution } from "../canvas-core";

/** A single post or reply by a student in a discussion thread. */
export interface DiscussionPost {
  text: string;
  /** ISO timestamp, when Canvas provides it. */
  createdAt: string | null;
  /** True for a nested reply, false for a top-level (initial) post. */
  isReply: boolean;
  /** The user id of the entry this one replied to (null for top-level posts). */
  parentUserId: number | null;
}

/** A student's structured activity in one discussion thread. */
export interface DiscussionActivity {
  initialPosts: DiscussionPost[];
  replies: DiscussionPost[];
}

interface CanvasViewEntry {
  id?: number;
  user_id?: number;
  message?: string | null;
  deleted?: boolean;
  created_at?: string | null;
  replies?: CanvasViewEntry[];
}

interface CanvasViewResponse {
  participants?: Array<{ id?: number; display_name?: string }>;
  view?: CanvasViewEntry[];
}

/**
 * Walk a discussion `/view` response into per-user structured activity (initial
 * posts vs replies, timestamps, and who each reply targeted) plus participant
 * names. Pure (no network) so it can be unit-tested with synthetic threads.
 */
export function extractDiscussionActivity(data: CanvasViewResponse): {
  names: Map<number, string>;
  byUser: Map<number, DiscussionActivity>;
} {
  const names = new Map<number, string>();
  for (const participant of data.participants ?? []) {
    if (typeof participant.id === "number") {
      names.set(participant.id, participant.display_name?.trim() || `User ${participant.id}`);
    }
  }

  const byUser = new Map<number, DiscussionActivity>();
  const walk = (entries: CanvasViewEntry[] | undefined, depth: number, parentUserId: number | null) => {
    for (const entry of entries ?? []) {
      if (!entry.deleted && typeof entry.user_id === "number" && entry.message) {
        const text = htmlToText(entry.message);
        if (text) {
          const isReply = depth > 0;
          const post: DiscussionPost = {
            text,
            createdAt: entry.created_at ?? null,
            isReply,
            parentUserId: isReply ? parentUserId : null,
          };
          const activity = byUser.get(entry.user_id) ?? { initialPosts: [], replies: [] };
          if (isReply) activity.replies.push(post);
          else activity.initialPosts.push(post);
          byUser.set(entry.user_id, activity);
        }
      }
      if (entry.replies?.length) {
        walk(entry.replies, depth + 1, entry.user_id ?? parentUserId);
      }
    }
  };
  walk(data.view, 0, null);

  return { names, byUser };
}

/** The discussion topic's due date (graded discussions carry it on the linked
 *  assignment; ungraded ones fall back to lock_at). Best-effort; null on failure. */
export async function fetchDiscussionDueAt(
  baseUrl: string,
  token: string,
  courseId: string,
  topicId: string
): Promise<string | null> {
  try {
    const response = await fetch(`${baseUrl}/api/v1/courses/${courseId}/discussion_topics/${topicId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return null;
    const topic = (await response.json()) as {
      assignment?: { due_at?: string | null } | null;
      lock_at?: string | null;
      todo_date?: string | null;
    };
    return topic.assignment?.due_at ?? topic.lock_at ?? topic.todo_date ?? null;
  } catch {
    return null;
  }
}

export interface CanvasStudentWork {
  student: string;
  userId: number;
  /** Text content: discussion posts/replies, or an assignment's text body. */
  text: string;
  /** Uploaded files (assignment submissions). Empty for discussions. */
  files: Array<{ name: string; base64: string; mimeType: string }>;
  /** Posts/replies for discussions; 1 for an assignment submission. */
  contributionCount: number;
  /** Structured thread activity, present only for the discussion source. */
  discussion?: DiscussionActivity;
}

export async function fetchDiscussion(
  baseUrl: string,
  token: string,
  institution: CanvasInstitution,
  courseId: string,
  topicId: string
): Promise<{ students: CanvasStudentWork[]; dueAt: string | null }> {
  const endpoint = `${baseUrl}/api/v1/courses/${courseId}/discussion_topics/${topicId}/view`;
  const [response, dueAt] = await Promise.all([
    fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } }),
    fetchDiscussionDueAt(baseUrl, token, courseId, topicId),
  ]);
  if (!response.ok) {
    throw canvasError(response.status, institution);
  }

  const data = (await response.json()) as CanvasViewResponse;
  const { names, byUser } = extractDiscussionActivity(data);

  const students: CanvasStudentWork[] = [];
  for (const [userId, activity] of byUser) {
    const ordered = [...activity.initialPosts, ...activity.replies];
    const text = ordered
      .map((post) => `${post.isReply ? "Reply" : "Post"}: ${post.text}`)
      .join("\n\n---\n\n");
    students.push({
      student: names.get(userId) ?? `User ${userId}`,
      userId,
      text,
      files: [],
      contributionCount: activity.initialPosts.length + activity.replies.length,
      discussion: activity,
    });
  }
  students.sort((a, b) => a.student.localeCompare(b.student));
  return { students, dueAt };
}
