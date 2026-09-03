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
// Resource-controls feature: the "preferred video length" setting's sentence
// builder - a plain, synchronous, exported function, so it lives in its own
// leaf rather than here (a "use server" module may export only async
// functions and type-only exports - src/lib/use-server-exports.test.ts).
import { videoLengthPreferenceSentence } from "@/lib/video-length-preference";
// PRIVACY FIX (BLOCKER 3): the bulk resource-search pass used to map a raw
// post straight through `deriveResourceConcept` with no redaction at all -
// `deriveResourceConcept` deliberately never reads an author FIELD, which is
// true and beside the point, since the leak is names in the post BODY (a
// self-introducing first post - "Hi everyone, I'm Maria and..." - is the
// commonest genre on a discussion board). This path fires unattended on
// EVERY reply that lands (R6), so it out-volumes the per-row path that was
// already hardened. `redactAuthorNameFromPost` is the SAME leaf
// (discussion-reply-redact.ts) the per-row targeted search
// (useReplyResources.ts's `resourceQueryForRow`, RC4) already uses - one
// implementation, two callers, never a second copy of the redaction rule.
import { redactAuthorNameFromPost, redactAuthorNameFromText } from "@/lib/discussion-reply-redact";
// docs/reply-resource-search-yield-acceptance-criteria.md Y5/Y8: the outcome
// kind/counts/shape types, `ConceptOutcome`, and the frozen zero-counts
// object are all owned by the neutral, dependency-free leaf
// src/lib/resource-search-outcome.ts - reached from here directly rather
// than through discussion-serialization.ts. `ZERO_RESOURCE_SEARCH_COUNTS` is
// a plain value import from a leaf with no "use server"/"use client"
// directive of its own, which this "use server" module's own export-shape
// rule (only async functions/types may be exported from HERE) does not
// constrain - that rule is about what this module exports, not what it
// imports.
import { ZERO_RESOURCE_SEARCH_COUNTS, type ResourceSearchOutcome, type ResourceSearchOutcomeKind, type ResourceSearchCounts, type ConceptOutcome } from "@/lib/resource-search-outcome";
import {
  EXTRACT_BATCH_SIZE,
  DRAFT_BATCH_SIZE,
  MAX_POST_CHARS,
  RESOURCE_BATCH_SIZE,
  REPLY_INGREDIENTS,
  REPLY_FORMALITY_STOPS,
  DEFAULT_REPLY_COMPOSITION,
  buildPostExtractionPrompt,
  buildReplyDraftingPrompt,
  parseReplyConcepts,
  type DiscussionAudience,
  type ThreadPosition,
  type ReplyIngredient,
  type ReplyFormality,
  type ReplyCompositionSettings,
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

// docs/reply-composition-controls-acceptance-criteria.md JOB3: `composition`
// arrives from the client over the Server Action wire. Its declared TS type
// is ReplyCompositionSettings, but nothing enforces that at runtime once a
// value has crossed a serialization boundary (the same reason
// threadPosition/replyingToAuthor above are coerced rather than trusted) -
// so it is validated here, exactly like coerceReplyComposition
// (discussion-draft-loop.ts) validates the client's own localStorage reads,
// before it ever reaches buildReplyDraftingPrompt. `value` is read as
// `unknown` internally on purpose, despite the parameter's declared type.
function coerceCompositionAtBoundary(value: unknown): ReplyCompositionSettings {
  const obj = value && typeof value === "object" ? (value as Record<string, unknown>) : {};

  let ingredients: readonly ReplyIngredient[] = DEFAULT_REPLY_COMPOSITION.ingredients;
  if (Array.isArray(obj.ingredients)) {
    const seen = new Set<ReplyIngredient>();
    for (const v of obj.ingredients) {
      if (typeof v === "string" && (REPLY_INGREDIENTS as readonly string[]).includes(v)) {
        seen.add(v as ReplyIngredient);
      }
    }
    // C2c: zero selected is legal and survives as an empty array - only a
    // non-array `ingredients` field falls back to the default set.
    ingredients = Array.from(seen);
  }

  const addressByName =
    typeof obj.addressByName === "boolean" ? obj.addressByName : DEFAULT_REPLY_COMPOSITION.addressByName;

  const formality: ReplyFormality =
    typeof obj.formality === "string" && (REPLY_FORMALITY_STOPS as readonly string[]).includes(obj.formality)
      ? (obj.formality as ReplyFormality)
      : DEFAULT_REPLY_COMPOSITION.formality;

  return { ingredients, addressByName, formality };
}

// "Activate this recording from the Knowledge base" (src/lib/recording-launch.ts's
// RecordingKnowledgeContext, taken once per capture run by
// useDiscussionReplies.ts's `start()` and threaded through every batch by
// discussion-draft-loop.ts's `runDraftLoop`): a defense-in-depth cap at the
// Server Action wire, mirroring coerceCompositionAtBoundary's own rationale
// just above - nothing enforces a caller's own cap once a value has crossed
// this boundary.
//
// The realistic worst case today is far below this cap. The ONLY production
// producer of a non-empty knowledgeContext (KnowledgeTab.tsx's
// startRecordingWithSelection) builds it via buildKnowledgeContextBlock
// (src/lib/chat/knowledge-context.ts), whose own DEFAULT_KNOWLEDGE_CONTEXT_MAX_CHARS
// already caps the rendered block at 10,000 characters - at most ~40KB even
// at 4-byte-per-character worst-case Unicode inflation, roughly 1% of
// UPLOAD_WIRE_BUDGET_BYTES (3.5MB, src/lib/upload-budget.ts). This feature
// carries no images and no file uploads, so it never needs its own
// checkWireBudget call the way extractDiscussionPostsAction's frames do. The
// cap below (MAX_KNOWLEDGE_CONTEXT_CHARS) is set well above that real
// ceiling on purpose, so it never fires against the one real path today and
// only ever protects against a hypothetical future caller of the exported
// openRecordingTool()/sanitizeKnowledgeContext() (recording-launch.ts, a
// sibling's file) that supplies unbounded text - sanitizeKnowledgeContext
// checks only that `text` is a non-blank string, never its length. Because
// this path is unreachable from anything an instructor can trigger today,
// truncating here (unlike a cap on the instructor's own real input) needs no
// instructor-facing notice - there is no real input to have silently
// shortened. Truncates rather than dropping, and marks the truncation
// visibly INSIDE the prompt text itself (never silently), mirroring
// MAX_POST_CHARS's own "..." marker on an over-long extracted post.
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
  // `greetingName` (docs/reply-composition-controls-acceptance-criteria.md
  // C1b-ii) is likewise derived and gated entirely by the caller
  // (discussion-draft-loop.ts's runDraftLoop, via greetingNameFromAuthor) -
  // this action threads it through unchanged, never derives one of its own.
  posts: Array<{
    id: string;
    author: string;
    text: string;
    parent?: { author: string; text: string };
    greetingName?: string;
  }>,
  audience: DiscussionAudience,
  courseName: string,
  composition: ReplyCompositionSettings,
  provider: LlmProvider,
  // "Activate this recording from the Knowledge base" (src/lib/recording-launch.ts):
  // the already-framed knowledgeContext text taken once per run and threaded
  // through every batch by discussion-draft-loop.ts's runDraftLoop. Added as
  // a NEW TRAILING parameter, after `provider`, deliberately - inserting it
  // anywhere earlier in this parameter list would have silently shifted
  // every existing 5-argument call site in this file's own test suite (over
  // two dozen of them) onto the wrong parameter, which is exactly the kind
  // of drift this repo's own wire-boundary tests exist to catch. Optional,
  // coerced below the same way `composition` is - never trusted as-is, since
  // it arrives from the client over the Server Action wire.
  knowledgeContext?: string
): Promise<{ replies: Array<{ id: string; reply: string; concepts?: string[] }> } | { error: string }> {
  try {
    const user = await requireOwner();

    if (posts.length === 0) return { error: "No posts to reply to." };
    if (posts.length > DRAFT_BATCH_SIZE) return { error: "Too many posts in one batch." };

    // getWritingStyleBlock already never throws (returns "" on any failure) -
    // no extra try/catch needed here, the builder simply drops it via
    // .filter(Boolean) when empty.
    const styleBlock = await getWritingStyleBlock(user.id);

    const safeComposition = coerceCompositionAtBoundary(composition);
    const safeKnowledgeContext = coerceKnowledgeContextAtBoundary(knowledgeContext);

    const prompt = buildReplyDraftingPrompt(posts, audience, courseName, styleBlock, safeComposition, safeKnowledgeContext);
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

    const raw = parseLenientJsonArray(r.text) as
      | Array<{ post?: unknown; reply?: unknown; concepts?: unknown }>
      | null;
    if (!raw) return { error: "Could not read the drafted replies from the model output." };

    // F2: a model can return the same positional index twice (e.g. two
    // elements both carrying "post": 2). Left undeduped, both map to the
    // SAME row and the other row is silently missing from the mapping even
    // though the batch "looked" complete - the mapping must be one-to-one by
    // construction, so only the FIRST occurrence of each index is kept.
    const seenPositions = new Set<number>();
    const byPosition = raw.filter(
      (r2): r2 is { post: number; reply: string; concepts?: unknown } => {
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

    // docs/reply-resource-concepts-acceptance-criteria.md RC2b/RC2c: parses
    // whatever "concepts" the model returned (RC2, dependency-free and
    // lenient), then drops any term that redacts to NO LETTERS at all under
    // this post's own author - "Isaac Newton" under that author redacts to
    // "", "Newton's" to "'s" (no letters survive either), so a chip never
    // names a term the search will not actually send. A mangled-but-lettered
    // term ("Newton's laws" under Isaac Newton, which still contains
    // "laws") is KEPT here exactly as the model wrote it - full redaction of
    // the SURVIVING term happens later, at search time
    // (resourceQueryForRow, group B), not here. `concepts` is emitted only
    // when non-empty; absent stays absent (mirrors postedAt above).
    //
    // parseReplyConcepts is called with `max: 6`, not its own default of 3 -
    // the FINAL cap to 3 happens here, AFTER the author-name drop, so the
    // worked example in the AC holds: under author Isaac Newton,
    // ["Isaac Newton", "a", "b", "c"] must yield ["a", "b", "c"], which
    // needs "c" to still be in the candidate list when the author-name term
    // is dropped - capping to 3 before that drop would have silently
    // discarded it. 6 is a generous cushion (twice the eventual cap) for a
    // model that returns more than the requested 1-3 terms.
    function withConcepts(
      id: string,
      reply: string,
      rawConcepts: unknown,
      author: string
    ): { id: string; reply: string; concepts?: string[] } {
      const concepts = parseReplyConcepts(rawConcepts, 6)
        .filter((term) => /\p{L}/u.test(redactAuthorNameFromText(term, author)))
        .slice(0, 3);
      return concepts.length > 0 ? { id, reply, concepts } : { id, reply };
    }

    let replies: Array<{ id: string; reply: string; concepts?: string[] }>;
    if (byPosition.length > 0) {
      replies = byPosition.map((r2) =>
        withConcepts(posts[r2.post - 1].id, r2.reply.trim(), r2.concepts, posts[r2.post - 1].author)
      );
    } else if (raw.length === posts.length) {
      // Belt and braces: the array came back the right length but no element
      // carried a usable "post" index - fall back to positional order rather
      // than failing the whole batch (DRAFT_BATCH_SIZE is only 5, so this is
      // cheap and rescues the common near-miss).
      replies = raw
        .map((r2, i) =>
          typeof r2.reply === "string" && r2.reply.trim()
            ? withConcepts(posts[i].id, r2.reply.trim(), r2.concepts, posts[i].author)
            : null
        )
        .filter((r2): r2 is { id: string; reply: string; concepts?: string[] } => r2 !== null);
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
 * The "eligible resource kinds" setting (discussion-persisted-controls.ts's
 * `resourceKinds`): narrows REPLY_RESOURCE_PROFILE's five-way default down to
 * whatever the instructor left checked. `undefined` (the setting was never
 * threaded through - every pre-existing call site in this file's own test
 * suite) means "no override", not "search nothing" - it resolves to the full
 * RESOURCE_KINDS list, byte-identical to today. An explicit EMPTY array is a
 * real, legal, different state (mirrors C2c's "zero ingredients selected" -
 * an instructor who deliberately unchecks every kind gets no resources
 * searched at all, not a silent revert to the default five) - handled by its
 * own early return in gatherReplyResourcesAction below, before this function
 * is ever reached. Always filters FROM RESOURCE_KINDS (never restates the
 * five kinds as a fresh literal) so this can never select a kind
 * coerceResourceKind would not itself recognize (R2's own rule, extended to
 * this setting).
 */
function effectiveResourceKinds(resourceKinds?: readonly ResourceKind[]): readonly ResourceKind[] {
  if (!resourceKinds || resourceKinds.length === 0) return RESOURCE_KINDS;
  const allowed = new Set(resourceKinds);
  return RESOURCE_KINDS.filter((k) => allowed.has(k));
}

/** Y8: `{ kind, text, counts }` for a post whose search returned NO resources
 *  at all. Callers only reach this for a post with a REAL (non-empty)
 *  concept - an empty-concept post gets no outcome at all (see the two call
 *  sites above), so `co` is `undefined` here only when that non-empty
 *  concept was dropped past MAX_CONCEPTS_PER_RUN's bound, which is precisely
 *  the "unknown (no entry)" case the AC names. */
function resourceSearchOutcomeFor(co: ConceptOutcome | undefined): ResourceSearchOutcome {
  if (!co) {
    return {
      kind: "unknown",
      text: "No links came back for these terms.",
      counts: ZERO_RESOURCE_SEARCH_COUNTS,
    };
  }
  const { concept: _concept, failed: _failed, ...counts } = co;
  let kind: ResourceSearchOutcomeKind;
  if (co.failed !== undefined) kind = "failed";
  else if (counts.sources === 0) kind = "no-sources";
  else if (counts.candidates === 0) kind = "no-candidates";
  else if (counts.kept === 0) kind = "all-dropped";
  // kept > 0 but this post still has no resources: every kept link for this
  // concept was a kind the instructor deselected, dropped by THIS action's
  // own result-side filter (see `allowedKinds` below) - not anything Group A
  // itself could have reported a reason for.
  else kind = "unknown";
  return { kind, text: resourceSearchOutcomeText(kind, counts, co.failed), counts };
}

/** Y8: the first sentence of a thrown-error message, clamped to 60
 *  characters - never the whole (potentially long, multi-sentence) message,
 *  so `The search failed: {reason}` always stays under the AC's 90-character
 *  budget for every outcome sentence. */
function clampFailedReason(failed: string): string {
  const match = failed.match(/^[^.!?]*[.!?]?/);
  const sentence = match ? match[0] : failed;
  return sentence.length > 60 ? sentence.slice(0, 60) : sentence;
}

/** Y8: the exact, frozen sentence for each outcome kind - each one under 90
 *  characters, "Search for resources" matching the row button's exact label.
 *  `counts` decides the two `all-dropped` variants and the `unknown` variant;
 *  `failedReason` is used only for `kind === "failed"`. */
function resourceSearchOutcomeText(
  kind: ResourceSearchOutcomeKind,
  counts: Pick<ResourceSearchCounts, "candidates" | "droppedUnreachable" | "droppedUncorroborated" | "kept">,
  failedReason?: string
): string {
  switch (kind) {
    case "failed":
      return `The search failed: ${clampFailedReason(failedReason ?? "")}`;
    case "no-sources":
      return "No web pages came back this time. Search for resources again - it usually works.";
    case "no-candidates":
      return "Pages were searched, but none matched these terms. Editing the reply changes the terms.";
    case "all-dropped":
      // A concept whose candidates were ALL placeholders (droppedPlaceholder
      // === candidates, both other drop counts 0) must not read as "did not
      // open" - that sentence requires at least one actual unreachable drop;
      // otherwise (including the 0/0 placeholder-only case) it is "none
      // traced back to a real site", which is true whenever nothing was ever
      // corroborated or fetched.
      return counts.droppedUnreachable > 0 && counts.droppedUnreachable >= counts.droppedUncorroborated
        ? `Found ${counts.candidates} links, but the pages did not open. Search for resources again.`
        : `Found ${counts.candidates} links, but none traced back to a real site. Editing the reply changes the terms.`;
    case "unknown":
      // `kept > 0` means links WERE found for this concept but every one was
      // a resource kind the instructor deselected in Eligible resource kinds
      // (this action's own result-side filter, `allowedKinds` above) - a
      // different reason from "nothing was ever kept", which stays the
      // generic sentence.
      return counts.kept > 0
        ? "Links were found, but not in the resource kinds you picked in Eligible resource kinds."
        : "No links came back for these terms.";
  }
}

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
 *
 * BLOCKER 3: each post's `text` is redacted against its own `author` (see
 * `redactAuthorNameFromPost`, discussion-reply-redact.ts) BEFORE the concept
 * is derived/truncated - a post's own body can self-introduce the author by
 * name ("Hi everyone, I'm Maria...") even though no `author` FIELD is ever
 * folded into the concept string itself.
 */
export async function gatherReplyResourcesAction(
  // BLOCKER 3: `author` is a NEW optional field, deliberately trailing
  // `text` rather than replacing the two-field shape - every pre-existing
  // call site in this file's own test suite that omits it keeps compiling
  // and behaving exactly as before (no author to strip, same as an empty
  // one - see redactAuthorNameFromPost). The one production caller that
  // matters (useReplyResources.ts's drain, R6's automatic bulk path) now
  // supplies it from `ReplyRow.author`.
  posts: Array<{ id: string; text: string; author?: string }>,
  courseName: string,
  provider: LlmProvider,
  // Resource-controls feature: "eligible resource kinds" (undefined = no
  // override, the full RESOURCE_KINDS default - every pre-existing call site
  // stays byte-identical) and the "preferred video length" setting. Both NEW
  // TRAILING parameters, after `provider` - deliberately, mirroring
  // draftDiscussionRepliesAction's own `knowledgeContext` addition
  // (discussion-replies.ts/discussion-draft-loop.ts) so no existing 3-argument
  // call site in this file's own test suite shifts onto the wrong parameter.
  resourceKinds?: readonly ResourceKind[],
  videoLengthPreference?: { minMinutes?: number; maxMinutes?: number }
): Promise<
  | {
      resources: Array<{ id: string; resources: ReplyResource[]; outcome?: ResourceSearchOutcome }>;
      degraded: boolean;
    }
  | { error: string }
> {
  try {
    await requireOwner();

    if (posts.length > RESOURCE_BATCH_SIZE) return { error: "Too many posts in one batch." };

    // Eligible-kinds setting: an explicit EMPTY array is "search nothing" -
    // a real, legal state (mirrors C2c's "zero ingredients"), not a
    // malformed input to fall back from. Short-circuits before any call,
    // exactly like the embedded-provider branch just below and the
    // empty-concept branch further down - same shape, same reasoning: a
    // capability the instructor deliberately turned off is not a failure.
    if (resourceKinds && resourceKinds.length === 0) {
      return { resources: posts.map((p) => ({ id: p.id, resources: [] })), degraded: false };
    }

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

    // BLOCKER 3: redact BEFORE deriving/truncating the concept, not after -
    // `redactAuthorNameFromPost` does both steps (redact, then
    // deriveResourceConcept) as one leaf call, mirroring
    // `resourceQueryForRow`'s own ordering for the per-row path (RC4).
    const entries = posts
      .map((p) => ({ id: p.id, concept: redactAuthorNameFromPost(p.text, p.author) }))
      .filter((e) => e.concept.length > 0);

    if (entries.length === 0) {
      // Every post here has an empty concept, so none of them ever had
      // anything to search for - this mirrors the embedded-provider and
      // empty-kinds short-circuits above:
      // nothing was searched, so there is nothing to explain, and NO outcome
      // is set (not a zero-count "unknown" one, which would make the row
      // look like a real search came back empty and stay eligible for
      // `Find resources (N)` forever, Y13).
      return {
        resources: posts.map((p) => ({ id: p.id, resources: [] })),
        degraded: false,
      };
    }

    // Eligible-kinds setting, continued: `kinds` narrows the RESEARCH
    // request itself (it drives both the grounded call's own description of
    // what to look for and the structuring call's allowed-kind JSON schema -
    // see learning-resource-links.ts's ResourceProfile/kindSchemaAlternation/
    // kindDescriptionList) - but that is prompt-level guidance, not an
    // enforced filter: nothing there stops a model from returning a kind it
    // was not asked for anyway. So `kinds` is the SEARCH-side narrowing, and
    // the `allowedKinds.has(link.kind)` check further down (right before a
    // survivor becomes a ReplyResource) is the RESULT-side hard filter that
    // actually guarantees a deselected kind never reaches a reply - belt and
    // braces, deliberately, not either alone.
    const kinds = effectiveResourceKinds(resourceKinds);
    const guidance = videoLengthPreferenceSentence(videoLengthPreference);
    const profile: { kinds: readonly ResourceKind[]; resourceTypeSentence: string; extraGuidance?: string } = {
      kinds,
      resourceTypeSentence: REPLY_RESOURCE_PROFILE.resourceTypeSentence,
    };
    if (guidance) profile.extraGuidance = guidance;

    // Y8: dedupe concept STRINGS (trimmed - redactAuthorNameFromPost/
    // deriveResourceConcept already trim) before the call. Two posts can
    // legitimately truncate to the identical concept text (R4b); previously
    // both were sent to the reused action as separate entries, which fired
    // the LLM search pair TWICE for the same text. `Set` preserves
    // first-occurrence order, so the concepts array's order (and therefore
    // MAX_CONCEPTS_PER_RUN's bounding of it) is unaffected by the dedupe.
    const dedupedConcepts = Array.from(new Set(entries.map((e) => e.concept)));

    const result = await findResourceLinksForConceptsAction(
      dedupedConcepts,
      courseName,
      provider,
      undefined,
      profile
    );

    if ("error" in result) return { error: result.error };

    // RESULT-side hard filter (see the comment above `kinds` for why this is
    // needed even though the request already narrowed `profile.kinds`): a
    // deselected kind is dropped here regardless of what the model actually
    // returned, so unchecking a kind is guaranteed to change what comes back
    // - not merely likely to, if the model happens to comply.
    const allowedKinds = new Set(kinds);

    // Group survivors by concept STRING first (never by index - see this
    // function's own doc comment / R4b), then cap each group at 3 (R4f)
    // before it is read back for every post that shares the string.
    const linksByConcept = new Map<string, ReplyResource[]>();
    for (const link of result.links) {
      if (!allowedKinds.has(link.kind)) continue;
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

    // Y8: `perConcept` (Group A, Y5) is one entry per DEDUPED, bounded
    // concept in input order - keyed here by concept string, FIRST entry
    // wins per the AC (defensive; Group A's own contract already guarantees
    // at most one entry per string since dedupedConcepts feeds it).
    const perConceptByConcept = new Map<string, ConceptOutcome>();
    for (const co of result.perConcept) {
      if (!perConceptByConcept.has(co.concept)) perConceptByConcept.set(co.concept, co);
    }

    const resources = posts.map((p) => {
      const concept = conceptById.get(p.id);
      const group = concept ? linksByConcept.get(concept) : undefined;
      // R4f: at most 3 links per post, even though a shared concept's group
      // may hold more (a caller-side slice, not a parameter to the reused
      // action - MAX_ITEMS_PER_CONCEPT there is a private module constant).
      const list = group ? group.slice(0, 3).map((r) => ({ ...r })) : [];
      if (list.length > 0) return { id: p.id, resources: list };
      // `concept` is undefined exactly when THIS post's own derived concept
      // was empty (filtered out of `entries` above, so it never had a
      // `conceptById` entry) - nothing was ever searched for it, so it gets
      // no outcome at all, same reasoning as the entries.length === 0
      // short-circuit above for the all-empty case.
      if (!concept) return { id: p.id, resources: list };
      // Y8: outcome present exactly when this post's own resources came back
      // empty - looked up by CONCEPT STRING (never by index, R4b's own rule
      // extended to this lookup), so two posts sharing a concept share the
      // exact same outcome, same as they already share resources. `concept`
      // is non-empty here, so a missing `perConceptByConcept` entry means the
      // concept itself was real but dropped past MAX_CONCEPTS_PER_RUN's
      // bound - a search DID run for this batch, just not for this concept -
      // which is the "unknown (no entry)" case the AC still wants explained.
      const outcome = resourceSearchOutcomeFor(perConceptByConcept.get(concept));
      return { id: p.id, resources: list, outcome };
    });

    return { resources, degraded: result.degraded };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not find resources for these replies." };
  }
}
