"use server";

// refineGeneratedArtifactAction and saveEditedGeneratedArtifactAction, split
// out of src/app/actions/lms-generation.ts to keep that file under this
// project's 1000-line ceiling (docs/module-intro-video-script-acceptance-
// criteria.md, finding 8 and its W1 acceptance criteria). This split did NOT
// land on its own, green, before any feature work in that chunk began - the
// split and M12's acronym-threading feature (see RefineGeneratedArtifactInput's
// and SaveEditedGeneratedArtifactInput's own `acronym` fields below) are one
// uncommitted change, not two sequential ones.
//
// Consequently this is a MOVE plus that one feature, not a byte-identical
// move: both actions' bodies, their private helpers, and their success
// interfaces (RefineGeneratedArtifactSuccess, SaveEditedGeneratedArtifactSuccess)
// carried over unchanged apart from import paths, but their input interfaces
// each gained a new `acronym` field, and each action's resolveGenerationCourseRow
// call site changed from the two-argument `(courseUrl, courseId)` call to the
// three-argument `(input.courseUrl, input.courseId, input.acronym)` call seen
// below, to pass it through. See each export's own doc comment (preserved
// verbatim apart from that one call-site change) for the actual design
// rationale.
//
// resolveGenerationCourseRow and isCourseNotLinkedMessage stay OUT of this
// file even though both actions below call them: lms-generation.ts's own
// generateFromSelectionAction, postGeneratedArtifactAction and
// listGeneratedArtifactVersionsAction read them too, so they are not private
// helpers "only" refine/saveEdited use - moving them here would either
// duplicate them (the exact hazard TITLED_GENERIC_KINDS's own doc comment
// below warns about) or leave lms-generation.ts unable to call them at all.
// resolveGenerationCourseRow is imported from
// src/app/actions/lms-generation-course-row.ts, its own leaf (split out of
// lms-generation.ts later, once Job 4's diag-log plumbing pushed that file
// past the 1000-line ceiling - a STRUCTURAL split, not itself a "use server"
// module since nothing calls it directly from client code); isCourseNotLinkedMessage
// is imported from src/lib/lms-generation/course-not-linked.ts (a pure leaf -
// it does no I/O, so it does not need to pay an async/await tax to be
// shared).
import { requireOwner } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { reviseLectureSlidesAction } from "./lecture-plans";
import {
  saveGeneratedArtifactVersion,
  type GeneratedArtifact,
} from "@/lib/supabase/generated-artifacts";
import { parseDeckSlidesFromStructured, mergeRefinedDeckSlides } from "@/lib/lms-generation/deck";
import {
  GENERATION_KIND_CONFIGS,
  kindSupportsTextEdit,
  type GenerationKindId,
  type DeckGeneratedContent,
  type KnowledgeCheckGeneratedContent,
  type GenerationFailure,
} from "@/lib/lms-generation/kinds";
import { parseKnowledgeCheckStructured } from "@/lib/lms-generation/post-content";
import { callLlm, describeEmptyLlmText, describeLlmFailure, type LlmProvider } from "@/lib/llm";
import { extractJsonObject } from "./shared";
import type { Json } from "@/lib/supabase/types";
import { resolveGenerationCourseRow } from "./lms-generation-course-row";
import { isCourseNotLinkedMessage } from "@/lib/lms-generation/course-not-linked";

/**
 * Which of the generic-path kinds carry a title that revised/edited TEXT
 * alone cannot reconstruct. "objectives"'s title and "assignments"'s are
 * both set once at GENERATE time (generateFromSelectionAction,
 * src/app/actions/lms-generation.ts) from data - a module label, a separate
 * generator field - not present in either
 * the refine or the manual-edit path; "announcements"'s title is a distinct
 * field (`{title, message}`) neither path ever revises. For all three, the
 * only correct post-write title is the version being written over's own -
 * `currentTitle` - carried forward so it never silently degrades to
 * `config.label` at post time (postGeneratedArtifactAction's `title =
 * artifact.title ?? "" || config.label`). "qa"/"currentEvents" are
 * deliberately excluded: they legitimately have no title (generated-
 * artifacts.ts's own column comment), and their existing tests assert it
 * stays that way. ("decks"/"knowledgeChecks" carry their own title in
 * refineGeneratedArtifactAction's own per-kind branches, and are refused
 * outright by saveEditedGeneratedArtifactAction - see kindSupportsTextEdit -
 * so neither reaches this list via that path.)
 *
 * "scripts" belongs here for the exact same reason as "objectives": its
 * title (`${moduleLabel} Intro Video Script`) is derived at GENERATE time
 * from the module label and is not reconstructible from the revised/edited
 * text alone.
 *
 * "resources" belongs here for the exact same reason: its title
 * (`${moduleLabel} Learning Resources`) is derived at GENERATE time from the
 * module label (src/app/actions/lms-generation.ts's `case "resources"`) and
 * is not reconstructible from the revised/edited text alone. It is
 * especially load-bearing here because "resources" also has no
 * `renderStructured` (kinds.ts's `ResourcesGeneratedContent` is a plain
 * `{text}`), so `kindSupportsTextEdit` is true for it - hand-editing via
 * saveEditedGeneratedArtifactAction is a FIRST-CLASS path for this kind, not
 * a rare edge case, so omitting it here would drop the title on every
 * hand-edited resources save, not merely on refine.
 *
 * Hoisted to module scope (rather than declared once inside
 * refineGeneratedArtifactAction) so BOTH refineGeneratedArtifactAction's
 * generic path and saveEditedGeneratedArtifactAction read the same ONE list
 * - two copies of this array could silently drift, re-opening the exact
 * "title quietly degrades to config.label" regression this list exists to
 * prevent. This list has NO exhaustiveness check (unlike the kind switch in
 * generateFromSelectionAction, src/app/actions/lms-generation.ts), so leaving
 * a titled kind out of it is exactly that regression - "resources" was
 * originally left out this way (a real, verified defect), which is why
 * lms-generation-refine.test.ts's own TITLED_GENERIC_KINDS canary test exists:
 * "which kinds set a title" is not mechanically derivable from
 * GENERATION_KIND_CONFIGS (no field on GenerationKindConfig says so), so that
 * canary is a hand-written list, not a derived one - the next kind author
 * must bump it in the same commit as any change here, exactly as
 * kinds.test.ts's GENERATION_KIND_IDS canary already asks of GENERATION_KIND_IDS
 * itself.
 */
const TITLED_GENERIC_KINDS: readonly GenerationKindId[] = [
  "objectives",
  "assignments",
  "announcements",
  "scripts",
  "resources",
  "introDiscussion",
];

export interface RefineGeneratedArtifactInput {
  courseUrl: string;
  /** See GenerateFromSelectionInput's own doc comment - same identifier,
   * same source-aware resolution. */
  courseId?: string;
  /** M12: see GenerateFromSelectionInput's own doc comment - same identifier,
   * same threading into resolveGenerationCourseRow. */
  acronym?: string;
  kind: GenerationKindId;
  /** The version being refined, as already-displayed text - mirrors
   * reviseDocumentAction's own `documentText` contract (see this function's
   * body comment for why that action itself is not reused here). */
  currentText: string;
  /** The version being refined's `title`/`structured` columns (GeneratedArtifact,
   * src/lib/supabase/generated-artifacts.ts) - trusted client-supplied values,
   * not re-read from the database here. Verified deliberate, not an oversight:
   * useLmsGeneration.ts's refine() already sends BOTH fields unconditionally on
   * every refine call, for every kind (its own inline comment saying "Decks
   * only... ignored server-side for every other kind" describes only what THIS
   * action used to DO with them, not what it sends), so no caller change is
   * needed to fix this. Re-reading server-side instead, the way
   * postGeneratedArtifactAction re-reads by id (P2's "never trust client-
   * supplied content"), was rejected here: it would need a new `artifactId`
   * field wired through the caller (outside this fix's file set) to guard
   * against a staleness gap refine does not actually have - instructions and
   * the version being refined are submitted in the same request, unlike a
   * preview modal left open before posting.
   *
   * `currentTitle` is read by every kind whose title is NOT re-derivable from
   * revised text: "decks" and "knowledgeChecks" (their own branches below),
   * and "objectives"/"assignments"/"announcements" (the generic text-refine
   * path's carry-forward). Ignored by "qa"/"currentEvents", which legitimately
   * have no title (see generated-artifacts.ts's own column comment).
   *
   * `currentStructured` was decks-only until this fix; "knowledgeChecks" now
   * reads it too (its own branch below), for the same reason decks does - its
   * refine must revise the STRUCTURED questions, never `currentText`'s lossy
   * rendered checklist. Ignored by every other kind. */
  currentTitle?: string | null;
  currentStructured?: unknown;
  instructions: string;
  provider?: LlmProvider;
}

export interface RefineGeneratedArtifactSuccess {
  artifact: GeneratedArtifact;
  /** Decks only - one line per slide whose speaker notes and/or graphic
   * could not be confidently carried over from the version being refined
   * (mergeRefinedDeckSlides, src/lib/lms-generation/deck.ts). Undefined for
   * every other kind, and an empty array for a deck refine that lost
   * nothing - see that function's own doc comment for what "confidently"
   * means. */
  notes?: string[];
}

/**
 * Revise an existing generated version per free-text instructions, and save
 * the result as a NEW version - never an overwrite of the version being
 * refined (saveGeneratedArtifactVersion always inserts; see that function's
 * own doc comment).
 */
export async function refineGeneratedArtifactAction(
  input: RefineGeneratedArtifactInput
): Promise<RefineGeneratedArtifactSuccess | GenerationFailure> {
  try {
    const user = await requireOwner();

    const currentText = input.currentText.trim();
    if (!currentText) return { error: "There is no generated document to refine." };
    const instructions = input.instructions.trim();
    if (!instructions) return { error: "Say what you would like changed." };

    const resolved = await resolveGenerationCourseRow(input.courseUrl, input.courseId, input.acronym);
    if ("error" in resolved) {
      return isCourseNotLinkedMessage(resolved.error)
        ? { error: resolved.error, courseNotLinked: true }
        : { error: resolved.error };
    }
    const course = resolved.course;
    const provider: LlmProvider = input.provider ?? "gemini";

    // DECKS: reviseLectureSlidesAction (src/app/actions/lecture-plans.ts) IS
    // the natural per-kind refine here - unlike the generic text path below,
    // it operates on the STRUCTURED slide array recovered from the version
    // being refined, so this branch can save a NEW `structured` payload too,
    // never just text (kinds.ts's own header comment on why `structured`
    // exists for decks). reviseLectureSlidesAction's own LLM response
    // contract only requests
    // { "slides": [ { "title": "...", "bullets": [...], "code": "...", "codeLanguage": "python" } ] }
    // (lecture-plans.ts's own prompt, verbatim) - `notes` and `graphic` are
    // never asked for, so every slide it returns lacks them regardless of
    // whether the version being refined carried them. Rather than accept
    // that loss (or widen reviseLectureSlidesAction's own contract, which
    // has other callers and is outside this chunk's ownership),
    // mergeRefinedDeckSlides (src/lib/lms-generation/deck.ts) merges the
    // revision back over `slides` - the version being refined - so a
    // confidently-matched slide keeps the notes/graphic the model was never
    // asked about, while `title`/`bullets`/`code`/`codeLanguage` (fields the
    // model WAS asked about) always come from the revision, never the old
    // version. See that function's own doc comment for the full matching
    // rule and why index alone is not used.
    if (input.kind === "decks") {
      const deckConfig = GENERATION_KIND_CONFIGS.decks;
      const slides = parseDeckSlidesFromStructured(input.currentStructured);
      if (slides.length === 0) return { error: "There is no generated deck to refine." };
      const presentationTitle = (input.currentTitle ?? "").trim() || "Presentation";

      const revised = await reviseLectureSlidesAction(presentationTitle, slides, instructions, provider);
      if ("error" in revised) return { error: revised.error };

      const merged = mergeRefinedDeckSlides(slides, revised.slides);
      const generated: DeckGeneratedContent = { presentationTitle, slides: merged.slides };
      if (deckConfig.isEmpty(generated)) return { error: deckConfig.emptyMessage };

      const supabase = createServiceClient();
      const artifact = await saveGeneratedArtifactVersion(supabase, user.id, {
        courseId: course.id,
        kind: deckConfig.artifactKind,
        title: presentationTitle,
        text: deckConfig.render(generated),
        structured: deckConfig.renderStructured!(generated) as Json,
        prompt: `Revise the deck "${presentationTitle}" for ${course.name || "this course"}, per: ${instructions}`,
      });
      return { artifact, notes: merged.droppedFields };
    }

    // KNOWLEDGE CHECKS: the same "structured, not text" problem decks has
    // (kinds.ts: `text` is knowledgeCheckTextFromQuestions' LOSSY "[x]"/"[ ]"
    // checklist rendering, unsafe to re-parse back into prompt/choices/
    // correct/explanation - the same round-trip kinds.ts already rejects for
    // decks). Before this branch existed, a knowledgeChecks refine fell into
    // the generic text path below, which saves ONLY `{text, prompt}` - no
    // `structured` - so buildPostContentForKind's "quiz" branch refused to
    // ever post the refined version. THE bug this fix exists for; see this
    // file's header comment and docs/REGRESSION.md entry 266 checks 6-8 for
    // the identical class of bug already caught for decks.
    //
    // Unlike decks, there is no existing "revise the questions" action to
    // delegate to (generateKnowledgeCheckAction only ever generates from
    // fresh materials; widening its contract is outside this fix's file
    // set), so this branch makes its own callLlm call, using the same JSON
    // response shape generateKnowledgeCheckAction's own prompt
    // (src/app/actions/knowledge-check.ts) already asks the model for.
    if (input.kind === "knowledgeChecks") {
      const kcConfig = GENERATION_KIND_CONFIGS.knowledgeChecks;
      const questions = parseKnowledgeCheckStructured(input.currentStructured);
      if (questions.length === 0) return { error: "There is no generated knowledge check to refine." };

      const kcPrompt = `You are revising an already-generated knowledge-check quiz for its instructor.

CURRENT QUESTIONS (JSON):
${JSON.stringify(questions, null, 2)}

REQUESTED CHANGES:
${instructions}

Revise the quiz so it satisfies the requested changes. Return ONLY valid JSON:
{
  "questions": [
    {
      "prompt": "...",
      "choices": [
        { "text": "...", "correct": true },
        { "text": "...", "correct": false, "explanation": "..." }
      ]
    }
  ]
}

Requirements:
- Return the COMPLETE revised set of questions, not only the ones that changed.
- Preserve every question the request did not ask you to change, including its exact wording.
- Exactly one choice per question is "correct": true; every other choice has "correct": false and a non-empty "explanation".
- Do not include any text outside the JSON object.`;

      const kcResult = await callLlm(
        {
          contents: [{ role: "user", parts: [{ text: kcPrompt }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 4096 },
        },
        provider
      );

      if (!kcResult.ok) return { error: describeLlmFailure(kcResult, `Refine ${kcConfig.label}`) };
      if (!kcResult.text.trim()) return { error: describeEmptyLlmText(kcResult, `Refine ${kcConfig.label}`) };

      // Structurally validated the same way a saved version's own
      // `structured` column already is (parseKnowledgeCheckStructured) -
      // this response is genuinely untrusted model output, so a malformed or
      // empty result is dropped/refused rather than saved as a version with
      // no usable questions (this is exactly the dead-end this fix exists to
      // close, so it must not reopen a narrower version of the same hole by
      // saving zero questions here).
      const parsedResponse = extractJsonObject(kcResult.text);
      const revisedQuestions = parsedResponse ? parseKnowledgeCheckStructured(parsedResponse.questions) : [];
      if (revisedQuestions.length === 0) {
        return { error: "The revised knowledge check has no usable questions - nothing was saved." };
      }

      const generated: KnowledgeCheckGeneratedContent = { questions: revisedQuestions };
      const supabase = createServiceClient();
      const artifact = await saveGeneratedArtifactVersion(supabase, user.id, {
        courseId: course.id,
        kind: kcConfig.artifactKind,
        // Preserved from the version being refined, exactly like decks'
        // `presentationTitle` above - a knowledge check's title
        // (`${moduleLabel} Knowledge Check`) is set once at generate time
        // from the module label, not re-derivable from the revised
        // questions.
        title: input.currentTitle ?? null,
        text: kcConfig.render(generated),
        structured: kcConfig.renderStructured!(generated) as Json,
        prompt: kcPrompt,
      });
      return { artifact };
    }

    const config = GENERATION_KIND_CONFIGS[input.kind];

    // Which of the remaining generic-path kinds carry a title that this
    // path's revised TEXT alone cannot reconstruct - see TITLED_GENERIC_KINDS'
    // own module-scope doc comment (this file, above) for the full rule.
    // "decks"/"knowledgeChecks" carry their own title above and never reach
    // this generic path.
    const carriedTitle = TITLED_GENERIC_KINDS.includes(input.kind) ? { title: input.currentTitle ?? null } : {};

    // A dedicated callLlm call here rather than reusing reviseDocumentAction
    // (src/app/actions/llm-content.ts), even though that action's own
    // contract - document text + instructions -> the complete revised
    // document - matches this one exactly. reviseDocumentAction's own empty-
    // response branch hardcodes "The model returned an empty document."
    // rather than calling describeEmptyLlmText, which would lose the
    // finishReason diagnostic describeEmptyLlmText surfaces (callLlm returns
    // { ok: true, text: "" } on MAX_TOKENS or a safety block - Gemini answers
    // HTTP 200 with no text). Calling callLlm directly here keeps that
    // diagnostic intact without editing a file outside this task's ownership.
    const prompt = `You are revising an already-generated "${config.label}" document for its instructor.

CURRENT DOCUMENT:
${currentText}

REQUESTED CHANGES:
${instructions}

Rewrite the document so it satisfies the requested changes.

Requirements:
- Return the COMPLETE revised document, ready to use as-is.
- Preserve everything the request did not ask you to change, including the existing heading structure and wording.
- Keep the same plain-text/markdown-ish formatting conventions the document already uses.
- Do not add commentary, preamble, or an explanation of what you changed. Return only the document text.`;

    const result = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 4096 },
      },
      provider
    );

    if (!result.ok) return { error: describeLlmFailure(result, `Refine ${config.label}`) };
    const revised = result.text.trim();
    if (!revised) return { error: describeEmptyLlmText(result, `Refine ${config.label}`) };

    const supabase = createServiceClient();
    const artifact = await saveGeneratedArtifactVersion(supabase, user.id, {
      courseId: course.id,
      kind: config.artifactKind,
      ...carriedTitle,
      text: revised,
      prompt,
    });
    return { artifact };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not refine the generated content." };
  }
}

export interface SaveEditedGeneratedArtifactInput {
  courseUrl: string;
  /** See GenerateFromSelectionInput's own doc comment - same identifier,
   * same source-aware resolution. */
  courseId?: string;
  /** M12: see GenerateFromSelectionInput's own doc comment - same identifier,
   * same threading into resolveGenerationCourseRow. */
  acronym?: string;
  kind: GenerationKindId;
  /** The instructor's hand-edited text, saved verbatim as the new version's
   * `text` - never round-tripped through a model. */
  text: string;
  /** See RefineGeneratedArtifactInput's own doc comment on `currentTitle` -
   * same carry-forward rule (TITLED_GENERIC_KINDS, above), same trusted
   * client-supplied value. */
  currentTitle?: string | null;
}

export interface SaveEditedGeneratedArtifactSuccess {
  artifact: GeneratedArtifact;
}

/** The `prompt` column is NOT NULL and exists to answer "what produced this
 * version" (generated-artifacts.ts's own column comment) - every other
 * writer in this file fills it with the actual prompt/instructions text that
 * produced the version. A manual edit has no such text: copying the
 * PREVIOUS version's prompt forward would misattribute the instructor's own
 * hand-written wording to whatever model call produced an earlier version,
 * which is actively misleading (E7) rather than merely uninformative. This
 * fixed string records the true provenance instead. */
const MANUAL_EDIT_PROMPT = "Manually edited by the instructor in the preview modal - not produced by a model.";

/**
 * Save the instructor's hand-edited text as a NEW version, with no model
 * call. The dedicated action E3 asks for, rather than routing an empty
 * "instructions" through refineGeneratedArtifactAction: that action rejects
 * empty instructions outright (`instructions.trim()` above) and its whole
 * body - for every kind - is an LLM round-trip a manual save must not make.
 *
 * Reuses refineGeneratedArtifactAction's own generic-path tail exactly:
 * `requireOwner` -> resolveGenerationCourseRow (same courseNotLinked
 * passthrough) -> `GENERATION_KIND_CONFIGS[kind].artifactKind` ->
 * saveGeneratedArtifactVersion, which always INSERTs a new version (E2) -
 * there is no update-in-place path here, and this action does not add one.
 *
 * E4: refuses server-side, before any database work, any kind
 * `kindSupportsTextEdit` says no to (currently "decks" and
 * "knowledgeChecks" - kinds.ts's own doc comment) - same shape as
 * postGeneratedArtifactAction's own commitMode refusal
 * (src/app/actions/lms-generation.ts). E1's UI gate
 * is only an affordance; a caller that bypasses it (or a stale client) must
 * still be refused here, since those kinds' `structured` payload - not
 * `text` - is what the deck download and the knowledge-check Canvas post
 * actually read (kinds.ts's `renderStructured`), and saving edited text
 * while carrying the old `structured` forward would produce a version whose
 * two halves disagree.
 */
export async function saveEditedGeneratedArtifactAction(
  input: SaveEditedGeneratedArtifactInput
): Promise<SaveEditedGeneratedArtifactSuccess | GenerationFailure> {
  try {
    const user = await requireOwner();

    const config = GENERATION_KIND_CONFIGS[input.kind];
    if (!kindSupportsTextEdit(input.kind)) {
      return {
        error: `"${config.label}" cannot be hand-edited as text - its slides/questions are what the download and the Canvas post actually read.`,
      };
    }

    const text = input.text.trim();
    if (!text) return { error: "There is no text to save." };

    const resolved = await resolveGenerationCourseRow(input.courseUrl, input.courseId, input.acronym);
    if ("error" in resolved) {
      return isCourseNotLinkedMessage(resolved.error)
        ? { error: resolved.error, courseNotLinked: true }
        : { error: resolved.error };
    }
    const course = resolved.course;

    const carriedTitle = TITLED_GENERIC_KINDS.includes(input.kind) ? { title: input.currentTitle ?? null } : {};

    const supabase = createServiceClient();
    const artifact = await saveGeneratedArtifactVersion(supabase, user.id, {
      courseId: course.id,
      kind: config.artifactKind,
      ...carriedTitle,
      text,
      prompt: MANUAL_EDIT_PROMPT,
    });
    return { artifact };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save the edited content." };
  }
}
