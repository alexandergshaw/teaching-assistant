// Generated Supabase types live here. Replace this with output from:
//   npx supabase gen types typescript --project-id <id> --schema public > src/lib/supabase/types.ts

import type {
  AccessibilityScansRow,
  AccessibilityScansInsert,
  AccessibilityScansUpdate,
  AiChatMessagesRow,
  AiChatMessagesInsert,
  AiChatMessagesUpdate,
  CartridgeDropsRow,
  CartridgeDropsInsert,
  CartridgeDropsUpdate,
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
  KnowledgeEntriesRow,
  KnowledgeEntriesInsert,
  KnowledgeEntriesUpdate,
} from "./types.tables-a";
import type {
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
  WorkflowDefsRow,
  WorkflowDefsInsert,
  WorkflowDefsUpdate,
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

export interface Database {
  public: {
    Tables: {
      accessibility_scans: {
        Row: AccessibilityScansRow;
        Insert: AccessibilityScansInsert;
        Update: AccessibilityScansUpdate;
      };
      ai_chat_messages: {
        Row: AiChatMessagesRow;
        Insert: AiChatMessagesInsert;
        Update: AiChatMessagesUpdate;
      };
      cartridge_drops: {
        Row: CartridgeDropsRow;
        Insert: CartridgeDropsInsert;
        Update: CartridgeDropsUpdate;
      };
      common_resources: {
        Row: CommonResourcesRow;
        Insert: CommonResourcesInsert;
        Update: CommonResourcesUpdate;
      };
      course_card_layout: {
        Row: CourseCardLayoutRow;
        Insert: CourseCardLayoutInsert;
        Update: CourseCardLayoutUpdate;
      };
      course_hub: {
        Row: CourseHubRow;
        Insert: CourseHubInsert;
        Update: CourseHubUpdate;
      };
      course_syllabi: {
        Row: CourseSyllabiRow;
        Insert: CourseSyllabiInsert;
        Update: CourseSyllabiUpdate;
      };
      deck_templates: {
        Row: DeckTemplatesRow;
        Insert: DeckTemplatesInsert;
        Update: DeckTemplatesUpdate;
      };
      glossary_terms: {
        Row: GlossaryTermsRow;
        Insert: GlossaryTermsInsert;
        Update: GlossaryTermsUpdate;
      };
      google_credentials: {
        Row: GoogleCredentialsRow;
        Insert: GoogleCredentialsInsert;
        Update: GoogleCredentialsUpdate;
      };
      grading_dismissals: {
        Row: GradingDismissalsRow;
        Insert: GradingDismissalsInsert;
        Update: GradingDismissalsUpdate;
      };
      grading_drafts: {
        Row: GradingDraftsRow;
        Insert: GradingDraftsInsert;
        Update: GradingDraftsUpdate;
      };
      institution_fields: {
        Row: InstitutionFieldsRow;
        Insert: InstitutionFieldsInsert;
        Update: InstitutionFieldsUpdate;
      };
      knowledge_entries: {
        Row: KnowledgeEntriesRow;
        Insert: KnowledgeEntriesInsert;
        Update: KnowledgeEntriesUpdate;
      };
      message_drafts: {
        Row: MessageDraftsRow;
        Insert: MessageDraftsInsert;
        Update: MessageDraftsUpdate;
      };
      microsoft_credentials: {
        Row: MicrosoftCredentialsRow;
        Insert: MicrosoftCredentialsInsert;
        Update: MicrosoftCredentialsUpdate;
      };
      presentation_drafts: {
        Row: PresentationDraftsRow;
        Insert: PresentationDraftsInsert;
        Update: PresentationDraftsUpdate;
      };
      problem_solutions: {
        Row: ProblemSolutionsRow;
        Insert: ProblemSolutionsInsert;
        Update: ProblemSolutionsUpdate;
      };
      problems: {
        Row: ProblemsRow;
        Insert: ProblemsInsert;
        Update: ProblemsUpdate;
      };
      recording_files: {
        Row: RecordingFilesRow;
        Insert: RecordingFilesInsert;
        Update: RecordingFilesUpdate;
      };
      rubric_bank: {
        Row: RubricBankRow;
        Insert: RubricBankInsert;
        Update: RubricBankUpdate;
      };
      syllabus_templates: {
        Row: SyllabusTemplatesRow;
        Insert: SyllabusTemplatesInsert;
        Update: SyllabusTemplatesUpdate;
      };
      user_style: {
        Row: UserStyleRow;
        Insert: UserStyleInsert;
        Update: UserStyleUpdate;
      };
      workflow_defs: {
        Row: WorkflowDefsRow;
        Insert: WorkflowDefsInsert;
        Update: WorkflowDefsUpdate;
      };
      workflow_runs: {
        Row: WorkflowRunsRow;
        Insert: WorkflowRunsInsert;
        Update: WorkflowRunsUpdate;
      };
      workflow_schedules: {
        Row: WorkflowSchedulesRow;
        Insert: WorkflowSchedulesInsert;
        Update: WorkflowSchedulesUpdate;
      };
      workflow_triggers: {
        Row: WorkflowTriggersRow;
        Insert: WorkflowTriggersInsert;
        Update: WorkflowTriggersUpdate;
      };
    };
    Views: Record<string, { Row: Record<string, unknown> }>;
    Functions: Record<string, { Args: Record<string, unknown>; Returns: unknown }>;
    Enums: Record<string, string>;
    CompositeTypes: Record<string, Record<string, unknown>>;
  };
}
