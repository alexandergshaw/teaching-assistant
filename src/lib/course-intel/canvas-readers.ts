// course-intel: the Canvas readers for ONE course, built once from one
// credential resolution.
//
// SERVER ONLY. `resolveInstitutionByCode` resolves an ambient identity, so
// nothing the browser bundles may import this file - the two callers are the
// ask route and the cross-course answer builder, both of which already run on
// the server.
//
// WHY IT IS A SEPARATE FILE. The route handler needs the pair (a single-course
// question may fetch student prose) and the cross-course path needs the SIGNAL
// half only, and D24d's "signals tier only, never student text" is worth more
// as a type than as a rule someone has to remember: `readLiveCourseSlice` is
// handed `.signals` and cannot reach `.text`, because it was never given
// anything that could. Building both here, from one credential resolution,
// keeps that split cheap - the alternative was resolving credentials twice for
// the single-course path or duplicating the reader table.

import {
  fetchDiscussion,
  getConversation,
  listAnnouncements,
  listAssignmentBriefsWithDue,
  listConversations,
  listCourseRoster,
  listCourseSubmissionGrid,
  listDiscussionTopicBriefs,
  listStudentGradeSummaries,
} from "@/lib/canvas";
import { resolveInstitutionByCode } from "@/lib/canvas-core";
import type { CourseIntelSignalReaders, CourseIntelTextReaders } from "./fetch";

export interface CourseIntelReaders {
  readonly signals: CourseIntelSignalReaders;
  readonly text: CourseIntelTextReaders;
}

/**
 * Resolve this institution's credential once and build both reader sets.
 *
 * Throws whatever the credential resolver throws. Every caller classifies that
 * throw rather than failing outright - `classifyLmsFailure` compares against
 * the one indistinguishable credential message BY IDENTITY, so "you never
 * connected" and "it is down" stay apart.
 */
export async function buildCourseIntelReaders(
  institutionCode: string,
  canvasCourseId: string,
  canvasUrl: string
): Promise<CourseIntelReaders> {
  const { institution, token, baseUrl } = await resolveInstitutionByCode(institutionCode);
  return {
    signals: {
      listAssignmentBriefs: () => listAssignmentBriefsWithDue(baseUrl, token, institution, canvasCourseId),
      listRoster: () => listCourseRoster(institutionCode, canvasCourseId),
      listGradeSummaries: () => listStudentGradeSummaries(institutionCode, canvasCourseId),
      listSubmissionGrid: (assignmentIds) =>
        listCourseSubmissionGrid(baseUrl, token, institution, canvasCourseId, assignmentIds),
      listTopicBriefs: () => listDiscussionTopicBriefs(baseUrl, token, institution, canvasCourseId),
      listAnnouncements: () => listAnnouncements(canvasUrl, institutionCode),
      // The course filter trusts Canvas's OWN context tagging, which is why
      // every assembly carries the course-filter-best-effort caveat: a message
      // about this course started from the general inbox has no course context
      // and is absent in a way that cannot even be counted.
      listConversationIndex: () => listConversations(institutionCode, { courseId: canvasCourseId }),
    },
    text: {
      fetchDiscussionTopic: async (topicId) =>
        await fetchDiscussion(baseUrl, token, institution, canvasCourseId, topicId),
      getConversationDetail: (conversationId) => getConversation(conversationId, institutionCode),
    },
  };
}
