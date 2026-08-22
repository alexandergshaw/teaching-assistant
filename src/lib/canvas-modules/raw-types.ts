/** Raw Canvas response shapes (internal). */

export interface RawModule {
  id?: number;
  name?: string;
  position?: number;
  published?: boolean;
  items_count?: number;
}

export interface RawModuleItem {
  id?: number;
  module_id?: number;
  title?: string;
  type?: string;
  position?: number;
  indent?: number;
  published?: boolean;
  page_url?: string | null;
  content_id?: number | null;
  html_url?: string | null;
  external_url?: string | null;
  content_details?: { due_at?: string | null; points_possible?: number | null } | null;
}

export interface RawPage {
  page_id?: number;
  url?: string;
  title?: string;
  body?: string | null;
  published?: boolean;
  front_page?: boolean;
  updated_at?: string | null;
}

export interface RawAssignment {
  id?: number;
  name?: string;
}

export interface RawQuiz {
  id?: number;
  title?: string;
}

export interface RawDiscussionTopic {
  id?: number;
  title?: string;
  is_announcement?: boolean;
}

export interface RawFile {
  id?: number;
  display_name?: string;
  filename?: string;
}

export interface RawCourseFile {
  id?: number;
  display_name?: string;
  filename?: string;
  "content-type"?: string;
  size?: number;
  url?: string;
  folder_id?: number | null;
  updated_at?: string | null;
}

export interface RawHtmlContent {
  id?: number;
  name?: string;
  title?: string;
  description?: string | null;
  message?: string | null;
  updated_at?: string | null;
  is_announcement?: boolean;
}

export interface RawMigration {
  id?: number;
  workflow_state?: string;
}

export interface RawSelective {
  property?: string;
  title?: string;
  type?: string;
  count?: number;
  sub_items?: RawSelective[];
}

export interface RawBulkAssignment {
  id?: number;
  name?: string;
  published?: boolean;
  due_at?: string | null;
  points_possible?: number | null;
  /**
   * New Quiz detection signals (see new-quiz.ts for the full rule and its
   * evidence). Canvas returns all three of these on every assignment row by
   * default - confirmed against https://canvas.instructure.com/doc/api/assignments.html,
   * whose `include[]` allowlist for the assignments-index endpoint only
   * covers submission, assignment_visibility, overrides, observed_users,
   * can_edit, score_statistics, ab_guid, peer_review, and
   * academic_integrity_pledge - none of these three. So no query-string
   * change was needed to "widen" the fetch; only this type (previously not
   * declaring these fields, so the mapping in bulk.ts silently dropped them)
   * and that mapping needed to change.
   */
  submission_types?: string[];
  /** "Boolean indicating whether this is a quiz lti assignment" (Canvas API
   *  docs, verbatim) - despite the field's name, this means New Quiz. */
  is_quiz_assignment?: boolean;
  /** Present only on a CLASSIC quiz's shadow assignment ("applies only when
   *  submission_types is ['online_quiz']" per the docs) - never on a New
   *  Quiz. Used as a disqualifying signal in new-quiz.ts. */
  quiz_id?: number | null;
}

export interface RawBulkQuiz {
  id?: number;
  title?: string;
  published?: boolean;
  due_at?: string | null;
  points_possible?: number | null;
}

export interface RawBulkDiscussion {
  id?: number;
  title?: string;
  published?: boolean;
  is_announcement?: boolean;
  assignment?: { due_at?: string | null; points_possible?: number | null } | null;
}

export interface RawRubricRating {
  description?: string;
  long_description?: string | null;
  points?: number;
}

export interface RawRubricCriterion {
  description?: string;
  long_description?: string | null;
  points?: number;
  ratings?: RawRubricRating[];
}

export interface RawQuizQuestion {
  id?: number;
  question_name?: string;
  question_text?: string | null;
  question_type?: string;
  points_possible?: number;
  position?: number;
  answers?: Array<{ text?: string; answer_text?: string; weight?: number }>;
}
