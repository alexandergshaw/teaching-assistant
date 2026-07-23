/**
 * Canvas LMS REST API client aggregator.
 * Re-exports all domain modules for a unified public interface.
 */

// Discussions
export {
  type DiscussionPost,
  type DiscussionActivity,
  extractDiscussionActivity,
  fetchDiscussionDueAt,
  type CanvasStudentWork,
  fetchDiscussion,
} from "./discussions";

// Submissions
export { fetchAssignment, canvasWorkToZipBase64 } from "./submissions";

// Metadata (descriptions, rubrics, points)
export {
  normalizeCriterionName,
  earnedPoints,
  formatRubric,
  fetchAssignmentObject,
  fetchCanvasMeta,
  fetchCanvasMetaWith,
  fetchAssignmentPointsPossible,
  getSpeedGraderUrl,
} from "./metadata";

// Listings (courses, assignments, students, rosters)
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
} from "./listings";

// Submission detail
export { type CanvasSubmissionDetail, fetchSubmissionDetail } from "./submission-detail";

// Grading queue (Live Feed)
export {
  type CanvasQueueItem,
  listGradingQueue,
  getNeedsGradingCount,
  getCourseNotifications,
} from "./grading-queue";

// Grade posting
export { postCanvasGrades } from "./grades";

// Announcements
export {
  type CanvasAnnouncement,
  getCourseName,
  getCourseInfo,
  exportCourseCartridge,
  listAnnouncements,
  createAnnouncement,
} from "./announcements";

// Inbox/Conversations
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
} from "./inbox";

// Auto-zero (non-submitters)
export {
  type CanvasNonSubmitter,
  type CanvasMissingResult,
  type CanvasAssignmentWithDue,
  listAssignmentNonSubmitters,
  listAssignmentBriefsWithDue,
} from "./auto-zero";

// Main work fetching entry point
export { fetchCanvasWork } from "./work";
