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
    };
    Views: Record<string, { Row: Record<string, unknown> }>;
    Functions: Record<string, { Args: Record<string, unknown>; Returns: unknown }>;
    Enums: Record<string, string>;
    CompositeTypes: Record<string, Record<string, unknown>>;
  };
}
