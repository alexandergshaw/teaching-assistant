// Generated Supabase types live here. Replace this with output from:
//   npx supabase gen types typescript --project-id <id> --schema public > src/lib/supabase/types.ts

import type {
  AccessibilityScansRow,
  AccessibilityScansInsert,
  AccessibilityScansUpdate,
  AiChatMessagesRow,
  AiChatMessagesInsert,
  AiChatMessagesUpdate,
  ArtifactTemplatesRow,
  ArtifactTemplatesInsert,
  ArtifactTemplatesUpdate,
  CartridgeDropsRow,
  CartridgeDropsInsert,
  CartridgeDropsUpdate,
  ClassSessionTranscriptsRow,
  ClassSessionTranscriptsInsert,
  ClassSessionTranscriptsUpdate,
  CommonResourcesRow,
  CommonResourcesInsert,
  CommonResourcesUpdate,
  CourseCardLayoutRow,
  CourseCardLayoutInsert,
  CourseCardLayoutUpdate,
  CourseHubRow,
  CourseHubInsert,
  CourseHubUpdate,
  CourseSyllabiRow,
  CourseSyllabiInsert,
  CourseSyllabiUpdate,
  CourseTasksRow,
  CourseTasksInsert,
  CourseTasksUpdate,
  CourseTaskDefsRow,
  CourseTaskDefsInsert,
  CourseTaskDefsUpdate,
  DeckTemplatesRow,
  DeckTemplatesInsert,
  DeckTemplatesUpdate,
  GlossaryTermsRow,
  GlossaryTermsInsert,
  GlossaryTermsUpdate,
  GoogleCredentialsRow,
  GoogleCredentialsInsert,
  GoogleCredentialsUpdate,
  GradingDismissalsRow,
  GradingDismissalsInsert,
  GradingDismissalsUpdate,
  GradingDraftsRow,
  GradingDraftsInsert,
  GradingDraftsUpdate,
  InstitutionFieldsRow,
  InstitutionFieldsInsert,
  InstitutionFieldsUpdate,
  InstitutionKnowledgeQuestionsRow,
  InstitutionKnowledgeQuestionsInsert,
  InstitutionKnowledgeQuestionsUpdate,
  InstitutionKnowledgeSummariesRow,
  InstitutionKnowledgeSummariesInsert,
  InstitutionKnowledgeSummariesUpdate,
  InstitutionPageAttachmentsRow,
  InstitutionPageAttachmentsInsert,
  InstitutionPageAttachmentsUpdate,
  InstitutionPagesRow,
  InstitutionPagesInsert,
  InstitutionPagesUpdate,
  KnowledgeEntriesRow,
  KnowledgeEntriesInsert,
  KnowledgeEntriesUpdate,
} from "./types.tables-a";
import type {
  LmsCredentialsRow,
  LmsCredentialsInsert,
  LmsCredentialsUpdate,
} from "./types.tables-c";
import type {
  AppUsersRow,
  AppUsersInsert,
  AppUsersUpdate,
  AvatarLikenessesRow,
  AvatarLikenessesInsert,
  AvatarLikenessesUpdate,
  AvatarVideosRow,
  AvatarVideosInsert,
  AvatarVideosUpdate,
  CourseTaskAttachmentsRow,
  CourseTaskAttachmentsInsert,
  CourseTaskAttachmentsUpdate,
  CourseTaskInstructionsRow,
  CourseTaskInstructionsInsert,
  CourseTaskInstructionsUpdate,
  GeneratedArtifactsRow,
  GeneratedArtifactsInsert,
  GeneratedArtifactsUpdate,
  MessageDraftsRow,
  MessageDraftsInsert,
  MessageDraftsUpdate,
  MicrosoftCredentialsRow,
  MicrosoftCredentialsInsert,
  MicrosoftCredentialsUpdate,
  PresentationDraftsRow,
  PresentationDraftsInsert,
  PresentationDraftsUpdate,
  ProblemSolutionsRow,
  ProblemSolutionsInsert,
  ProblemSolutionsUpdate,
  ProblemsRow,
  ProblemsInsert,
  ProblemsUpdate,
  RecordingFilesRow,
  RecordingFilesInsert,
  RecordingFilesUpdate,
  RubricBankRow,
  RubricBankInsert,
  RubricBankUpdate,
  SyllabusTemplatesRow,
  SyllabusTemplatesInsert,
  SyllabusTemplatesUpdate,
  UserStyleRow,
  UserStyleInsert,
  UserStyleUpdate,
  WeeklyAnnouncementScheduleRow,
  WeeklyAnnouncementScheduleInsert,
  WeeklyAnnouncementScheduleUpdate,
  WorkflowDefsRow,
  WorkflowDefsInsert,
  WorkflowDefsUpdate,
  WorkflowRunStepsRow,
  WorkflowRunStepsInsert,
  WorkflowRunStepsUpdate,
  WorkflowRunsRow,
  WorkflowRunsInsert,
  WorkflowRunsUpdate,
  WorkflowSchedulesRow,
  WorkflowSchedulesInsert,
  WorkflowSchedulesUpdate,
  WorkflowTriggersRow,
  WorkflowTriggersInsert,
  WorkflowTriggersUpdate,
} from "./types.tables-b";

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// supabase/migrations/20261017000000_announcement_exemplars.sql
//
// Defined directly in this file, rather than added to
// ./types.tables-a.ts / ./types.tables-b.ts / ./types.tables-c.ts as this
// repo's usual hand-maintained-row-types convention would put it (see
// types.tables-c.ts's own header for that convention) - this table's
// migration, module and tests were built by one agent in a batch of
// concurrent agents each scoped to a disjoint file set, and this file was
// the only types file in that agent's set. A later pass may want to move
// these three interfaces into types.tables-c.ts (which has headroom) purely
// for consistency; nothing here depends on them staying in this file.
export interface AnnouncementExemplarsRow {
  id: string;
  user_id: string;
  course_id: string;
  exemplar_text: string;
  outline: Json;
  label: string | null;
  created_at: string;
}

export interface AnnouncementExemplarsInsert {
  id?: string;
  user_id: string;
  course_id: string;
  exemplar_text: string;
  outline: Json;
  label?: string | null;
  created_at?: string;
}

export interface AnnouncementExemplarsUpdate {
  id?: string;
  user_id?: string;
  course_id?: string;
  exemplar_text?: string;
  outline?: Json;
  label?: string | null;
  created_at?: string;
}

// supabase/migrations/20261018000000_course_intel_answers.sql
//
// Defined directly in this file, rather than added to
// ./types.tables-a.ts / ./types.tables-b.ts / ./types.tables-c.ts as this
// repo's usual hand-maintained-row-types convention would put it - mirrors
// AnnouncementExemplarsRow/Insert/Update just above, added the same way for
// the same reason: this table's migration, module and tests were built by
// one agent in a batch of concurrent agents each scoped to a disjoint file
// set, and this file was the only types file in that agent's set.
// scope_student is NOT NULLABLE (default '') - see the migration's own
// header for why this table does not need the coalesce-to-nil-uuid
// generated-column technique institution_knowledge_questions.scope_key
// uses.
export interface CourseIntelAnswersRow {
  id: string;
  user_id: string;
  course_id: string;
  scope_student: string;
  question: string;
  answer_markdown: string;
  cited_students: Json;
  omissions: Json;
  tier: string;
  assembled_at: string;
  created_at: string;
}

export interface CourseIntelAnswersInsert {
  id?: string;
  user_id: string;
  course_id: string;
  scope_student?: string;
  question: string;
  answer_markdown: string;
  cited_students?: Json;
  omissions?: Json;
  tier: string;
  assembled_at: string;
  created_at?: string;
}

export interface CourseIntelAnswersUpdate {
  id?: string;
  user_id?: string;
  course_id?: string;
  scope_student?: string;
  question?: string;
  answer_markdown?: string;
  cited_students?: Json;
  omissions?: Json;
  tier?: string;
  assembled_at?: string;
  created_at?: string;
}

// @supabase/postgrest-js's generic client requires each table entry to
// satisfy `GenericTable` (Row/Insert/Update assignable to Record<string,
// unknown>, plus a `Relationships` array) or the whole schema silently
// collapses to `never` for every `.insert`/`.upsert`/`.update` call (forcing
// `as any` at every call site, which is how this file's tables were written
// before). Named `interface`s (like the ones in ./types.tables-a and
// ./types.tables-b) don't get TypeScript's implicit index signature, so they
// don't satisfy `Record<string, unknown>` on their own - `Expand<T>` copies
// an interface's members into a plain mapped type, which does. Purely a
// compile-time reshaping; it changes no runtime behavior.
type Expand<T> = { [K in keyof T]: T[K] };

export interface Database {
  public: {
    Tables: {
      announcement_exemplars: {
        Row: Expand<AnnouncementExemplarsRow>;
        Insert: Expand<AnnouncementExemplarsInsert>;
        Update: Expand<AnnouncementExemplarsUpdate>;
        Relationships: [];
      };
      app_users: {
        Row: Expand<AppUsersRow>;
        Insert: Expand<AppUsersInsert>;
        Update: Expand<AppUsersUpdate>;
        Relationships: [];
      };
      avatar_likenesses: {
        Row: Expand<AvatarLikenessesRow>;
        Insert: Expand<AvatarLikenessesInsert>;
        Update: Expand<AvatarLikenessesUpdate>;
        Relationships: [];
      };
      avatar_videos: {
        Row: Expand<AvatarVideosRow>;
        Insert: Expand<AvatarVideosInsert>;
        Update: Expand<AvatarVideosUpdate>;
        Relationships: [];
      };
      accessibility_scans: {
        Row: Expand<AccessibilityScansRow>;
        Insert: Expand<AccessibilityScansInsert>;
        Update: Expand<AccessibilityScansUpdate>;
        Relationships: [];
      };
      ai_chat_messages: {
        Row: Expand<AiChatMessagesRow>;
        Insert: Expand<AiChatMessagesInsert>;
        Update: Expand<AiChatMessagesUpdate>;
        Relationships: [];
      };
      artifact_templates: {
        Row: Expand<ArtifactTemplatesRow>;
        Insert: Expand<ArtifactTemplatesInsert>;
        Update: Expand<ArtifactTemplatesUpdate>;
        Relationships: [];
      };
      cartridge_drops: {
        Row: Expand<CartridgeDropsRow>;
        Insert: Expand<CartridgeDropsInsert>;
        Update: Expand<CartridgeDropsUpdate>;
        Relationships: [];
      };
      class_session_transcripts: {
        Row: Expand<ClassSessionTranscriptsRow>;
        Insert: Expand<ClassSessionTranscriptsInsert>;
        Update: Expand<ClassSessionTranscriptsUpdate>;
        Relationships: [];
      };
      common_resources: {
        Row: Expand<CommonResourcesRow>;
        Insert: Expand<CommonResourcesInsert>;
        Update: Expand<CommonResourcesUpdate>;
        Relationships: [];
      };
      course_card_layout: {
        Row: Expand<CourseCardLayoutRow>;
        Insert: Expand<CourseCardLayoutInsert>;
        Update: Expand<CourseCardLayoutUpdate>;
        Relationships: [];
      };
      course_hub: {
        Row: Expand<CourseHubRow>;
        Insert: Expand<CourseHubInsert>;
        Update: Expand<CourseHubUpdate>;
        Relationships: [];
      };
      course_intel_answers: {
        Row: Expand<CourseIntelAnswersRow>;
        Insert: Expand<CourseIntelAnswersInsert>;
        Update: Expand<CourseIntelAnswersUpdate>;
        Relationships: [];
      };
      course_syllabi: {
        Row: Expand<CourseSyllabiRow>;
        Insert: Expand<CourseSyllabiInsert>;
        Update: Expand<CourseSyllabiUpdate>;
        Relationships: [];
      };
      course_tasks: {
        Row: Expand<CourseTasksRow>;
        Insert: Expand<CourseTasksInsert>;
        Update: Expand<CourseTasksUpdate>;
        Relationships: [];
      };
      course_task_attachments: {
        Row: Expand<CourseTaskAttachmentsRow>;
        Insert: Expand<CourseTaskAttachmentsInsert>;
        Update: Expand<CourseTaskAttachmentsUpdate>;
        Relationships: [];
      };
      course_task_defs: {
        Row: Expand<CourseTaskDefsRow>;
        Insert: Expand<CourseTaskDefsInsert>;
        Update: Expand<CourseTaskDefsUpdate>;
        Relationships: [];
      };
      course_task_instructions: {
        Row: Expand<CourseTaskInstructionsRow>;
        Insert: Expand<CourseTaskInstructionsInsert>;
        Update: Expand<CourseTaskInstructionsUpdate>;
        Relationships: [];
      };
      deck_templates: {
        Row: Expand<DeckTemplatesRow>;
        Insert: Expand<DeckTemplatesInsert>;
        Update: Expand<DeckTemplatesUpdate>;
        Relationships: [];
      };
      generated_artifacts: {
        Row: Expand<GeneratedArtifactsRow>;
        Insert: Expand<GeneratedArtifactsInsert>;
        Update: Expand<GeneratedArtifactsUpdate>;
        Relationships: [];
      };
      glossary_terms: {
        Row: Expand<GlossaryTermsRow>;
        Insert: Expand<GlossaryTermsInsert>;
        Update: Expand<GlossaryTermsUpdate>;
        Relationships: [];
      };
      google_credentials: {
        Row: Expand<GoogleCredentialsRow>;
        Insert: Expand<GoogleCredentialsInsert>;
        Update: Expand<GoogleCredentialsUpdate>;
        Relationships: [];
      };
      grading_dismissals: {
        Row: Expand<GradingDismissalsRow>;
        Insert: Expand<GradingDismissalsInsert>;
        Update: Expand<GradingDismissalsUpdate>;
        Relationships: [];
      };
      grading_drafts: {
        Row: Expand<GradingDraftsRow>;
        Insert: Expand<GradingDraftsInsert>;
        Update: Expand<GradingDraftsUpdate>;
        Relationships: [];
      };
      institution_fields: {
        Row: Expand<InstitutionFieldsRow>;
        Insert: Expand<InstitutionFieldsInsert>;
        Update: Expand<InstitutionFieldsUpdate>;
        Relationships: [];
      };
      institution_knowledge_questions: {
        Row: Expand<InstitutionKnowledgeQuestionsRow>;
        Insert: Expand<InstitutionKnowledgeQuestionsInsert>;
        Update: Expand<InstitutionKnowledgeQuestionsUpdate>;
        Relationships: [];
      };
      institution_knowledge_summaries: {
        Row: Expand<InstitutionKnowledgeSummariesRow>;
        Insert: Expand<InstitutionKnowledgeSummariesInsert>;
        Update: Expand<InstitutionKnowledgeSummariesUpdate>;
        Relationships: [];
      };
      institution_page_attachments: {
        Row: Expand<InstitutionPageAttachmentsRow>;
        Insert: Expand<InstitutionPageAttachmentsInsert>;
        Update: Expand<InstitutionPageAttachmentsUpdate>;
        Relationships: [];
      };
      institution_pages: {
        Row: Expand<InstitutionPagesRow>;
        Insert: Expand<InstitutionPagesInsert>;
        Update: Expand<InstitutionPagesUpdate>;
        Relationships: [];
      };
      knowledge_entries: {
        Row: Expand<KnowledgeEntriesRow>;
        Insert: Expand<KnowledgeEntriesInsert>;
        Update: Expand<KnowledgeEntriesUpdate>;
        Relationships: [];
      };
      lms_credentials: {
        Row: Expand<LmsCredentialsRow>;
        Insert: Expand<LmsCredentialsInsert>;
        Update: Expand<LmsCredentialsUpdate>;
        Relationships: [];
      };
      message_drafts: {
        Row: Expand<MessageDraftsRow>;
        Insert: Expand<MessageDraftsInsert>;
        Update: Expand<MessageDraftsUpdate>;
        Relationships: [];
      };
      microsoft_credentials: {
        Row: Expand<MicrosoftCredentialsRow>;
        Insert: Expand<MicrosoftCredentialsInsert>;
        Update: Expand<MicrosoftCredentialsUpdate>;
        Relationships: [];
      };
      presentation_drafts: {
        Row: Expand<PresentationDraftsRow>;
        Insert: Expand<PresentationDraftsInsert>;
        Update: Expand<PresentationDraftsUpdate>;
        Relationships: [];
      };
      problem_solutions: {
        Row: Expand<ProblemSolutionsRow>;
        Insert: Expand<ProblemSolutionsInsert>;
        Update: Expand<ProblemSolutionsUpdate>;
        Relationships: [];
      };
      problems: {
        Row: Expand<ProblemsRow>;
        Insert: Expand<ProblemsInsert>;
        Update: Expand<ProblemsUpdate>;
        Relationships: [];
      };
      recording_files: {
        Row: Expand<RecordingFilesRow>;
        Insert: Expand<RecordingFilesInsert>;
        Update: Expand<RecordingFilesUpdate>;
        Relationships: [];
      };
      rubric_bank: {
        Row: Expand<RubricBankRow>;
        Insert: Expand<RubricBankInsert>;
        Update: Expand<RubricBankUpdate>;
        Relationships: [];
      };
      syllabus_templates: {
        Row: Expand<SyllabusTemplatesRow>;
        Insert: Expand<SyllabusTemplatesInsert>;
        Update: Expand<SyllabusTemplatesUpdate>;
        Relationships: [];
      };
      user_style: {
        Row: Expand<UserStyleRow>;
        Insert: Expand<UserStyleInsert>;
        Update: Expand<UserStyleUpdate>;
        Relationships: [];
      };
      weekly_announcement_schedule: {
        Row: Expand<WeeklyAnnouncementScheduleRow>;
        Insert: Expand<WeeklyAnnouncementScheduleInsert>;
        Update: Expand<WeeklyAnnouncementScheduleUpdate>;
        Relationships: [];
      };
      workflow_defs: {
        Row: Expand<WorkflowDefsRow>;
        Insert: Expand<WorkflowDefsInsert>;
        Update: Expand<WorkflowDefsUpdate>;
        Relationships: [];
      };
      workflow_run_steps: {
        Row: Expand<WorkflowRunStepsRow>;
        Insert: Expand<WorkflowRunStepsInsert>;
        Update: Expand<WorkflowRunStepsUpdate>;
        Relationships: [];
      };
      workflow_runs: {
        Row: Expand<WorkflowRunsRow>;
        Insert: Expand<WorkflowRunsInsert>;
        Update: Expand<WorkflowRunsUpdate>;
        Relationships: [];
      };
      workflow_schedules: {
        Row: Expand<WorkflowSchedulesRow>;
        Insert: Expand<WorkflowSchedulesInsert>;
        Update: Expand<WorkflowSchedulesUpdate>;
        Relationships: [];
      };
      workflow_triggers: {
        Row: Expand<WorkflowTriggersRow>;
        Insert: Expand<WorkflowTriggersInsert>;
        Update: Expand<WorkflowTriggersUpdate>;
        Relationships: [];
      };
    };
    Views: Record<string, { Row: Record<string, unknown>; Relationships: [] }>;
    Functions: Record<string, { Args: Record<string, unknown>; Returns: unknown }>;
    Enums: Record<string, string>;
    CompositeTypes: Record<string, Record<string, unknown>>;
  };
}
