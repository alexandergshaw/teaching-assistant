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

/**
 * Knowledge-base context currently loaded into a chat session, derived from
 * the "open-ai-chat" event's `OpenChatDetail` (see
 * `src/lib/chat/open-chat.ts`) once `AiChatFab` has confirmed it carries at
 * least one page id. Unlike `OpenChatDetail` — whose fields are optional
 * because the parser must tolerate a missing/malformed event detail —
 * `knowledgePageIds` here is never empty: `AiChatFab` only ever stores this
 * once it has validated that. Held as state for the lifetime of the open
 * chat window and sent with every message in the session (see `AiChatFab`'s
 * own comment on why the scope is session, not single-message).
 */
export interface ChatKnowledgeContext {
  knowledgePageIds: string[];
  label?: string;
}

/**
 * Modules-selection context currently loaded into a chat session, derived
 * from the "open-ai-chat" event's `OpenChatDetail.selectionContext` (see
 * `OpenChatSelectionContext` in `src/lib/chat/open-chat.ts`) once
 * `AiChatFab` has confirmed it carries usable text. `parseOpenChatDetail`
 * already guarantees `text` is a non-empty string whenever
 * `selectionContext` is present at all (C1), so - unlike
 * `OpenChatDetail.selectionContext`, whose optionality reflects that the
 * dispatch might not carry one - `text` here is never checked again once
 * stored.
 *
 * Held as state for the lifetime of the open chat window and re-sent (as
 * `selectionContextText`) with every message in the session, same
 * lifetime and same reason as `ChatKnowledgeContext` above: the Modules
 * selection is gathered ONCE, client-side, at click time (D1 in
 * docs/modules-selection-ask-ai-acceptance-criteria.md) - Canvas network
 * I/O (page bodies, file previews, assignment descriptions) that would add
 * seconds to every follow-up turn if re-run per message, unlike the
 * knowledge-base path, which cheaply re-derives its own block server-side
 * from ids on every turn. Independent of `ChatKnowledgeContext`: a chat
 * session may carry either, both, or neither at once (C3) - one is never
 * cleared as a side effect of the other being set or sent.
 */
export interface ChatSelectionContext {
  text: string;
  label?: string;
}

/**
 * Server-confirmed counts for the knowledge context loaded into the current
 * turn (A7), mirroring `/api/ai-chat`'s `knowledgeContext` response field
 * (see `KnowledgeContextResult` in `src/app/api/ai-chat/route.ts` — only the
 * summary counts are returned to the client, never the assembled block text,
 * which was already injected server-side into the model call). Distinct
 * from `ChatKnowledgeContext` above: that type is the CLIENT's requested
 * selection (page ids, sent with every message); this is what the SERVER
 * actually resolved after re-verifying ownership and applying the character
 * budget, which is why `includedPages`/`includedAttachments` can be lower
 * than the requested selection size, and is the more trustworthy number to
 * show the instructor once it is available.
 */
export interface ChatKnowledgeContextSummary {
  includedPages: number;
  omittedPages: number;
  includedAttachments: number;
  omittedAttachments: number;
}
