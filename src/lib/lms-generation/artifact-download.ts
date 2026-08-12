// Download a saved generated-content version straight out of the preview
// modal (GeneratedPreviewModal.tsx) - see
// docs/generated-artifact-download-acceptance-criteria.md for the full
// acceptance criteria this file implements (chunk 3c).
//
// Split into a PURE half (this file's format/filename/mime logic - no DOM,
// no network, unit-tested with in-memory fixtures in
// artifact-download.test.ts) and one IMPURE builder
// (buildArtifactDownloadBlob) that dynamically pulls the heavy document
// libraries via the existing, already-vetted helpers (buildDocxFromPlainText,
// buildSlidesPptx). This mirrors useLmsGeneration.ts's own precedent of
// exporting its pure logic separately from the hook that wires it to React -
// see that file's header comment.
//
// DELIBERATELY FREE of any "@/app/actions" or Supabase-client import (only a
// type-only import of GeneratedArtifact, erased at compile time) so this
// module stays a leaf, directly importable from the client hook without
// pulling in server-only code - matches kinds.ts's and deck.ts's own
// "dependency-free leaf" rule, stated in their header comments.
//
// THE POWERPOINT PATH READS `structured`, NEVER `text`. A deck's `text` is
// only the lossy `# / ## / -` projection `deckTextFromSlides` (kinds.ts)
// produces for preview/diff - it drops `notes`, `code`, `codeLanguage` and
// `graphic` by construction (verified by reading that function). Those four
// fields survive only in the `structured` column, which is exactly why that
// column exists - see docs/REGRESSION.md entry 266 check 2 ("THIS IS THE
// KIND `structured` EXISTS FOR, AND THE LOSS IS MEASURED"). So the .pptx
// builder below parses `structured` via parseDeckSlidesFromStructured and
// hands the result straight to buildSlidesPptx - never through
// slidesToText/textToSlides (content-tab/utils.ts), which would both re-lose
// the same four fields AND pull in "@/app/actions" (see this repo's reuse
// survey for the full "deliberately not reused" rationale).
import type { GeneratedArtifact } from "@/lib/supabase/generated-artifacts";
import { parseDeckSlidesFromStructured } from "@/lib/lms-generation/deck";
import { buildDocxFromPlainText } from "@/lib/docx";
import { buildSlidesPptx } from "@/lib/pptx";

export type ArtifactDownloadFormat = "md" | "docx" | "pptx";

/** The subset of a GeneratedArtifact this file's pure functions actually
 * read - so a unit test can build a minimal fixture instead of a full row
 * (id/courseId/isCurrent/prompt/createdAt/updatedAt are never touched here). */
type DownloadableArtifact = Pick<GeneratedArtifact, "title" | "text" | "structured" | "version">;

/**
 * Which formats to offer for `artifact`. Markdown and Word are offered for
 * every kind (AC 2: `.md` is the artifact's `text` verbatim, already
 * markdown-ish for every kind; `.docx` is buildDocxFromPlainText(text)).
 * PowerPoint is offered ONLY when the version's `structured` column actually
 * parses into at least one usable slide (AC 3) - gated on the PARSED RESULT,
 * never on a `kind`/`kindId` string, so a deck version saved before
 * `structured` existed, or one whose `structured` failed to parse, does not
 * offer a `.pptx` button that would build an empty deck (see
 * buildArtifactDownloadBlob's own guard for the belt-and-suspenders throw if
 * this function is ever bypassed).
 */
export function artifactDownloadFormats(
  artifact: Pick<DownloadableArtifact, "structured">
): readonly ArtifactDownloadFormat[] {
  const formats: ArtifactDownloadFormat[] = ["md", "docx"];
  if (parseDeckSlidesFromStructured(artifact.structured).length > 0) {
    formats.push("pptx");
  }
  return formats;
}

/** Correct MIME type for each downloadable format. */
export const ARTIFACT_DOWNLOAD_MIME: Record<ArtifactDownloadFormat, string> = {
  md: "text/markdown;charset=utf-8",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

/** Human-readable label for a format, used as the download control's
 * tooltip/accessible name (GeneratedPreviewModal.tsx) and in error
 * text (AC 6: a failed build names the format it failed to build). */
export function artifactDownloadFormatLabel(format: ArtifactDownloadFormat): string {
  switch (format) {
    case "md":
      return "Markdown (.md)";
    case "docx":
      return "Word (.docx)";
    case "pptx":
      return "PowerPoint (.pptx)";
  }
}

// A filename with no visible name at all ("generated") is always safer than
// an empty or dot-only basename, which some OSes/browsers reject outright or
// silently mangle.
const FALLBACK_NAME = "generated";

// Characters Windows forbids in a filename. Replaced with "-" (rather than
// dropped or spaced) so a title that happens to contain one of these - e.g. a
// pasted path like "C:\Notes\Week 3", or a colon used as punctuation, "Unit
// 4: Loops" - keeps a visible boundary between what were two distinct
// segments, instead of silently fusing them into one word.
const ILLEGAL_FILENAME_CHARS_RE = /[\\/:*?"<>|]/g;

// Control characters (U+0000-U+001F: NUL through Unit Separator, including
// stray CR/LF/TAB bytes). These are invisible, so - unlike the punctuation
// above - collapsing them into a plain space (not a dash) is the more
// faithful sanitization: a control character in a title is almost always a
// stray whitespace-like byte, and a space lets the whitespace-collapse pass
// immediately below fold it in with any adjacent real whitespace rather than
// leaving a visible dash where nothing was visible before.
const CONTROL_CHARS_RE = /[\x00-\x1f]/g;

/**
 * Sanitize one filename component (the `<name>` half of `<name>
 * v<version>.<ext>`) so it is always safe on Windows and never empty - see
 * this file's header comment and AC 5. Illegal punctuation and control
 * characters are replaced (never simply dropped, so e.g. "A/B" cannot
 * silently collide with "AB"), runs of whitespace collapse to one space, and
 * leading/trailing dots are stripped (Windows filenames cannot end in a dot
 * or a space, and a name of only dots is reserved). If what remains is empty
 * or made up entirely of dots/spaces, falls back to FALLBACK_NAME.
 */
function sanitizeFilenamePart(raw: string): string {
  const cleaned = raw
    .replace(ILLEGAL_FILENAME_CHARS_RE, "-")
    .replace(CONTROL_CHARS_RE, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .replace(/\.+$/, "")
    .trim();
  const onlyDotsOrSpaces = cleaned.length === 0 || /^[.\s]*$/.test(cleaned);
  return onlyDotsOrSpaces ? FALLBACK_NAME : cleaned;
}

/**
 * `<name> v<version>.<ext>` - AC 5. `<name>` is the artifact's `title` when
 * it is set and non-blank, else `kindLabel` (a blank/whitespace-only title
 * falls back to the kind label exactly like a missing one). The version
 * number is always folded in unsanitized (it is a plain integer), so
 * downloading v2 and v3 of the same kind always produces two distinct
 * filenames regardless of how `<name>` sanitizes.
 */
export function artifactDownloadFilename(
  artifact: Pick<DownloadableArtifact, "title" | "version">,
  kindLabel: string,
  format: ArtifactDownloadFormat
): string {
  const trimmedTitle = (artifact.title ?? "").trim();
  const rawName = trimmedTitle !== "" ? trimmedTitle : kindLabel;
  const name = sanitizeFilenamePart(rawName);
  return `${name} v${artifact.version}.${format}`;
}

/**
 * Build the downloadable Blob for `artifact` in `format` - the impure half
 * (async; dynamically pulls in docx/pptxgenjs via the existing, already
 * client-safe builders). Never writes anything anywhere (AC 8): this only
 * reads `artifact`'s already-saved fields and returns bytes in memory.
 *
 *   - "md": `artifact.text` verbatim (AC 2).
 *   - "docx": buildDocxFromPlainText(artifact.text) (AC 2).
 *   - "pptx": parseDeckSlidesFromStructured(artifact.structured), passed
 *     straight to buildSlidesPptx - the lossless path (AC 4; see this file's
 *     header comment for why `text` is never used here). The presentation
 *     title is the artifact's own `title`, falling back to `kindLabel` when
 *     null/blank, matching artifactDownloadFilename's own fallback rule.
 *     Throws when zero slides parse - the UI (GeneratedPreviewModal,
 *     gated by artifactDownloadFormats) should never offer "pptx" in that
 *     case, so this is a defense-in-depth guard, not the primary gate.
 */
export async function buildArtifactDownloadBlob(
  artifact: DownloadableArtifact,
  kindLabel: string,
  format: ArtifactDownloadFormat
): Promise<Blob> {
  if (format === "md") {
    return new Blob([artifact.text], { type: ARTIFACT_DOWNLOAD_MIME.md });
  }
  if (format === "docx") {
    const buffer = await buildDocxFromPlainText(artifact.text);
    return new Blob([buffer], { type: ARTIFACT_DOWNLOAD_MIME.docx });
  }
  const slides = parseDeckSlidesFromStructured(artifact.structured);
  if (slides.length === 0) {
    throw new Error(
      `Cannot build a PowerPoint download for "${kindLabel}" (version ${artifact.version}): this version has no usable slide data.`
    );
  }
  const presentationTitle = (artifact.title ?? "").trim() || kindLabel;
  const buffer = await buildSlidesPptx({ presentationTitle, slides });
  return new Blob([buffer], { type: ARTIFACT_DOWNLOAD_MIME.pptx });
}
