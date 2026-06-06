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
          user_id: string | null;
          title: string;
          description: string | null;
          term: string | null;
          /** Storage path to the uploaded CSV schedule file. */
          schedule_file_path: string | null;
          schedule_file_name: string | null;
          gemini_prompt: string | null;
          /** Storage path to the uploaded ZIP codebase archive. */
          codebase_file_path: string | null;
          codebase_file_name: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          user_id?: string | null;
          title: string;
          description?: string | null;
          term?: string | null;
          schedule_file_path?: string | null;
          schedule_file_name?: string | null;
          gemini_prompt?: string | null;
          codebase_file_path?: string | null;
          codebase_file_name?: string | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          user_id?: string;
          title?: string;
          description?: string | null;
          term?: string | null;
          schedule_file_path?: string | null;
          schedule_file_name?: string | null;
          gemini_prompt?: string | null;
          codebase_file_path?: string | null;
          codebase_file_name?: string | null;
        };
      };
      lectures: {
        Row: {
          id: string;
          created_at: string;
          course_id: string;
          title: string;
          /** Storage path to the uploaded PowerPoint file (.pptx / .ppt). */
          file_path: string | null;
          file_name: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          course_id: string;
          title: string;
          file_path?: string | null;
          file_name?: string | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          course_id?: string;
          title?: string;
          file_path?: string | null;
          file_name?: string | null;
        };
      };
      assignment_instructions: {
        Row: {
          id: string;
          created_at: string;
          course_id: string;
          title: string;
          /** Storage path to the uploaded Word document (.docx). */
          file_path: string | null;
          file_name: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          course_id: string;
          title: string;
          file_path?: string | null;
          file_name?: string | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          course_id?: string;
          title?: string;
          file_path?: string | null;
          file_name?: string | null;
        };
      };
      module_introductions: {
        Row: {
          id: string;
          created_at: string;
          course_id: string;
          title: string;
          /** Storage path to the uploaded Word document (.docx). */
          file_path: string | null;
          file_name: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          course_id: string;
          title: string;
          file_path?: string | null;
          file_name?: string | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          course_id?: string;
          title?: string;
          file_path?: string | null;
          file_name?: string | null;
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
