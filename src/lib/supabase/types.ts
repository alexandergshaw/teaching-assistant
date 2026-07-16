// Generated Supabase types live here. Replace this with output from:
//   npx supabase gen types typescript --project-id <id> --schema public > src/lib/supabase/types.ts

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
      grading_dismissals: {
        Row: {
          user_id: string;
          scope: "assignment" | "course";
          institution: string;
          ref_id: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          scope: "assignment" | "course";
          institution: string;
          ref_id: string;
          created_at?: string;
        };
        Update: {
          user_id?: string;
          scope?: "assignment" | "course";
          institution?: string;
          ref_id?: string;
          created_at?: string;
        };
      };
      google_credentials: {
        Row: {
          user_id: string;
          access_token: string | null;
          refresh_token: string | null;
          expiry: string | null;
          scope: string | null;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          access_token?: string | null;
          refresh_token?: string | null;
          expiry?: string | null;
          scope?: string | null;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          access_token?: string | null;
          refresh_token?: string | null;
          expiry?: string | null;
          scope?: string | null;
          updated_at?: string;
        };
      };
      microsoft_credentials: {
        Row: {
          user_id: string;
          institution: string;
          access_token: string | null;
          refresh_token: string | null;
          expiry: string | null;
          scope: string | null;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          institution: string;
          access_token?: string | null;
          refresh_token?: string | null;
          expiry?: string | null;
          scope?: string | null;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          institution?: string;
          access_token?: string | null;
          refresh_token?: string | null;
          expiry?: string | null;
          scope?: string | null;
          updated_at?: string;
        };
      };
      syllabus_templates: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          file_name: string;
          content: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          file_name: string;
          content: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          file_name?: string;
          content?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      course_syllabi: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          file_name: string;
          course_code: string | null;
          content: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          file_name: string;
          course_code?: string | null;
          content: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          file_name?: string;
          course_code?: string | null;
          content?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      course_hub: {
        Row: {
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
        };
        Insert: {
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
        };
        Update: {
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
        };
      };
      accessibility_scans: {
        Row: {
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
        };
        Insert: {
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
        };
        Update: {
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
        };
      };
      rubric_bank: {
        Row: {
          id: string;
          topics: string[];
          instructions_excerpt: string;
          rubric_text: string;
          source: string;
          created_at: string;
        };
        Insert: {
          id: string;
          topics?: string[];
          instructions_excerpt?: string;
          rubric_text: string;
          source?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          topics?: string[];
          instructions_excerpt?: string;
          rubric_text?: string;
          source?: string;
          created_at?: string;
        };
      };
      glossary_terms: {
        Row: {
          id: string;
          term: string;
          definition: string;
          source: string;
          created_at: string;
        };
        Insert: {
          id: string;
          term: string;
          definition: string;
          source?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          term?: string;
          definition?: string;
          source?: string;
          created_at?: string;
        };
      };
      knowledge_entries: {
        Row: {
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
        };
        Insert: {
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
        };
        Update: {
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
        };
      };
      ai_chat_messages: {
        Row: {
          id: string;
          created_at: string;
          user_id: string | null;
          session_id: string;
          source: "fab" | "selection";
          role: "user" | "assistant";
          content: string;
          context_text: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          user_id?: string | null;
          session_id: string;
          source: "fab" | "selection";
          role: "user" | "assistant";
          content: string;
          context_text?: string | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          user_id?: string | null;
          session_id?: string;
          source?: "fab" | "selection";
          role?: "user" | "assistant";
          content?: string;
          context_text?: string | null;
        };
      };
      recording_files: {
        Row: {
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
          created_at: string;
          updated_at: string;
        };
        Insert: {
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
          created_at?: string;
          updated_at?: string;
        };
        Update: {
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
          created_at?: string;
          updated_at?: string;
        };
      };
      workflow_defs: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          description: string;
          steps: Json;
          scope: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          user_id: string;
          name: string;
          description?: string;
          steps?: Json;
          scope?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          description?: string;
          steps?: Json;
          scope?: Json;
          created_at?: string;
          updated_at?: string;
        };
      };
      deck_templates: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          description: string;
          slides: Json;
          loops: Json;
          audience: string;
          tone: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          user_id: string;
          name: string;
          description?: string;
          slides?: Json;
          loops?: Json;
          audience?: string;
          tone?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          description?: string;
          slides?: Json;
          loops?: Json;
          audience?: string;
          tone?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      common_resources: {
        Row: {
          user_id: string;
          items: Json;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          items?: Json;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          items?: Json;
          updated_at?: string;
        };
      };
      course_card_layout: {
        Row: {
          user_id: string;
          groups: Json;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          groups?: Json;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          groups?: Json;
          updated_at?: string;
        };
      };
      institution_fields: {
        Row: {
          user_id: string;
          acronym: string;
          fields: Json;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          acronym: string;
          fields?: Json;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          acronym?: string;
          fields?: Json;
          updated_at?: string;
        };
      };
      workflow_schedules: {
        Row: {
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
        };
        Insert: {
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
        };
        Update: {
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
        };
      };
      workflow_triggers: {
        Row: {
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
        };
        Insert: {
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
        };
        Update: {
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
        };
      };
      workflow_runs: {
        Row: {
          id: string;
          user_id: string;
          workflow_id: string;
          workflow_name: string;
          status: string;
          trigger_source: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          workflow_id: string;
          workflow_name: string;
          status: string;
          trigger_source?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          workflow_id?: string;
          workflow_name?: string;
          status?: string;
          trigger_source?: string | null;
          created_at?: string;
        };
      };
      grading_drafts: {
        Row: {
          id: string;
          user_id: string;
          status: string;
          summary: string;
          payload: Json;
          created_at: string;
          updated_at: string;
          workflow_id: string | null;
          workflow_name: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          status?: string;
          summary?: string;
          payload?: Json;
          created_at?: string;
          updated_at?: string;
          workflow_id?: string | null;
          workflow_name?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          status?: string;
          summary?: string;
          payload?: Json;
          created_at?: string;
          updated_at?: string;
          workflow_id?: string | null;
          workflow_name?: string | null;
        };
      };
      message_drafts: {
        Row: {
          id: string;
          user_id: string;
          status: string;
          summary: string;
          payload: Json;
          created_at: string;
          updated_at: string;
          workflow_id: string | null;
          workflow_name: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          status?: string;
          summary?: string;
          payload?: Json;
          created_at?: string;
          updated_at?: string;
          workflow_id?: string | null;
          workflow_name?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          status?: string;
          summary?: string;
          payload?: Json;
          created_at?: string;
          updated_at?: string;
          workflow_id?: string | null;
          workflow_name?: string | null;
        };
      };
      presentation_drafts: {
        Row: {
          id: string;
          user_id: string;
          status: string;
          summary: string;
          payload: Json;
          workflow_id: string | null;
          workflow_name: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          status?: string;
          summary?: string;
          payload?: Json;
          workflow_id?: string | null;
          workflow_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          status?: string;
          summary?: string;
          payload?: Json;
          workflow_id?: string | null;
          workflow_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
    Views: Record<string, { Row: Record<string, unknown> }>;
    Functions: Record<string, { Args: Record<string, unknown>; Returns: unknown }>;
    Enums: Record<string, string>;
    CompositeTypes: Record<string, Record<string, unknown>>;
  };
}
