/**
 * Course discussion topic inventory: id, title, posted date, whether it is an
 * announcement, reply count, and lock state - for every topic in a course, in
 * one paginated read.
 *
 * docs/course-student-intelligence-acceptance-criteria.md D2/D4:
 * `subentryCount` (Canvas's `discussion_subentry_count`) is the point of this
 * function. A topic with zero replies needs no expensive `/view` call at all
 * to know that, and this check rides a call the Stratum A assembler already
 * has to make for the topic inventory - so skipping empty topics before ever
 * fetching their threaded content costs nothing extra. The field is
 * documented in Canvas's API and, per the acceptance doc's own survey, unused
 * anywhere else in this repo - so it is treated as possibly absent from any
 * given response, and its absence is reported as `null`, never silently
 * folded into 0 (a topic Canvas did not report a count for is not the same
 * claim as "this topic has zero replies").
 *
 * Deliberately `?per_page=100` with no `only_announcements` filter - this
 * reader wants every topic (announcements included, since an announcement is
 * itself a discussion topic and can carry replies), not the narrower set
 * listAnnouncements (announcements.ts) already covers for a different
 * purpose.
 *
 * Never fetches or returns `login_id` or any email - topics have no student
 * identity attached at all; this reader returns facts about a topic, never
 * about a person.
 */

import { canvasError, parseNextLink, type CanvasInstitution } from "../canvas-core";
import { assertCanvasSuppliedUrlIsSameOrigin, CANVAS_PAGINATION_PAGE_CAP } from "../canvas-remote-url";
import { canvasGet } from "../canvas-fetch-response";

export interface CanvasDiscussionTopicBrief {
  readonly id: number;
  readonly title: string;
  readonly postedAt: string | null;
  readonly isAnnouncement: boolean;
  /** `discussion_subentry_count` from Canvas. `null` means Canvas's response
   * did not include the field at all - treated as unknown, never as zero. A
   * caller that wants to skip empty topics must check for the literal value
   * `0`, not falsiness. */
  readonly subentryCount: number | null;
  readonly locked: boolean;
}

interface CanvasRawDiscussionTopic {
  id?: number;
  title?: string | null;
  posted_at?: string | null;
  is_announcement?: boolean;
  discussion_subentry_count?: number;
  locked?: boolean;
}

/**
 * List every discussion topic in a course - announcements included - with
 * enough metadata to decide, without ever calling `/view`, which topics are
 * worth the expensive threaded read.
 */
export async function listDiscussionTopicBriefs(
  baseUrl: string,
  token: string,
  institution: CanvasInstitution,
  courseId: string
): Promise<CanvasDiscussionTopicBrief[]> {
  let next: string | null = `${baseUrl}/api/v1/courses/${courseId}/discussion_topics?per_page=100`;
  const topics: CanvasDiscussionTopicBrief[] = [];
  let pageCount = 0;

  while (next) {
    // E-REL2 - cap follows; see CANVAS_PAGINATION_PAGE_CAP's own doc comment
    // for why an uncapped loop here would be a silent 60s function kill.
    pageCount += 1;
    if (pageCount > CANVAS_PAGINATION_PAGE_CAP) {
      throw new Error(
        `Canvas pagination exceeded ${CANVAS_PAGINATION_PAGE_CAP} pages while listing discussion topics for course ${courseId} - refusing to follow further "next" links.`
      );
    }

    const response = await canvasGet(next, token);
    if (!response.ok) {
      throw canvasError(response.status, institution);
    }

    const page = (await response.json()) as CanvasRawDiscussionTopic[];
    for (const item of page) {
      if (typeof item.id !== "number") continue;
      topics.push({
        id: item.id,
        title: (item.title ?? "").trim() || "(untitled)",
        postedAt: item.posted_at ?? null,
        isAnnouncement: item.is_announcement === true,
        subentryCount:
          typeof item.discussion_subentry_count === "number" ? item.discussion_subentry_count : null,
        locked: item.locked === true,
      });
    }

    // E-CRIT1 - verified same-origin with baseUrl before being dialed, and
    // the URL fetched next iteration is the guard's own RETURNED string, not
    // the raw Link header candidate (see src/lib/canvas-remote-url.ts).
    const rawNext = parseNextLink(response.headers.get("link"));
    next = rawNext ? assertCanvasSuppliedUrlIsSameOrigin(rawNext, baseUrl) : null;
  }

  return topics;
}
