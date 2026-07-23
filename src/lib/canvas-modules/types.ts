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
}

/** A grading rubric defined in the course (for bulk association). */
export interface CanvasRubric {
  id: number;
  title: string;
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
