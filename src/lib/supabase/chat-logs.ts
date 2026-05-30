import { createServiceClient } from "./server";
import type { Database } from "./types";
import type { ChatSource, ChatMessage } from "@/lib/chat/types";

export interface LogChatMessageParams {
  sessionId: string;
  source: ChatSource;
  role: ChatMessage["role"];
  content: string;
  /** Only required for 'selection' source chats. */
  contextText?: string;
  /** Omit for anonymous sessions. */
  userId?: string;
}

/**
 * Persists a single chat turn to the `ai_chat_messages` table.
 *
 * Uses the service-role client so inserts succeed regardless of RLS.
 * Never throws — logging failures are caught and printed to stderr so they
 * do not surface as errors to the end-user.
 */
export async function logChatMessage(params: LogChatMessageParams): Promise<void> {
  try {
    const supabase = createServiceClient();
    // Cast through `any` to work around the Supabase client's generic inference
    // for the compiled `.insert()` overload when `Relation` is `any`.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const table = (supabase as any).from("ai_chat_messages");
    const row: Database["public"]["Tables"]["ai_chat_messages"]["Insert"] = {
      session_id: params.sessionId,
      source: params.source,
      role: params.role,
      content: params.content,
      context_text: params.contextText ?? null,
      user_id: params.userId ?? null,
    };
    const { error } = await table.insert(row);

    if (error) {
      console.error("[chat-logs] Failed to insert chat message:", error.message);
    }
  } catch (err) {
    console.error("[chat-logs] Unexpected error logging chat message:", err);
  }
}

/**
 * Convenience helper that logs both the user turn and the assistant reply in
 * a single call. Order is preserved (user first, then assistant).
 */
export async function logChatExchange(params: {
  sessionId: string;
  source: ChatSource;
  userMessage: string;
  assistantReply: string;
  contextText?: string;
  userId?: string;
}): Promise<void> {
  const base = {
    sessionId: params.sessionId,
    source: params.source,
    contextText: params.contextText,
    userId: params.userId,
  };

  await logChatMessage({ ...base, role: "user", content: params.userMessage });
  await logChatMessage({ ...base, role: "assistant", content: params.assistantReply });
}
