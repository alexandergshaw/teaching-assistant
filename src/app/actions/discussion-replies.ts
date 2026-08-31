"use server";

// Server actions for discussion reply capture (Manual > Recording >
// Discussion replies). Two actions, both vision-over-JPEG-frames / text-only
// LLM calls following the discipline of the existing screen-recording actions
// (src/app/actions/media.ts:470-565): requireOwner, a frame/post count cap,
// checkWireBudget before the model call, parseLenientJsonArray for output,
// and { error } returned rather than thrown.
//
// See docs/discussion-reply-capture-acceptance-criteria.md sections 4b, 17a,
// 17b, AC64, AC65 - this file is built to that contract exactly.

import { requireOwner } from "@/lib/supabase/auth";
import { callLlm, describeLlmFailure, describeEmptyLlmText, type LlmProvider, type LlmPart } from "@/lib/llm";
import { checkWireBudget, sumBase64WireBytes } from "@/lib/upload-budget";
import { parseLenientJsonArray } from "@/lib/lenient-json";
import { getWritingStyleBlock } from "./shared";
import { findResourceLinksForConceptsAction } from "./learning-resource-links";
import { RESOURCE_KINDS, type ResourceKind } from "@/lib/resource-kind";
import {
  EXTRACT_BATCH_SIZE,
  DRAFT_BATCH_SIZE,
  MAX_POST_CHARS,
  RESOURCE_BATCH_SIZE,
  buildPostExtractionPrompt,
  buildReplyDraftingPrompt,
  deriveResourceConcept,
  type DiscussionAudience,
  type ThreadPosition,
} from "@/lib/discussion-reply-prompt";

// docs/discussion-thread-structure-acceptance-criteria.md T2b/T3: the
// three-member set a captured post's thread position can hold. Anything
// outside it coerces to `undefined` - never thrown, never a fourth value.
const THREAD_POSITIONS: readonly ThreadPosition[] = ["root", "reply", "unknown"];

function coerceThreadPosition(value: unknown): ThreadPosition | undefined {
  return typeof value === "string" && (THREAD_POSITIONS as readonly string[]).includes(value)
    ? (value as ThreadPosition)
    : undefined;
}

// T3: `replyingToAuthor` survives only as a non-empty, trimmed string - an
// empty or whitespace-only reading is the same as the LMS printing nothing.
function coerceReplyingToAuthor(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * Read the discussion posts visible across a batch of screen-capture frames.
 * frames.length must be 1..EXTRACT_BATCH_SIZE (the client packs batches by
 * bytes with count as a ceiling - see AC10a in the discussion capture ACs).
 * An empty result after filtering is SUCCESS with an empty array - a batch of
 * frames showing only navigation chrome legitimately contains no posts.
 */
export async function extractDiscussionPostsAction(
  frames: Array<{ base64: string }>,
  courseName: string,
  provider: LlmProvider
): Promise<
  {
    posts: Array<{
      author: string;
      text: string;
      postedAt?: string;
      threadPosition?: ThreadPosition;
      replyingToAuthor?: string;
    }>;
  }
  | { error: string }
> {
  try {
    await requireOwner();

    if (frames.length === 0) return { error: "No frames were captured from the screen." };
    if (frames.length > EXTRACT_BATCH_SIZE) return { error: "Too many frames in one batch." };

    const sizeCheck = checkWireBudget(sumBase64WireBytes(frames.map((f) => f.base64)), "These screen frames");
    if (!sizeCheck.ok) return { error: sizeCheck.error ?? "These screen frames are too large to upload in one request." };

    const parts: LlmPart[] = [
      { text: buildPostExtractionPrompt(courseName, frames.length) },
      ...frames.map((f) => ({ inlineData: { mimeType: "image/jpeg", data: f.base64 } })),
    ];

    // AC4b-i: maxOutputTokens 8192, not 4096 - on Gemini 3.x thinking tokens
    // draw from the same budget as output, and six overlapping frames of a
    // dense board can legitimately hold 8-10 unique posts. AC4b-ii: the
    // temperature below is advisory on the default model (normalizeGenerationConfig
    // deletes it) and is passed as-is, unworked-around, on purpose.
    const r = await callLlm(
      { contents: [{ role: "user", parts }], generationConfig: { temperature: 0.1, maxOutputTokens: 8192 } },
      provider
    );

    if (!r.ok) return { error: describeLlmFailure(r, "Reading the screen failed") };
    if (!r.text.trim()) return { error: describeEmptyLlmText(r, "Reading the screen") };

    const raw = parseLenientJsonArray(r.text) as
      | Array<{ author?: unknown; text?: unknown; postedAt?: unknown; threadPosition?: unknown; replyingToAuthor?: unknown }>
      | null;
    if (!raw) return { error: "Could not read any posts from that part of the screen." };

    const posts = raw
      .filter(
        (p) =>
          typeof p.author === "string" && p.author.trim() &&
          typeof p.text === "string" && p.text.trim()
      )
      .map((p) => {
        const author = (p.author as string).trim();
        const text = (p.text as string).trim();
        const postedAt = typeof p.postedAt === "string" && p.postedAt.trim() ? p.postedAt.trim() : undefined;
        // AC4b: truncate to MAX_POST_CHARS with a visible marker when
        // truncation actually happened - AC12's merge compares lengths to
        // decide which read wins, so two truncated reads of an over-long
        // post must not both silently land at exactly the same length.
        const truncated = text.length > MAX_POST_CHARS ? `${text.slice(0, MAX_POST_CHARS)}...` : text;
        const threadPosition = coerceThreadPosition(p.threadPosition);
        const replyingToAuthor = coerceReplyingToAuthor(p.replyingToAuthor);

        const post: {
          author: string;
          text: string;
          postedAt?: string;
          threadPosition?: ThreadPosition;
          replyingToAuthor?: string;
        } = { author, text: truncated };
        if (postedAt) post.postedAt = postedAt;
        if (threadPosition) post.threadPosition = threadPosition;
        if (replyingToAuthor) post.replyingToAuthor = replyingToAuthor;
        return post;
      });

    return { posts };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not read posts from the screen." };
  }
}

/**
 * Draft one reply per post. posts.length must be 1..DRAFT_BATCH_SIZE. Caller
 * ids never go on the wire: the prompt shows positional "POST 1..N" and the
 * model returns positional integers, mapped back to the caller's ids here
 * (AC4b) - a small integer is inside a model's reliable-copy envelope in a
 * way an opaque token id is not, and it saves output tokens nobody reads.
 */
export async function draftDiscussionRepliesAction(
  // T6/T6c: `parent` is optional and, when present, was already resolved and
  // gated by the caller (resolveDraftParent in discussion-capture.ts, on all
  // three of threadPosition === "reply", a printed replyingToAuthor and
  // exactly one matching author) - this action does no gating of its own,
  // it only threads whatever `parent` it is handed into the prompt.
  posts: Array<{ id: string; author: string; text: string; parent?: { author: string; text: string } }>,
  audience: DiscussionAudience,
  courseName: string,
  provider: LlmProvider
): Promise<{ replies: Array<{ id: string; reply: string }> } | { error: string }> {
  try {
    const user = await requireOwner();

    if (posts.length === 0) return { error: "No posts to reply to." };
    if (posts.length > DRAFT_BATCH_SIZE) return { error: "Too many posts in one batch." };

    // getWritingStyleBlock already never throws (returns "" on any failure) -
    // no extra try/catch needed here, the builder simply drops it via
    // .filter(Boolean) when empty.
    const styleBlock = await getWritingStyleBlock(user.id);

    const prompt = buildReplyDraftingPrompt(posts, audience, courseName, styleBlock);
    const parts: LlmPart[] = [{ text: prompt }];

    // AC4b-ii: temperature 0.7 is advisory on the default Gemini 3 model
    // (normalizeGenerationConfig deletes any temperature < 1 there) and is
    // passed as stated, with no special-casing.
    const r = await callLlm(
      { contents: [{ role: "user", parts }], generationConfig: { temperature: 0.7, maxOutputTokens: 4096 } },
      provider
    );

    if (!r.ok) return { error: describeLlmFailure(r, "Drafting replies failed") };
    if (!r.text.trim()) return { error: describeEmptyLlmText(r, "Drafting replies") };

    const raw = parseLenientJsonArray(r.text) as Array<{ post?: unknown; reply?: unknown }> | null;
    if (!raw) return { error: "Could not read the drafted replies from the model output." };

    // F2: a model can return the same positional index twice (e.g. two
    // elements both carrying "post": 2). Left undeduped, both map to the
    // SAME row and the other row is silently missing from the mapping even
    // though the batch "looked" complete - the mapping must be one-to-one by
    // construction, so only the FIRST occurrence of each index is kept.
    const seenPositions = new Set<number>();
    const byPosition = raw.filter(
      (r2): r2 is { post: number; reply: string } => {
        if (
          !Number.isInteger(r2.post) ||
          (r2.post as number) < 1 ||
          (r2.post as number) > posts.length ||
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

    let replies: Array<{ id: string; reply: string }>;
    if (byPosition.length > 0) {
      replies = byPosition.map((r2) => ({ id: posts[r2.post - 1].id, reply: r2.reply.trim() }));
    } else if (raw.length === posts.length) {
      // Belt and braces: the array came back the right length but no element
      // carried a usable "post" index - fall back to positional order rather
      // than failing the whole batch (DRAFT_BATCH_SIZE is only 5, so this is
      // cheap and rescues the common near-miss).
      replies = raw
        .map((r2, i) => (typeof r2.reply === "string" && r2.reply.trim() ? { id: posts[i].id, reply: r2.reply.trim() } : null))
        .filter((r2): r2 is { id: string; reply: string } => r2 !== null);
    } else {
      replies = [];
    }

    return { replies };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not draft replies." };
  }
}

/**
 * One resource an instructor might attach beneath a drafted reply. Defined
 * HERE (not imported) because nothing in the repo exports it yet -
 * useReplyRows.ts's own ReplyRow.resources field (R3 in the resources AC)
 * lands in a later wave of this same group. `export interface` is a legal
 * "use server" export form (see src/lib/use-server-exports.test.ts) -
 * matching ResourceLink/FindResourceLinksSuccess in learning-resource-links.ts.
 */
export interface ReplyResource {
  title: string;
  url: string;
  kind: ResourceKind;
  note?: string;
}

// The full five-way kind list this feature searches across, built from
// RESOURCE_KINDS (never a fresh literal array) so the profile handed to
// findResourceLinksForConceptsAction can never name a kind
// coerceResourceKind would not itself recognize - see
// docs/discussion-reply-resources-acceptance-criteria.md R2.
const REPLY_RESOURCE_PROFILE = {
  kinds: RESOURCE_KINDS,
  resourceTypeSentence: "documentation, video tutorials, written tutorials, news articles, and papers",
};

/**
 * Gather real, grounded resources (docs, video, written tutorials, news,
 * papers) for a batch of discussion posts, reusing
 * findResourceLinksForConceptsAction (src/app/actions/learning-resource-links.ts)
 * rather than re-implementing its two-call grounded-search pipeline. See
 * docs/discussion-reply-resources-acceptance-criteria.md section 3 (R4) for
 * the full contract this is built to.
 *
 * ONE call carries every post's concept (R0-3): the reused action already
 * fans out per-concept internally with Promise.allSettled and keeps each
 * concept's corroboration sources separate, so a per-post fan-out here would
 * only re-fan an existing fan-out while paying for N separate reachability
 * budgets, N separate 40s retry clocks, and N round trips through the
 * serialized Server Action lane that the live capture pipeline's frame drain
 * depends on staying free (R0-4).
 *
 * Keying results back to posts (R4b, the highest-risk line in the AC): the
 * reused action trims and filters its `concepts` array before running, and
 * returns links keyed by the concept STRING, not by position. So entries
 * whose derived concept is empty are dropped BEFORE the call (its own
 * filter(Boolean) then has nothing left to shift), and results are grouped
 * by `link.concept` into a map, then read back by that same string for every
 * entry that shares it - never by array index. Two posts whose text
 * truncates to the identical concept string legitimately receive the same
 * resources.
 */
export async function gatherReplyResourcesAction(
  posts: Array<{ id: string; text: string }>,
  courseName: string,
  provider: LlmProvider
): Promise<{ resources: Array<{ id: string; resources: ReplyResource[] }>; degraded: boolean } | { error: string }> {
  try {
    await requireOwner();

    if (posts.length > RESOURCE_BATCH_SIZE) return { error: "Too many posts in one batch." };

    // R4e: the reused action returns { error } outright for the embedded
    // provider (it makes no network call and can neither search nor verify a
    // link). This feature's provider comes from getStoredProvider() at
    // dispatch, so without this short-circuit an embedded-provider user
    // would see a resource failure notice on every batch for the whole
    // session - a capability limit, not a failure, so it must not go through
    // the same { error } channel as a real search failure.
    if (provider === "embedded") {
      return { resources: posts.map((p) => ({ id: p.id, resources: [] })), degraded: true };
    }

    const entries = posts
      .map((p) => ({ id: p.id, concept: deriveResourceConcept(p.text) }))
      .filter((e) => e.concept.length > 0);

    if (entries.length === 0) {
      return { resources: posts.map((p) => ({ id: p.id, resources: [] })), degraded: false };
    }

    const result = await findResourceLinksForConceptsAction(
      entries.map((e) => e.concept),
      courseName,
      provider,
      undefined,
      REPLY_RESOURCE_PROFILE
    );

    if ("error" in result) return { error: result.error };

    // Group survivors by concept STRING first (never by index - see this
    // function's own doc comment / R4b), then cap each group at 3 (R4f)
    // before it is read back for every post that shares the string.
    const linksByConcept = new Map<string, ReplyResource[]>();
    for (const link of result.links) {
      const list = linksByConcept.get(link.concept);
      const resource: ReplyResource = { title: link.title, url: link.url, kind: link.kind };
      if (link.whatYouGet.trim()) resource.note = link.whatYouGet.trim();
      if (list) {
        list.push(resource);
      } else {
        linksByConcept.set(link.concept, [resource]);
      }
    }

    const conceptById = new Map(entries.map((e) => [e.id, e.concept]));
    const resources = posts.map((p) => {
      const concept = conceptById.get(p.id);
      const group = concept ? linksByConcept.get(concept) : undefined;
      // R4f: at most 3 links per post, even though a shared concept's group
      // may hold more (a caller-side slice, not a parameter to the reused
      // action - MAX_ITEMS_PER_CONCEPT there is a private module constant).
      return { id: p.id, resources: group ? group.slice(0, 3).map((r) => ({ ...r })) : [] };
    });

    return { resources, degraded: result.degraded };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not find resources for these replies." };
  }
}
