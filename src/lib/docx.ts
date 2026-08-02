// Shared client-side .docx generation. Both the lecture-plan ZIP download and
// the per-document download in the editor build Word documents through this one
// function so they stay visually identical. `docx` is imported dynamically so it
// stays out of the main bundle until a download is requested.

import { looksLikeAssignmentSlug, stripAssignmentSlugPrefix } from "./assignment-name";
import {
  CodeFenceTracker,
  MARKDOWN_HEADING_RE,
  bulletLevelFromIndent,
  hasMarkdownHeading,
  markdownHeadingKind,
  normalizeTableRowWidth,
  parseMarkdownTable,
  stripListMarker,
  tokenizeInline,
  type HeadingKind,
  type ParsedMarkdownTable,
} from "./docx-blocks";
import { normalizeTypography } from "./text-normalize";

// The docx library writes an empty docProps/app.xml, whereas a file actually
// saved from Word always names the application and version. This is the
// extended-properties payload Word itself produces for a plain document, so the
// finished file is indistinguishable from one the user saved by hand. Counts are
// left at zero (Word recomputes them on next open) and Company is blank.
const WORD_APP_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' +
  '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">' +
  "<Template>Normal.dotm</Template>" +
  "<TotalTime>1</TotalTime>" +
  "<Pages>1</Pages>" +
  "<Words>0</Words>" +
  "<Characters>0</Characters>" +
  "<Application>Microsoft Office Word</Application>" +
  "<DocSecurity>0</DocSecurity>" +
  "<Lines>0</Lines>" +
  "<Paragraphs>0</Paragraphs>" +
  "<ScaleCrop>false</ScaleCrop>" +
  "<Company></Company>" +
  "<LinksUpToDate>false</LinksUpToDate>" +
  "<CharactersWithSpaces>0</CharactersWithSpaces>" +
  "<SharedDoc>false</SharedDoc>" +
  "<HyperlinksChanged>false</HyperlinksChanged>" +
  "<AppVersion>16.0000</AppVersion>" +
  "</Properties>";

/**
 * Rewrite a packed .docx so its docProps/app.xml matches what Microsoft Word
 * writes, instead of the empty placeholder the docx library emits. Every .docx
 * the app produces is passed through here before download so the extended
 * properties carry no sign of how the file was generated.
 */
export async function stampDocxAppProperties(buffer: ArrayBuffer): Promise<ArrayBuffer> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(buffer);
  zip.file("docProps/app.xml", WORD_APP_XML);
  // DEFLATE so the repacked file matches the compression Word itself uses.
  return zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE" });
}

/**
 * Render markdown-ish plain text (a title, "## section" headings or heuristic
 * headings, paragraphs, "1." / "-" lists, fenced ``` code blocks, bare URLs,
 * markdown `[text](url)` links, and markdown pipe tables) into a polished,
 * branded Word document and return it as an ArrayBuffer.
 *
 * Headings render as real Word paragraph styles (Title/Heading1/Heading2/
 * Heading3) rather than bare bold runs, so the document gets a genuine
 * navigation-pane outline. A markdown "#" is the Title, "##"/"###"/"####" map
 * to Heading 1/2/3, and a stray "#####"/"######" also collapses to Heading 3.
 * List items nest up to two levels deep, keyed off the source line's leading
 * indentation (0-1 spaces -> level 0, 2-3 -> level 1, 4+ -> level 2). A
 * fenced ``` block renders as a shaded, monospace, non-bulleted block; nothing
 * inside it is promoted to a heading, bulleted, or linkified - including
 * markdown links, which render as literal bracket-and-paren text there.
 *
 * A markdown pipe table (a header row, a `| --- | --- |` separator row, and
 * zero or more body rows) becomes a real Word table (`<w:tbl>`), not literal
 * "| a | b |" text - see `parseMarkdownTable` in ./docx-blocks for exactly
 * what is recognized and `buildTableFromMarkdown` below for how it renders.
 * The header row is marked as a repeating header row (`<w:tblHeader/>`),
 * which is also the accessibility signal a screen reader uses to announce
 * column headers for the body cells below. A malformed candidate (no valid
 * separator row on the line right after it) is never promoted - it renders
 * as ordinary paragraph text exactly as it always has.
 *
 * Both bare URLs and markdown `[text](url)` links become real, identically
 * styled hyperlinks (see `tokenizeInline` in ./docx-blocks for the precedence
 * and malformed-syntax rules); a markdown link always wins where the two
 * could overlap, and its display text is never itself re-scanned for URLs.
 *
 * When `templateHeadings` is supplied, only lines exactly matching one of those
 * headings are promoted to a heading; body text is never promoted. Otherwise,
 * when the document contains at least one markdown heading line (`#`..`######`)
 * anywhere, those headings are authoritative for the WHOLE document and the
 * length/blank-line heuristic below never runs at all - every non-`#` line
 * outside a fence is body text (see `hasMarkdownHeading` in ./docx-blocks).
 * Only when a document has neither `templateHeadings` nor any markdown heading
 * does the length/blank-line heuristic promote an isolated short line to a
 * heading, exactly as it always has.
 *
 * The whole `text` payload is run through `normalizeTypography` (./text-
 * normalize) before anything else happens, so every em/en dash and curly
 * quote an LLM generator emits is already plain ASCII by the time any line
 * classification, table parsing, or inline tokenization sees it - see that
 * function's doc comment for the exact substitution rules; it is fence- and
 * URL-aware, so a fenced code block or a bare URL is passed through
 * untouched either way.
 *
 * `author` is written into the document's core properties so the file reads as
 * the user's own work; when omitted, no author is recorded at all (rather than
 * the "Un-named" placeholder the docx library would otherwise insert).
 */
export async function buildDocxFromPlainText(
  text: string,
  templateHeadings?: string[],
  author?: string
): Promise<ArrayBuffer> {
  const {
    Document,
    Packer,
    Paragraph,
    TextRun,
    ExternalHyperlink,
    Footer,
    PageNumber,
    AlignmentType,
    BorderStyle,
    HeadingLevel,
    ShadingType,
    Table,
    TableRow,
    TableCell,
    WidthType,
  } = await import("docx");

  // Professional, branded document palette (matches the app + slide decks).
  const FONT = "Calibri";
  const BODY = "1F2937"; // near-black slate for body copy
  const NAVY = "1A2744"; // brand navy for the title + section headings
  const ACCENT = "2563EB"; // link blue
  const RULE = "D1D5DB"; // light divider under section headings
  const MUTED = "6B7280"; // footer / secondary text
  const CODE_FONT = "Consolas"; // Word substitutes a fallback (e.g. Courier New) when unavailable
  const CODE_BG = "F3F4F6"; // light grey shading behind fenced code blocks

  type Run = InstanceType<typeof TextRun> | InstanceType<typeof ExternalHyperlink>;

  // Split a string into runs, turning bare URLs and markdown `[text](url)`
  // links alike into real, identically-styled hyperlinks. The actual
  // recognition (precedence, malformed-syntax fallback, token order) lives in
  // the pure `tokenizeInline` helper; this just maps its tokens onto the docx
  // Run types.
  const runsFromText = (content: string, bold = false): Run[] =>
    tokenizeInline(content).map((token) =>
      token.kind === "link"
        ? new ExternalHyperlink({
            link: token.url,
            children: [new TextRun({ text: token.text, font: FONT, color: ACCENT, underline: {} })],
          })
        : new TextRun({ text: token.text, font: FONT, color: BODY, bold })
    );

  // Normalize heading text for robust matching (case, surrounding punctuation,
  // numbering prefixes, and whitespace are ignored).
  const normalizeHeading = (value: string) =>
    value
      .toLowerCase()
      .replace(/^[\d.)\s-]+/, "")
      .replace(/[:.\s]+$/, "")
      .replace(/\s+/g, " ")
      .trim();

  const hasTemplate = Array.isArray(templateHeadings) && templateHeadings.length > 0;
  const allowedHeadings = new Set((templateHeadings ?? []).map(normalizeHeading));

  // When a line begins with a short "Label:" prefix, bold the label and leave
  // the remainder normal (with hyperlinks detected throughout).
  const buildLabeledRuns = (content: string): Run[] => {
    const labelMatch = content.match(/^([^:\n]{1,80}:)(\s[\s\S]*)?$/);
    if (labelMatch) {
      const runs: Run[] = [new TextRun({ text: labelMatch[1], font: FONT, color: BODY, bold: true })];
      if (labelMatch[2]) runs.push(...runsFromText(labelMatch[2]));
      return runs;
    }
    return runsFromText(content);
  };

  // Real Word heading styles, keyed by the same values HeadingLevel exposes, so
  // a paragraph's `heading` option both renders `<w:pStyle w:val="…"/>` and
  // picks up the matching look defined below.
  const HEADING_LEVEL_BY_KIND: Record<HeadingKind, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
    TITLE: HeadingLevel.TITLE,
    HEADING_1: HeadingLevel.HEADING_1,
    HEADING_2: HeadingLevel.HEADING_2,
    HEADING_3: HeadingLevel.HEADING_3,
  };

  const buildHeadingParagraph = (kind: HeadingKind, headingText: string) =>
    new Paragraph({
      heading: HEADING_LEVEL_BY_KIND[kind],
      children: [new TextRun({ text: headingText })],
    });

  // A fenced code block line: verbatim monospace text, shaded and indented,
  // with tightened spacing so the block reads as one unit.
  const buildCodeParagraph = (rawLine: string) =>
    new Paragraph({
      children: [new TextRun({ text: rawLine, font: CODE_FONT, color: BODY, size: 18 })],
      shading: { fill: CODE_BG, type: ShadingType.CLEAR, color: "auto" },
      indent: { left: 180 },
      spacing: { after: 0, line: 240 },
    });

  // A markdown pipe table becomes a real Word table with the same NAVY-header
  // brand look already used for the one hand-built table in the app (the
  // course-schedule table in steps.course-guides.ts), so every generated
  // table reads as one design. `tableHeader: true` on the header row is what
  // docx renders as `<w:tblHeader/>` - Word's "repeat as header row" flag,
  // and the signal a screen reader uses to announce column headers for the
  // body cells below (the accessibility requirement a table without it
  // fails). Body-cell text still goes through `runsFromText`, so a bare URL
  // or markdown link inside a cell still becomes a real hyperlink like
  // anywhere else in the document; a header cell is always a single bold
  // white run (headers are short labels - a hyperlinked header has no real
  // use case here, and keeping it to one run keeps the header row simple).
  const buildTableFromMarkdown = (table: ParsedMarkdownTable) => {
    const columnCount = table.headerCells.length;

    const buildCell = (text: string, isHeader: boolean) =>
      new TableCell({
        shading: isHeader ? { fill: NAVY, type: ShadingType.CLEAR, color: "auto" } : undefined,
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [
          new Paragraph({
            spacing: { after: 0 },
            children: isHeader
              ? [new TextRun({ text, font: FONT, color: "FFFFFF", bold: true, size: 20 })]
              : runsFromText(text),
          }),
        ],
      });

    const buildRow = (cells: string[], isHeader: boolean) =>
      new TableRow({
        tableHeader: isHeader,
        children: normalizeTableRowWidth(cells, columnCount).map((cellText) => buildCell(cellText, isHeader)),
      });

    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [buildRow(table.headerCells, true), ...table.bodyRows.map((row) => buildRow(row, false))],
    });
  };

  const children: Array<InstanceType<typeof Paragraph> | InstanceType<typeof Table>> = [];
  // The whole payload is normalized (em/en dashes and curly quotes -> plain
  // ASCII - see normalizeTypography's doc comment) before it is split into
  // lines, so every downstream pass - heading detection, table parsing,
  // inline tokenization - already sees plain ASCII and needs no normalization
  // logic of its own.
  const normalizedText = normalizeTypography(text);
  const lines = normalizedText.split("\n");
  let firstHeadingFound = false;
  const fence = new CodeFenceTracker();

  // A document-level pre-pass (fence-aware): when ANY line anywhere in the
  // document is a markdown heading, markdown headings are authoritative for
  // the whole document and the length/blank-line heuristic below must never
  // run - a document already using explicit headings must never have
  // ordinary body text guessed into a heading. Computed once, up front, so a
  // heading appearing late in the document still disables the heuristic for
  // every line above it.
  const documentHasMarkdownHeadings = hasMarkdownHeading(lines);

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();
    const fenceState = fence.consume(trimmed);

    // The ``` marker itself never renders as a paragraph.
    if (fenceState === "delimiter") continue;

    // Inside a fence: every line renders verbatim, including blank ones — no
    // heading promotion, no bullets, no URL linkification, no label bolding.
    if (fenceState === "code") {
      children.push(buildCodeParagraph(rawLine));
      continue;
    }

    if (!trimmed) continue;

    // A markdown pipe table becomes a real Word table, not literal
    // "| a | b |" text. Tried before heading/list/paragraph classification -
    // a table header row would never match those anyway (it starts with "|"
    // or ordinary text, not "#"/"-"/a digit-dot), so this ordering never
    // steals a line that would otherwise have been a heading or a bullet. A
    // malformed candidate (no valid separator row on the very next line)
    // returns null from parseMarkdownTable and this line falls straight
    // through to ordinary paragraph handling below, completely unchanged -
    // the "degrade to the original text" behavior a broken table must have.
    const tableMatch = parseMarkdownTable(lines, i);
    if (tableMatch) {
      children.push(buildTableFromMarkdown(tableMatch));
      i += tableMatch.lineCount - 1; // the for-loop's own i++ takes the final step
      continue;
    }

    const markdownMatch = trimmed.match(MARKDOWN_HEADING_RE);
    const prevBlank = i === 0 || !lines[i - 1].trim();
    const nextBlank = i >= lines.length - 1 || !lines[i + 1].trim();
    const listContent = stripListMarker(trimmed);
    const isListItem = listContent !== null;

    let isHeading: boolean;
    let headingText = trimmed;
    let headingKind: HeadingKind = "HEADING_1";

    if (markdownMatch) {
      isHeading = true;
      headingText = markdownMatch[2].trim();
      headingKind = markdownHeadingKind(markdownMatch[1].length);
    } else if (hasTemplate) {
      isHeading = allowedHeadings.has(normalizeHeading(trimmed));
    } else if (documentHasMarkdownHeadings) {
      // The document already uses explicit markdown headings elsewhere, so
      // they are authoritative for the whole document - this non-"#" line is
      // body text, never guessed into a heading by the heuristic below.
      isHeading = false;
    } else {
      // A short, isolated line is a heading — unless it is just a machine slug
      // ("review2", "assignment3"), which must stay body text, never a heading.
      isHeading =
        trimmed.length < 80 &&
        !isListItem &&
        prevBlank &&
        nextBlank &&
        !looksLikeAssignmentSlug(trimmed);
    }

    if (isHeading) {
      // Non-markdown paths (heuristic or templateHeadings) never carry their
      // own depth signal: the first heading found is the Title and every one
      // after it is Heading 1 — exactly today's two-level behavior.
      if (!markdownMatch) headingKind = firstHeadingFound ? "HEADING_1" : "TITLE";
      firstHeadingFound = true;
      // Drop a leaked machine-slug prefix (e.g. "review1: ") while leaving a
      // legitimate human title like "Assignment 3: …" untouched.
      const cleanHeading = stripAssignmentSlugPrefix(headingText);
      children.push(buildHeadingParagraph(headingKind, cleanHeading));
    } else if (isListItem) {
      // List items always render as bullets — generated documents never use
      // numbered lists, so a "1." line is stripped of its number and bulleted.
      // The nesting level comes from the source line's leading indentation.
      children.push(
        new Paragraph({
          children: buildLabeledRuns(listContent),
          bullet: { level: bulletLevelFromIndent(rawLine) },
          spacing: { after: 80 },
        })
      );
    } else {
      children.push(new Paragraph({ children: buildLabeledRuns(trimmed) }));
    }
  }

  const doc = new Document({
    // Stamp authorship into the core properties. Passing an empty string when no
    // author is known keeps the field blank rather than letting the docx library
    // fall back to its "Un-named" placeholder.
    creator: author ?? "",
    lastModifiedBy: author ?? "",
    // App-wide professional defaults: clean body font, comfortable line spacing,
    // plus the real Title/Heading1/Heading2/Heading3 styles paragraphs opt into
    // via `heading:`. These override docx's built-in (blue, unbranded) heading
    // styles in place — rather than adding separate custom style ids — so
    // styles.xml never ends up with two definitions for the same style id.
    styles: {
      default: {
        document: {
          run: { font: FONT, size: 22, color: BODY },
          paragraph: { spacing: { after: 140, line: 276 } },
        },
        title: {
          run: { font: FONT, color: NAVY, bold: true, size: 36 },
          paragraph: {
            spacing: { after: 200 },
            border: { bottom: { style: BorderStyle.SINGLE, size: 12, space: 6, color: NAVY } },
          },
        },
        heading1: {
          run: { font: FONT, color: NAVY, bold: true, size: 24, allCaps: true },
          paragraph: {
            spacing: { before: 320, after: 120 },
            border: { bottom: { style: BorderStyle.SINGLE, size: 4, space: 4, color: RULE } },
          },
        },
        heading2: {
          run: { font: FONT, color: NAVY, bold: true, size: 22 },
          paragraph: { spacing: { before: 240, after: 100 } },
        },
        heading3: {
          run: { font: FONT, color: BODY, bold: true, size: 22 },
          paragraph: { spacing: { before: 200, after: 80 } },
        },
      },
    },
    sections: [
      {
        properties: { page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 18, color: MUTED }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });
  return stampDocxAppProperties(await Packer.toArrayBuffer(doc));
}
