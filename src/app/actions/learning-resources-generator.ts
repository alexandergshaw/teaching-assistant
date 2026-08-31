import { courseKindContract, courseKindNoun, type CourseKind } from "@/lib/course-kind";
import { PLAIN_LANGUAGE_CONTRACT } from "@/lib/artifact-voice";
import { callLlm, type LlmProvider } from "@/lib/llm";
import { stripModelUrls } from "@/lib/urls";
import { toBullets, keyPhrases, ensureSentence, capitalizeFirst } from "@/lib/embedded/scaffold";
import { parseDeckConcepts, clampDeckConcepts, type DeckConcept } from "@/lib/workflows/deck-concepts";
import { findResourceLinksForConceptsAction, type ResourceLink } from "@/app/actions/learning-resource-links";

/**
 * gatherSelectionMaterials (src/lib/lms-generation/materials.ts) headers every
 * item's chunk one of two ways depending on its source: a live Page/File is
 * `# <title>\n<body>` (gatherLiveItem), an export-sourced item OR a live
 * Assignment/Quiz/Discussion is `<Type>: <title>\n<body>` (gatherExportItem /
 * gatherLiveItem's header-line branches), and a repo-sourced item is
 * `# <itemRef>\n<content>` (gatherRepoItem) - so either a markdown H1 or a
 * "Type: Title" line always names the item as Canvas (or the repo/export
 * source) itself names it. `<Type>` is drawn from the closed vocabulary
 * gatherLiveItem/gatherExportItem actually emit (Assignment, Quiz, Page,
 * File, Discussion - see materials.ts:226-278) - NOT any capitalized word,
 * so a materials body line that merely happens to look like "Word: rest"
 * (e.g. a "Note: submissions are due Friday." line from an item's own body
 * text) is never mistaken for a real item header and echoed back to the
 * student as something the instructor selected. This is the ONLY place that
 * header shape is relied on, and only to echo the selection's own item names
 * back to the student (D1/A7 point 1: "a course item the instructor actually
 * selected, named as it is named in Canvas") in the embedded scaffold below -
 * the LLM path instead reads the materials itself and is told the same
 * naming rule in the prompt (see generateLearningResourcesForSelection).
 */
const ITEM_HEADER_RE = /^(?:#\s+(.+)|(?:Assignment|Quiz|Page|File|Discussion):\s+(.+))$/;

function extractItemTitles(materialsText: string): string[] {
  const titles: string[] = [];
  for (const rawLine of materialsText.split(/\r?\n/)) {
    const match = ITEM_HEADER_RE.exec(rawLine.trim());
    if (!match) continue;
    const title = (match[1] ?? match[2])?.trim();
    if (title) titles.push(title);
  }
  return [...new Set(titles)];
}

/**
 * Materials text with every item-header line (matched by ITEM_HEADER_RE)
 * removed, so the "Concepts to Review" section (built from what's left) can
 * never simply repeat the "This Module's Items" section (built from the
 * header lines themselves) line for line (finding 3).
 */
function stripItemHeaderLines(materialsText: string): string {
  return materialsText
    .split(/\r?\n/)
    .filter((line) => !ITEM_HEADER_RE.test(line.trim()))
    .join("\n");
}

/** Strip a leading markdown heading marker a concept line might still carry
 * (toBullets' own stripMarker strips "-", "*", bullet, "1.", "a)" but not
 * "#" - see src/lib/embedded/scaffold.ts:98-99) so a concept never renders as
 * "- # Some Heading." (finding 3). */
function stripLeadingHeadingMarker(text: string): string {
  return text.replace(/^#+\s*/, "");
}

/**
 * Embedded Deterministic Engine scaffold for a Learning Resources page (A9).
 * No suitable scaffold already existed in @/lib/embedded/docs for this kind
 * (that module's scaffolds cover the module-intro/objectives/assignment
 * documents only), so this is a small deterministic one, written here rather
 * than there - following that module's own precedent
 * (scaffoldModuleObjectivesDoc's own doc comment: "the assignment is what
 * proves the objective... every bullet comes from the input verbatim").
 * Every line below is either a title pulled verbatim from the selection's own
 * item headers (extractItemTitles) or a phrase pulled verbatim from the
 * materials text (toBullets/keyPhrases) - nothing here is invented, and no
 * chapter number, video title, or author is ever fabricated. A materials
 * body CAN legitimately contain a URL (e.g. a live page's own body text
 * copied verbatim), so the caller (generateLearningResourcesForSelection)
 * runs this scaffold's output through stripModelUrls exactly as it does the
 * LLM path's output, rather than letting a copied-verbatim link reach a
 * posted page unfiltered (D1). The concepts source has every item-header
 * line stripped first (stripItemHeaderLines) so this section is never a
 * line-for-line repeat of the items section above it.
 */
function scaffoldLearningResourcesDoc(moduleLabel: string, materialsText: string): string {
  const items = extractItemTitles(materialsText);
  const concepts = toBullets(stripItemHeaderLines(materialsText)).slice(0, 5);
  const searchTerms = keyPhrases(materialsText, 6);

  const itemsSection =
    items.length > 0
      ? items
          .map((title) => `- ${title}: one of the items selected for this module - look it over before you start.`)
          .join("\n")
      : "- [List the items selected for this module]";

  const conceptsSection =
    concepts.length > 0
      ? concepts
          .map((concept) => `- ${ensureSentence(capitalizeFirst(stripLeadingHeadingMarker(concept)))}`)
          .join("\n")
      : "- [List a concept or skill worth reviewing before this module's work]";

  const searchSection =
    searchTerms.length > 0
      ? searchTerms.map((term) => `- "${term}"`).join("\n")
      : '- [Search terms a student could use to find outside material themselves]';

  return [
    `# Learning Resources: ${moduleLabel}`,
    ensureSentence(`Use this page to get ready for ${moduleLabel.toLowerCase()}`),
    "## This Module's Items",
    itemsSection,
    "## Concepts to Review",
    conceptsSection,
    "## Practice",
    "- Skim every item above once, start to end, before you dig into any one of them.\n- Then work back through the concepts listed here and check that you can explain each one in your own words before you start the graded work.",
    "## Search Terms",
    searchSection,
  ].join("\n\n");
}

// ── Real links (docs/learning-resources-real-links-acceptance-criteria.md) ─
//
// Contract 3 (this file) owns exactly one new step: turning this module's own
// gathered materials into a small, bounded concept list. Everything that
// makes a link on the page TRUSTWORTHY - the grounded search, the
// corroboration against that search's own sources, the reachability check -
// lives in the sibling action this file calls (Contract 2,
// findResourceLinksForConceptsAction) and, beneath that, Contract 1
// (checkUrlsReachable). This file never fetches, never grounds, and never
// invents a link itself.

/**
 * A2/A1: bounded per run. The sibling action spends TWO LLM calls plus a
 * batch of reachability fetches PER concept (Contract 2's own D1/D6), and
 * this whole generation runs from a Server Action behind a button on Vercel
 * Hobby - a hard 60s ceiling (docs/deployment-vercel-hobby.md territory).
 * Four concepts x (2 calls + reachability, run concurrently by the sibling)
 * comfortably fits that budget; clampDeckConcepts' own default of 8 (let
 * alone its [1,20] ceiling) would not, so this cap is well under it.
 */
const MAX_RESOURCE_CONCEPTS = 4;

// A single, ungrounded, small call - no JSON-and-search conflict to worry
// about here (that trap is D1, and it only applies to the sibling's grounded
// per-concept calls), so this stays a normal "return ONLY valid JSON" ask.
const CONCEPT_EXTRACTION_MAX_TOKENS = 512;

/**
 * A1: derive a small concept list from THIS MODULE'S gathered materials
 * (never from the prose page generated below - that keeps concept
 * derivation and prose generation independent, so one's failure never
 * blocks the other). Reuses parseDeckConcepts/clampDeckConcepts
 * (src/lib/workflows/deck-concepts.ts) rather than writing a second JSON-
 * concepts parser - both are pure and shaped exactly for this despite the
 * "deck" in their file's name (they were built for the lecture-deck concept
 * extractor, but nothing about them is deck-specific).
 *
 * Never throws: a transport failure, a malformed response, or an empty
 * result all degrade to `[]`, which downstream (buildResourcesSection) is a
 * normal, renderable case - "no concepts were identified" - not a fatal one.
 * The prose page above this call has already been confirmed good by the time
 * this runs, so this step's failure must never turn a good page into an
 * error.
 */
async function deriveResourceConcepts(materialsText: string, provider: LlmProvider): Promise<DeckConcept[]> {
  try {
    const prompt = `Read the module materials below and identify up to ${MAX_RESOURCE_CONCEPTS} concepts or skills a student would benefit from finding outside resources (official documentation, video tutorials, or written tutorials) for.

MODULE MATERIALS:
${materialsText}

Return ONLY valid JSON in this exact shape:
{"concepts":[{"concept":"<short concept name>","evidence":"<why this concept matters, drawn from the materials>"}]}

No markdown fences, no commentary. If nothing in the materials warrants an outside resource, return {"concepts":[]}.`;

    const result = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: CONCEPT_EXTRACTION_MAX_TOKENS },
      },
      provider
    );

    if (!result.ok || !result.text.trim()) return [];
    return parseDeckConcepts(result.text, clampDeckConcepts(MAX_RESOURCE_CONCEPTS));
  } catch {
    return [];
  }
}

/** The sibling action's success shape, narrowed to what this file renders -
 *  named locally so a lookup failure (see findResourceLinksSafely) can be
 *  represented with the exact same shape as a real, merely-empty result. */
interface ResourceLookupOutcome {
  links: ResourceLink[];
  degraded: boolean;
  droppedUncorroborated: number;
  droppedPlaceholder: number;
  droppedUnreachable: number;
  notes: string[];
}

const EMPTY_LOOKUP: ResourceLookupOutcome = {
  links: [],
  degraded: false,
  droppedUncorroborated: 0,
  droppedPlaceholder: 0,
  droppedUnreachable: 0,
  notes: [],
};

/**
 * Call the sibling grounded-link-finder action, and never let its failure
 * (or absence of anything to search for) become this generator's failure -
 * a resources page with no links is a documented, useful degraded case
 * (C3); a thrown error here is not. `concepts.length === 0` short-circuits
 * before the call: there is nothing to search for, so there is nothing to
 * call the sibling with (A1).
 */
async function findResourceLinksSafely(
  concepts: readonly DeckConcept[],
  courseKind: CourseKind,
  provider: LlmProvider
): Promise<ResourceLookupOutcome> {
  if (concepts.length === 0) return EMPTY_LOOKUP;
  try {
    const result = await findResourceLinksForConceptsAction(
      concepts.map((c) => c.concept),
      courseKind,
      provider
    );
    if ("error" in result) {
      return { ...EMPTY_LOOKUP, notes: [`Resource search failed: ${result.error}`] };
    }
    return result;
  } catch (err) {
    return { ...EMPTY_LOOKUP, notes: [`Resource search failed: ${err instanceof Error ? err.message : String(err)}`] };
  }
}

// ResourceLink["kind"] is the full five-way ResourceKind union
// (src/lib/resource-kind.ts) as of the discussion-reply-resources work
// (docs/discussion-reply-resources-acceptance-criteria.md R1/R2), even
// though this page's own call site never asks for anything but doc/video/
// tutorial (findResourceLinksForConceptsAction defaults to that three-kind
// profile). Partial, not Record, so this literal does not have to invent
// labels for "news"/"paper" kinds this page can never actually receive;
// the lookup at its one call site below already falls back to the raw
// `link.kind` value when a label is missing.
const RESOURCE_KIND_LABELS: Partial<Record<ResourceLink["kind"], string>> = {
  doc: "Doc",
  video: "Video",
  tutorial: "Tutorial",
};

/**
 * Resources-section gate: `link.url` is the ONE string allowed to reach this
 * section unmodified - the sibling action (findResourceLinksForConceptsAction,
 * @/app/actions/learning-resource-links) already sanitizes and
 * percent-encodes it before returning it, and it is the only field in
 * `ResourceLink` that passed the three gates in
 * docs/learning-resources-real-links-acceptance-criteria.md (grounded
 * search, corroboration, reachability). Every OTHER model-authored string
 * rendered into this section is ungrounded, unverified text that passed
 * through none of those gates:
 *   - `concept.concept` comes from deriveResourceConcepts, a plain,
 *     ungrounded callLlm over materialsText parsed by parseDeckConcepts -
 *     no URL filter of any kind runs on it.
 *   - `link.title` and `link.whatYouGet` come from the sibling's SECOND,
 *     ungrounded structuring call - only that call's `url` field is gated.
 *   - every `note` the sibling action returns may itself embed a concept
 *     string verbatim.
 * Any of those could carry a bare URL the model invented, which
 * markdownLiteToHtml's tokenizeInline (src/lib/docx-blocks.ts) would
 * otherwise autolink into a real, unverified, clickable anchor - exactly the
 * defect class src/lib/urls.ts:8-11 documents. So every one of them is run
 * through stripModelUrls at the point it is rendered (resourceLinkBullet,
 * conceptFallbackBullet, buildResourcesSection below) rather than upstream,
 * so a future field added to this section is obviously subject to the same
 * rule. NEVER call this on `link.url` - stripping or re-encoding it here
 * would corrupt the one field the sibling action already made render-safe.
 */
function sanitizeResourceText(text: string): string {
  return stripModelUrls(text).trim();
}

/**
 * The LINK-TEXT half of the same problem. `sanitizeResourceText` above stops
 * a model-authored string from smuggling a URL onto the page; this stops one
 * from breaking the markdown link it sits inside. A title containing `[` or
 * `]` terminates `[...]` early, so `[Guide [v2]](https://real.example)`
 * parses as link text "Guide [v2" followed by stray characters - the href is
 * lost and tokenizeInline then autolinks the bare URL instead, leaving
 * brackets scattered through the sentence. A regression pass found this;
 * unlike the balanced-paren defect on the URL side it degrades to a working
 * bare link rather than a dead one, but it is the same root cause (model
 * text placed unescaped into markdown syntax) and the same fix.
 *
 * `sourceLinkMarkdown` (src/lib/workflows/current-events-report.ts:427-433)
 * already strips exactly these two characters from a source title before
 * building `[title](uri)`, for exactly this reason - this reuses that rule
 * rather than inventing a second one. Only applied to text rendered INSIDE
 * brackets; `whatYouGet` sits outside them and needs no escaping.
 */
function sanitizeLinkText(text: string): string {
  return sanitizeResourceText(text).replace(/[[\]]/g, "").trim();
}

/** C1: a clickable markdown link, so markdownLiteToHtml turns it into a real
 *  `<a href>` in the Canvas page, labelled by kind so a student can tell a
 *  video from a doc without following it first. `link.url` is rendered
 *  as-is (see sanitizeResourceText's doc comment); `title` and `whatYouGet`
 *  are model-authored and ungated, so both pass through sanitizeResourceText
 *  first. */
function resourceLinkBullet(link: ResourceLink): string {
  const label = RESOURCE_KIND_LABELS[link.kind] ?? link.kind;
  return `- [${sanitizeLinkText(link.title)}](${link.url}) (${label}): ${sanitizeResourceText(link.whatYouGet)}`;
}

/** C3: a concept for which no link survived every gate is still listed -
 *  with a plain-text, never-a-link suggestion to search for it, the same
 *  "point the student at it themselves" fallback the shipped scaffold's own
 *  Search Terms section already uses. The page's usefulness must not
 *  regress to nothing just because search (or corroboration, or
 *  reachability) found nothing for this one concept. `concept.concept` is
 *  ungrounded model text (see sanitizeResourceText's doc comment), so it is
 *  sanitized before being echoed here. */
function conceptFallbackBullet(concept: DeckConcept): string {
  return `- No verified link survived for this concept - search for it yourself: "${sanitizeResourceText(concept.concept)}"`;
}

/**
 * Append a `## Resources` section: one `###` subsection per concept (C1 -
 * grouped by concept), each either the concept's surviving links
 * (resourceLinkBullet) or, when none survived, the fallback bullet (C3) -
 * every concept is listed either way, never dropped. Always ends with a
 * counts line the instructor can act on (C5: concepts searched, links kept,
 * and how many were dropped at each gate) and, verbatim, any notes the
 * sibling action recorded - in particular its degraded / no-sources note,
 * which is how an instructor learns "the page has no links because search
 * found nothing" rather than silently getting a linkless page with no
 * explanation.
 */
function buildResourcesSection(concepts: readonly DeckConcept[], outcome: ResourceLookupOutcome): string {
  if (concepts.length === 0) {
    return [
      "## Resources",
      "No concepts were identified in this module's materials to search for outside resources.",
    ].join("\n\n");
  }

  const linksByConcept = new Map<string, ResourceLink[]>();
  for (const link of outcome.links) {
    const bucket = linksByConcept.get(link.concept);
    if (bucket) bucket.push(link);
    else linksByConcept.set(link.concept, [link]);
  }

  const groups = concepts.map((concept) => {
    // Grouping is keyed on the RAW concept string (the sibling action's own
    // ResourceLink.concept is that same string, unstripped) - only the
    // rendered heading text below is sanitized, so a stripped-vs-unstripped
    // mismatch can never make a concept's links fail to group under it.
    const links = linksByConcept.get(concept.concept) ?? [];
    const body = links.length > 0 ? links.map(resourceLinkBullet).join("\n") : conceptFallbackBullet(concept);
    return [`### ${sanitizeResourceText(concept.concept)}`, body].join("\n\n");
  });

  const totalDropped = outcome.droppedUncorroborated + outcome.droppedPlaceholder + outcome.droppedUnreachable;
  const summary = `Resource search: ${concepts.length} concept(s) checked, ${outcome.links.length} link(s) kept, ${totalDropped} dropped (uncorroborated: ${outcome.droppedUncorroborated}, placeholder: ${outcome.droppedPlaceholder}, unreachable: ${outcome.droppedUnreachable}).`;

  const sections = ["## Resources", summary, ...groups];
  if (outcome.notes.length > 0) {
    // Each note may itself embed a concept string verbatim (see
    // sanitizeResourceText's doc comment) - sanitized for the same reason.
    sections.push(["### Notes", outcome.notes.map((note) => `- ${sanitizeResourceText(note)}`).join("\n")].join("\n\n"));
  }
  return sections.join("\n\n");
}

/**
 * Generate a LEARNING RESOURCES page (docs/learning-resources-page-
 * acceptance-criteria.md) for the module a Modules-view selection names.
 * Shaped exactly like generateModuleObjectivesForAssignment
 * (./module-objectives-generator.ts) - moduleLabel + materialsText +
 * provider + courseKind in, `{ text } | { error }` out - so the two
 * generators can sit side by side in generateFromSelectionAction's switch
 * with no special-casing. THIS SIGNATURE DOES NOT CHANGE across the revision
 * described below - lms-generation.ts's `case "resources":` needs no edit.
 *
 * REVISED CONTRACT (docs/learning-resources-real-links-acceptance-criteria.md):
 * this page used to guarantee NO link of any kind ever reached the student -
 * a model asked for "resources" will confidently emit plausible, dead URLs,
 * fake chapter numbers, fake video titles, and fake authors (see
 * stripModelUrls' own header comment for the real generated course that
 * shipped 37 dead links out of 73). That property still holds for the PROSE
 * below: the prompt still forbids the model from inventing a link, citation,
 * chapter number, or media title, and stripModelUrls still runs over the
 * response unconditionally, exactly as before. What changed is that the page
 * is no longer link-free OVERALL - the instructor asked for real links to
 * docs, videos and tutorials, and this function now appends a `## Resources`
 * section (buildResourcesSection) carrying links that came from nowhere near
 * this prose call: a bounded concept list drawn from the materials
 * (deriveResourceConcepts) is handed to a sibling action
 * (findResourceLinksForConceptsAction, @/app/actions/learning-resource-links)
 * that grounds a real web search per concept, corroborates every candidate
 * against that search's own sources, and reachability-checks what survives.
 * A link only ever reaches the page through that path. The embedded provider
 * (below) makes no network call and is unchanged - still link-free, still
 * the deterministic scaffold, still run through stripModelUrls.
 *
 * A7: reuses the shared PLAIN_LANGUAGE_CONTRACT (@/lib/artifact-voice) and
 * courseKindContract/courseKindNoun (@/lib/course-kind) exactly as every
 * other student-facing generator does. Deliberately does NOT reuse
 * BLOOM_OBJECTIVES_CONTRACT (@/lib/bloom-taxonomy) - that contract states a
 * measurable-verb/Bloom-level rule for stating a learning OBJECTIVE, which
 * has no meaning for a resources page (there is no objective being stated
 * here to tag with a verb or a level).
 */
export async function generateLearningResourcesForSelection(
  moduleLabel: string,
  materialsText: string,
  provider: LlmProvider = "gemini",
  courseKind: CourseKind = "coding"
): Promise<{ text: string } | { error: string }> {
  // Embedded Deterministic Engine: template the resources page straight from
  // the selection's own materials, exactly as the objectives generator does
  // for its own scaffold - never a model call, never a silent failure (A9).
  // D1/A8: run through stripModelUrls the same as the LLM path below - the
  // scaffold never INVENTS a URL, but a live item's own body text (copied
  // verbatim into materialsText by gatherSelectionMaterials) can legitimately
  // contain one, and that must not reach a posted page unfiltered either.
  if (provider === "embedded") {
    return { text: stripModelUrls(scaffoldLearningResourcesDoc(moduleLabel, materialsText)).trim() };
  }

  const prompt = `You are an expert educator writing a LEARNING RESOURCES page for a ${courseKindNoun(courseKind)}.

${courseKindContract(courseKind)}

MODULE: ${moduleLabel}

THIS MODULE'S MATERIALS (the assignments, quizzes, pages, and files selected for this module - every resource you write must be drawn from what is actually here):
${materialsText}

Write a Learning Resources page a STUDENT reads directly, in the Canvas page it becomes. Write in the second person, addressing the student as "you". Keep it scannable: short headed sections, one line per resource, no preamble, and no commentary about being an AI, about how this page was produced, or about the instructor's intent.

CRITICAL RULE - NEVER INVENT A LINK, CITATION, OR MEDIA TITLE: you have no way to verify that a URL, a textbook chapter number, a video title, or an author's name is real or still live. Do not write any of those anywhere in this document, under any circumstance, even as an example. A resource, in this document, is ONLY one of these four things:
1. A course item drawn from THIS MODULE'S MATERIALS above, named EXACTLY as it is named there (so the student can find it in the module), with one line on what to focus on or do with it.
2. A concept or skill worth reviewing before attempting that work, with one clause on why it matters for that specific assignment or quiz.
3. A concrete practice suggestion or self-check the student can do on their own, with no outside material required.
4. Search terms (plain words or a short phrase, never a URL) a student could type into a search engine or their library catalog to find outside material themselves.

Inventing a URL, a citation, a chapter number, a video title, or an author's name is a defect, not a feature - never do it, even to seem more helpful.

Structure the document as:
1. A single document title on the very first line, written exactly as the markdown level-1 heading "# Learning Resources: ${moduleLabel}". This must be the only level-1 heading in the document.
2. A "## This Module's Items" section: one line per item drawn from the materials above, named exactly as it is named there, with a short note on what to focus on.
3. A "## Concepts to Review" section: 3-5 concepts or skills, each its own line starting with "- ", each with one clause on why it matters for this module's work.
4. A "## Practice" section: 2-4 concrete practice suggestions or self-checks a student can do on their own.
5. A "## Search Terms" section: 3-6 short search phrases a student could use to find outside material themselves - plain text only, never a URL.
6. Format every section heading as a markdown level-2 heading. Do not use any other markdown symbols (no bold, italics, or numbered lists) in the body text.
7. ${PLAIN_LANGUAGE_CONTRACT}

Do not restate this module's instructions in full - point to what to review and why, never a copy of the instructions themselves.`;

  // Budget fix (docs/learning-resources-real-links-acceptance-criteria.md D6):
  // this prose call and deriveResourceConcepts both take ONLY materialsText
  // (never each other's output - deriveResourceConcepts is deliberately
  // grounded in materialsText, not in this prose, precisely so the two stay
  // independent - see deriveResourceConcepts' own doc comment) and neither
  // result is needed until both are in hand, so they are kicked off together
  // with Promise.all rather than run one after the other. Worst case
  // sequential timing (prose + concepts + a retried grounded/structure pair +
  // reachability) can approach or exceed Vercel Hobby's 60s Server Action
  // ceiling with no maxDuration; running them concurrently removes one leg of
  // that chain from the critical path. Each promise fails independently:
  // callLlm never throws (it resolves to `{ ok: false, ... }` on failure, and
  // that failure is handled below exactly as before), and
  // deriveResourceConcepts has its own try/catch that degrades to `[]` rather
  // than rejecting - so a concept-derivation problem can never reject this
  // Promise.all and can never fail the prose, and a prose failure below never
  // touches `concepts` (already resolved independently by the time it's read).
  const [result, concepts] = await Promise.all([
    callLlm(
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.5, maxOutputTokens: 1536 },
      },
      provider
    ),
    deriveResourceConcepts(materialsText, provider),
  ]);

  if (!result.ok) {
    return { error: `LLM API error for learning resources "${moduleLabel}": HTTP ${result.status} — ${result.body.slice(0, 200)}` };
  }

  if (!result.text.trim()) {
    return { error: `Learning resources generation returned empty response for "${moduleLabel}".` };
  }

  // D1/A8: the last line of defense, applied unconditionally regardless of
  // whether the prompt above was followed - the exact same treatment
  // generateModuleObjectivesForAssignment and
  // generateAssignmentInstructionsForAssignment give their own output. D4
  // (real-links AC): this strip runs over the PROSE ONLY and nothing else -
  // the Resources section built below is appended AFTER this point and is
  // never passed through stripModelUrls, because it is the one place on this
  // page a link is allowed (every link in it already passed three gates
  // before this function ever saw it). Stripping the combined text instead
  // would delete every surviving link right back out again.
  const proseText = stripModelUrls(result.text).trim();

  // A8: a response that is nothing but invented links strips down to "" (or
  // whitespace) - that must surface as an error, never as an empty success
  // silently saved and posted into a module. Checked BEFORE the resources
  // lookup below runs: a bad prose page is still a bad prose page regardless
  // of what real links might be found for it.
  if (!proseText) {
    return { error: `Learning resources generation for "${moduleLabel}" contained no content once invented links were removed.` };
  }

  // Real-links revision: `concepts` was already derived from the materials
  // above (never from the prose - see deriveResourceConcepts), concurrently
  // with the prose call itself. Hand it to the sibling grounded-search
  // action now that the prose is confirmed good. Both steps degrade to "no
  // links" rather than throwing (deriveResourceConcepts's own try/catch,
  // findResourceLinksSafely's), so a problem here can only ever make the
  // Resources section say less - it can never turn this already-good prose
  // page into an error.
  const outcome = await findResourceLinksSafely(concepts, courseKind, provider);
  const resourcesSection = buildResourcesSection(concepts, outcome);

  return { text: [proseText, resourcesSection].join("\n\n") };
}
