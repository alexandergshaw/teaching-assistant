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
import { requireUser } from "@/lib/supabase/auth";
import { callLlm, type LlmProvider } from "@/lib/llm";
import { getGeminiModel } from "@/lib/gemini";
import { jsonObjectSlice } from "@/lib/json-slice";
import { getWritingStyleBlock } from "./writing-style-block";
import {
  fnv1aHash,
  redactSensitiveText,
  unattemptedLlmDiag,
  type ScriptGenerationLlmDiag,
} from "@/lib/lms-generation/generation-diag";
import { deriveAnnouncementOutline } from "@/lib/announcement-outline";
import { EMPTY_ANNOUNCEMENT_OUTLINE, type AnnouncementOutline } from "@/lib/announcement-outline-types";
import { buildWalkthroughAnnouncementPrompt } from "@/lib/walkthrough-announcement-prompt";
import { walkthroughAnnouncementMaxOutputTokens } from "@/lib/walkthrough-announcement-bounds";
import { composeWalkthroughScriptPrompt } from "@/lib/walkthrough-script-prompt";
import {
  listAnnouncementExemplars,
  getMostRecentAnnouncementExemplar,
  saveAnnouncementExemplar,
  deleteAnnouncementExemplar,
} from "@/lib/announcement-exemplars";
import { createAnnouncementFromMarkdown } from "@/lib/canvas";
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

// ── Drafting (AC2-AC8, decisions P1/P7/P11) ─────────────────────────────────

interface WalkthroughAnnouncementDraftInput {
  courseLabel: string;
  moduleLabel: string | null;
  /** The reduced walkthrough materials text (module-deck-capture/module-
   * blocks.ts's reduceCaptureToMaterials output) - the ONLY carrier of what
   * was actually captured. */
  materialsText: string;
  /** The exemplar's DERIVED outline (AC2) - never its raw text (P11). Pass
   * EMPTY_ANNOUNCEMENT_OUTLINE when no exemplar was pasted or picked. */
  outline: AnnouncementOutline;
  /** Pre-rendered by the caller via renderWalkthroughCoverageBlock
   * (walkthrough-announcement-coverage.ts) from the same joined blocks
   * reduceCaptureToMaterials returned - "" when there is nothing to name. */
  coverageBlock: string;
  /** Free-text notes entered before capture (AC3). */
  notes: string;
  provider?: LlmProvider;
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
): Promise<({ title: string; message: string } | { error: string }) & { diag: ScriptGenerationLlmDiag }> {
  const provider: LlmProvider = input.provider ?? "gemini";
  try {
    const user = await requireUser();
    if (!input.materialsText.trim()) {
      return { error: "Nothing was captured yet - record a walkthrough first.", diag: unattemptedLlmDiag(provider) };
    }

    const styleBlock = await getWritingStyleBlock(user.id);
    const bodyInstruction = buildWalkthroughAnnouncementPrompt({
      courseLabel: input.courseLabel,
      moduleLabel: input.moduleLabel,
      materialsText: input.materialsText,
      outline: input.outline,
      coverageBlock: input.coverageBlock,
      notes: input.notes,
      styleBlock,
    });

    const prompt = [
      "You are an instructor writing a course announcement for students.",
      bodyInstruction,
      [
        "Return ONLY valid JSON:",
        "{",
        '  "title": "...",',
        '  "message": "..."',
        "}",
        "",
        "Requirements:",
        '- "title": a short, specific subject line (no more than ~10 words). Plain text, no markdown.',
        '- "message": the announcement body itself, formatted exactly as instructed above (Markdown headings/lists where the outline calls for them).',
        "- Do not include any text outside the JSON object.",
      ].join("\n"),
    ].join("\n\n");

    // THE COMPUTED TOKEN BUDGET (P7) - sized from the outline, never a fixed
    // 1024 (draftAnnouncementAction's own budget, deliberately not
    // inherited - see walkthrough-announcement-bounds.ts's header).
    const tokenBudget = walkthroughAnnouncementMaxOutputTokens(input.outline);
    const r = await callLlm(
      { contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.5, maxOutputTokens: tokenBudget } },
      provider
    );

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
      failureBodyRedacted: !r.ok ? redactSensitiveText(r.body) : undefined,
    };

    if (!r.ok) return { error: `Draft failed: HTTP ${r.status} — ${r.body.slice(0, 200)}`, diag: diagBase };
    if (!r.text.trim()) return { error: "The model returned no announcement. Try again.", diag: diagBase };

    const jsonText = jsonObjectSlice(r.text);
    if (!jsonText) return { error: "Could not parse the draft from the model response.", diag: diagBase };

    let parsed: { title?: string; message?: string };
    try {
      parsed = JSON.parse(jsonText) as { title?: string; message?: string };
    } catch {
      return { error: "Could not parse the draft from the model response.", diag: diagBase };
    }

    const title = (parsed.title ?? "").trim();
    const message = (parsed.message ?? "").trim();
    if (!title || !message) {
      return { error: "Generated announcement is empty. Try again.", diag: diagBase };
    }

    return { title, message, diag: diagBase };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Could not draft the announcement.",
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
      return { error: "Nothing was captured yet - record a walkthrough first.", diag: unattemptedLlmDiag(provider) };
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
      failureBodyRedacted: !r.ok ? redactSensitiveText(r.body) : undefined,
    };

    if (!r.ok || !r.text.trim()) return { error: "The model returned no script. Try again.", diag };
    return { script: r.text.trim(), diag };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Could not generate the script.",
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
  acronym?: string
): Promise<{ id: number } | { error: string }> {
  try {
    await requireUser();
    const announcement = await createAnnouncementFromMarkdown(courseUrl, title, markdownBody, acronym);
    return { id: announcement.id };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not post the announcement." };
  }
}
