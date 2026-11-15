"use server";

// Server actions for "announcement (and video script) from a recorded LMS
// walkthrough" (docs/announcement-from-walkthrough-acceptance-criteria.md).
// This is the drafting-path wiring wave 1 shipped as pure leaves only - see
// walkthrough-announcement-prompt.ts, walkthrough-script-prompt.ts,
// walkthrough-announcement-bounds.ts, announcement-outline.ts and
// announcement-exemplars.ts, all reused here, none rebuilt.
//
// A "use server" file may export only async functions (P14 of the
// acceptance document, confirmed against this repo's own build gate) - every
// request/response shape below is therefore a LOCAL, unexported interface.
// A caller still gets full type-checking on both ends: TypeScript infers an
// exported async function's parameter and return types structurally at the
// call site even when the named interface itself is not re-exported (the
// same reason draftAnnouncementAction's own JSON return shape is never named
// either).
//
// AUTH: every action below calls requireUser() explicitly, never
// requireOwner() - P14's other correction. requireOwner() is now a plain
// alias for requireUser() (any active account), and several older file
// headers still describe it as an owner gate; naming the real guard here
// keeps this file honest about what it actually checks.

import { createServiceClient } from "@/lib/supabase/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { requireUser } from "@/lib/supabase/auth";
import { callLlm, type LlmProvider } from "@/lib/llm";
import { getGeminiModel } from "@/lib/gemini";
import { jsonObjectSlice } from "@/lib/json-slice";
import { getWritingStyleBlock } from "./writing-style-block";
import {
  fnv1aHash,
  unattemptedLlmDiag,
  type ScriptGenerationLlmDiag,
} from "@/lib/lms-generation/generation-diag";
import { deriveAnnouncementOutline } from "@/lib/announcement-outline";
import { EMPTY_ANNOUNCEMENT_OUTLINE, type AnnouncementOutline } from "@/lib/announcement-outline-types";
import { buildWalkthroughAnnouncementPrompt, type AnnouncementTiming } from "@/lib/walkthrough-announcement-prompt";
import { walkthroughAnnouncementMaxOutputTokens } from "@/lib/walkthrough-announcement-bounds";
import { composeWalkthroughScriptPrompt } from "@/lib/walkthrough-script-prompt";
import { addedPromptLines, hasUnsupportedQuizContent } from "@/lib/walkthrough-quiz-evidence";
import { containsEmoji, isSingleEmoji } from "@/lib/announcement-emoji";
import { renderRichTemplate, validRichTemplate, richTemplatePlaceholders, richTemplateSlotsFromMap } from "@/lib/announcement-rich-template";
import { renderRichTree, richTreePlan, richTreeSlotsFromMap } from "@/lib/announcement-rich-tree";
import { projectRichTemplate } from "@/lib/walkthrough-rich-projection";
import { htmlToMarkdown, markdownToHtml } from "@/lib/markdown";
import { announcementStructurePlan, assembleAnnouncementSections, recoverAnnouncementSections, sectionsFromPlaceholderMap, plainPlaceholderFailure, normalizeAnnouncementEmoji, normalizeAnnouncementSectionText, validAnnouncementEmojiChoice, announcementSectionFailure, announcementContentSignature, announcementSectionBody, hasMeaningfulAnnouncementContent } from "@/lib/walkthrough-structured-announcement";
import { verifiedStyledAnnouncement } from "@/lib/walkthrough-styled-announcement";
import { applyWalkthroughFidelity } from "@/lib/walkthrough-announcement-fidelity";
import { possibleCrossActivityAttribution, preservesImplicatedActivityTerms } from "@/lib/walkthrough-attribution-review";
import { matchQuizDetailsBullets } from "@/lib/walkthrough-quiz-list";
import { collectPermittedUrls, stripUnpermittedUrls } from "@/lib/walkthrough-announcement-link-guard";
import {
  resourceSearchOutcomeFor,
  aggregateResourceOutcome,
  type ResourceSearchOutcome,
} from "@/lib/resource-search-outcome";
import { deriveResourceConcepts } from "./learning-resources-generator";
import { findResourceLinksForConceptsAction } from "./learning-resource-links";
import {
  listAnnouncementExemplars,
  getMostRecentAnnouncementExemplar,
  saveAnnouncementExemplar,
  deleteAnnouncementExemplar,
} from "@/lib/announcement-exemplars";
import { createAnnouncementFromMarkdown } from "@/lib/canvas";
import { createAnnouncementFromSafeHtml } from "@/lib/canvas/announcements";
import type { Json } from "@/lib/supabase/types";

// ── Exemplars (AC1, decision P3: Supabase, not localStorage) ───────────────

/** The client-facing shape of one saved exemplar - id/label/createdAt for
 * the picker, plus the DERIVED outline (never the raw exemplarText: P11
 * means a drafting call may only ever read the outline, and not returning
 * the raw text here at all is one less place that boundary could be
 * crossed by accident later). `exemplarPreview` is a short, UI-only excerpt
 * of the instructor's OWN pasted text, shown back to THEM so they can tell
 * two saved exemplars apart - never sent to a drafting prompt. */
interface AnnouncementExemplarSummary {
  id: string;
  label: string | null;
  createdAt: string;
  outline: AnnouncementOutline;
  exemplarPreview: string;
}

const EXEMPLAR_PREVIEW_CHARS = 140;

function coerceStoredOutline(raw: Json): AnnouncementOutline {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return EMPTY_ANNOUNCEMENT_OUTLINE;
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.sections)) return EMPTY_ANNOUNCEMENT_OUTLINE;
  // Every row here was written by saveAnnouncementExemplarAction below, via
  // deriveAnnouncementOutline - a real shape mismatch would mean a hand-
  // edited row or a future schema change, not a client attack, so a shallow
  // "does this look like an outline at all" check is enough; anything more
  // elaborate would be re-deriving deriveAnnouncementOutline's own contract
  // a second time in this file.
  return raw as unknown as AnnouncementOutline;
}

function toSummary(row: {
  id: string;
  label: string | null;
  createdAt: string;
  outline: Json;
  exemplarText: string;
}): AnnouncementExemplarSummary {
  return {
    id: row.id,
    label: row.label,
    createdAt: row.createdAt,
    outline: coerceStoredOutline(row.outline),
    exemplarPreview:
      row.exemplarText.length > EXEMPLAR_PREVIEW_CHARS
        ? `${row.exemplarText.slice(0, EXEMPLAR_PREVIEW_CHARS)}…`
        : row.exemplarText,
  };
}

/** AC1's own "most recent is the default": a dedicated, lightweight call
 * so the panel can default-select without first fetching every saved
 * exemplar - getMostRecentAnnouncementExemplar (announcement-exemplars.ts)
 * is exactly this single-row query (`order by created_at desc limit 1`),
 * shipped in wave 1 with no caller until this action reaches it. Browsing
 * OTHER saved exemplars is a separate, on-demand call
 * (listAnnouncementExemplarsAction below). */
export async function getMostRecentAnnouncementExemplarAction(
  courseId: string
): Promise<{ exemplar: AnnouncementExemplarSummary | null } | { error: string }> {
  try {
    const user = await requireUser();
    if (!courseId.trim()) return { exemplar: null };
    const supabase = createServiceClient();
    const row = await getMostRecentAnnouncementExemplar(supabase, user.id, courseId);
    return { exemplar: row ? toSummary(row) : null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load the most recent exemplar." };
  }
}

/** AC1: every exemplar saved for one course, newest first - "most recent is
 * the default" (AC1) is left for the CALLER to apply (index 0), matching
 * getMostRecentAnnouncementExemplar's own "derived, never stored" design
 * (announcement-exemplars.ts's header) rather than this action re-deciding
 * it. */
export async function listAnnouncementExemplarsAction(
  courseId: string
): Promise<{ exemplars: AnnouncementExemplarSummary[] } | { error: string }> {
  try {
    const user = await requireUser();
    if (!courseId.trim()) return { exemplars: [] };
    const supabase = createServiceClient();
    const rows = await listAnnouncementExemplars(supabase, user.id, courseId);
    return { exemplars: rows.map(toSummary) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load saved exemplars." };
  }
}

/**
 * AC1/AC2: save a pasted exemplar for reuse next time. The outline is
 * derived HERE, server-side, from the exemplar text this call receives -
 * never trusted as a client-supplied value - so the stored `outline` column
 * always matches what deriveAnnouncementOutline would produce for
 * `exemplarText`, the same invariant every other stored-derived-value table
 * in this app keeps (mapRecordingFile, mapGeneratedArtifact).
 */
export async function saveAnnouncementExemplarAction(
  courseId: string,
  exemplarText: string,
  label?: string
): Promise<{ exemplar: AnnouncementExemplarSummary } | { error: string }> {
  try {
    const user = await requireUser();
    if (!courseId.trim()) return { error: "Choose a course before saving an exemplar." };
    if (!exemplarText.trim()) return { error: "Paste an announcement to save as an exemplar first." };

    const outline = deriveAnnouncementOutline(exemplarText);
    const supabase = createServiceClient();
    const saved = await saveAnnouncementExemplar(supabase, user.id, {
      courseId,
      exemplarText,
      outline: outline as unknown as Json,
      label: label?.trim() || null,
    });

    return { exemplar: toSummary(saved) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save the exemplar." };
  }
}

/** Remove one of the CALLING USER's own saved exemplars. Filtered on the
 * server-derived user id inside deleteAnnouncementExemplar itself (P14) -
 * this action passes no other identifier that could reassign or affect
 * another user's row. */
export async function deleteAnnouncementExemplarAction(id: string): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireUser();
    if (!id.trim()) return { error: "Nothing to remove." };
    const supabase = createServiceClient();
    await deleteAnnouncementExemplar(supabase, user.id, id);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not remove that exemplar." };
  }
}

// ── Research (Ruling 2/8/19/21) ─────────────────────────────────────────────

/**
 * The per-slot research result (G3 Ask 3). A local, unexported type - this
 * is a "use server" file, so only async functions may be exported (see this
 * file's own header); a caller still gets full structural type-checking on
 * this shape at the call site, exactly as WalkthroughAnnouncementDraftInput
 * below already relies on.
 *
 * `"off"` - the research toggle was off; `"found"` - real, reachability-
 * checked links came back; `"empty"` - the search ran (or the concept step
 * ran) and came back with nothing, with the FULL ResourceSearchOutcome
 * carried through (Ruling 14: "thread the real inputs... or the implementer
 * will invent parallel prose", since resourceSearchOutcomeText's own prose
 * needs `counts`, not just a kind); `"failed"` - a transport/LLM failure at
 * either the concept-derivation step or the resource-search step (Ruling 19/
 * 21: a transport failure must never read as "found nothing"). `reason` is
 * an internal diagnostic string and is NEVER shown to the user raw (see
 * researchNoticeFor below) - only its presence, not its content, crosses
 * into user-facing text.
 */
type ResourceOutcome =
  | { kind: "off" }
  | { kind: "found"; links: readonly { title: string; url: string }[] }
  | { kind: "empty"; outcome: ResourceSearchOutcome }
  | { kind: "failed"; reason: string };

/**
 * The user-facing notice derived from a ResourceOutcome (Ruling 5/14): "off",
 * "found", "ran and found nothing", and "failed" (timeout or error) must be
 * distinguishable to the instructor - a silently unwired toggle is
 * indistinguishable from a broken one. `text` on the "failed" branch is a
 * FIXED, non-raw string (never ResourceOutcome's own `reason`, which may
 * carry a raw transport/LLM error message - see draftWalkthroughAnnouncementAction's
 * own diag redaction argument for why raw failure text never reaches the
 * user directly).
 */
type ResearchNotice =
  | { kind: "off" }
  | { kind: "found"; text: string }
  | { kind: "empty"; text: string }
  | { kind: "failed"; text: string };

function researchNoticeFor(outcome: ResourceOutcome): ResearchNotice {
  switch (outcome.kind) {
    case "off":
      return { kind: "off" };
    case "found": {
      const n = outcome.links.length;
      return {
        kind: "found",
        text: `Found ${n} resource link${n === 1 ? "" : "s"} and added ${n === 1 ? "it" : "them"} to the draft.`,
      };
    }
    case "empty":
      // resourceSearchOutcomeFor/aggregateResourceOutcome (resource-search-
      // outcome.ts, Ruling 15's accepted home for this vocabulary) already
      // computed `.text` from the real `counts` - reused here verbatim
      // rather than re-deriving parallel prose (Ruling 14).
      return { kind: "empty", text: outcome.outcome.text };
    case "failed":
      return { kind: "failed", text: "Could not research resources for this announcement." };
  }
}

/**
 * Gathers real, reachability-checked resource links for one walkthrough
 * slot (G3 Ask 3) - a port of the shipped gatherReplyResourcesAction's shape
 * (discussion-replies.ts), not a new build (Ruling 8): derive a small
 * concept list from the materials, then reuse
 * findResourceLinksForConceptsAction's own grounded-search pipeline.
 *
 * findResourceLinksForConceptsAction NEVER REJECTS (Ruling 8) - it resolves
 * `{ error: string }` on failure, so `"error" in result` is checked FIRST,
 * with a try/catch as the outer belt only (matching useReplyResources.ts's
 * own shape). deriveResourceConcepts likewise never throws; its `{ ok:
 * false, error }` branch is a transport/LLM failure and is routed to
 * `"failed"`, never `"empty"` (Ruling 19/21) - collapsing the two would tell
 * the instructor "no links came back for these terms" when the search never
 * even ran.
 */
export async function gatherWalkthroughResourcesAction(
  materialsText: string,
  courseLabel: string,
  provider: LlmProvider
): Promise<ResourceOutcome> {
  try {
    await requireUser();

    const conceptResult = await deriveResourceConcepts(materialsText, provider);
    if (!conceptResult.ok) return { kind: "failed", reason: conceptResult.error };
    if (conceptResult.concepts.length === 0) {
      return { kind: "empty", outcome: resourceSearchOutcomeFor(undefined) };
    }

    const result = await findResourceLinksForConceptsAction(
      conceptResult.concepts.map((c) => c.concept),
      courseLabel,
      provider
    );
    if ("error" in result) return { kind: "failed", reason: result.error };
    if (result.links.length === 0) {
      return { kind: "empty", outcome: aggregateResourceOutcome(result.perConcept) };
    }
    return { kind: "found", links: result.links.map((l) => ({ title: l.title, url: l.url })) };
  } catch (err) {
    return { kind: "failed", reason: err instanceof Error ? err.message : "Could not research resources." };
  }
}

// ── Drafting (AC2-AC8, decisions P1/P7/P11) ─────────────────────────────────

export interface WalkthroughAnnouncementDraftInput {
  courseLabel: string;
  moduleLabel: string | null;
  /** The reduced walkthrough materials text (module-deck-capture/module-
   * blocks.ts's reduceCaptureToMaterials output) - the ONLY carrier of what
   * was actually captured. */
  materialsText: string;
  /** The exemplar's DERIVED outline (AC2) - never its raw text (P11). Pass
   * EMPTY_ANNOUNCEMENT_OUTLINE when no exemplar was pasted or picked. */
  outline: AnnouncementOutline;
  matchExample?: boolean;
  /** Pre-rendered by the caller via renderWalkthroughCoverageBlock
   * (walkthrough-announcement-coverage.ts) from the same joined blocks
   * reduceCaptureToMaterials returned - "" when there is nothing to name. */
  coverageBlock: string;
  /** Free-text notes entered before capture (AC3). */
  notes: string;
  provider?: LlmProvider;
  /**
   * Ruling 11: REQUIRED, not optional - an optional field lets a caller omit
   * it with every gate green (the dead-control failure mode this chunk
   * exists to close). "requested" asks the model to use emojis in the
   * drafted announcement; "forbidden" matches every other announcement
   * drafter in this app.
   *
   * G3 wave 3 closed the wave-boundary gap this comment used to describe:
   * buildWalkthroughAnnouncementPrompt (walkthrough-announcement-prompt.ts)
   * now has an emojiPolicy parameter (Ruling 12), and this field is forwarded
   * into it below.
   */
  emojiPolicy: "requested" | "forbidden";
  /**
   * Ruling 11/2: the resources gatherWalkthroughResourcesAction found for
   * this slot (its `"found"` outcome's links, or `[]` otherwise) - the RAW
   * list, unfiltered by the permitted-URL enforcer below. The enforcer's own
   * permitted set already includes this list by construction (a researched
   * link is always permitted to be cited), so pre-filtering it here would be
   * circular.
   *
   * G3 wave 3: also forwarded into buildWalkthroughAnnouncementPrompt below
   * (Ruling 12), in addition to its use here as an input to the
   * permitted-URL enforcer (Ruling 2: the enforcer runs inside this action,
   * the only site that sees every carrier).
   */
  researchedResources: readonly { title: string; url: string }[];
  /**
   * Ruling 14/2b: the full research outcome for this slot, carried through
   * so `researchNotice` (below) can be computed from real counts rather than
   * invented prose.
   */
  researchOutcome: ResourceOutcome;
  /** A19: which of the two tones (docs/a19-scope.md) this draft should use -
   * REQUIRED, same reasoning as emojiPolicy above. Forwarded into
   * buildWalkthroughAnnouncementPrompt below. */
  timing: AnnouncementTiming;
  revision?: { editedDraft: { title: string; message: string }; revisionNote: string };
  /** Exact instructor-reviewed provider prompt, if supplied. */
  promptOverride?: string;
  promptPreparedFor?: string;
  promptSignature?: string;
  promptContextSignature?: string;
}

function composeProviderPrompt(input: WalkthroughAnnouncementDraftInput, styleBlock: string): string {
  const bodyInstruction = buildWalkthroughAnnouncementPrompt({
    courseLabel: input.courseLabel,
    moduleLabel: input.moduleLabel,
    materialsText: input.materialsText,
    outline: input.matchExample ? { ...input.outline, sections: announcementStructurePlan(input.outline).slice(0, -1) } : input.outline,
    matchExample: input.matchExample,
    coverageBlock: input.coverageBlock,
    notes: input.notes,
    styleBlock,
    // G3 wave 3 (walkthrough-announcement-prompt.ts): the wave-boundary
    // gap this file's own header comments named for emojiPolicy and
    // researchedResources - both parameters now exist on the composer, so
    // both fields (already REQUIRED on this action's own input type per
    // Ruling 11) are forwarded here instead of silently reaching this
    // action and going nowhere.
    emojiPolicy: input.emojiPolicy,
    researchedResources: input.researchedResources,
    // A19: forwards the caller's chosen tone into the composer (AC-6/AC-7).
    timing: input.timing,
    revision: input.revision,
  });

  return [
    "You are an instructor writing a course announcement for students.",
    bodyInstruction,
    input.matchExample && richTreePlan(input.outline.richTree) ? [
      "Return ONLY valid JSON with title and placeholders, a flat object mapping IDs to current text.",
      'Shape example only; use only IDs present in the layout: {"title":"Current update","placeholders":{"s0":"Current information","extra_0":"Additional current information"}}',
      `The content-free layout is ${JSON.stringify(richTreePlan(input.outline.richTree)!.shape)}. Use key s followed by the slot number.`,
      "Fill every slot in an included top-level branch; omit unsupported branches. Keep Markdown links within one value. Never reuse example facts. Put additional supported paragraphs in optional extra_0 through extra_39 keys, in order. Do not return any other fields.",
      input.emojiPolicy === "requested" ? "Slots marked emoji accept one selected emoji; do not put emoji in other slots." : "Omit slots marked emoji; do not put emoji in other slots.",
    ].join("\n") : input.matchExample && validRichTemplate(input.outline.richTemplate) ? [
      "Return ONLY valid JSON with title and placeholders, where placeholders is an object mapping placeholder IDs to current text. Generate content once.",
      'Shape example only; use only IDs present in the layout: {"title":"Current update","placeholders":{"b0_e0_r0":"Current information","extra_0":"Additional current information"}}',
      `The content-free blocks and grouped placeholder IDs are: ${JSON.stringify(input.outline.richTemplate.blocks.map((block, index) => ({ kind: block.tag, entries: richTemplatePlaceholders(input.outline.richTemplate!)[index].map((entry, e) => entry.map((id, r) => ({ id, kind: block.entries[e].runs[r].emoji ? "emoji" : "text" }))) })))}.`,
      "Fill every ID in an included entry; omit unsupported blocks. Within a list block include a consecutive prefix of entries, with no gaps. Keep each Markdown link entirely within one placeholder. Never use example facts or invent facts to fill a block. Put additional supported paragraphs in optional extra_0 through extra_39 keys, in order. Do not return any other fields.",
      input.emojiPolicy === "requested" ? "For each emoji placeholder choose one relevant emoji; do not put emoji in text placeholders." : "Omit emoji placeholders and do not put emoji in text placeholders.",
    ].join("\n") : input.matchExample ? [
      "Return ONLY JSON with title and placeholders, a flat map of IDs to current text. No other fields.",
      '{"title":"Current update","placeholders":{"s1_p0":"Current information"}}',
      `The section positions and shapes are ${JSON.stringify(announcementStructurePlan(input.outline))}.`,
      "For section N, use sN_p0, sN_p1 and so on for paragraphs; sN_i0, sN_i1 and so on for list items. Number each kind consecutively from zero without gaps. For a heading with no canonical heading use sN_heading. Omit sections unsupported by current materials. The last section is optional extra prose. Keep each value one line, and do not include Markdown block prefixes.",
      input.emojiPolicy === "requested" ? "For each saved emoji position, use sN_emoji0, sN_emoji1 and so on in its listed order; each value is one selected emoji. Do not put emoji in text values." : "Do not include emoji.",
      "Use only current materials for facts. Never reuse example facts or invent facts to fill placeholders.",
    ].join("\n") : [
      "Return ONLY valid JSON:",
      "{",
      '  "title": "...",',
      '  "message": "..."',
      "}",
      "",
      "Requirements:",
      '- "title": a short, specific subject line (no more than ~10 words). Plain text, no markdown.',
      '- "message": the announcement body itself, formatted exactly as instructed above (Markdown headings/lists where the outline calls for them, and Markdown bold/italic emphasis per the EMPHASIS instruction above).',
      "- Do not include any text outside the JSON object.",
    ].join("\n"),
  ].join("\n\n");
}

/** Prepare the exact provider input for instructor review after slot research. */
function promptSignature(prompt: string, userId: string): string | undefined {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return key ? createHmac("sha256", key).update("walkthrough-prompt-v1\0").update(userId).update("\0").update(prompt).digest("hex") : undefined;
}
function hasValidPromptSignature(prompt: string, userId: string, signature: string | undefined): boolean {
  const expected = promptSignature(prompt, userId);
  if (!expected || !signature || !/^[0-9a-f]{64}$/.test(signature)) return false;
  return timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"));
}
function canonicalPromptContext(input: WalkthroughAnnouncementDraftInput): string {
  const { promptOverride: _override, promptPreparedFor: _owner, promptSignature: _signature, promptContextSignature: _context, ...context } = input;
  const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, canonical(entry)])) : value;
  return JSON.stringify(canonical(context));
}
function contextSignature(input: WalkthroughAnnouncementDraftInput, userId: string, expires: number, prompt: string): string | undefined {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return key ? `${expires}.${createHmac("sha256", key).update("walkthrough-context-v2\0").update(userId).update("\0").update(String(expires)).update("\0").update(prompt).update("\0").update(canonicalPromptContext(input)).digest("hex")}` : undefined;
}
function hasValidContextSignature(input: WalkthroughAnnouncementDraftInput, userId: string): boolean {
  const token = input.promptContextSignature;
  if (!token || !/^\d{13}\.[0-9a-f]{64}$/.test(token)) return false;
  const expires = Number(token.slice(0, 13));
  if (!Number.isSafeInteger(expires) || expires < Date.now() || expires > Date.now() + 30 * 60_000) return false;
  if (input.promptOverride === undefined) return false;
  const expected = contextSignature(input, userId, expires, input.promptOverride);
  return !!expected && timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}
export async function prepareWalkthroughAnnouncementPromptAction(input: WalkthroughAnnouncementDraftInput): Promise<{ prompt: string; preparedFor: string; promptSignature?: string; promptContextSignature?: string } | { error: string }> {
  try {
    const user = await requireUser();
    if (!input.materialsText.trim()) return { error: "No captured material is available. Capture a walkthrough first." };
    const prompt = composeProviderPrompt(input, await getWritingStyleBlock(user.id));
    return { prompt, preparedFor: user.id, promptSignature: promptSignature(prompt, user.id), promptContextSignature: contextSignature(input, user.id, Date.now() + 30 * 60_000, prompt) };
  } catch { return { error: "Could not prepare the announcement prompt. Try again." }; }
}

/**
 * Drafts the announcement itself. Returns the body as MARKDOWN text (P1) -
 * never HTML - so the caller can still show and edit it as plain text before
 * posting; posting is a SEPARATE action (postWalkthroughAnnouncementAction
 * below) that converts it via markdownToHtml at the last possible moment,
 * exactly once, right before the Canvas write.
 *
 * The `diag` field on both branches (success AND failure) mirrors
 * generateModuleIntroScriptAction's own ScriptGenerationLlmDiag shape
 * (src/app/actions/media.ts / src/lib/lms-generation/generation-diag.ts)
 * rather than inventing a sixth diagnostic shape for this feature - P7's
 * whole point is that an output-budget failure "looks like nothing"
 * (thinking tokens can consume the entire budget and yield an EMPTY string
 * with ok:true), so the token budget actually used, the finish reason, and
 * the returned text's LENGTH (never its content - see that file's own
 * redaction argument) are always reported, on the failure path too, rather
 * than only reconstructable by reading server logs nobody is watching.
 */
export async function draftWalkthroughAnnouncementAction(
  input: WalkthroughAnnouncementDraftInput
): Promise<
  ({ title: string; message: string; researchNotice: ResearchNotice; richHtml?: string; richExtraNotice?: boolean; formatFallback?: boolean; attributionWarning?: boolean; attributionSuggestion?: { title: string; message: string; richHtml?: string } } | { error: string }) & {
    diag: ScriptGenerationLlmDiag;
  }
> { return draftWalkthroughAnnouncementAttempt(input, false); }

async function draftWalkthroughAnnouncementAttempt(input: WalkthroughAnnouncementDraftInput, attributionRepair: boolean): ReturnType<typeof draftWalkthroughAnnouncementAction> {
  const provider: LlmProvider = input.provider ?? "gemini";
  try {
    const user = await requireUser();
    if (!input.materialsText.trim()) {
      return { error: "Nothing was captured yet - capture a walkthrough first.", diag: unattemptedLlmDiag(provider) };
    }

    const styleBlock = await getWritingStyleBlock(user.id);
    if (input.promptOverride !== undefined && input.promptPreparedFor !== user.id) {
      return { error: "Your account changed. Prepare the prompt again.", diag: unattemptedLlmDiag(provider) };
    }
    if (input.promptOverride !== undefined && (!input.promptOverride.trim() || input.promptOverride.length > 160000)) {
      return { error: "The prompt must contain text and be at most 160,000 characters.", diag: unattemptedLlmDiag(provider) };
    }
    const defaultPrompt = composeProviderPrompt(input, styleBlock);
    const reviewedPrompt = input.promptOverride ?? defaultPrompt;
    const prompt = attributionRepair ? `${reviewedPrompt}\n\nCORRECTION: The previous draft may have combined instructions or optional status from distinct captured activities. Re-read each captured section separately. Keep each activity and its own submission and optionality details distinct; include all supported activities. Return the same requested output format.` : reviewedPrompt;
    const signedPrompt = input.promptOverride !== undefined && hasValidPromptSignature(input.promptOverride, user.id, input.promptSignature);
    if (signedPrompt && !hasValidContextSignature(input, user.id)) return { error: "The reviewed prompt has expired or its inputs changed. Prepare it again.", diag: unattemptedLlmDiag(provider) };
    const useDefaultPrompt = input.promptOverride === undefined || input.promptOverride === defaultPrompt || signedPrompt;

    // THE COMPUTED TOKEN BUDGET (P7) - sized from the outline, never a fixed
    // 1024 (draftAnnouncementAction's own budget, deliberately not
    // inherited - see walkthrough-announcement-bounds.ts's header).
    const tokenBudget = input.matchExample && useDefaultPrompt
      ? Math.min(8192, walkthroughAnnouncementMaxOutputTokens(input.outline) * 2)
      : walkthroughAnnouncementMaxOutputTokens(input.outline);
    const config = { temperature: 0.5, maxOutputTokens: tokenBudget, ...(input.matchExample && useDefaultPrompt ? { responseMimeType: "application/json" } : {}) };
    let r = await callLlm(
      { contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: config },
      provider
    );

    if (r.ok && input.matchExample && useDefaultPrompt && !attributionRepair && !r.text.trim()) {
      console.warn("Walkthrough draft response empty; retrying once");
      r = await callLlm({ contents: [{ role: "user", parts: [{ text: `${prompt}\n\nReturn a complete JSON object with a nonempty title and the requested placeholders object. Do not return a partial object or prose outside JSON.` }] }], generationConfig: config }, provider);
    }

    const diagBase = {
      attempted: true as const,
      provider,
      model: provider === "gemini" ? getGeminiModel() : undefined,
      tokenBudget,
      promptLength: prompt.length,
      promptHash: fnv1aHash(prompt),
      styleBlockLength: styleBlock.length,
      ok: r.ok,
      finishReason: r.ok ? r.finishReason : undefined,
      textLength: r.ok ? r.text.length : 0,
      failureBodyRedacted: undefined,
    };

    if (!r.ok) return { error: `Draft failed (HTTP ${r.status}). Try again.`, diag: diagBase };
    if (!r.text.trim()) return { error: "The model returned no announcement. Try again.", diag: diagBase };

    const jsonText = jsonObjectSlice(r.text);
    if (!jsonText) return { error: "Could not parse the draft from the model response.", diag: diagBase };

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText) as unknown;
    } catch {
      return { error: "Could not parse the draft from the model response.", diag: diagBase };
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) ||
      !("title" in parsed) || typeof parsed.title !== "string" ||
      ("message" in parsed && typeof parsed.message !== "string")) {
      return { error: "Could not parse the draft from the model response.", diag: diagBase };
    }
    if (input.matchExample && useDefaultPrompt && !("placeholders" in parsed) && !("message" in parsed) && !("sections" in parsed) && !("richSlots" in parsed)) {
      const entries = Object.entries(parsed).filter(([key]) => key !== "title");
      if (entries.length && entries.every(([key, value]) => /^(?:s\d+_(?:heading|p\d+|i\d+|emoji\d+)|b\d+_e\d+_r\d+|s\d+|extra_\d+)$/.test(key) && typeof value === "string")) {
        parsed = { title: parsed.title, placeholders: Object.fromEntries(entries) };
      }
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || !("title" in parsed) || typeof parsed.title !== "string") return { error: "Could not parse the draft from the model response.", diag: diagBase };
    const title = parsed.title.trim();
    const message = "message" in parsed && typeof parsed.message === "string" ? parsed.message.trim() : "";
    if (!title || (!message && !(input.matchExample && useDefaultPrompt && ("sections" in parsed || "richSlots" in parsed || "placeholders" in parsed)))) {
      console.warn("Walkthrough draft validation", !title ? "missing-title" : !input.matchExample ? "missing-body-no-template" : !useDefaultPrompt ? "missing-body-custom-prompt" : "missing-template-content");
      if (title && !message && input.matchExample && useDefaultPrompt) console.warn("Walkthrough draft shape", Object.keys(parsed).length === 1 ? "title-only" : Object.keys(parsed).some(key => /^(?:s\d+_(?:heading|p\d+|i\d+|emoji\d+)|b\d+_e\d+_r\d+|s\d+|extra_\d+)$/.test(key)) ? "top-level-placeholder-keys" : "other-fields");
      return { error: "Generated announcement is empty. Try again.", diag: diagBase };
    }

    // Ruling 2: the permitted-URL enforcer runs HERE, inside the draft
    // action - the only site that already sees every carrier (course/module
    // label, materials text, the outline's own heading strings, the coverage
    // block, notes, the writing-style sample, and the researched-resource
    // links). Ruling 20: the enforcer never rewrites text it did not decide
    // to strip - it returns the model's own message with per-match splices
    // only, so this is not a post-processing pass over the whole document.
    const permitted = collectPermittedUrls({
      courseLabel: input.courseLabel,
      moduleLabel: input.moduleLabel,
      materialsText: input.materialsText,
      outline: input.outline,
      coverageBlock: input.coverageBlock,
      notes: `${input.notes}\n${input.promptOverride ?? ""}`,
      styleBlock,
      researchedResources: input.researchedResources,
    });
    const { text: permittedMessage } = stripUnpermittedUrls(message, permitted);
    let structuredMessage = permittedMessage;
    let formatFallback = false;
    let singleSourceRich: string | null = null;
    const treePlan = richTreePlan(input.outline.richTree);
    if (input.matchExample && useDefaultPrompt) {
      if (Object.keys(parsed).some(key => !["title", "message", "sections", "richSlots", "treeSlots", "treeExtra", "extra", "placeholders"].includes(key))) return { error: "The draft contained content outside its sections. Try again.", diag: diagBase };
      if (containsEmoji(title)) return { error: "The draft title included an unsupported emoji. Try again.", diag: diagBase };
      const slotsOnly = !message && !("sections" in parsed) && ((validRichTemplate(input.outline.richTemplate) && "richSlots" in parsed && Array.isArray(parsed.richSlots)) || (!!treePlan || validRichTemplate(input.outline.richTemplate)) && "placeholders" in parsed);
      const plainMap = !slotsOnly && !message && !("sections" in parsed) && "placeholders" in parsed && !treePlan && !validRichTemplate(input.outline.richTemplate);
      if (!slotsOnly && !plainMap && ("extra" in parsed || "placeholders" in parsed)) return { error: "The draft contained content outside its sections. Try again.", diag: diagBase };
      if (plainMap && Object.keys(parsed).some(key => !["title", "placeholders"].includes(key))) return { error: "The draft contained content outside its sections. Try again.", diag: diagBase };
      if (slotsOnly) {
        if (Object.keys(parsed).some(key => !["title", "richSlots", "placeholders", "extra"].includes(key)) || ("richSlots" in parsed && "placeholders" in parsed)) return { error: "The draft contained content outside its formatting slots. Try again.", diag: diagBase };
        const placeholderMap = "placeholders" in parsed && parsed.placeholders && typeof parsed.placeholders === "object" && !Array.isArray(parsed.placeholders) ? parsed.placeholders as Record<string, unknown> : null;
        const extraKeys = placeholderMap ? Object.keys(placeholderMap).filter(key => /^extra_(?:[0-9]|[1-3][0-9])$/.test(key)).sort((a, b) => Number(a.slice(6)) - Number(b.slice(6))) : [];
        if (extraKeys.some((key, index) => key !== `extra_${index}`)) return { error: "The draft contained invalid additional content. Try again.", diag: diagBase };
        const extra = "extra" in parsed ? parsed.extra : extraKeys.map(key => placeholderMap![key]);
        if ("extra" in parsed && extraKeys.length) return { error: "The draft contained duplicate additional content. Try again.", diag: diagBase };
        if (!Array.isArray(extra) || extra.length > 40 || !extra.every(value => typeof value === "string" && value.trim() && value.length <= 8000 && !/[\r\n]/.test(value))) return { error: "The draft contained invalid additional content. Try again.", diag: diagBase };
        const contentMap = placeholderMap && Object.fromEntries(Object.entries(placeholderMap).filter(([key]) => !extraKeys.includes(key)));
        if (treePlan && "placeholders" in parsed) {
          const treeSlots = richTreeSlotsFromMap(input.outline.richTree, contentMap);
          const invalidEmoji = treeSlots?.find(slot => treePlan.emojiSlots.includes(slot.slot) && !isSingleEmoji(slot.text) && !(input.emojiPolicy !== "requested" && !slot.text.trim()));
          if (!treeSlots || invalidEmoji || treeSlots.some(slot => !treePlan.emojiSlots.includes(slot.slot) && containsEmoji(slot.text)) || extra.some(value => containsEmoji(value))) { console.warn("Walkthrough draft validation", !treeSlots ? "tree-map-invalid" : invalidEmoji ? (!invalidEmoji.text.trim() ? "tree-emoji-slot-blank" : "tree-emoji-slot-nonsingle") : treeSlots.some(slot => !treePlan.emojiSlots.includes(slot.slot) && containsEmoji(slot.text)) ? "tree-emoji-in-text-slot" : "tree-emoji-in-extra"); return { error: "The draft could not be matched safely to the saved formatting. Try again.", diag: diagBase }; }
          if (input.emojiPolicy === "requested" && treePlan.emojiSlots.some(id => !treeSlots.some(slot => slot.slot === id))) formatFallback = true;
          const cleanedTree = treeSlots.filter(slot => input.emojiPolicy === "requested" || !treePlan.emojiSlots.includes(slot.slot)).map(slot => ({ ...slot, text: stripUnpermittedUrls(slot.text, permitted).text }));
          const cleanedExtra = extra.map(value => stripUnpermittedUrls(value, permitted).text).filter(value => value.trim());
          singleSourceRich = renderRichTree(input.outline.richTree!, cleanedTree, cleanedExtra);
          if (!singleSourceRich) { console.warn("Walkthrough draft validation", "tree-render-invalid"); return { error: "The draft could not be matched safely to the saved formatting. Try again.", diag: diagBase }; }
          structuredMessage = htmlToMarkdown(singleSourceRich);
          if (cleanedExtra.length) formatFallback = true;
        } else {
        const rawSlots = ("placeholders" in parsed ? richTemplateSlotsFromMap(input.outline.richTemplate!, contentMap) : "richSlots" in parsed ? parsed.richSlots : null) as Parameters<typeof renderRichTemplate>[1] | null;
        if (!rawSlots) { console.warn("Walkthrough draft validation", "rich-map-invalid"); return { error: "The draft could not be matched safely to the saved formatting. Try again.", diag: diagBase }; }
        const rawHtml = rawSlots.length ? renderRichTemplate(input.outline.richTemplate!, rawSlots) : "";
        if (rawHtml === null || (!rawHtml && !extra.length)) { console.warn("Walkthrough draft validation", rawHtml === null ? "rich-render-invalid" : "rich-map-empty"); return { error: "The draft could not be matched safely to the saved formatting. Try again.", diag: diagBase }; }
        if (input.emojiPolicy === "requested" && rawSlots.some(slot => slot.entries.some((entry, e) => entry.some((fragment, r) => input.outline.richTemplate!.blocks[slot.index]?.entries[e]?.runs[r]?.emoji && !fragment)))) formatFallback = true;
        if (extra.some(value => containsEmoji(value))) return { error: "The draft included emoji that could not be positioned safely. Try again.", diag: diagBase };
        const cleanedSlots = rawSlots.map(slot => ({ index: slot.index, entries: slot.entries.map((entry, e) => entry.map((fragment, r) => input.emojiPolicy !== "requested" && input.outline.richTemplate!.blocks[slot.index].entries[e].runs[r].emoji ? "" : stripUnpermittedUrls(fragment, permitted).text)) }));
        singleSourceRich = cleanedSlots.length ? renderRichTemplate(input.outline.richTemplate!, cleanedSlots) : "";
        if (singleSourceRich === null) return { error: "Generated announcement has no content after removing unverified links. Try again.", diag: diagBase };
        const extraMarkdown = extra.map(value => stripUnpermittedUrls(value, permitted).text).filter(value => value.trim()).join("\n\n");
        if (extraMarkdown) { singleSourceRich += markdownToHtml(extraMarkdown); formatFallback = true; }
        structuredMessage = htmlToMarkdown(singleSourceRich);
        }
      } else {
      const rawSections = plainMap && "placeholders" in parsed ? sectionsFromPlaceholderMap(parsed.placeholders, input.outline, input.emojiPolicy === "requested") : "sections" in parsed ? parsed.sections : undefined;
      if (plainMap && rawSections === null && "placeholders" in parsed) console.warn("Walkthrough placeholder validation", plainPlaceholderFailure(parsed.placeholders, input.outline, input.emojiPolicy === "requested"));
      const normalizedText = !message ? normalizeAnnouncementSectionText(rawSections) : { sections: rawSections, adjusted: false };
      const normalized = input.emojiPolicy === "requested" && !message ? normalizeAnnouncementEmoji(normalizedText.sections, input.outline) : { sections: normalizedText.sections, adjusted: false };
      const sections = normalized.sections;
      if (normalized.adjusted || normalizedText.adjusted) formatFallback = true;
      const assembled = assembleAnnouncementSections(sections, input.outline, input.emojiPolicy === "requested");
      if (assembled) {
        const retainedBody = stripUnpermittedUrls(announcementSectionBody(sections), permitted).text;
        if (!hasMeaningfulAnnouncementContent(retainedBody)) return { error: "Generated announcement has no content after removing unverified links. Try again.", diag: diagBase };
        structuredMessage = stripUnpermittedUrls(assembled, permitted).text;
        if (message && announcementContentSignature(structuredMessage) !== announcementContentSignature(permittedMessage)) return { error: "The draft sections did not match the complete message. Try again.", diag: diagBase };
      } else if (sections !== undefined) {
        let recovered = recoverAnnouncementSections(sections, input.outline);
        if (!recovered && normalized.adjusted && input.emojiPolicy === "requested" && !message && Array.isArray(sections) && sections.every(section => section && typeof section === "object" && !Array.isArray(section) && (section.emojis === undefined || (Array.isArray(section.emojis) && section.emojis.every(validAnnouncementEmojiChoice))))) {
          const withoutEmoji = sections.map(section => section && typeof section === "object" && !Array.isArray(section) ? { ...section, emojis: [] } : section);
          recovered = recoverAnnouncementSections(withoutEmoji, input.outline);
          if (recovered) formatFallback = true;
        }
        if (!recovered || message) console.warn("Walkthrough section validation:", announcementSectionFailure(sections, input.outline));
        if (!recovered && input.emojiPolicy === "requested" && Array.isArray(sections) && sections.some(section => section && typeof section === "object" && !Array.isArray(section) && Array.isArray(section.emojis) && section.emojis.length > 0)) return { error: "The draft's emoji positions could not be matched to the saved format. Try again or turn off emoji.", diag: diagBase };
        if (!recovered || message) return { error: "The draft did not match the requested section structure. Try again.", diag: diagBase };
        const retainedBody = stripUnpermittedUrls(announcementSectionBody(sections), permitted).text;
        if (!hasMeaningfulAnnouncementContent(retainedBody)) return { error: "Generated announcement has no content after removing unverified links. Try again.", diag: diagBase };
        structuredMessage = stripUnpermittedUrls(recovered, permitted).text;
        formatFallback = true;
      } else if (message) {
        if (input.emojiPolicy !== "requested" && containsEmoji(permittedMessage)) return { error: "The draft included unsupported emoji. Try again.", diag: diagBase };
        // A returned freeform message may contain information absent from sections.
        // Preserve it rather than silently choosing a conflicting representation.
        structuredMessage = permittedMessage;
        formatFallback = true;
      } else {
        return { error: "The draft did not contain usable section content. Try again.", diag: diagBase };
      }
      }
    }
    const addedInstructions = useDefaultPrompt ? "" : addedPromptLines(defaultPrompt, input.promptOverride ?? "");
    const enforcedMessage = input.matchExample && useDefaultPrompt
      ? applyWalkthroughFidelity(matchQuizDetailsBullets(structuredMessage, input.outline), input.outline)
      : permittedMessage;
    const { text: enforcedTitle } = stripUnpermittedUrls(title, permitted);
    if (input.matchExample && hasUnsupportedQuizContent(enforcedTitle, enforcedMessage, [input.courseLabel, input.moduleLabel ?? "", input.materialsText, input.coverageBlock, input.notes].join("\n"), addedInstructions)) {
      return { error: "The draft mentioned a quiz that was not found in the current materials. Retry, or add the quiz details to the notes.", diag: diagBase };
    }
    if (!enforcedTitle.trim() || !hasMeaningfulAnnouncementContent(enforcedMessage)) {
      return { error: "Generated announcement is empty after removing unverified links. Try again.", diag: diagBase };
    }

    const wantsRich = !!(validRichTemplate(input.outline.richTemplate) || richTreePlan(input.outline.richTree));
    const treeReference = enforcedMessage.replace(/^ {0,3}(?:#{1,6}[ \t]+|[-*+][ \t]+|\d+[.)][ \t]+)/gm, "");
    let richHtml = singleSourceRich && verifiedStyledAnnouncement(treePlan ? treeReference : enforcedMessage, singleSourceRich, treePlan ? "plain-tree" : "structured") ? singleSourceRich : input.matchExample && useDefaultPrompt && input.outline.richTemplate
      ? projectRichTemplate(enforcedMessage, input.outline.richTemplate) : null;
    let richExtraNotice = false;
    if (!singleSourceRich && input.matchExample && useDefaultPrompt && validRichTemplate(input.outline.richTemplate) && "richSlots" in parsed && Array.isArray(parsed.richSlots)) {
      const candidate = renderRichTemplate(input.outline.richTemplate, parsed.richSlots as Parameters<typeof renderRichTemplate>[1]);
      if (!candidate || !verifiedStyledAnnouncement(enforcedMessage, candidate)) formatFallback = true;
      else richHtml = candidate;
    }
    if (input.matchExample && useDefaultPrompt && input.outline.richTree && richTreePlan(input.outline.richTree) && "treeSlots" in parsed && Array.isArray(parsed.treeSlots) && "treeExtra" in parsed && Array.isArray(parsed.treeExtra)) {
      const candidate = renderRichTree(input.outline.richTree, parsed.treeSlots as Parameters<typeof renderRichTree>[1], parsed.treeExtra as string[]);
      const plainReference = message ? permittedMessage : enforcedMessage.replace(/^ {0,3}(?:#{1,6}[ \t]+|[-*+][ \t]+|\d+[.)][ \t]+)/gm, "");
      if (!candidate || !verifiedStyledAnnouncement(plainReference, candidate, "plain-tree")) formatFallback = true;
      else { richHtml = candidate; richExtraNotice = parsed.treeExtra.length > 0; }
    }
    if (wantsRich && !richHtml && input.matchExample && useDefaultPrompt) formatFallback = true;

    const researchNotice = researchNoticeFor(input.researchOutcome);

    const attributionWarning = possibleCrossActivityAttribution(input.materialsText, enforcedMessage);
    let attributionSuggestion: { title: string; message: string; richHtml?: string } | undefined;
    if (attributionWarning && useDefaultPrompt && !attributionRepair) {
      const repaired = await draftWalkthroughAnnouncementAttempt(input, true);
      if (!("error" in repaired) && repaired.title === enforcedTitle.trim() && !repaired.attributionWarning && preservesImplicatedActivityTerms(input.materialsText, enforcedMessage, repaired.message)) attributionSuggestion = { title: repaired.title, message: repaired.message, ...(repaired.richHtml && { richHtml: repaired.richHtml }) };
    }
    return { title: enforcedTitle.trim(), message: enforcedMessage, researchNotice, diag: diagBase, ...(richHtml && { richHtml }), ...(richExtraNotice && { richExtraNotice }), ...(formatFallback && { formatFallback: true }), ...(attributionWarning && { attributionWarning: true }), ...(attributionSuggestion && { attributionSuggestion }) };
  } catch {
    return {
      error: "Could not draft the announcement. Try again.",
      diag: unattemptedLlmDiag(provider),
    };
  }
}

interface WalkthroughScriptDraftInput {
  courseName: string;
  moduleLabel: string;
  materialsText: string;
  notes: string;
  provider?: LlmProvider;
}

// AC5's video script has no requested-duration signal to size a budget
// against the way lectureScriptMaxOutputTokens/walkthroughAnnouncementMaxOutputTokens
// do (no target minutes, no structural outline) - the script simply narrates
// whatever the walkthrough captured. Rather than inventing a scaling formula
// with no real signal to scale from, this is a flat, deliberately GENEROUS
// ceiling: 8192 matches the ceiling already used elsewhere in this repo
// (lecture-script-bounds.ts's own MAX_OUTPUT_TOKENS, course-planning.ts) and
// comfortably covers even the acceptance document's own worst-realistic-case
// walkthrough (8 pages, a few narrated sentences each) with room to spare -
// so it functions as a backstop against a pathological run, never a tight
// budget a realistic one could brush up against. Not exported (a "use
// server" file may export only async functions) - private to this module.
const WALKTHROUGH_SCRIPT_MAX_OUTPUT_TOKENS = 8192;

/**
 * Drafts the video script (AC5). Plain spoken-register prose - never HTML,
 * never posted anywhere; the instructor reads it, edits it, and re-records
 * against it. See composeWalkthroughScriptPrompt's own header for why this
 * is a sibling prompt to the announcement's, not a shared one with a flag.
 */
export async function draftWalkthroughVideoScriptAction(
  input: WalkthroughScriptDraftInput
): Promise<({ script: string } | { error: string }) & { diag: ScriptGenerationLlmDiag }> {
  const provider: LlmProvider = input.provider ?? "gemini";
  try {
    const user = await requireUser();
    if (!input.materialsText.trim()) {
      return { error: "Nothing was captured yet - capture a walkthrough first.", diag: unattemptedLlmDiag(provider) };
    }

    const styleBlock = await getWritingStyleBlock(user.id);
    const prompt = composeWalkthroughScriptPrompt({
      courseName: input.courseName,
      moduleLabel: input.moduleLabel,
      materialsText: input.materialsText,
      notes: input.notes,
      styleBlock,
    });

    const tokenBudget = WALKTHROUGH_SCRIPT_MAX_OUTPUT_TOKENS;
    const r = await callLlm(
      { contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.6, maxOutputTokens: tokenBudget } },
      provider
    );

    const diag: ScriptGenerationLlmDiag = {
      attempted: true,
      provider,
      model: provider === "gemini" ? getGeminiModel() : undefined,
      tokenBudget,
      promptLength: prompt.length,
      promptHash: fnv1aHash(prompt),
      styleBlockLength: styleBlock.length,
      ok: r.ok,
      finishReason: r.ok ? r.finishReason : undefined,
      textLength: r.ok ? r.text.length : 0,
      failureBodyRedacted: undefined,
    };

    if (!r.ok || !r.text.trim()) return { error: "The model returned no script. Try again.", diag };
    return { script: r.text.trim(), diag };
  } catch {
    return {
      error: "Could not generate the script. Try again.",
      diag: unattemptedLlmDiag(provider),
    };
  }
}

// ── Posting (AC7, decision P1) ──────────────────────────────────────────────

/**
 * Posts the drafted announcement's MARKDOWN body to Canvas, converting it
 * via createAnnouncementFromMarkdown (src/lib/canvas/announcements.ts) -
 * markdownToHtml, never textToHtml (P1). This is a NEW, separate action from
 * createAnnouncementAction (src/app/actions/canvas-inbox.ts): every existing
 * caller of that action posts plain text and must keep doing so unchanged.
 */
export async function postWalkthroughAnnouncementAction(
  courseUrl: string,
  title: string,
  markdownBody: string,
  acronym?: string,
  delayedPostAt?: string,
  richHtml?: string
): Promise<{ id: number } | { error: string }> {
  try {
    await requireUser();
    // Rich HTML is the instructor-edited, displayed representation. The
    // Canvas helper sanitizes it again at the server boundary.
    const announcement = richHtml !== undefined
      ? await createAnnouncementFromSafeHtml(courseUrl, title, richHtml, acronym, undefined, delayedPostAt)
      : await createAnnouncementFromMarkdown(courseUrl, title, markdownBody, acronym, delayedPostAt);
    return { id: announcement.id };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not post the announcement." };
  }
}
