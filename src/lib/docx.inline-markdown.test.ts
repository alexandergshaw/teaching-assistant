import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { buildDocxFromPlainText } from "./docx";

// DEFECT 1 (real generated artifact: "INFO 1020 - Class Opener - Week
// 8.docx"): nine text runs carried unrendered markdown - "**Model Scenario:"
// / " A Library Book System**", "*Result:* The `Patron` calls
// `request_book()`...", "**The logic result:** If the `amount` (100) is
// greater than the `balance` (50)...", "Imagine you have a `BankClient`..." -
// so a student read literal asterisks and backticks instead of bold text and
// inline code. buildDocxFromPlainText already handled markdown links,
// "Label:" bolding, headings, pipe tables, and fenced code, but never
// inline **bold**, *italic*, or `code` spans - they fell through as literal
// characters. See docx.ts's parseMarkdownSpans/hasUnbalancedMarkdownDelimiter
// (and the doc comments there) for the fix.
//
// Split into its own file (matching how
// steps.course-schedule-from-source.course-kind-precedence.test.ts was split
// out to stay under this repo's 1000-line-per-file cap) rather than folded
// into docx.test.ts, which is already at that cap.
//
// These render a real .docx and unpack the actual XML (not the parser in
// isolation), the same discipline the sibling "markdown links" describe
// block in docx.test.ts uses - a wiring bug between the new inline-span
// parser and the existing run-building path (runsFromText/buildLabeledRuns)
// is what turns these red.
async function unpack(buffer: ArrayBuffer) {
  const zip = await JSZip.loadAsync(buffer);
  const documentXml = await zip.file("word/document.xml")!.async("string");
  const relsFile = zip.file("word/_rels/document.xml.rels");
  const relsXml = relsFile ? await relsFile.async("string") : "";
  return { documentXml, relsXml };
}

function paragraphsOf(documentXml: string): string[] {
  return documentXml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? [];
}

function runsOf(xml: string): string[] {
  return xml.match(/<w:r>[\s\S]*?<\/w:r>/g) ?? [];
}

function tablesOf(documentXml: string): string[] {
  return documentXml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) ?? [];
}
function tableRowsOf(tableXml: string): string[] {
  return tableXml.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) ?? [];
}
function tableCellsOf(rowXml: string): string[] {
  return rowXml.match(/<w:tc>[\s\S]*?<\/w:tc>/g) ?? [];
}

function relationshipTarget(relsXml: string, rId: string): string | undefined {
  const match = relsXml.match(new RegExp(`<Relationship Id="${rId}"[^>]*Target="([^"]+)"`));
  return match?.[1];
}

describe("buildDocxFromPlainText: inline markdown emphasis (bold/italic/code)", () => {
  it("renders **bold** as a real bold run with no literal asterisks", async () => {
    const buffer = await buildDocxFromPlainText(
      ["Intro paragraph before.", "This step is **very important** to get right.", "Trailing paragraph after."].join(
        "\n"
      )
    );
    const { documentXml } = await unpack(buffer);
    const paragraphs = paragraphsOf(documentXml);
    const paragraph = paragraphs.find((p) => p.includes("very important"));
    expect(paragraph).toBeDefined();

    expect(paragraph).not.toContain("*");
    const runs = runsOf(paragraph!);
    const boldRun = runs.find((r) => r.includes(">very important<"));
    expect(boldRun).toBeDefined();
    expect(boldRun).toMatch(/<w:b\/>/);
  });

  it("renders *italic* as a real italic run with no literal asterisks", async () => {
    const buffer = await buildDocxFromPlainText(
      ["Intro paragraph before.", "*Result:* the value is returned unchanged.", "Trailing paragraph after."].join("\n")
    );
    const { documentXml } = await unpack(buffer);
    const paragraphs = paragraphsOf(documentXml);
    const paragraph = paragraphs.find((p) => p.includes("Result"));
    expect(paragraph).toBeDefined();

    expect(paragraph).not.toContain("*");
    const runs = runsOf(paragraph!);
    const italicRun = runs.find((r) => r.includes(">Result:<"));
    expect(italicRun).toBeDefined();
    expect(italicRun).toMatch(/<w:i\/>/);
    expect(italicRun).not.toMatch(/<w:b\/>/);
  });

  it("renders `code` as a monospace run with no literal backticks, and applies no block-level shading", async () => {
    const buffer = await buildDocxFromPlainText(
      ["Intro paragraph before.", "The `Patron` calls `request_book()` on the object.", "Trailing paragraph after."].join(
        "\n"
      )
    );
    const { documentXml } = await unpack(buffer);
    const paragraphs = paragraphsOf(documentXml);
    const paragraph = paragraphs.find((p) => p.includes("calls"));
    expect(paragraph).toBeDefined();

    expect(paragraph).not.toContain("`");
    const runs = runsOf(paragraph!);
    const patronRun = runs.find((r) => r.includes(">Patron<"));
    const callRun = runs.find((r) => r.includes(">request_book()<"));
    expect(patronRun).toBeDefined();
    expect(callRun).toBeDefined();
    expect(patronRun).toMatch(/w:ascii="Consolas"/);
    expect(callRun).toMatch(/w:ascii="Consolas"/);
    // Inline code gets the monospace font only - not the fenced-code block's
    // paragraph-level grey shading, which is a block-only look.
    expect(paragraph).not.toMatch(/w:shd/);
  });

  it("renders a line mixing prose, code spans, and punctuation as ordered runs (the exact real-document shape)", async () => {
    const buffer = await buildDocxFromPlainText(
      [
        "Intro paragraph before.",
        "*Result:* The `Patron` calls `request_book()`, which checks the `is_checked_out` attribute of a `Book`.",
        "Trailing paragraph after.",
      ].join("\n")
    );
    const { documentXml } = await unpack(buffer);
    const paragraphs = paragraphsOf(documentXml);
    const paragraph = paragraphs.find((p) => p.includes("checks the"));
    expect(paragraph).toBeDefined();
    expect(paragraph).not.toContain("*");
    expect(paragraph).not.toContain("`");

    const resultIdx = paragraph!.indexOf(">Result:<");
    const patronIdx = paragraph!.indexOf(">Patron<");
    const callIdx = paragraph!.indexOf(">request_book()<");
    const checkedIdx = paragraph!.indexOf(">is_checked_out<");
    const bookIdx = paragraph!.indexOf(">Book<");

    for (const idx of [resultIdx, patronIdx, callIdx, checkedIdx, bookIdx]) expect(idx).toBeGreaterThan(-1);
    expect(resultIdx).toBeLessThan(patronIdx);
    expect(patronIdx).toBeLessThan(callIdx);
    expect(callIdx).toBeLessThan(checkedIdx);
    expect(checkedIdx).toBeLessThan(bookIdx);
  });

  it("does not apply inline markdown emphasis inside a fenced code block", async () => {
    const buffer = await buildDocxFromPlainText(
      ["```", "x = 2 * y  # not italic, this is multiplication", "print(`not code span either`)", "```"].join("\n")
    );
    const { documentXml } = await unpack(buffer);

    expect(documentXml).toContain("x = 2 * y  # not italic, this is multiplication");
    expect(documentXml).toContain("print(`not code span either`)");
  });

  // ── The interaction the design guidance explicitly calls out: a "Label:"
  // heuristic bolding a leading prefix must never collide with a
  // generator-authored **bold**/`code` span across the SAME colon, and must
  // never leave either double-bolded or mangled with stray asterisks.
  describe("interaction with the Label: bolding heuristic", () => {
    it("renders a whole-line bold span that happens to contain a colon as ONE bold run, not a mangled label split", async () => {
      // The exact shape from the real generated document: "**Model
      // Scenario: A Library Book System**" - cutting at the first colon
      // (buildLabeledRuns' own heuristic) would sever this single bold span
      // into "**Model Scenario:" (bolded, asterisks and all) and
      // " A Library Book System**" (plain, with a stray trailing "**").
      const buffer = await buildDocxFromPlainText(
        ["Intro paragraph before.", "**Model Scenario: A Library Book System**", "Trailing paragraph after."].join(
          "\n"
        )
      );
      const { documentXml } = await unpack(buffer);
      const paragraphs = paragraphsOf(documentXml);
      const paragraph = paragraphs.find((p) => p.includes("Model Scenario"));
      expect(paragraph).toBeDefined();

      // No literal asterisks survive anywhere in this paragraph.
      expect(paragraph).not.toContain("*");

      const runs = runsOf(paragraph!);
      // Exactly one run carries the whole sentence, and it is bold.
      const wholeLineRun = runs.find((r) => r.includes(">Model Scenario: A Library Book System<"));
      expect(wholeLineRun).toBeDefined();
      expect(wholeLineRun).toMatch(/<w:b\/>/);
    });

    it("bolds a **Label:** prefix exactly once and keeps the remainder (including inline code) normal weight", async () => {
      // "**The logic result:** If the `amount` (100) is greater than the
      // `balance` (50)..." - the label heuristic's own regex already fails
      // to match here (the char right after the cut-point colon is the
      // second "*" of the closing "**", not whitespace), so this also
      // exercises that this line renders correctly WITHOUT relying on the
      // hasUnbalancedMarkdownDelimiter guard catching it.
      const buffer = await buildDocxFromPlainText(
        [
          "Intro paragraph before.",
          "**The logic result:** If the `amount` (100) is greater than the `balance` (50), withdraw fails.",
          "Trailing paragraph after.",
        ].join("\n")
      );
      const { documentXml } = await unpack(buffer);
      const paragraphs = paragraphsOf(documentXml);
      const paragraph = paragraphs.find((p) => p.includes("logic result"));
      expect(paragraph).toBeDefined();
      expect(paragraph).not.toContain("*");
      expect(paragraph).not.toContain("`");

      const runs = runsOf(paragraph!);
      // The label itself is bolded exactly once - not twice, and its text
      // does not leak into a second bold run.
      const boldRuns = runs.filter((r) => r.includes(">The logic result:<"));
      expect(boldRuns).toHaveLength(1);
      expect(boldRuns[0]).toMatch(/<w:b\/>/);

      // The remainder is normal weight, with its two code spans monospaced.
      const remainderRun = runs.find((r) => r.includes("If the"));
      expect(remainderRun).toBeDefined();
      expect(remainderRun).not.toMatch(/<w:b\/>/);

      const amountRun = runs.find((r) => r.includes(">amount<"));
      const balanceRun = runs.find((r) => r.includes(">balance<"));
      expect(amountRun).toMatch(/w:ascii="Consolas"/);
      expect(balanceRun).toMatch(/w:ascii="Consolas"/);
      expect(amountRun).not.toMatch(/<w:b\/>/);
    });

    it("still bolds an ordinary, markdown-free Label: prefix exactly as before (no regression)", async () => {
      const buffer = await buildDocxFromPlainText(
        ["Intro paragraph before.", "Note: this is a plain label with no markdown at all.", "Trailing paragraph after."].join(
          "\n"
        )
      );
      const { documentXml } = await unpack(buffer);
      const paragraphs = paragraphsOf(documentXml);
      const paragraph = paragraphs.find((p) => p.includes(">Note:<"));
      expect(paragraph).toBeDefined();

      const runs = runsOf(paragraph!);
      const labelRun = runs.find((r) => r.includes(">Note:<"));
      expect(labelRun).toMatch(/<w:b\/>/);
      const remainderRun = runs.find((r) => r.includes("this is a plain label"));
      expect(remainderRun).toBeDefined();
      expect(remainderRun).not.toMatch(/<w:b\/>/);
    });

    it("still linkifies a bare URL in the remainder of a **bold** Label: line", async () => {
      const buffer = await buildDocxFromPlainText(
        [
          "Intro paragraph before.",
          "**Note:** see https://example.com/guide for the full walkthrough.",
          "Trailing paragraph after.",
        ].join("\n")
      );
      const { documentXml, relsXml } = await unpack(buffer);
      const paragraphs = paragraphsOf(documentXml);
      const paragraph = paragraphs.find((p) => p.includes(">Note:<") && p.includes("<w:hyperlink"));
      expect(paragraph).toBeDefined();

      const runs = runsOf(paragraph!);
      const labelRun = runs.find((r) => r.includes(">Note:<"));
      expect(labelRun).toMatch(/<w:b\/>/);

      const rId = paragraph!.match(/<w:hyperlink[^>]*r:id="([^"]+)"/)?.[1];
      expect(relationshipTarget(relsXml, rId!)).toBe("https://example.com/guide");
    });
  });

  it("does not misread an unpaired asterisk used as multiplication as italic", async () => {
    const buffer = await buildDocxFromPlainText(
      ["Intro paragraph before.", "3 * 4 and 5 * 6 are both examples of multiplication.", "Trailing paragraph after."].join(
        "\n"
      )
    );
    const { documentXml } = await unpack(buffer);
    const paragraphs = paragraphsOf(documentXml);
    const paragraph = paragraphs.find((p) => p.includes("multiplication"));
    expect(paragraph).toBeDefined();

    // The asterisks survive as literal text; nothing was coerced into an
    // italic run, and no character was dropped.
    expect(paragraph).toContain("3 * 4 and 5 * 6 are both examples of multiplication.");
    expect(paragraph).not.toMatch(/<w:i\/>/);
  });

  it("renders markdown emphasis inside a markdown table cell", async () => {
    const buffer = await buildDocxFromPlainText(
      ["| Term | Meaning |", "| --- | --- |", "| Patron | Calls `request_book()` to **borrow** a book. |"].join("\n")
    );
    const { documentXml } = await unpack(buffer);
    const rows = tableRowsOf(tablesOf(documentXml)[0]);
    const cell = tableCellsOf(rows[1])[1];

    expect(cell).not.toContain("*");
    expect(cell).not.toContain("`");
    const runs = runsOf(cell);
    expect(runs.find((r) => r.includes(">request_book()<"))).toMatch(/w:ascii="Consolas"/);
    expect(runs.find((r) => r.includes(">borrow<"))).toMatch(/<w:b\/>/);
  });
});
