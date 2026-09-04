"use server";

// Server actions for the Message replies recording tool (Manual > Recording >
// Message replies). Two actions, mirroring the discussion-replies pair this
// feature is a sibling of (docs/message-replies-acceptance-criteria.md
// section 0: "built by COPYING its row-typed machinery and IMPORTING its
// row-free machinery, exactly as the grading tool did") - same discipline as
// src/app/actions/discussion-replies.ts: requireOwner, a frame/thread count
// cap, checkWireBudget before the model call for extraction,
// parseLenientJsonArray for output, and { error } returned rather than
// thrown.
//
// See docs/message-replies-acceptance-criteria.md M8 (extraction), M10/M12
// (drafting) and section 9 (the exact, fixed export surface Group C compiles
// against).

import { requireOwner } from "@/lib/supabase/auth";
import { getWritingStyleBlock } from "./shared";
import { callLlm, describeLlmFailure, describeEmptyLlmText, type LlmProvider, type LlmPart } from "@/lib/llm";
import { checkWireBudget, sumBase64WireBytes } from "@/lib/upload-budget";
import { parseLenientJsonArray } from "@/lib/lenient-json";
import {
  EXTRACT_BATCH_SIZE,
  DRAFT_BATCH_SIZE,
  MESSAGE_INGREDIENTS,
  DEFAULT_MESSAGE_INGREDIENTS,
  buildMessageExtractionPrompt,
  buildMessageReplyPrompt,
  parseExtractedMessages,
  type ExtractedMessage,
  type MessageIngredient,
  type MessageCompositionSettings,
} from "@/lib/message-reply-prompt";
import { REPLY_FORMALITY_STOPS, type ReplyFormality } from "@/lib/discussion-reply-prompt";

// M12/section 9: the boundary default, mirroring coerceCompositionAtBoundary's
// own DEFAULT_REPLY_COMPOSITION fallback (discussion-replies.ts) - used only
// when `composition` arrives malformed over the Server Action wire.
// addressByName mirrors the discussion default (true); message-reply-prompt.ts
// exports DEFAULT_MESSAGE_INGREDIENTS for the ingredients half only, since
// that is the only piece Group C's own control defaults (M10/M14) also need.
const DEFAULT_MESSAGE_COMPOSITION: MessageCompositionSettings = {
  ingredients: DEFAULT_MESSAGE_INGREDIENTS,
  addressByName: true,
  formality: "balanced",
};

/**
 * `composition` arrives from the client over the Server Action wire. Its
 * declared TS type is MessageCompositionSettings, but nothing enforces that
 * at runtime once a value has crossed a serialization boundary - so it is
 * validated here, exactly like coerceCompositionAtBoundary
 * (discussion-replies.ts) validates the client's own localStorage reads,
 * before it ever reaches buildMessageReplyPrompt. `value` is read as
 * `unknown` internally on purpose, despite the parameter's declared type.
 */
function coerceMessageCompositionAtBoundary(value: unknown): MessageCompositionSettings {
  const obj = value && typeof value === "object" ? (value as Record<string, unknown>) : {};

  let ingredients: readonly MessageIngredient[] = DEFAULT_MESSAGE_COMPOSITION.ingredients;
  if (Array.isArray(obj.ingredients)) {
    const seen = new Set<MessageIngredient>();
    for (const v of obj.ingredients) {
      if (typeof v === "string" && (MESSAGE_INGREDIENTS as readonly string[]).includes(v)) {
        seen.add(v as MessageIngredient);
      }
    }
    // Zero selected is legal (M10: "Zero selected is legal") and survives as
    // an empty array - only a non-array `ingredients` field falls back to
    // the default set.
    ingredients = Array.from(seen);
  }

  const addressByName =
    typeof obj.addressByName === "boolean" ? obj.addressByName : DEFAULT_MESSAGE_COMPOSITION.addressByName;

  const formality: ReplyFormality =
    typeof obj.formality === "string" && (REPLY_FORMALITY_STOPS as readonly string[]).includes(obj.formality)
      ? (obj.formality as ReplyFormality)
      : DEFAULT_MESSAGE_COMPOSITION.formality;

  return { ingredients, addressByName, formality };
}

// Mirrors coerceKnowledgeContextAtBoundary's own rationale (discussion-replies.ts):
// a defense-in-depth cap at the Server Action wire, since nothing enforces a
// caller's own cap once a value has crossed this boundary. Truncates rather
// than dropping, and marks the truncation visibly INSIDE the prompt text
// itself (never silently) - see that file's own comment for the full
// reasoning, unchanged here.
const MAX_KNOWLEDGE_CONTEXT_CHARS = 20000;

function coerceKnowledgeContextAtBoundary(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.length > MAX_KNOWLEDGE_CONTEXT_CHARS
    ? `${trimmed.slice(0, MAX_KNOWLEDGE_CONTEXT_CHARS)}\n\n[Knowledge Base context truncated - it was too long to include in full.]`
    : trimmed;
}

/**
 * M8: read the student messages visible across a batch of screen-capture
 * frames. frames.length must be 1..EXTRACT_BATCH_SIZE. An empty result after
 * filtering is SUCCESS with an empty array - a batch of frames showing only
 * navigation chrome legitimately contains no messages.
 *
 * `provider` is threaded straight through to callLlm exactly as
 * extractDiscussionPostsAction's own does, with NO special-case rejection of
 * "embedded" - callLlm itself ignores whatever provider it is handed for
 * this generic vision/text interface and always calls Gemini (see
 * src/lib/llm.ts's callLlm), so a caller that offers "embedded" here behaves
 * exactly as one that offers "gemini" or "other" - the same as the sibling.
 */
export async function extractStudentMessagesAction(
  frames: Array<{ base64: string }>,
  courseName: string,
  provider: LlmProvider
): Promise<{ messages: ExtractedMessage[] } | { error: string }> {
  try {
    await requireOwner();

    if (frames.length === 0) return { error: "No frames were captured from the screen." };
    if (frames.length > EXTRACT_BATCH_SIZE) return { error: "Too many frames in one batch." };

    const sizeCheck = checkWireBudget(sumBase64WireBytes(frames.map((f) => f.base64)), "These screen frames");
    if (!sizeCheck.ok) return { error: sizeCheck.error ?? "These screen frames are too large to upload in one request." };

    const parts: LlmPart[] = [
      { text: buildMessageExtractionPrompt(courseName, frames.length) },
      ...frames.map((f) => ({ inlineData: { mimeType: "image/jpeg", data: f.base64 } })),
    ];

    // Mirrors extractDiscussionPostsAction's own settings (M8: "mirrors
    // extractDiscussionPostsAction (batch, wire budget, MAX_POST_CHARS
    // truncation, lenient parsing, empty-field filtering, pane coerced ...")
    // end to end, including the generation config.
    const r = await callLlm(
      { contents: [{ role: "user", parts }], generationConfig: { temperature: 0.1, maxOutputTokens: 8192 } },
      provider
    );

    if (!r.ok) return { error: describeLlmFailure(r, "Reading the screen failed") };
    if (!r.text.trim()) return { error: describeEmptyLlmText(r, "Reading the screen") };

    const raw = parseLenientJsonArray(r.text);
    if (raw === null) return { error: "Could not read any messages from that part of the screen." };

    // parseExtractedMessages (message-reply-prompt.ts) does the empty-field
    // filtering, MAX_POST_CHARS truncation and "pane" coercion - the caller
    // here only has to check for an unparseable response (null) first, per
    // that function's own doc comment.
    return { messages: parseExtractedMessages(raw) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not read messages from the screen." };
  }
}

/**
 * M12: draft one reply per thread. threads.length must be 1..DRAFT_BATCH_SIZE.
 * Mirrors draftDiscussionRepliesAction's batching, wire-boundary coercion and
 * positional-dedupe machinery, but the output stays purely positional -
 * `{ post, reply }` keyed by the thread's 1-based position in `threads`,
 * never remapped to a caller-supplied id (M10: the model returns
 * `{"post": <the THREAD number>, "reply": "..."}`, and this feature has no
 * opaque row id to rebuild - Group C reads `post` back against its own
 * `threads` array by index).
 *
 * `styleBlock` is resolved here, server-side, exactly like
 * draftDiscussionRepliesAction's own does - via getWritingStyleBlock(user.id)
 * from "./shared" - rather than arriving as a client-supplied parameter, so
 * the instructor's raw writing-style sample never has to cross the Server
 * Action wire to the client.
 *
 * No `provider` parameter (section 9's fixed surface omits it) - callLlm
 * defaults to "gemini" when none is supplied, and callLlm ignores whatever
 * provider it is given for this generic interface regardless (see
 * extractStudentMessagesAction's own comment above), so this omission
 * changes nothing about which model actually answers the call.
 */
export async function draftMessageRepliesAction(
  threads: ReadonlyArray<{
    messages: ReadonlyArray<{ text: string; fromMe: boolean }>;
    greetingName?: string;
  }>,
  courseName: string,
  composition: MessageCompositionSettings,
  knowledgeContext?: string
): Promise<{ replies: Array<{ post: number; reply: string }> } | { error: string }> {
  try {
    const user = await requireOwner();

    if (threads.length === 0) return { error: "No threads to reply to." };
    if (threads.length > DRAFT_BATCH_SIZE) return { error: "Too many threads in one batch." };

    // getWritingStyleBlock already never throws (returns "" on any failure) -
    // no extra try/catch needed here, the builder simply drops it via
    // .filter(Boolean) when empty.
    const styleBlock = await getWritingStyleBlock(user.id);

    const safeComposition = coerceMessageCompositionAtBoundary(composition);
    const safeKnowledgeContext = coerceKnowledgeContextAtBoundary(knowledgeContext);

    const prompt = buildMessageReplyPrompt(threads, courseName, styleBlock, safeComposition, safeKnowledgeContext);
    const parts: LlmPart[] = [{ text: prompt }];

    // Mirrors draftDiscussionRepliesAction's own generation config.
    const r = await callLlm({ contents: [{ role: "user", parts }], generationConfig: { temperature: 0.7, maxOutputTokens: 4096 } });

    if (!r.ok) return { error: describeLlmFailure(r, "Drafting replies failed") };
    if (!r.text.trim()) return { error: describeEmptyLlmText(r, "Drafting replies") };

    const raw = parseLenientJsonArray(r.text) as Array<{ post?: unknown; reply?: unknown }> | null;
    if (!raw) return { error: "Could not read the drafted replies from the model output." };

    // Same dedupe rule as draftDiscussionRepliesAction's own F2 fix: only the
    // FIRST occurrence of a repeated positional index is kept, so the mapping
    // stays one-to-one by construction.
    const seenPositions = new Set<number>();
    const byPosition = raw.filter(
      (r2): r2 is { post: number; reply: string } => {
        if (
          !Number.isInteger(r2.post) ||
          (r2.post as number) < 1 ||
          (r2.post as number) > threads.length ||
          typeof r2.reply !== "string" ||
          r2.reply.trim().length === 0
        ) {
          return false;
        }
        if (seenPositions.has(r2.post as number)) return false;
        seenPositions.add(r2.post as number);
        return true;
      }
    );

    let replies: Array<{ post: number; reply: string }>;
    if (byPosition.length > 0) {
      replies = byPosition.map((r2) => ({ post: r2.post, reply: r2.reply.trim() }));
    } else if (raw.length === threads.length) {
      // Belt and braces: the array came back the right length but no element
      // carried a usable "post" index - fall back to positional order rather
      // than failing the whole batch, mirroring draftDiscussionRepliesAction's
      // own fallback.
      replies = raw
        .map((r2, i) => (typeof r2.reply === "string" && r2.reply.trim() ? { post: i + 1, reply: r2.reply.trim() } : null))
        .filter((r2): r2 is { post: number; reply: string } => r2 !== null);
    } else {
      replies = [];
    }

    return { replies };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not draft replies." };
  }
}
