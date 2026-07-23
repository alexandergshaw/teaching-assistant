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
