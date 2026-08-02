// Pure helpers for embedding an already-uploaded knowledge-base attachment
// inline in a page's Markdown body, without a second upload (AC2). An embed
// is authored as a standalone line containing ONLY a Markdown link whose
// href is the `attachment://<id>` scheme:
//
//   [My Handout](attachment://3fa85f64-5717-4562-b3fc-2c963f66afa6)
//
// The id is the stable reference that gets SAVED in the page body - never a
// signed URL. See src/lib/institution-page-attachments.ts's
// getInstitutionPageAttachmentUrl docstring for why baking an expiring
// signed URL directly into saved markdown would break permanently and
// silently once it expired: PageBody.tsx resolves this id to a fresh signed
// URL every time the page is rendered instead.
//
// Requiring the reference to sit alone on its own line (blank-line
// separated from surrounding prose) keeps resolution at the BLOCK level,
// matching how AttachmentsPanel.tsx's "Insert" button actually authors one
// (see insertEmbedReferenceIntoBody below) rather than needing to splice
// React content into the middle of markdownToHtml's inline HTML output. A
// reference typed inline within a sentence still round-trips through
// markdownToHtml as an ordinary link - graceful degrade, never a parse
// error - it simply is not resolved into an inline embed.

export interface MarkdownBodySegment {
  type: "markdown";
  text: string;
}

export interface EmbedBodySegment {
  type: "embed";
  label: string;
  attachmentId: string;
}

export type BodySegment = MarkdownBodySegment | EmbedBodySegment;

// A line containing nothing but `[label](attachment://id)`, optionally
// padded with surrounding spaces/tabs. The id excludes whitespace and `)` -
// real attachment ids are uuids, which need neither.
const EMBED_LINE_RE = /^[ \t]*\[([^\]]+)\]\(attachment:\/\/([^)\s]+)\)[ \t]*$/;

/**
 * A safe label for an embed reference. File names may legally contain `[`
 * or `]`, either of which would corrupt the `[label](href)` syntax the
 * reference is built from, so both are stripped. Falls back to "Attachment"
 * so a reference is never built with a blank label.
 */
export function sanitizeEmbedLabel(label: string): string {
  const cleaned = label.replace(/[[\]]/g, "").trim();
  return cleaned || "Attachment";
}

/**
 * Build the Markdown reference for embedding an already-uploaded
 * attachment. `attachmentId` is the sole pointer to the file's bytes - this
 * never re-uploads anything (AC2).
 */
export function buildAttachmentEmbedReference(fileName: string, attachmentId: string): string {
  return `[${sanitizeEmbedLabel(fileName)}](attachment://${attachmentId})`;
}

/**
 * Split a page body into an ordered list of plain-Markdown runs and embed
 * references, at line granularity - see the module comment for why a
 * reference must own its whole line to be recognized. Markdown runs are
 * handed to the existing markdownToHtml block renderer unchanged; embed
 * segments are resolved by PageBody.tsx's EmbedBlock. Never throws - an
 * empty or whitespace-only body returns [].
 */
export function splitBodyIntoSegments(body: string): BodySegment[] {
  const lines = (body ?? "").replace(/\r\n/g, "\n").split("\n");
  const segments: BodySegment[] = [];
  let buffer: string[] = [];

  const flushMarkdown = () => {
    if (buffer.length === 0) return;
    const text = buffer.join("\n");
    if (text.trim()) segments.push({ type: "markdown", text });
    buffer = [];
  };

  for (const line of lines) {
    const match = line.match(EMBED_LINE_RE);
    if (match) {
      flushMarkdown();
      segments.push({ type: "embed", label: match[1], attachmentId: match[2] });
    } else {
      buffer.push(line);
    }
  }
  flushMarkdown();

  return segments;
}

export interface InsertReferenceResult {
  /** The full body text after insertion. */
  text: string;
  /** Where the cursor should land after insertion: immediately after the
   * inserted block (including whatever blank-line padding it needed),
   * ready to continue typing before whatever followed the old selection. */
  cursor: number;
}

/**
 * Insert an embed reference at [selectionStart, selectionEnd) in `body`
 * (replacing any selected text), padding it onto its own blank-line-
 * separated block so splitBodyIntoSegments recognizes it - see the module
 * comment. Indices are clamped into range, so a stale or out-of-bounds
 * selection can never throw. Callers with no live text selection (e.g. no
 * textarea mounted yet) can pass body.length for both bounds to append at
 * the end.
 */
export function insertEmbedReferenceIntoBody(
  body: string,
  selectionStart: number,
  selectionEnd: number,
  reference: string
): InsertReferenceResult {
  const start = Math.max(0, Math.min(selectionStart, body.length));
  const end = Math.max(start, Math.min(selectionEnd, body.length));
  const before = body.slice(0, start);
  const after = body.slice(end);

  const leadingGap = before.length === 0 ? "" : before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
  const trailingGap = after.length === 0 ? "" : after.startsWith("\n\n") ? "" : after.startsWith("\n") ? "\n" : "\n\n";

  const insertion = `${leadingGap}${reference}${trailingGap}`;
  const text = `${before}${insertion}${after}`;
  const cursor = before.length + insertion.length;

  return { text, cursor };
}
