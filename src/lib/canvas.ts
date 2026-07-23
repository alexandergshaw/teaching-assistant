/**
 * Client for the Canvas LMS REST API.
 *
 * Canvas has no UI export for discussion boards or assignment submissions, but
 * its API exposes both. We pull every student's work — discussion posts/replies,
 * or an assignment's text body plus uploaded files — so it can be fed into the
 * existing grading pipeline. The kind is detected from the URL.
 *
 * Server-only: reads the instructor API token from the environment and never
 * exposes it to the client.
 *
 * This module re-exports the Canvas API client implementations from domain-specific
 * submodules located in ./canvas/.
 */

// All exports aggregated from submodules for backward compatibility
export {
  type DiscussionPost,
  type DiscussionActivity,
  extractDiscussionActivity,
  fetchDiscussionDueAt,
  type CanvasStudentWork,
  fetchDiscussion,
} from "./canvas/discussions";

export { fetchAssignment, canvasWorkToZipBase64 } from "./canvas/submissions";

export {
  normalizeCriterionName,
  earnedPoints,
  formatRubric,
  fetchAssignmentObject,
  fetchCanvasMeta,
  fetchCanvasMetaWith,
  fetchAssignmentPointsPossible,
  getSpeedGraderUrl,
} from "./canvas/metadata";

export {
  type CanvasAssignmentBrief,
  type CanvasPerson,
  type CanvasCourse,
  listActiveTeacherCourses,
  listCourses,
  listCoursesByTerm,
  listAssignments,
  listStudents,
  type CanvasRosterEntry,
  listCourseRoster,
  listStudentGradeSummaries,
  type CanvasTextSubmission,
  listAssignmentTextSubmissions,
  listCourseAssignmentDueDates,
} from "./canvas/listings";

export { type CanvasSubmissionDetail, fetchSubmissionDetail } from "./canvas/submission-detail";

export {
  type CanvasQueueItem,
  listGradingQueue,
  getNeedsGradingCount,
  getCourseNotifications,
} from "./canvas/grading-queue";

export { postCanvasGrades } from "./canvas/grades";

export {
  type CanvasAnnouncement,
  getCourseName,
  getCourseInfo,
  exportCourseCartridge,
  listAnnouncements,
  createAnnouncement,
} from "./canvas/announcements";

export {
  type CanvasConversationSummary,
  type CanvasConversationMessage,
  type CanvasConversationDetail,
  listConversations,
  getConversation,
  replyToConversation,
  setConversationWorkflowState,
  createConversation,
  getUnreadCount,
} from "./canvas/inbox";

export {
  type CanvasNonSubmitter,
  type CanvasMissingResult,
  type CanvasAssignmentWithDue,
  listAssignmentNonSubmitters,
  listAssignmentBriefsWithDue,
} from "./canvas/auto-zero";

export { fetchCanvasWork } from "./canvas/work";
