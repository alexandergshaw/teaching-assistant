// PRES-2 S4 (FIND half only): the adversarial-review checklists as named,
// versioned data, producing itemized findings over a deck
// (docs/pres-2-scope.md section 2.4, stages 11/12). This leaf is the FIND
// step only - APPLY (routing a finding through applyDeckOperation to
// regenerate, section 2.4 / A43-C's C2) is a later wave that needs the
// presentations/A43-C surface, out of scope here.
//
// Two closed, versioned checklists carry the owner's stage-11/12 questions.
// Stage 11 (info-flow) gives full question sentences verbatim; stage 12
// (visual) gives named topics rather than full sentences, so those four are
// phrased as questions here while keeping each topic's exact wording intact
// (arrow direction / request-response-as-one-message /
// HTML-appearing-to-request / query-string-vs-fragment) - divergence noted
// in the wave report, not silently smoothed over.
//
// Each item is marked "deterministic" (a pure function can decide it from
// the deck text, per scope 2.4's own split) or "llm" (needs a model
// judgment). For llm items this leaf only builds the prompt and parses the
// reply - it never calls callLlm itself; that belongs to the route/surface
// (S6), mirroring (not importing) buildReviewPrompt's shape
// (src/lib/presentations/prompts.ts:56-71) to keep this leaf
// surface-independent, matching the Frame leaf's stated policy
// (src/lib/deck-standard/frame.ts:18-22).
//
// Findings are itemized and opt-in by construction: every function here
// returns a list the caller chooses from. Nothing in this file mutates a
// deck or auto-applies a fix.
//
// Pure leaf: no IO, no callLlm, no imports from decks/pptx/presentations or
// any other deck-standard file (S1/S2/S3 are concurrent, disjoint waves).

export type ChecklistItemMode = "deterministic" | "llm";

export interface ChecklistItem {
  id: string;
  text: string;
  mode: ChecklistItemMode;
}

export interface Checklist {
  id: string;
  version: string;
  items: ChecklistItem[];
}

/**
 * Stage 11 (adversarial review of information flow), the owner's exact
 * questions (docs/pres-2-scope.md section 2.4 / the S4 brief). Per scope
 * 2.4, "vocab-without-a-model" and "standalone-reconstructable" are each
 * PARTIALLY decidable by a pure function (a Terminology term with no
 * definition row; a slide with a title and zero bullets), so they are
 * "deterministic" here; the remaining four need a model judgment.
 */
export const INFO_FLOW_CHECKLIST: Checklist = {
  id: "info-flow",
  version: "info-flow-checklist-v1",
  items: [
    { id: "main-point-obvious", text: "Is the main point obvious?", mode: "llm" },
    { id: "where-to-look-first", text: "Does the student know where to look first?", mode: "llm" },
    { id: "detail-too-early", text: "Is technical detail introduced too early?", mode: "llm" },
    { id: "diagram-implies-false", text: "Does a diagram imply something incorrect?", mode: "llm" },
    {
      id: "vocab-without-a-model",
      text: "Is vocabulary introduced without a mental model?",
      mode: "deterministic",
    },
    {
      id: "standalone-reconstructable",
      text: "Can the deck be understood without the instructor present?",
      mode: "deterministic",
    },
  ],
};

/**
 * Stage 12 (adversarial review of visuals), the owner's named topics
 * (docs/pres-2-scope.md section 2.4 / the S4 brief). Scope 2.4 marks none of
 * these deterministic (only the two info-flow items above are), so all four
 * are "llm".
 */
export const VISUAL_CHECKLIST: Checklist = {
  id: "visual",
  version: "visual-checklist-v1",
  items: [
    {
      id: "arrow-direction",
      text: "Is every arrow drawn in the direction the data (or control) actually flows?",
      mode: "llm",
    },
    {
      id: "request-response-one-message",
      text: "Is a request and its response shown as a single message where it should be shown as two?",
      mode: "llm",
    },
    {
      id: "html-appears-to-request",
      text: "Does a visual make HTML appear to make requests on its own?",
      mode: "llm",
    },
    {
      id: "query-string-vs-fragment",
      text: "Does a visual conflate a URL query string with a URL fragment?",
      mode: "llm",
    },
  ],
};

/** One Terminology term as it appears on a slide, for the vocab-without-a-model check. */
export interface ChecklistTerm {
  term: string;
  definition?: string;
}

/**
 * The minimal deck shape this leaf needs. Deliberately structural (like
 * DeckStandardInput in standard.ts and FrameDeckInput in frame.ts) rather
 * than importing GeneratedDeck/PptxSlide, so this leaf has no compile-time
 * dependency on src/lib/decks, src/lib/pptx, or src/lib/presentations.
 * `terms` is optional and carries only what checkVocabWithoutModel needs -
 * this leaf does not attempt to read the real Terminology table graphic.
 */
export interface ChecklistSlideInput {
  title: string;
  bullets: string[];
  notes?: string;
  terms?: ChecklistTerm[];
}

export interface ChecklistDeckInput {
  slides: ChecklistSlideInput[];
}

/** One itemized, opt-in finding: which checklist, which item, which slide (if applicable), what was found. */
export interface ChecklistFinding {
  checklistId: string;
  itemId: string;
  slideIndex?: number;
  message: string;
}

/**
 * The result of running a checklist (deterministic pass, or a parsed llm
 * pass) against a deck. `ranItemIds` is the completeness receipt: every item
 * id this run actually covered, independent of whether that item produced a
 * finding - so a caller can prove no question was silently skipped (the
 * "guard names the actual set" shape, docs/loop/seats.md).
 */
export interface ChecklistResult {
  checklistVersion: string;
  findings: ChecklistFinding[];
  ranItemIds: string[];
}

/**
 * Deterministic check for "standalone-reconstructable": a slide with a
 * title and zero bullets (and no notes to substitute) fails, per scope 2.4.
 * The title slide (index 0) is exempt - DECK_STANDARD_V1's own
 * titleSlideOnlyTitle rule (standard.ts) already makes "title only" the
 * REQUIRED shape there, so it is not also a violation here.
 */
function checkStandaloneReconstructable(deck: ChecklistDeckInput): ChecklistFinding[] {
  const findings: ChecklistFinding[] = [];

  deck.slides.forEach((slide, slideIndex) => {
    if (slideIndex === 0) return;
    const hasBody = slide.bullets.length > 0 || (slide.notes ?? "").trim().length > 0;
    if (!hasBody) {
      findings.push({
        checklistId: INFO_FLOW_CHECKLIST.id,
        itemId: "standalone-reconstructable",
        slideIndex,
        message: `Slide ${slideIndex} ("${slide.title}") has no bullets or notes; a student cannot reconstruct it without the instructor present.`,
      });
    }
  });

  return findings;
}

/**
 * Deterministic check for "vocab-without-a-model": a Terminology term with
 * no definition row, per scope 2.4.
 */
function checkVocabWithoutModel(deck: ChecklistDeckInput): ChecklistFinding[] {
  const findings: ChecklistFinding[] = [];

  deck.slides.forEach((slide, slideIndex) => {
    (slide.terms ?? []).forEach((term) => {
      if (!term.definition || term.definition.trim().length === 0) {
        findings.push({
          checklistId: INFO_FLOW_CHECKLIST.id,
          itemId: "vocab-without-a-model",
          slideIndex,
          message: `Term "${term.term}" on slide ${slideIndex} has no definition row.`,
        });
      }
    });
  });

  return findings;
}

const DETERMINISTIC_CHECKERS: Record<string, (deck: ChecklistDeckInput) => ChecklistFinding[]> = {
  "standalone-reconstructable": checkStandaloneReconstructable,
  "vocab-without-a-model": checkVocabWithoutModel,
};

/**
 * Run every "deterministic" item of `checklist` against `deck`, pure and
 * synchronous (no IO, no callLlm). `ranItemIds` lists every deterministic
 * item id that was checked, so a caller (or a test) can prove none was
 * skipped, independent of whether it produced a finding.
 */
export function runDeterministicChecklist(
  checklist: Checklist,
  deck: ChecklistDeckInput
): ChecklistResult {
  const findings: ChecklistFinding[] = [];
  const ranItemIds: string[] = [];

  for (const item of checklist.items) {
    if (item.mode !== "deterministic") continue;
    ranItemIds.push(item.id);
    const checker = DETERMINISTIC_CHECKERS[item.id];
    if (checker) findings.push(...checker(deck));
  }

  return { checklistVersion: checklist.version, findings, ranItemIds };
}

/**
 * Build a pure prompt asking a model to judge every "llm" item of
 * `checklist` against `deck`, mirroring the shape of buildReviewPrompt
 * (src/lib/presentations/prompts.ts:56-71) without importing it: a short
 * framing line, the checklist questions (each on its own line, tagged with
 * its item id so the reply can reference it back), then the deck content.
 * Does not call callLlm - that is the route/surface's job (S6). Every "llm"
 * item's id and text appear in the returned string, in checklist order, so
 * FRAME-FOLD-style presence is checkable on the raw prompt text.
 */
export function buildChecklistPrompt(checklist: Checklist, deck: ChecklistDeckInput): string {
  const llmItems = checklist.items.filter((item) => item.mode === "llm");
  const questionLines = llmItems.map((item) => `${item.id}: ${item.text}`);

  const deckText = deck.slides
    .map((slide, slideIndex) => {
      const bulletLines = slide.bullets.map((bullet) => `  - ${bullet}`).join("\n");
      const notesLine = slide.notes ? `  Notes: ${slide.notes}` : "";
      return [`Slide ${slideIndex}: ${slide.title}`, bulletLines, notesLine]
        .filter((line) => line.length > 0)
        .join("\n");
    })
    .join("\n\n");

  return [
    `You are adversarially reviewing a generated slide deck against the "${checklist.id}" checklist (version ${checklist.version}) for an instructor's lesson material.`,
    "Answer every numbered question below against the deck as a whole, citing the slide index where a problem occurs.",
    "",
    "Checklist questions:",
    ...questionLines,
    "",
    "Deck:",
    deckText,
    "",
    'Return ONLY a JSON array of findings, e.g. [{"itemId": "main-point-obvious", "slideIndex": 2, "message": "..."}]. Omit an item entirely when it has no finding. No other text.',
  ].join("\n");
}

/** The shape one entry of the model's itemized reply is expected to have, before validation. */
interface RawChecklistFindingEntry {
  itemId?: unknown;
  slideIndex?: unknown;
  message?: unknown;
}

/**
 * Parse a model's itemized reply to buildChecklistPrompt into a
 * ChecklistResult. Never throws: a reply that is not valid JSON, not an
 * array, or whose entries are malformed is handled by dropping the bad
 * entry (or, if the whole reply is unusable, returning zero findings) -
 * never by raising. Only entries whose `itemId` matches one of the
 * checklist's own "llm" item ids are kept, so a hallucinated id cannot
 * produce a finding. `ranItemIds` is every "llm" item id in `checklist`,
 * since the prompt asked about all of them and the reply format is
 * "omit when clean" - an item with no finding was still asked about.
 */
export function parseChecklistResponse(checklist: Checklist, responseText: string): ChecklistResult {
  const validItemIds = new Set(
    checklist.items.filter((item) => item.mode === "llm").map((item) => item.id)
  );
  const ranItemIds = [...validItemIds];
  const findings: ChecklistFinding[] = [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(responseText);
  } catch {
    return { checklistVersion: checklist.version, findings, ranItemIds };
  }

  if (!Array.isArray(parsed)) {
    return { checklistVersion: checklist.version, findings, ranItemIds };
  }

  for (const raw of parsed as RawChecklistFindingEntry[]) {
    if (!raw || typeof raw !== "object") continue;

    const itemId = raw.itemId;
    const message = raw.message;
    if (typeof itemId !== "string" || !validItemIds.has(itemId)) continue;
    if (typeof message !== "string" || message.trim().length === 0) continue;

    const slideIndex =
      typeof raw.slideIndex === "number" && Number.isInteger(raw.slideIndex)
        ? raw.slideIndex
        : undefined;

    findings.push({
      checklistId: checklist.id,
      itemId,
      slideIndex,
      message,
    });
  }

  return { checklistVersion: checklist.version, findings, ranItemIds };
}
