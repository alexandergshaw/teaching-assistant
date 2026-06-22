// Shared client-side .docx generation. Both the lecture-plan ZIP download and
// the per-document download in the editor build Word documents through this one
// function so they stay visually identical. `docx` is imported dynamically so it
// stays out of the main bundle until a download is requested.

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
    LevelFormat,
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
  // Each contiguous run of "1. 2. 3." items gets its own numbering instance so
  // numbering restarts per section instead of running on across the document.
  type DocOptions = ConstructorParameters<typeof Document>[0];
  type NumberingConfig = NonNullable<DocOptions["numbering"]>["config"][number];
  const numberingConfigs: NumberingConfig[] = [];
  let orderedGroups = 0;
  let currentOrderedRef: string | null = null;
  let prevWasOrdered = false;

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
      isHeading = trimmed.length < 80 && !isListItem && prevBlank && nextBlank;
    }

    if (isHeading) {
      prevWasOrdered = false;
      const isTitle = markdownMatch ? markdownIsTitle : !firstHeadingFound;
      firstHeadingFound = true;
      if (isTitle) {
        // Document title: large navy heading with a navy rule beneath it.
        children.push(
          new Paragraph({
            children: [new TextRun({ text: headingText, font: FONT, color: NAVY, bold: true, size: 36 })],
            spacing: { after: 200 },
            border: { bottom: { style: BorderStyle.SINGLE, size: 12, space: 6, color: NAVY } },
          })
        );
      } else {
        // Section heading: navy small-caps with a light divider underneath.
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: headingText, font: FONT, color: NAVY, bold: true, size: 24, allCaps: true }),
            ],
            spacing: { before: 320, after: 120 },
            border: { bottom: { style: BorderStyle.SINGLE, size: 4, space: 4, color: RULE } },
          })
        );
      }
    } else if (/^\d+\.\s+/.test(trimmed)) {
      if (!prevWasOrdered) {
        orderedGroups += 1;
        currentOrderedRef = `ordered-${orderedGroups}`;
        numberingConfigs.push({
          reference: currentOrderedRef,
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: "%1.",
              alignment: AlignmentType.START,
              style: { paragraph: { indent: { left: 460, hanging: 260 } } },
            },
          ],
        });
      }
      prevWasOrdered = true;
      children.push(
        new Paragraph({
          children: buildLabeledRuns(trimmed.replace(/^\d+\.\s+/, "")),
          numbering: { reference: currentOrderedRef as string, level: 0 },
          spacing: { after: 80 },
        })
      );
    } else if (/^[-•*]\s+/.test(trimmed)) {
      prevWasOrdered = false;
      children.push(
        new Paragraph({
          children: buildLabeledRuns(trimmed.slice(trimmed.indexOf(" ") + 1)),
          bullet: { level: 0 },
          spacing: { after: 80 },
        })
      );
    } else {
      prevWasOrdered = false;
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
    numbering: { config: numberingConfigs },
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
  return Packer.toArrayBuffer(doc);
}
