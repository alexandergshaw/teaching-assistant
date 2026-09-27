/**
 * A43-S: normalise an uploaded/pasted source into the `materials` text the
 * manual deck path (src/app/components/ppt-design) feeds to
 * `DeckGenContext.materials` (src/lib/decks/generate.ts), plus a small
 * receipt describing what was kept.
 *
 * Pure, server-safe, no React and no I/O: the actual byte-to-text extraction
 * happens in src/app/actions/deck-source.ts (extractTextFromBuffer for a
 * dropped file, ingestRepoAction for a repo reference) - this module only
 * shapes the RESULT of that extraction into what the UI stores and what the
 * prompt receives. Kept separate from src/lib/office-extract.ts on purpose:
 * that file is the one extractor (50 extensions) and must not gain a second
 * spelling of "give me a source" (docs/a43-scope.md section 6.2).
 */

/** Prompt budget for source materials. Generous relative to a lecture-length
 * upload, but bounded so one huge source cannot crowd out the rest of
 * buildDeckPrompt's own instructions (src/lib/decks/generate.ts). */
export const DECK_SOURCE_MAX_CHARS = 20000;

export interface DeckSourceReceipt {
  /** The uploaded file's name, or the repo reference/URL the instructor pasted. */
  name: string;
  /** Bytes of the ORIGINAL source (file bytes on disk, or repo digest text bytes). */
  bytes: number;
  /** Characters of materials text actually kept for the prompt (post-truncation). */
  characters: number;
  /** True when the extracted text was cut to fit DECK_SOURCE_MAX_CHARS. */
  truncated: boolean;
}

export interface DeckSourceResult {
  /** Text ready to hand to DeckGenContext.materials. Empty string if there was nothing to keep. */
  materials: string;
  receipt: DeckSourceReceipt;
}

/**
 * Normalise extracted source text (already produced by extractTextFromBuffer
 * or a repo digest) into prompt-ready materials plus a receipt. Collapses
 * excess blank lines so the character budget is spent on content, then
 * truncates to DECK_SOURCE_MAX_CHARS.
 */
export function normalizeDeckSource(
  name: string,
  bytes: number,
  rawText: string
): DeckSourceResult {
  const collapsed = rawText.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  const truncated = collapsed.length > DECK_SOURCE_MAX_CHARS;
  const materials = truncated ? collapsed.slice(0, DECK_SOURCE_MAX_CHARS).trim() : collapsed;

  return {
    materials,
    receipt: {
      name,
      bytes,
      characters: materials.length,
      truncated,
    },
  };
}

/**
 * A subject line the instructor never had to type (A39/A43 C2 - Generate
 * must succeed with no subject typed). Prefers the source's own first
 * Markdown/plain heading, then its filename with the extension stripped,
 * falling back to the empty string so the caller can fall through to the
 * template's own name.
 */
export function deriveSubjectFromSource(name: string, materials: string): string {
  const heading = materials
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  if (heading) {
    const withoutMarkdownHash = heading.replace(/^#{1,6}\s+/, "").trim();
    if (withoutMarkdownHash) {
      return withoutMarkdownHash.slice(0, 120);
    }
  }

  const base = name.trim().replace(/\.[a-zA-Z0-9]+$/, "").trim();
  return base;
}
