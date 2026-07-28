/** Which surface triggered the chat. */
export type ChatSource = "fab" | "selection";

/** A single turn in an AI chat conversation. */
export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
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
