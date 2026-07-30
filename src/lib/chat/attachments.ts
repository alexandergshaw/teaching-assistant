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

/** Sensible cap on how many files can ride on a single chat message. Shared
 * by the paperclip control AND drag-and-drop (AiChatWindow.tsx) - AC7 of the
 * drag-and-drop feature requires both entry points to enforce the exact
 * same cap, which is automatic as long as both read this one constant. */
export const MAX_ATTACHMENTS_PER_MESSAGE = 6;

export function formatMB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export interface AttachmentLimitCheck {
  ok: boolean;
  /** User-facing refusal reason; only set when `ok` is false. */
  error?: string;
}

/**
 * Refuses adding `incomingCount` files to a message that already has
 * `existingCount` pending when the total would exceed `max`. Split out from
 * `checkAttachmentByteBudget` below (rather than one combined "validate new
 * files" function) because the cap check needs only counts - no attachment
 * content - while the budget check needs actual byte sizes; keeping them
 * separate lets the paperclip AND drop handlers run the cheap count check
 * before ever reading a file's bytes.
 */
export function checkAttachmentCap(existingCount: number, incomingCount: number, max: number): AttachmentLimitCheck {
  if (existingCount + incomingCount > max) {
    return { ok: false, error: `You can attach up to ${max} files per message.` };
  }
  return { ok: true };
}

/**
 * Refuses adding `incomingBytes` to a message that already carries
 * `existingBytes` of pending attachment content when the total would exceed
 * `maxBytes` (see `CHAT_ATTACHMENT_BUDGET_BYTES`'s own doc comment for why
 * that budget exists).
 */
export function checkAttachmentByteBudget(existingBytes: number, incomingBytes: number, maxBytes: number): AttachmentLimitCheck {
  const total = existingBytes + incomingBytes;
  if (total > maxBytes) {
    return {
      ok: false,
      error: `These files total ${formatMB(total)}, over the ${formatMB(maxBytes)} limit per message. Remove some files and try again.`,
    };
  }
  return { ok: true };
}

/**
 * True when a drag carries at least one file (as opposed to, say, dragged
 * text or a link) - checked against `DataTransfer.types` rather than
 * `DataTransfer.files`, which browsers deliberately leave empty during
 * `dragenter`/`dragover` for security reasons and only populate at `drop`.
 * Pulled out as a pure function (AiChatWindow.tsx's drag handlers all call
 * this first) so "only intercept file drags, never an unrelated drag" is
 * unit-testable without constructing a real DragEvent/DataTransfer in a
 * DOM-less test environment.
 */
export function isFileDragTypes(types: Iterable<string> | null | undefined): boolean {
  return Array.from(types ?? []).includes("Files");
}

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
