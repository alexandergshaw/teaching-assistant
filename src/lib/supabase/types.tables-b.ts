// Table type definitions for message_drafts through workflow_triggers

import type { Json } from "./types";

export interface MessageDraftsRow {
  id: string;
  user_id: string;
  status: string;
  summary: string;
  payload: Json;
  created_at: string;
  updated_at: string;
  workflow_id: string | null;
  workflow_name: string | null;
}

export interface MessageDraftsInsert {
  id?: string;
  user_id: string;
  status?: string;
  summary?: string;
  payload?: Json;
  created_at?: string;
  updated_at?: string;
  workflow_id?: string | null;
  workflow_name?: string | null;
}

export interface MessageDraftsUpdate {
  id?: string;
  user_id?: string;
  status?: string;
  summary?: string;
  payload?: Json;
  created_at?: string;
  updated_at?: string;
  workflow_id?: string | null;
  workflow_name?: string | null;
}

export interface MicrosoftCredentialsRow {
  user_id: string;
  institution: string;
  access_token: string | null;
  refresh_token: string | null;
  expiry: string | null;
  scope: string | null;
  updated_at: string;
}

export interface MicrosoftCredentialsInsert {
  user_id: string;
  institution: string;
  access_token?: string | null;
  refresh_token?: string | null;
  expiry?: string | null;
  scope?: string | null;
  updated_at?: string;
}

export interface MicrosoftCredentialsUpdate {
  user_id?: string;
  institution?: string;
  access_token?: string | null;
  refresh_token?: string | null;
  expiry?: string | null;
  scope?: string | null;
  updated_at?: string;
}

export interface PresentationDraftsRow {
  id: string;
  user_id: string;
  status: string;
  summary: string;
  payload: Json;
  workflow_id: string | null;
  workflow_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface PresentationDraftsInsert {
  id?: string;
  user_id: string;
  status?: string;
  summary?: string;
  payload?: Json;
  workflow_id?: string | null;
  workflow_name?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface PresentationDraftsUpdate {
  id?: string;
  user_id?: string;
  status?: string;
  summary?: string;
  payload?: Json;
  workflow_id?: string | null;
  workflow_name?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ProblemSolutionsRow {
  id: string;
  user_id: string;
  problem_id: string;
  title: string;
  approach: string;
  created_at: string;
}

export interface ProblemSolutionsInsert {
  id?: string;
  user_id: string;
  problem_id: string;
  title: string;
  approach: string;
  created_at?: string;
}

export interface ProblemSolutionsUpdate {
  id?: string;
  user_id?: string;
  problem_id?: string;
  title?: string;
  approach?: string;
  created_at?: string;
}

export interface ProblemsRow {
  id: string;
  user_id: string;
  title: string;
  detail: string;
  status: "open" | "resolved";
  created_at: string;
  updated_at: string;
}

export interface ProblemsInsert {
  id?: string;
  user_id: string;
  title: string;
  detail?: string;
  status?: "open" | "resolved";
  created_at?: string;
  updated_at?: string;
}

export interface ProblemsUpdate {
  id?: string;
  user_id?: string;
  title?: string;
  detail?: string;
  status?: "open" | "resolved";
  created_at?: string;
  updated_at?: string;
}

export interface RecordingFilesRow {
  id: string;
  user_id: string;
  name: string;
  kind: "recording" | "captioned" | "narrated" | "bundle" | "file";
  mime_type: string;
  size_bytes: number;
  duration_sec: number | null;
  storage_path: string;
  source: string | null;
  origin: string | null;
  workflow_name: string | null;
  workflow_id: string | null;
  workflow_run_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface RecordingFilesInsert {
  id?: string;
  user_id: string;
  name: string;
  kind?: "recording" | "captioned" | "narrated" | "bundle" | "file";
  mime_type?: string;
  size_bytes?: number;
  duration_sec?: number | null;
  storage_path: string;
  source?: string | null;
  origin?: string | null;
  workflow_name?: string | null;
  workflow_id?: string | null;
  workflow_run_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface RecordingFilesUpdate {
  id?: string;
  user_id?: string;
  name?: string;
  kind?: "recording" | "captioned" | "narrated" | "bundle" | "file";
  mime_type?: string;
  size_bytes?: number;
  duration_sec?: number | null;
  storage_path?: string;
  source?: string | null;
  origin?: string | null;
  workflow_name?: string | null;
  workflow_id?: string | null;
  workflow_run_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface RubricBankRow {
  id: string;
  topics: string[];
  instructions_excerpt: string;
  rubric_text: string;
  source: string;
  created_at: string;
}

export interface RubricBankInsert {
  id: string;
  topics?: string[];
  instructions_excerpt?: string;
  rubric_text: string;
  source?: string;
  created_at?: string;
}

export interface RubricBankUpdate {
  id?: string;
  topics?: string[];
  instructions_excerpt?: string;
  rubric_text?: string;
  source?: string;
  created_at?: string;
}

export interface SyllabusTemplatesRow {
  id: string;
  user_id: string;
  name: string;
  file_name: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface SyllabusTemplatesInsert {
  id?: string;
  user_id: string;
  name: string;
  file_name: string;
  content: string;
  created_at?: string;
  updated_at?: string;
}

export interface SyllabusTemplatesUpdate {
  id?: string;
  user_id?: string;
  name?: string;
  file_name?: string;
  content?: string;
  created_at?: string;
  updated_at?: string;
}

export interface UserStyleRow {
  user_id: string;
  voice_id: string | null;
  voice_sample_path: string | null;
  voice_sample_name: string | null;
  writing_sample: string | null;
  updated_at: string;
}

export interface UserStyleInsert {
  user_id: string;
  voice_id?: string | null;
  voice_sample_path?: string | null;
  voice_sample_name?: string | null;
  writing_sample?: string | null;
  updated_at?: string;
}

export interface UserStyleUpdate {
  user_id?: string;
  voice_id?: string | null;
  voice_sample_path?: string | null;
  voice_sample_name?: string | null;
  writing_sample?: string | null;
  updated_at?: string;
}

export interface WorkflowDefsRow {
  id: string;
  user_id: string;
  name: string;
  description: string;
  steps: Json;
  scope: Json;
  created_at: string;
  updated_at: string;
}

export interface WorkflowDefsInsert {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  steps?: Json;
  scope?: Json;
  created_at?: string;
  updated_at?: string;
}

export interface WorkflowDefsUpdate {
  id?: string;
  user_id?: string;
  name?: string;
  description?: string;
  steps?: Json;
  scope?: Json;
  created_at?: string;
  updated_at?: string;
}

export interface WorkflowRunsRow {
  id: string;
  user_id: string;
  workflow_id: string;
  workflow_name: string;
  status: string;
  trigger_source: string | null;
  created_at: string;
}

export interface WorkflowRunsInsert {
  id?: string;
  user_id: string;
  workflow_id: string;
  workflow_name: string;
  status: string;
  trigger_source?: string | null;
  created_at?: string;
}

export interface WorkflowRunsUpdate {
  id?: string;
  user_id?: string;
  workflow_id?: string;
  workflow_name?: string;
  status?: string;
  trigger_source?: string | null;
  created_at?: string;
}

export interface WorkflowSchedulesRow {
  id: string;
  user_id: string;
  workflow_id: string;
  workflow_name: string;
  field_values: Json;
  next_run_at: string;
  repeat: string;
  enabled: boolean;
  course_id: string | null;
  institution: string | null;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
  unattended: boolean;
  provider: string | null;
  disabled_steps: Json;
  interval_minutes: number | null;
  fanout_progress: Json | null;
  last_run_status: string | null;
  last_run_detail: string | null;
  recovery_attempts: number;
}

export interface WorkflowSchedulesInsert {
  id?: string;
  user_id: string;
  workflow_id: string;
  workflow_name: string;
  field_values?: Json;
  next_run_at: string;
  repeat?: string;
  enabled?: boolean;
  course_id?: string | null;
  institution?: string | null;
  last_run_at?: string | null;
  created_at?: string;
  updated_at?: string;
  unattended?: boolean;
  provider?: string | null;
  disabled_steps?: Json;
  interval_minutes?: number | null;
  fanout_progress?: Json | null;
  last_run_status?: string | null;
  last_run_detail?: string | null;
  recovery_attempts?: number;
}

export interface WorkflowSchedulesUpdate {
  id?: string;
  user_id?: string;
  workflow_id?: string;
  workflow_name?: string;
  field_values?: Json;
  next_run_at?: string;
  repeat?: string;
  enabled?: boolean;
  course_id?: string | null;
  institution?: string | null;
  last_run_at?: string | null;
  created_at?: string;
  updated_at?: string;
  unattended?: boolean;
  provider?: string | null;
  disabled_steps?: Json;
  interval_minutes?: number | null;
  fanout_progress?: Json | null;
  last_run_status?: string | null;
  last_run_detail?: string | null;
  recovery_attempts?: number;
}

export interface WorkflowTriggersRow {
  id: string;
  user_id: string;
  workflow_id: string;
  workflow_name: string;
  field_values: Json;
  event_type: string;
  event_config: Json;
  cursor: Json | null;
  check_version: number;
  enabled: boolean;
  unattended: boolean;
  provider: string | null;
  disabled_steps: Json;
  course_id: string | null;
  institution: string | null;
  webhook_token: string | null;
  last_checked_at: string | null;
  last_fired_at: string | null;
  created_at: string;
  updated_at: string;
  last_run_status: string | null;
  last_run_detail: string | null;
  recovery_attempts: number;
}

export interface WorkflowTriggersInsert {
  id?: string;
  user_id: string;
  workflow_id: string;
  workflow_name: string;
  field_values?: Json;
  event_type: string;
  event_config?: Json;
  cursor?: Json | null;
  check_version?: number;
  enabled?: boolean;
  unattended?: boolean;
  provider?: string | null;
  disabled_steps?: Json;
  course_id?: string | null;
  institution?: string | null;
  webhook_token?: string | null;
  last_checked_at?: string | null;
  last_fired_at?: string | null;
  created_at?: string;
  updated_at?: string;
  last_run_status?: string | null;
  last_run_detail?: string | null;
  recovery_attempts?: number;
}

export interface WorkflowTriggersUpdate {
  id?: string;
  user_id?: string;
  workflow_id?: string;
  workflow_name?: string;
  field_values?: Json;
  event_type?: string;
  event_config?: Json;
  cursor?: Json | null;
  check_version?: number;
  enabled?: boolean;
  unattended?: boolean;
  provider?: string | null;
  disabled_steps?: Json;
  course_id?: string | null;
  institution?: string | null;
  webhook_token?: string | null;
  last_checked_at?: string | null;
  last_fired_at?: string | null;
  created_at?: string;
  updated_at?: string;
  last_run_status?: string | null;
  last_run_detail?: string | null;
  recovery_attempts?: number;
}
