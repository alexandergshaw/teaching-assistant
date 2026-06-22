// Shared client-side .docx generation. Both the lecture-plan ZIP download and
// the per-document download in the editor build Word documents through this one
// function so they stay visually identical. `docx` is imported dynamically so it
// stays out of the main bundle until a download is requested.

import { looksLikeAssignmentSlug, stripAssignmentSlugPrefix } from "./assignment-name";

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
 * headings, paragraphs, "1." / "-" lists, and bare URLs) into a polished,
 * branded Word document and return it as an ArrayBuffer.
 *
 * When `templateHeadings` is supplied, only lines exactly matching one of those
 * headings are promoted to a heading; body text is never promoted.
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
  } = await import("docx");

  // Professional, branded document palette (matches the app + slide decks).
  const FONT = "Calibri";
  const BODY = "1F2937"; // near-black slate for body copy
  const NAVY = "1A2744"; // brand navy for the title + section headings
  const ACCENT = "2563EB"; // link blue
  const RULE = "D1D5DB"; // light divider under section headings
  const MUTED = "6B7280"; // footer / secondary text

  const URL_RE = /(https?:\/\/[^\s)]+)/g;

  type Run = InstanceType<typeof TextRun> | InstanceType<typeof ExternalHyperlink>;

  // Split a string into runs, turning bare URLs into real, styled hyperlinks.
  const runsFromText = (content: string, bold = false): Run[] => {
    const runs: Run[] = [];
    for (const part of content.split(URL_RE)) {
      if (!part) continue;
      if (/^https?:\/\//.test(part)) {
        runs.push(
          new ExternalHyperlink({
            link: part,
            children: [new TextRun({ text: part, font: FONT, color: ACCENT, underline: {} })],
          })
        );
      } else {
        runs.push(new TextRun({ text: part, font: FONT, color: BODY, bold }));
      }
    }
    return runs;
  };

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

  const children: InstanceType<typeof Paragraph>[] = [];
  const lines = text.split("\n");
  let firstHeadingFound = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;

    const markdownMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
    const prevBlank = i === 0 || !lines[i - 1].trim();
    const nextBlank = i >= lines.length - 1 || !lines[i + 1].trim();
    const isListItem = /^(\d+\.|[-•*])\s/.test(trimmed);

    let isHeading: boolean;
    let headingText = trimmed;
    let markdownIsTitle = false;

    if (markdownMatch) {
      isHeading = true;
      headingText = markdownMatch[2].trim();
      markdownIsTitle = markdownMatch[1].length === 1;
    } else if (hasTemplate) {
      isHeading = allowedHeadings.has(normalizeHeading(trimmed));
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
      const isTitle = markdownMatch ? markdownIsTitle : !firstHeadingFound;
      firstHeadingFound = true;
      // Drop a leaked machine-slug prefix (e.g. "review1: ") while leaving a
      // legitimate human title like "Assignment 3: …" untouched.
      const cleanHeading = stripAssignmentSlugPrefix(headingText);
      if (isTitle) {
        // Document title: large navy heading with a navy rule beneath it.
        children.push(
          new Paragraph({
            children: [new TextRun({ text: cleanHeading, font: FONT, color: NAVY, bold: true, size: 36 })],
            spacing: { after: 200 },
            border: { bottom: { style: BorderStyle.SINGLE, size: 12, space: 6, color: NAVY } },
          })
        );
      } else {
        // Section heading: navy small-caps with a light divider underneath.
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: cleanHeading, font: FONT, color: NAVY, bold: true, size: 24, allCaps: true }),
            ],
            spacing: { before: 320, after: 120 },
            border: { bottom: { style: BorderStyle.SINGLE, size: 4, space: 4, color: RULE } },
          })
        );
      }
    } else if (/^(?:\d+\.|[-•*])\s+/.test(trimmed)) {
      // List items always render as bullets — generated documents never use
      // numbered lists, so a "1." line is stripped of its number and bulleted.
      children.push(
        new Paragraph({
          children: buildLabeledRuns(trimmed.replace(/^(?:\d+\.|[-•*])\s+/, "")),
          bullet: { level: 0 },
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
    // App-wide professional defaults: clean body font, comfortable line spacing.
    styles: {
      default: {
        document: {
          run: { font: FONT, size: 22, color: BODY },
          paragraph: { spacing: { after: 140, line: 276 } },
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
