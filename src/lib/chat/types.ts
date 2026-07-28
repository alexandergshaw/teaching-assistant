/** Which surface triggered the chat. */
export type ChatSource = "fab" | "selection";

/** A file the user attached to a chat message (see `src/lib/llm-files.ts`). */
export interface ChatAttachment {
  name: string;
  mimeType: string;
  base64: string;
}

/** A single turn in an AI chat conversation. */
export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  /**
   * Files attached to this message (always a "user" message in practice).
   * Kept in the transcript, not just sent once, so follow-up questions about
   * the same document stay grounded — see `trimAttachmentsToBudget` in
   * `src/lib/chat/attachments.ts` for how later turns keep this bounded.
   */
  attachments?: ChatAttachment[];
}

/**
 * Whether the FAB chat is currently mimicking the instructor's writing tone
 * (see `getChatToneStatusAction` in `src/app/actions/chat-style.ts`):
 * - "active": a usable writing sample is on file and is being fed to the model.
 * - "no-sample": no usable sample yet.
 * - "embedded": the embedded provider never calls a model, so no tone applies
 *   regardless of whether a sample is on file.
 */
export type ChatToneStatus = "active" | "no-sample" | "embedded";
