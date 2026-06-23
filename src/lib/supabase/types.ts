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
