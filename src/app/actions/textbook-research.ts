"use server";

// F1 ("Recommend textbooks") and F2 ("Extract from photo") on the courses
// table. A "use server" module may export ONLY async functions (see
// src/lib/use-server-exports.test.ts) - every type, constant, and pure
// helper (formatting, JSON parsing, URL corroboration) lives in the plain
// module src/lib/textbook-recommendations.ts instead.
//
// GROUNDING (F1 only - mirrors case-study-research.ts's own module doc
// comment, read that file's header first if this one is unclear): a grounded
// call (webSearch: true) that also demands "return ONLY valid JSON"
// reliably makes Gemini answer from parametric memory instead of actually
// searching - pairing "search the web" with a strict JSON contract in the
// SAME call is what suppresses the search. So recommendTextbooksAction
// splits into a grounded PROSE call (researchTextbooksProse, no JSON
// instruction) and a second, UNGROUNDED call that structures that prose into
// JSON (structureProseIntoTextbooks). Never combine the two into one call.
import { callLlm, describeLlmFailure, describeEmptyLlmText, type LlmProvider, type LlmPart, type Source } from "@/lib/llm";
import { requireOwner } from "@/lib/supabase/auth";
import { filesToLlmParts, type UploadedFile } from "@/lib/llm-files";
import { checkWireBudget, sumBase64WireBytes } from "@/lib/upload-budget";
import {
  applyUrlCorroboration,
  parseTextbookFields,
  parseTextbookRecommendations,
  type TextbookFields,
  type TextbookRecommendation,
} from "@/lib/textbook-recommendations";

// Call 1 (grounded prose search for 2-3 Cengage MindTap titles). Sized well
// above what an ungrounded call of similar length would need: the default
// model (gemini.ts's DEFAULT_GEMINI_MODEL) is a Gemini 3.x model, and as
// llm.ts's own comment above normalizeGenerationConfig explains, thinking
// tokens on that family are drawn from the SAME budget as maxOutputTokens. A
// grounded web search that must then write 2-3 detailed paragraphs can have
// this budget consumed entirely by thinking and come back empty with
// finishReason MAX_TOKENS. 4096 mirrors the comparable grounded pipeline
// (case-study-research.ts's own RESEARCH_MAX_TOKENS, which uses 8192 for a
// whole-course pass rather than this single-description one).
const RESEARCH_MAX_TOKENS = 4096;
// Call 2 (ungrounded structuring of that prose into JSON).
const STRUCTURE_MAX_TOKENS = 1536;
// STRUCTURE_INPUT_CHAR_CAP bounds how much of call 1's prose the structuring
// call is asked to read, and it must stay sized against RESEARCH_MAX_TOKENS
// or the two silently drift apart (mirrors case-study-research.ts's own
// STRUCTURE_INPUT_CHAR_CAP comment): at a conservative ~4 characters/token,
// RESEARCH_MAX_TOKENS's 4096 tokens is up to ~16,384 characters, so this cap
// carries real headroom above that ceiling and a full-length call 1 response
// can never be truncated by it. It exists as a backstop against a
// pathological/oversized response, not as a routine trim. Bump this together
// with RESEARCH_MAX_TOKENS if either changes.
const STRUCTURE_INPUT_CHAR_CAP = 20000;

/**
 * Call 1 of the two-call grounded shape: a grounded (webSearch: true) prose
 * search for Cengage MindTap titles that fit this course's description.
 * Explicitly allowed to come back with fewer than 2 matches (AC7) - never
 * padded to a target count, here or downstream.
 *
 * BUG-2 fix: returns a discriminated result instead of collapsing every
 * failure mode to null, so the caller can surface the actual HTTP
 * status/body (describeLlmFailure) or an empty-response finishReason like
 * MAX_TOKENS (describeEmptyLlmText) instead of one generic sentence -
 * mirrors extractTextbookFromImageAction's existing use of both helpers.
 */
async function researchTextbooksProse(
  courseName: string,
  courseDescription: string,
  provider: LlmProvider
): Promise<{ ok: true; text: string; sources: Source[] } | { ok: false; error: string }> {
  const prompt = `You are an expert educator researching Cengage or MindTap textbooks for a college course${courseName.trim() ? ` called "${courseName.trim()}"` : ""}.

COURSE DESCRIPTION:
${courseDescription.trim()}

Search the web first, then identify 2-3 real Cengage or MindTap textbook titles that are a strong fit for this course description. For each title you find, write a short paragraph in plain prose giving: the title, the author(s), the edition, the ISBN, the publisher, the publication year, the exact Cengage/MindTap product page URL, and one or two sentences on why it fits this course.

It is fine, and expected, to find fewer than 2 strong matches for a narrow or unusual course description - if that happens, say so plainly and list only the titles that are genuinely strong matches. Never pad the list with a weak or unrelated title just to reach 2 or 3 results. Do not invent a title, an ISBN, or a URL - if you are not confident of a detail, say so instead of guessing.`;

  const grounded = await callLlm(
    {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: RESEARCH_MAX_TOKENS },
      webSearch: true,
    },
    provider
  );

  if (!grounded.ok) {
    return { ok: false, error: describeLlmFailure(grounded, "Textbook research failed") };
  }
  if (!grounded.text.trim()) {
    return { ok: false, error: describeEmptyLlmText(grounded, "Textbook research failed") };
  }

  return { ok: true, text: grounded.text, sources: grounded.sources ?? [] };
}

/**
 * Call 2 of the two-call grounded shape: convert call 1's prose into
 * structured JSON, with NO web search - demanding strict JSON is exactly
 * what would suppress grounding if asked alongside webSearch: true (see the
 * module doc comment), so that instruction only ever appears in this
 * ungrounded call.
 *
 * BUG-1 fix: returns a discriminated result that distinguishes the call
 * itself FAILING (ok: false, an error the caller must surface, never a
 * silent zero-result note) from the call succeeding and genuinely parsing to
 * zero textbooks (ok: true, recommendations: [] - AC7's "found fewer than 2"
 * note is only correct in this second case). Empty prose (defensive - call 1
 * already checked its text is non-empty before this runs) and unparseable
 * JSON both degrade to the same "parsed successfully, zero textbooks"
 * bucket, since neither is a call failure.
 */
async function structureProseIntoTextbooks(
  prose: string,
  provider: LlmProvider
): Promise<{ ok: true; recommendations: TextbookRecommendation[] } | { ok: false; error: string }> {
  if (!prose.trim()) return { ok: true, recommendations: [] };

  const prompt = `Convert the following research notes into structured JSON. Use only information present in the notes below - do not add, invent, look up, or infer anything that isn't already stated there.

RESEARCH NOTES:
${prose.slice(0, STRUCTURE_INPUT_CHAR_CAP)}

Return ONLY valid JSON in this exact shape:
{"textbooks":[{"title":"...","authors":"...","edition":"...","isbn":"...","publisher":"...","year":"...","url":"...","whyItFits":"..."}]}

Every field is a string; use "" for any field the notes do not state. Include at most 3 textbooks, in the order the notes present them. No markdown fences, no commentary. If the notes contain no textbooks, return {"textbooks":[]}.`;

  const result = await callLlm(
    {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: STRUCTURE_MAX_TOKENS },
    },
    provider
  );

  if (!result.ok) {
    return { ok: false, error: describeLlmFailure(result, "Textbook structuring failed") };
  }
  if (!result.text.trim()) {
    return { ok: false, error: describeEmptyLlmText(result, "Textbook structuring failed") };
  }

  return { ok: true, recommendations: parseTextbookRecommendations(result.text) };
}

/**
 * F1: research 2-3 Cengage MindTap textbooks that fit a course's
 * description, using the two-call grounded shape above, then corroborate
 * each result's url against call 1's own grounding sources (AC6) before
 * returning. `note` is set when fewer than 2 recommendations survive (AC7) -
 * the list itself is never padded to reach a target count.
 *
 * The embedded provider guard runs BEFORE requireOwner() (mirrors
 * case-study-research.ts's own ordering and its doc comment on why) so an
 * embedded run makes no network call of any kind.
 */
export async function recommendTextbooksAction(
  courseName: string,
  courseDescription: string,
  provider: LlmProvider
): Promise<{ recommendations: TextbookRecommendation[]; sources: Source[]; note?: string } | { error: string }> {
  if (provider === "embedded") {
    return {
      error:
        "The embedded engine cannot search the web for textbook recommendations. Switch to an LLM provider to use this feature.",
    };
  }

  try {
    await requireOwner();

    if (!courseDescription.trim()) {
      return { error: "Add a course description before requesting textbook recommendations." };
    }

    const researched = await researchTextbooksProse(courseName, courseDescription, provider);
    if (!researched.ok) {
      return { error: researched.error };
    }

    const structured = await structureProseIntoTextbooks(researched.text, provider);
    if (!structured.ok) {
      return { error: structured.error };
    }
    const recommendations = applyUrlCorroboration(structured.recommendations, researched.sources);

    const note =
      recommendations.length === 0
        ? "No strong Cengage MindTap matches were found for this course description."
        : recommendations.length === 1
          ? "Only one strong Cengage MindTap match was found for this course description - showing it rather than padding the list."
          : undefined;

    return { recommendations, sources: researched.sources, note };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not recommend textbooks." };
  }
}

/**
 * F2: extract the seven textbook fields (AC43's order) from one or more
 * screenshot/PDF files, via a single ungrounded vision call. The model is
 * instructed to transcribe only what is visible and never guess - an
 * unreadable field comes back as "" (AC16), handled by
 * parseTextbookFields's own coercion (D1) rather than re-validated here.
 *
 * Same embedded-guard ordering as recommendTextbooksAction above.
 */
export async function extractTextbookFromImageAction(
  files: UploadedFile[],
  provider: LlmProvider
): Promise<{ fields: TextbookFields } | { error: string }> {
  if (provider === "embedded") {
    return {
      error:
        "The embedded engine cannot read image contents. Switch to an LLM provider to extract textbook details from a photo.",
    };
  }

  try {
    await requireOwner();

    if (files.length === 0) {
      return { error: "Attach a screenshot or PDF before extracting." };
    }

    // Several images/pages can ride on one request; budget the TOTAL, before
    // any LLM call is made. extractTextbookInfoAction (src/app/actions/media.ts)
    // is the same feature reached from the Add Course form - both use this
    // shared helper and wording shape so the two size rules cannot drift.
    const totalFileBytes = sumBase64WireBytes(files.map((f) => f.base64));
    const budgetCheck = checkWireBudget(totalFileBytes, "Everything attached");
    if (!budgetCheck.ok) {
      return { error: budgetCheck.error ?? "Everything attached is too large to upload in one request." };
    }

    const fileParts = await filesToLlmParts(files, "TEXTBOOK SCREENSHOT");
    if (fileParts.length === 0) {
      return { error: "Could not read the attached file." };
    }

    const prompt = `The attached file is a screenshot or page showing textbook details - a bookstore listing, a course-materials page, or a photo of the book itself. Transcribe ONLY the textbook details that are visibly present. Never guess or invent a value - when a field is not clearly shown, return "" for it.

Return ONLY valid JSON in this exact shape:
{"title":"...","authors":"...","edition":"...","isbn":"...","publisher":"...","year":"...","url":"..."}

Every field is a string. "authors" may list more than one author, separated by commas. "year" is the publication year written as a plain number string (e.g. "2020"). No markdown fences, no commentary.`;

    const parts: LlmPart[] = [{ text: prompt }, ...fileParts];

    const result = await callLlm(
      {
        contents: [{ role: "user", parts }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 768 },
      },
      provider
    );

    if (!result.ok) {
      return { error: describeLlmFailure(result, "Textbook photo extraction failed") };
    }
    if (!result.text.trim()) {
      return { error: describeEmptyLlmText(result, "Textbook photo extraction failed") };
    }

    return { fields: parseTextbookFields(result.text) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not extract textbook details from the photo." };
  }
}
