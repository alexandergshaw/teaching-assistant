// The Polish Linter (stage 13): a pure, idempotent pass over the deck model
// that fixes what the owner's stage-13 pass can decide WITHOUT rendering the
// deck, and leaves everything else as an owner-verification residual.
//
// Scope (docs/pres-2-scope.md section 2.5): "Mechanically checkable (this
// piece): dedupe identical section labels; normalize spacing (trim, collapse
// internal whitespace in titles/bullets); normalize activity badges
// (canonical `Practice:`/`Your Turn:` prefixes); renumber `Section <n>:`
// dividers contiguously." Everything else the owner's stage 13 lists -
// "fix overlaps", "enlarge diagrams needing classroom visibility", whether
// the deck "looks polished" from the back of the room - is a RENDER
// property. Nothing renders under vitest here (docs/loop/this-repo.md
// section 6), so those are NOT implemented and NOT claimed as covered; they
// stay owner-verification only (RES-PRES2-4, docs/pres-2-scope.md:573).
//
// This leaf is deliberately structural: it operates over a local
// PolishDeckInput shape (mirroring S1's DeckStandardInput /
// S2's FrameDeckInput pattern, standard.ts:17-21 / frame.ts) so it has no
// compile-time dependency on GeneratedDeck/PptxSlide. Pure: no IO, no
// callLlm, and every function returns a NEW deck rather than mutating the
// input.

/**
 * The minimal deck shape this pass needs. Any object with this shape
 * (including the real GeneratedDeck) can be polished.
 */
export interface PolishSlideInput {
  title: string;
  bullets: string[];
  notes?: string;
  /**
   * Passthrough fields the real slide model (`PptxSlide`) carries that this
   * pass does not read or normalize. Declared here (structurally, not by
   * importing `PptxSlide`) so `polishDeck` preserves them byte-identical
   * instead of silently dropping them when a real deck slide is polished.
   */
  code?: string;
  codeLanguage?: string;
  graphic?: unknown;
}

export interface PolishDeckInput {
  presentationTitle: string;
  slides: PolishSlideInput[];
}

/** One itemized change the pass made, kept for the caller's change log. */
export interface PolishChange {
  /** -1 for a deck-level change; otherwise the 0-based slide index it touched. */
  slideIndex: number;
  kind: "dedupe-label" | "normalize-spacing" | "normalize-badge" | "renumber-section";
  detail: string;
}

export interface PolishResult {
  deck: PolishDeckInput;
  changes: PolishChange[];
}

/**
 * Canonical activity-badge prefixes, matching the vocabulary
 * `enforceCodingCycle` and the graphics guard already key on
 * (src/lib/slide-prompt.ts:374,239 per the scope). Each entry's `match`
 * recognizes any casing/spacing/separator variant of the badge at the
 * START of a title; `canonical` is the exact prefix polishDeck writes back.
 * Order matters: longer/more specific prefixes are matched before shorter
 * ones that could be a substring of them (e.g. "Post-Lecture Practice"
 * before "Practice").
 */
const BADGE_RULES: Array<{ match: RegExp; canonical: string }> = [
  { match: /^post[\s-]*lecture[\s-]*practice\s*[:\-]\s*/i, canonical: "Post-Lecture Practice: " },
  { match: /^your[\s-]*turn\s*[:\-]\s*/i, canonical: "Your Turn: " },
  { match: /^walkthrough\s*[:\-]\s*/i, canonical: "Walkthrough: " },
  { match: /^practice\s*[:\-]\s*/i, canonical: "Practice: " },
  { match: /^example\s*[:\-]\s*/i, canonical: "Example: " },
  { match: /^answer\s*[:\-]\s*/i, canonical: "Answer: " },
];

/** Matches a "Section <n>: <rest>" divider title, any spacing around ":". */
const SECTION_DIVIDER_RE = /^section\s+(\d+)\s*:\s*(.*)$/i;

/** Collapses internal runs of whitespace to a single space and trims. */
function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Rewrites `title`'s leading activity-badge prefix (if any) to its
 * canonical form. Returns the original string unchanged when no badge
 * prefix is recognized, or when the title already uses the canonical form
 * (so this is a fixed point - required for idempotence).
 */
function canonicalizeBadge(title: string): string {
  for (const rule of BADGE_RULES) {
    const match = title.match(rule.match);
    if (match) {
      const rest = title.slice(match[0].length);
      return `${rule.canonical}${rest}`;
    }
  }
  return title;
}

/**
 * The pure, idempotent polish pass: `polishDeck(polishDeck(d).deck).changes`
 * is always empty, and `polishDeck(polishDeck(d).deck).deck` deep-equals
 * `polishDeck(d).deck` (POLISH-IDEMPOTENT). Returns a NEW deck; `deck` is
 * never mutated.
 *
 * Applies, in order:
 *  1. normalize-spacing - trim/collapse whitespace in presentationTitle,
 *     every slide title, bullet, and notes field.
 *  2. normalize-badge - rewrite each title's leading activity-badge prefix
 *     to its canonical form.
 *  3. dedupe-label - drop a slide whose (already-normalized) title exactly
 *     repeats the immediately preceding slide's title (the "survived from
 *     an earlier revision" duplicate).
 *  4. renumber-section - renumber "Section <n>:" divider titles
 *     contiguously (1, 2, 3, ...) in order of appearance, over the
 *     post-dedupe slide list.
 */
export function polishDeck(deck: PolishDeckInput): PolishResult {
  const changes: PolishChange[] = [];

  const normalizedTitle = normalizeWhitespace(deck.presentationTitle);
  if (normalizedTitle !== deck.presentationTitle) {
    changes.push({
      slideIndex: -1,
      kind: "normalize-spacing",
      detail: "Collapsed whitespace in the presentation title.",
    });
  }

  // Step 1 + 2: whitespace, then badge canonicalization, per slide.
  const spacedAndBadged = deck.slides.map((slide, index) => {
    const trimmedTitle = normalizeWhitespace(slide.title);
    if (trimmedTitle !== slide.title) {
      changes.push({
        slideIndex: index,
        kind: "normalize-spacing",
        detail: `Collapsed whitespace in slide ${index} title.`,
      });
    }

    const trimmedBullets = slide.bullets.map((bullet, bulletIndex) => {
      const trimmed = normalizeWhitespace(bullet);
      if (trimmed !== bullet) {
        changes.push({
          slideIndex: index,
          kind: "normalize-spacing",
          detail: `Collapsed whitespace in slide ${index} bullet ${bulletIndex}.`,
        });
      }
      return trimmed;
    });

    const trimmedNotes = slide.notes === undefined ? undefined : normalizeWhitespace(slide.notes);
    if (trimmedNotes !== undefined && trimmedNotes !== slide.notes) {
      changes.push({
        slideIndex: index,
        kind: "normalize-spacing",
        detail: `Collapsed whitespace in slide ${index} notes.`,
      });
    }

    const badgedTitle = canonicalizeBadge(trimmedTitle);
    if (badgedTitle !== trimmedTitle) {
      changes.push({
        slideIndex: index,
        kind: "normalize-badge",
        detail: `Normalized slide ${index} activity badge to its canonical prefix.`,
      });
    }

    const next: PolishSlideInput = { ...slide, title: badgedTitle, bullets: trimmedBullets };
    if (trimmedNotes !== undefined) next.notes = trimmedNotes;
    else delete next.notes;
    return next;
  });

  // Step 3: dedupe a slide whose title exactly repeats the previous slide's.
  const deduped: PolishSlideInput[] = [];
  spacedAndBadged.forEach((slide, index) => {
    const previous = deduped[deduped.length - 1];
    if (previous !== undefined && previous.title === slide.title) {
      changes.push({
        slideIndex: index,
        kind: "dedupe-label",
        detail: `Removed slide ${index} as a duplicate of the preceding "${slide.title}" slide.`,
      });
      return;
    }
    deduped.push(slide);
  });

  // Step 4: renumber "Section <n>:" dividers contiguously.
  let sectionCount = 0;
  const renumbered = deduped.map((slide, index) => {
    const match = slide.title.match(SECTION_DIVIDER_RE);
    if (!match) return slide;
    sectionCount += 1;
    const rest = match[2];
    const newTitle = `Section ${sectionCount}: ${rest}`;
    if (newTitle !== slide.title) {
      changes.push({
        slideIndex: index,
        kind: "renumber-section",
        detail: `Renumbered "${slide.title}" to "${newTitle}".`,
      });
    }
    return newTitle === slide.title ? slide : { ...slide, title: newTitle };
  });

  const polished: PolishDeckInput = {
    ...deck,
    presentationTitle: normalizedTitle,
    slides: renumbered,
  };

  return { deck: polished, changes };
}
