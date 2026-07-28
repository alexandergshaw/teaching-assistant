import type { ChatAttachment, ChatMessage } from "./types";

/**
 * Budget trimming for chat attachments (`/api/ai-chat`, reached from the FAB).
 *
 * Vercel's serverless request body limit is roughly 4.5MB. The chat posts
 * JSON, and an attachment's base64 string is literally what rides in that
 * body, so this budget caps the TOTAL base64 payload across every message in
 * the transcript at ~3.5MB — leaving headroom for message text, prior turns,
 * and JSON structure so a request never fails opaquely against the platform
 * limit.
 *
 * Pure: no I/O, no Date, no randomness. Safe to unit test directly and to
 * call from both the client (before fetch, to refuse a too-large send with a
 * real reason) and the server (defense in depth).
 */

export const CHAT_ATTACHMENT_BUDGET_BYTES = 3.5 * 1024 * 1024;

export interface TrimAttachmentsResult {
  /** Messages to actually send, with over-budget attachments dropped from older turns. */
  messages: ChatMessage[];
  /** Names of attachments dropped to fit the budget, oldest first. */
  droppedNames: string[];
  /**
   * Set only when the newest user message's own attachments already exceed
   * the budget by themselves. That message is what the user is asking about
   * right now, so it can never be trimmed to make room — the send must be
   * refused instead, with this string as the user-facing reason. `messages`
   * is returned unchanged in this case; the caller should not send it.
   */
  rejected?: string;
}

/**
 * Approximates the wire size of one attachment. base64 character count IS
 * the string that ends up in the JSON body, so this is exact for budgeting
 * purposes even though it overstates the underlying binary size (~4/3 ratio).
 */
function attachmentBytes(attachment: ChatAttachment): number {
  return attachment.base64.length;
}

function sumBytes(attachments: ChatAttachment[] | undefined): number {
  return (attachments ?? []).reduce((sum, a) => sum + attachmentBytes(a), 0);
}

function formatMB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/** Index of the last "user" message, or -1 if there is none. */
function lastUserIndex(messages: ChatMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") return i;
  }
  return -1;
}

export function trimAttachmentsToBudget(
  messages: ChatMessage[],
  maxBytes: number
): TrimAttachmentsResult {
  if (messages.length === 0) {
    return { messages: [], droppedNames: [] };
  }

  const newestIndex = lastUserIndex(messages);
  const newestBytes = newestIndex >= 0 ? sumBytes(messages[newestIndex].attachments) : 0;

  if (newestBytes > maxBytes) {
    return {
      messages,
      droppedNames: [],
      rejected: `These files total ${formatMB(newestBytes)}, over the ${formatMB(maxBytes)} limit per message. Remove some files and try again.`,
    };
  }

  const totalBytes = messages.reduce(
    (sum, m, i) => (i === newestIndex ? sum : sum + sumBytes(m.attachments)),
    newestBytes
  );

  if (totalBytes <= maxBytes) {
    return { messages, droppedNames: [] };
  }

  // Every OTHER message's attachments, oldest to newest. The newest user
  // message is excluded — its bytes are already reserved above and it is
  // never trimmed.
  const others: Array<{ attachment: ChatAttachment }> = [];
  messages.forEach((m, i) => {
    if (i === newestIndex) return;
    (m.attachments ?? []).forEach((attachment) => others.push({ attachment }));
  });

  // Walk newest-to-oldest among the "others", greedily keeping what fits.
  // Whatever doesn't fit is, by construction, the oldest material — its
  // content is already summarized by the assistant's reply that followed it.
  let running = newestBytes;
  const keep = new Set<ChatAttachment>();
  for (let i = others.length - 1; i >= 0; i--) {
    const size = attachmentBytes(others[i].attachment);
    if (running + size <= maxBytes) {
      keep.add(others[i].attachment);
      running += size;
    }
  }

  const droppedNames = others
    .filter((ref) => !keep.has(ref.attachment))
    .map((ref) => ref.attachment.name);

  const trimmedMessages = messages.map((m, i) => {
    if (i === newestIndex || !m.attachments || m.attachments.length === 0) {
      return m;
    }
    const kept = m.attachments.filter((a) => keep.has(a));
    if (kept.length === m.attachments.length) return m;
    return { ...m, attachments: kept };
  });

  return { messages: trimmedMessages, droppedNames };
}
