/** Which surface triggered the chat. */
export type ChatSource = "fab" | "selection";

/** A single turn in an AI chat conversation. */
export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}
