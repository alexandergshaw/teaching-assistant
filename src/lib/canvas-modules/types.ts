/** One item inside a module (a Page, Assignment, File, SubHeader, etc.). */
export interface CanvasModuleItem {
  id: number;
  moduleId: number;
  title: string;
  /** Page, Assignment, Quiz, Discussion, File, SubHeader, ExternalUrl, ExternalTool. */
  type: string;
  position: number;
  /** Visual nesting depth Canvas shows in the module list. */
  indent: number;
  published: boolean;
  /** Page slug for Page items; null otherwise. */
  pageUrl: string | null;
  /** Underlying content id for Assignment/Quiz/Discussion/File items. */
  contentId: number | null;
  /** Current due date (ISO 8601) for gradable items, when Canvas reports one. */
  dueAt: string | null;
  /** Points possible for gradable items, when Canvas reports one. */
  pointsPossible: number | null;
  htmlUrl: string | null;
  externalUrl: string | null;
}

/** One module with its ordered items. */
export interface CanvasModule {
  id: number;
  name: string;
  position: number;
  published: boolean;
  itemsCount: number;
  items: CanvasModuleItem[];
}

/** A wiki page as it appears in the page list (no body). */
export interface CanvasPageSummary {
  pageId: number;
  /** Stable slug used to address the page in the API and in module items. */
  url: string;
  title: string;
  published: boolean;
  frontPage: boolean;
  updatedAt: string | null;
}

/** A single wiki page including its raw HTML body. */
export interface CanvasPage {
  pageId: number;
  url: string;
  title: string;
  /** Raw HTML, passed through verbatim for editing. */
  body: string;
  published: boolean;
  updatedAt: string | null;
}

/** A piece of course content that can be added to a module, keyed by content id. */
export interface CanvasContentItem {
  id: number;
  title: string;
}

/** The content types (besides pages) that can be added as module items. */
export interface CanvasAddableContent {
  assignments: CanvasContentItem[];
  quizzes: CanvasContentItem[];
  discussions: CanvasContentItem[];
  files: CanvasContentItem[];
}

/** Fields accepted when creating a module item. */
export interface NewModuleItem {
  /** Page, Assignment, Quiz, Discussion, File, SubHeader, ExternalUrl. */
  type: string;
  /** Required for Assignment/Quiz/Discussion/File. */
  contentId?: number;
  /** Required for Page items (the page slug). */
  pageUrl?: string;
  /** Required for ExternalUrl; optional label for SubHeader. */
  externalUrl?: string;
  title?: string;
  position?: number;
  indent?: number;
}

/** A single due-date change: the item's type, its content id, and the new date. */
export interface DueDateUpdate {
  /** Assignment, Quiz, or Discussion (graded). */
  type: string;
  contentId: number;
  /** ISO 8601 due date, or null/empty to clear it. */
  dueAt: string | null;
}

/** A pre-signed Canvas upload ticket; the browser POSTs the file to uploadUrl. */
export interface FileUploadTicket {
  uploadUrl: string;
  uploadParams: Record<string, string>;
}

/** One file in the course's Files area. */
export interface CourseFile {
  id: number;
  displayName: string;
  fileName: string;
  contentType: string;
  size: number;
  url: string;
  folderId: number | null;
  updatedAt: string | null;
}

/** One piece of HTML content to scan for accessibility. */
export interface ScannableItem {
  type: AccessibleItemType;
  /** Page slug, content id (as string), or "syllabus". */
  id: string;
  title: string;
  /** Canvas updated_at when available, else a content hash — re-scan key. */
  fingerprint: string;
  html: string;
}

/** A lightweight reference to a scannable item (no HTML) for incremental scanning. */
export interface AccessibilityItemRef {
  type: AccessibleItemType;
  id: string;
  title: string;
  fingerprint: string;
}

/** One broken link found by Canvas's course link validator, tied to its item. */
export interface BrokenLink {
  itemType: AccessibleItemType;
  itemId: string;
  itemTitle: string;
  url: string;
  /** Canvas reason code, e.g. "unpublished_item", "missing_item", "broken_link". */
  reason: string;
  linkText?: string;
}

/** A node in a migration's selectable-content tree (a type or an item). */
export interface SelectiveNode {
  /** The Canvas key to submit to include this node, e.g. copy[assignments][i_abc]. */
  property: string;
  title: string;
  type?: string;
  count?: number;
  subItems: SelectiveNode[];
}

/** Kinds the bulk editor can list and update. */
export type BulkKind = "Assignment" | "Quiz" | "Discussion" | "Page";

/** A normalized item for the bulk editor (id is a slug for pages, else numeric). */
export interface BulkItem {
  id: string;
  title: string;
  published: boolean;
  dueAt: string | null;
  pointsPossible: number | null;
  /** True when this assignment row is an LTI-backed New Quiz (D1). Absent
   *  for every other kind and for Classic Quizzes - see new-quiz.ts. */
  isNewQuiz?: boolean;
  /** Set only on an Assignment-tab row that is really a classic quiz's
   *  shadow assignment record (Canvas creates one for every graded quiz,
   *  reported via `quiz_id` - see new-quiz.ts). This row's own `id` IS the
   *  assignment id, and deleting it via DELETE /assignments/{id} is exactly
   *  what Canvas's own Assignments page does (it cascades into deleting the
   *  quiz) - correct, but the instructor must be able to tell this row apart
   *  from an ordinary assignment before choosing to delete it. Absent for
   *  every other row, including a classic quiz's own row in the Quizzes tab
   *  (which carries no such flag - see bulk.ts). */
  isClassicQuizShadow?: boolean;
  /** The underlying classic quiz's own id (the /quizzes record) - populated
   *  only alongside `isClassicQuizShadow`, from the same `quiz_id` field
   *  bulk.ts already reads to set that flag. Lets courseItems-modules.ts look
   *  up which module the QUIZ is filed under: Canvas records that module
   *  item as type "Quiz" keyed by THIS id, never by the shadow assignment's
   *  own `id` above. */
  shadowQuizId?: number;
  /** Set only on an Assignment-tab row that is really a graded discussion's
   *  shadow assignment record (Canvas creates one for every graded
   *  discussion topic, the same way it does for classic quizzes, identified
   *  by `submission_types` including "discussion_topic"). Same reasoning as
   *  `isClassicQuizShadow` above: this row's `id` is the assignment id, and
   *  deleting it cascades into deleting the discussion, so it must be
   *  labelled rather than left indistinguishable from an ordinary
   *  assignment. */
  isGradedDiscussionShadow?: boolean;
  /** The underlying graded discussion topic's own id - populated only
   *  alongside `isGradedDiscussionShadow`, from Canvas's `discussion_topic.id`
   *  field on the assignment payload (a base field of the Assignment object
   *  model itself, not one gated behind the assignments-index endpoint's
   *  include[] allowlist - see raw-types.ts's own citation). Absent when
   *  Canvas's response genuinely does not carry the field for this row
   *  ("if applicable", per Canvas's own docs) - callers must treat that as
   *  UNKNOWN, never as "no discussion topic id therefore no module" (see
   *  courseItems-modules.ts's own reasoning). Lets courseItems-modules.ts look
   *  up which module the DISCUSSION is filed under: Canvas records that
   *  module item as type "Discussion" keyed by THIS id, never by the shadow
   *  assignment's own `id` above - the same reasoning `shadowQuizId` already
   *  documents for a classic quiz. */
  shadowDiscussionTopicId?: number;
}

/** A grading rubric available to the course (for bulk association). Course-
 * level rubrics live in this course only; account-level rubrics are defined
 * on the Canvas account and shared across every course under it - see
 * rubrics.ts's listRubrics for how each is fetched and tagged. */
export interface CanvasRubric {
  id: number;
  title: string;
  /** Where this rubric is defined. Only "course" rubrics can be edited
   * through this app's rubric builder (getRubric/updateRubric hit
   * /courses/:id/rubrics/:id, which does not resolve an account rubric's
   * id) - callers should disable editing for "account" rubrics. */
  source: "course" | "account";
}

/** One criterion of a rubric being built: a row with point-tier ratings. */
export interface RubricCriterionInput {
  description: string;
  longDescription?: string;
  points: number;
  ratings: Array<{ description: string; longDescription?: string; points: number }>;
}

/** A rubric loaded for editing: its title plus criteria/tiers with descriptions. */
export interface RubricDetail {
  id: number;
  title: string;
  criteria: Array<{
    description: string;
    longDescription?: string;
    points: number;
    ratings: Array<{ description: string; longDescription?: string; points: number }>;
  }>;
}

/** Supported classic-quiz question types this editor can create. */
export type QuizQuestionType =
  | "multiple_choice_question"
  | "true_false_question"
  | "short_answer_question"
  | "essay_question";

/** One answer choice. `correct` maps to Canvas answer_weight 100 (else 0). */
export interface QuizAnswerInput {
  text: string;
  correct: boolean;
}

/** The editable shape of a quiz question. */
export interface QuizQuestionInput {
  name: string;
  text: string;
  type: QuizQuestionType;
  points: number;
  answers: QuizAnswerInput[];
}

/** A quiz question as loaded from Canvas (with its id + position). */
export interface QuizQuestion extends QuizQuestionInput {
  id: number;
  position: number;
}

/** Gradable kinds whose title, description, and due date can be edited inline. */
export type GradableKind = "Assignment" | "Quiz" | "Discussion";

/** A gradable's editable detail. Description is HTML; for discussions it is the message body. */
export interface GradableDetail {
  title: string;
  description: string;
  /** Associated rubric id (assignments with a rubric), for pre-filling bulk edits. */
  rubricId?: number;
  /** Submission types for assignments only; empty array for other kinds. */
  submissionTypes: string[];
}

/** A previewable view of a Canvas file: base64 for image/PDF, else extracted text. */
export interface FilePreview {
  name: string;
  mimeType: string;
  /** base64 of the bytes for image/PDF rendering; empty for text-only previews. */
  base64: string;
  /** Extracted text for non-image/PDF files (or an explanatory message). */
  text: string;
  truncated: boolean;
}

/** A course file that can be scanned for accessibility (docx/pptx images, or PDF). */
export interface ScannableFile {
  id: number;
  title: string;
  kind: OfficeKind | "pdf";
  fingerprint: string;
}

/** Fields for a new Canvas assignment. */
export interface NewAssignment {
  name: string;
  description: string;
  pointsPossible: number | null;
  /** ISO datetime or "" for none. */
  dueAt: string;
  /** Canvas submission type, e.g. online_text_entry / online_upload / online_url / on_paper / none. */
  submissionType: string;
  published: boolean;
  /** ISO datetime or "" - when students can start. */
  unlockAt?: string;
  /** ISO datetime or "" - until when they can submit. */
  lockAt?: string;
  /** points | percent | pass_fail | letter_grade | not_graded */
  gradingType?: string;
  /** -1 = unlimited. */
  allowedAttempts?: number;
  /** Comma-separated list like "pdf,docx" (only for online_upload). */
  allowedExtensions?: string;
  peerReviews?: boolean;
  omitFromFinalGrade?: boolean;
  assignmentGroupId?: number | null;
}

import type { AccessibleItemType } from "../accessibility/types";
import type { OfficeKind, OfficeParagraph, OfficeImage, RunSpan } from "../office-edit";

export type { AccessibleItemType, OfficeKind, OfficeParagraph, OfficeImage, RunSpan };
