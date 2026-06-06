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
      courses: {
        Row: {
          id: string;
          created_at: string;
          user_id: string;
          title: string;
          description: string | null;
          term: string | null;
          schedule: string | null;
          gemini_prompt: string | null;
          codebase: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          user_id: string;
          title: string;
          description?: string | null;
          term?: string | null;
          schedule?: string | null;
          gemini_prompt?: string | null;
          codebase?: string | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          user_id?: string;
          title?: string;
          description?: string | null;
          term?: string | null;
          schedule?: string | null;
          gemini_prompt?: string | null;
          codebase?: string | null;
        };
      };
      lectures: {
        Row: {
          id: string;
          created_at: string;
          course_id: string;
          title: string;
          content: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          course_id: string;
          title: string;
          content?: string | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          course_id?: string;
          title?: string;
          content?: string | null;
        };
      };
      assignment_instructions: {
        Row: {
          id: string;
          created_at: string;
          course_id: string;
          title: string;
          instructions: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          course_id: string;
          title: string;
          instructions?: string | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          course_id?: string;
          title?: string;
          instructions?: string | null;
        };
      };
      module_introductions: {
        Row: {
          id: string;
          created_at: string;
          course_id: string;
          title: string;
          content: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          course_id: string;
          title: string;
          content?: string | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          course_id?: string;
          title?: string;
          content?: string | null;
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
