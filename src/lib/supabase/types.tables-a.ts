// Table type definitions for accessibility_scans through knowledge_entries

import type { Json } from "./types";

export interface AccessibilityScansRow {
  user_id: string;
  institution: string;
  course_id: string;
  item_type: string;
  item_id: string;
  item_title: string;
  fingerprint: string;
  error_count: number;
  warning_count: number;
  suggestion_count: number;
  issues: Json;
  scanned_at: string;
}

export interface AccessibilityScansInsert {
  user_id: string;
  institution: string;
  course_id: string;
  item_type: string;
  item_id: string;
  item_title: string;
  fingerprint: string;
  error_count?: number;
  warning_count?: number;
  suggestion_count?: number;
  issues: Json;
  scanned_at?: string;
}

export interface AccessibilityScansUpdate {
  user_id?: string;
  institution?: string;
  course_id?: string;
  item_type?: string;
  item_id?: string;
  item_title?: string;
  fingerprint?: string;
  error_count?: number;
  warning_count?: number;
  suggestion_count?: number;
  issues?: Json;
  scanned_at?: string;
}

export interface AiChatMessagesRow {
  id: string;
  created_at: string;
  user_id: string | null;
  session_id: string;
  source: "fab" | "selection";
  role: "user" | "assistant";
  content: string;
  context_text: string | null;
}

export interface AiChatMessagesInsert {
  id?: string;
  created_at?: string;
  user_id?: string | null;
  session_id: string;
  source: "fab" | "selection";
  role: "user" | "assistant";
  content: string;
  context_text?: string | null;
}

export interface AiChatMessagesUpdate {
  id?: string;
  created_at?: string;
  user_id?: string | null;
  session_id?: string;
  source?: "fab" | "selection";
  role?: "user" | "assistant";
  content?: string;
  context_text?: string | null;
}

export interface CartridgeDropsRow {
  id: string;
  user_id: string;
  name: string;
  course_label: string;
  assignment_label: string;
  points_possible: number | null;
  rubric_text: string | null;
  lms: "canvas" | "brightspace" | "blackboard" | "moodle";
  status: "new" | "processing" | "graded" | "error";
  error: string | null;
  storage_path: string;
  csv_storage_path: string | null;
  csv_name: string | null;
  size_bytes: number;
  graded_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CartridgeDropsInsert {
  id?: string;
  user_id: string;
  name: string;
  course_label?: string;
  assignment_label?: string;
  points_possible?: number | null;
  rubric_text?: string | null;
  lms?: "canvas" | "brightspace" | "blackboard" | "moodle";
  status?: "new" | "processing" | "graded" | "error";
  error?: string | null;
  storage_path: string;
  csv_storage_path?: string | null;
  csv_name?: string | null;
  size_bytes?: number;
  graded_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface CartridgeDropsUpdate {
  id?: string;
  user_id?: string;
  name?: string;
  course_label?: string;
  assignment_label?: string;
  points_possible?: number | null;
  rubric_text?: string | null;
  lms?: "canvas" | "brightspace" | "blackboard" | "moodle";
  status?: "new" | "processing" | "graded" | "error";
  error?: string | null;
  storage_path?: string;
  csv_storage_path?: string | null;
  csv_name?: string | null;
  size_bytes?: number;
  graded_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface CommonResourcesRow {
  user_id: string;
  items: Json;
  updated_at: string;
}

export interface CommonResourcesInsert {
  user_id: string;
  items?: Json;
  updated_at?: string;
}

export interface CommonResourcesUpdate {
  user_id?: string;
  items?: Json;
  updated_at?: string;
}

export interface CourseCardLayoutRow {
  user_id: string;
  groups: Json;
  updated_at: string;
}

export interface CourseCardLayoutInsert {
  user_id: string;
  groups?: Json;
  updated_at?: string;
}

export interface CourseCardLayoutUpdate {
  user_id?: string;
  groups?: Json;
  updated_at?: string;
}

export interface CourseHubRow {
  id: string;
  user_id: string;
  name: string;
  course_code: string | null;
  term: string | null;
  canvas_url: string | null;
  repos: Array<{ repo: string; branch: string | null }>;
  github_org: string | null;
  textbook: string | null;
  syllabus_id: string | null;
  institution: string | null;
  integrations: Array<{ name: string; url: string | null }>;
  roster: string | null;
  notes: string | null;
  topics: string | null;
  csv_name: string | null;
  csv_data: string | null;
  rubric_name: string | null;
  rubric_data: string | null;
  start_date: string | null;
  description: string | null;
  weeks: number | null;
  tests: number | null;
  lms: string | null;
  day_time: string | null;
  modality: string | null;
  materials_files: Json;
  export_files: Json | null;
  materials_zip_name: string | null;
  materials_zip_path: string | null;
  materials_zip_size: bigint | null;
  custom_tiles: Json;
  hidden_tiles: Json;
  student_repos: Json;
  created_at: string;
  updated_at: string;
}

export interface CourseHubInsert {
  id?: string;
  user_id: string;
  name: string;
  course_code?: string | null;
  term?: string | null;
  canvas_url?: string | null;
  repos?: Array<{ repo: string; branch: string | null }>;
  github_org?: string | null;
  textbook?: string | null;
  syllabus_id?: string | null;
  institution?: string | null;
  integrations?: Array<{ name: string; url: string | null }>;
  roster?: string | null;
  notes?: string | null;
  topics?: string | null;
  csv_name?: string | null;
  csv_data?: string | null;
  rubric_name?: string | null;
  rubric_data?: string | null;
  start_date?: string | null;
  description?: string | null;
  weeks?: number | null;
  tests?: number | null;
  lms?: string | null;
  day_time?: string | null;
  modality?: string | null;
  materials_files?: Json;
  export_files?: Json | null;
  materials_zip_name?: string | null;
  materials_zip_path?: string | null;
  materials_zip_size?: bigint | null;
  custom_tiles?: Json;
  hidden_tiles?: Json;
  student_repos?: Json;
  created_at?: string;
  updated_at?: string;
}

export interface CourseHubUpdate {
  id?: string;
  user_id?: string;
  name?: string;
  course_code?: string | null;
  term?: string | null;
  canvas_url?: string | null;
  repos?: Array<{ repo: string; branch: string | null }>;
  github_org?: string | null;
  textbook?: string | null;
  syllabus_id?: string | null;
  institution?: string | null;
  integrations?: Array<{ name: string; url: string | null }>;
  roster?: string | null;
  notes?: string | null;
  topics?: string | null;
  csv_name?: string | null;
  csv_data?: string | null;
  rubric_name?: string | null;
  rubric_data?: string | null;
  start_date?: string | null;
  description?: string | null;
  weeks?: number | null;
  tests?: number | null;
  lms?: string | null;
  day_time?: string | null;
  modality?: string | null;
  materials_files?: Json;
  export_files?: Json | null;
  materials_zip_name?: string | null;
  materials_zip_path?: string | null;
  materials_zip_size?: bigint | null;
  custom_tiles?: Json;
  hidden_tiles?: Json;
  student_repos?: Json;
  created_at?: string;
  updated_at?: string;
}

export interface CourseSyllabiRow {
  id: string;
  user_id: string;
  name: string;
  file_name: string;
  course_code: string | null;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface CourseSyllabiInsert {
  id?: string;
  user_id: string;
  name: string;
  file_name: string;
  course_code?: string | null;
  content: string;
  created_at?: string;
  updated_at?: string;
}

export interface CourseSyllabiUpdate {
  id?: string;
  user_id?: string;
  name?: string;
  file_name?: string;
  course_code?: string | null;
  content?: string;
  created_at?: string;
  updated_at?: string;
}

export interface DeckTemplatesRow {
  id: string;
  user_id: string;
  name: string;
  description: string;
  slides: Json;
  loops: Json;
  audience: string;
  tone: string;
  theme: Json;
  created_at: string;
  updated_at: string;
}

export interface DeckTemplatesInsert {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  slides?: Json;
  loops?: Json;
  audience?: string;
  tone?: string;
  theme?: Json;
  created_at?: string;
  updated_at?: string;
}

export interface DeckTemplatesUpdate {
  id?: string;
  user_id?: string;
  name?: string;
  description?: string;
  slides?: Json;
  loops?: Json;
  audience?: string;
  tone?: string;
  theme?: Json;
  created_at?: string;
  updated_at?: string;
}

export interface GlossaryTermsRow {
  id: string;
  term: string;
  definition: string;
  source: string;
  created_at: string;
}

export interface GlossaryTermsInsert {
  id: string;
  term: string;
  definition: string;
  source?: string;
  created_at?: string;
}

export interface GlossaryTermsUpdate {
  id?: string;
  term?: string;
  definition?: string;
  source?: string;
  created_at?: string;
}

export interface GoogleCredentialsRow {
  user_id: string;
  access_token: string | null;
  refresh_token: string | null;
  expiry: string | null;
  scope: string | null;
  updated_at: string;
}

export interface GoogleCredentialsInsert {
  user_id: string;
  access_token?: string | null;
  refresh_token?: string | null;
  expiry?: string | null;
  scope?: string | null;
  updated_at?: string;
}

export interface GoogleCredentialsUpdate {
  user_id?: string;
  access_token?: string | null;
  refresh_token?: string | null;
  expiry?: string | null;
  scope?: string | null;
  updated_at?: string;
}

export interface GradingDismissalsRow {
  user_id: string;
  scope: "assignment" | "course";
  institution: string;
  ref_id: string;
  created_at: string;
}

export interface GradingDismissalsInsert {
  user_id: string;
  scope: "assignment" | "course";
  institution: string;
  ref_id: string;
  created_at?: string;
}

export interface GradingDismissalsUpdate {
  user_id?: string;
  scope?: "assignment" | "course";
  institution?: string;
  ref_id?: string;
  created_at?: string;
}

export interface GradingDraftsRow {
  id: string;
  user_id: string;
  status: string;
  summary: string;
  payload: Json;
  created_at: string;
  updated_at: string;
  workflow_id: string | null;
  workflow_name: string | null;
  source: string | null;
}

export interface GradingDraftsInsert {
  id?: string;
  user_id: string;
  status?: string;
  summary?: string;
  payload?: Json;
  created_at?: string;
  updated_at?: string;
  workflow_id?: string | null;
  workflow_name?: string | null;
  source?: string | null;
}

export interface GradingDraftsUpdate {
  id?: string;
  user_id?: string;
  status?: string;
  summary?: string;
  payload?: Json;
  created_at?: string;
  updated_at?: string;
  workflow_id?: string | null;
  workflow_name?: string | null;
  source?: string | null;
}

export interface InstitutionFieldsRow {
  user_id: string;
  acronym: string;
  fields: Json;
  updated_at: string;
}

export interface InstitutionFieldsInsert {
  user_id: string;
  acronym: string;
  fields?: Json;
  updated_at?: string;
}

export interface InstitutionFieldsUpdate {
  user_id?: string;
  acronym?: string;
  fields?: Json;
  updated_at?: string;
}

export interface KnowledgeEntriesRow {
  id: string;
  kind: "case_study" | "practice_problem" | "reference";
  source: "curated" | "wikipedia" | "stackexchange" | "manual";
  title: string;
  topics: string[];
  summary: string;
  lesson: string | null;
  organization: string | null;
  year: number | null;
  language: string | null;
  difficulty: string | null;
  prompt: string | null;
  example_code: string | null;
  solution_code: string | null;
  url: string | null;
  verified: boolean;
  times_served: number;
  last_served_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeEntriesInsert {
  id: string;
  kind: "case_study" | "practice_problem" | "reference";
  source?: "curated" | "wikipedia" | "stackexchange" | "manual";
  title: string;
  topics?: string[];
  summary?: string;
  lesson?: string | null;
  organization?: string | null;
  year?: number | null;
  language?: string | null;
  difficulty?: string | null;
  prompt?: string | null;
  example_code?: string | null;
  solution_code?: string | null;
  url?: string | null;
  verified?: boolean;
  times_served?: number;
  last_served_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface KnowledgeEntriesUpdate {
  id?: string;
  kind?: "case_study" | "practice_problem" | "reference";
  source?: "curated" | "wikipedia" | "stackexchange" | "manual";
  title?: string;
  topics?: string[];
  summary?: string;
  lesson?: string | null;
  organization?: string | null;
  year?: number | null;
  language?: string | null;
  difficulty?: string | null;
  prompt?: string | null;
  example_code?: string | null;
  solution_code?: string | null;
  url?: string | null;
  verified?: boolean;
  times_served?: number;
  last_served_at?: string | null;
  created_at?: string;
  updated_at?: string;
}
