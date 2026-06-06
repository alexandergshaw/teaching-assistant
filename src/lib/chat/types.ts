/** Which surface triggered the chat. */
export type ChatSource = "fab" | "selection";

/** A single turn in an AI chat conversation. */
export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

/**
 * A file attached to a chat message, with content pre-read on the client.
 * `data` is plain UTF-8 text when `isText` is true, or a base64-encoded
 * binary payload when `isText` is false.
 */
export interface AttachedFile {
  name: string;
  mimeType: string;
  data: string;
  isText: boolean;
}
