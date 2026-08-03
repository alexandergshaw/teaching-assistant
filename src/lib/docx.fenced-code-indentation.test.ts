import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { buildDocxFromPlainText } from "./docx";

// DEFECT 2 TRACE (real generated artifact: "INFO 1020 - Class Opener - Week
// 8.docx"): the opener's warm-up Python code shipped with every line at the
// same indent -
//
//   class BankAccount:
//   def __init__(self):
//   self.balance = 0
//
// - not valid Python, in a programming course. The verified OOXML evidence
// was `<w:t xml:space="preserve">def __init__(self):</w:t>` with NO leading
// spaces, while the SAME code in that run's .pptx deck kept its four-space
// indent intact.
//
// Split into its own file (matching how
// steps.course-schedule-from-source.course-kind-precedence.test.ts was split
// out to stay under this repo's 1000-line-per-file cap, and rather than
// growing docx.test.ts past it) rather than folded into docx.test.ts.
//
// This file exists to answer ONE question before any fix was attempted:
// does buildDocxFromPlainText (docx.ts) itself lose the indentation? Tracing
// the code: buildCodeParagraph passes `rawLine` into a TextRun completely
// unmodified; the line split at `normalizedText.split("\n")` never trims;
// and normalizeTypography (text-normalize.ts) is fence-aware - it feeds a
// fenced line straight through unchanged rather than running its own
// dash/quote substitutions on it. The tests below confirm all of that
// end-to-end, against the REAL rendered XML: when this function IS given
// correctly indented source text, the indentation survives untouched all the
// way into the <w:t> content.
//
// CONCLUSION: the loss reproduced in the real artifact is NOT in docx.ts. It
// is upstream, in stripModelUrls (src/lib/urls.ts:70-74):
//
//   return result
//     .split("\n")
//     .map((line) => line.replace(/[ \t]+/g, " ").trim())
//     .join("\n")
//     ...
//
// - a whitespace-collapse-and-trim applied to EVERY line, with no fence
// awareness at all (unlike normalizeTypography, which tracks fences
// deliberately). It runs inside generateWeekOpener
// (src/app/actions/research.ts:390: `stripModelUrls(openerResult.text).trim()`),
// and that already-flattened text is what steps.content-lectures.ts
// (:815-817) hands to buildDocxFromPlainText as `openerText` - so the code's
// leading spaces are gone before this function ever sees them. Neither
// src/lib/urls.ts nor src/app/actions/research.ts is in this change's file
// scope (docx.ts / docx.test.ts only), so no fix for that loss lives here -
// only the proof that it is not here either.
async function unpack(buffer: ArrayBuffer) {
  const zip = await JSZip.loadAsync(buffer);
  const documentXml = await zip.file("word/document.xml")!.async("string");
  return { documentXml };
}

function paragraphsOf(documentXml: string): string[] {
  return documentXml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? [];
}

describe("buildDocxFromPlainText: fenced code block indentation (defect trace)", () => {
  it("preserves multi-level leading whitespace on every line of a fenced Python block", async () => {
    const buffer = await buildDocxFromPlainText(
      [
        "```python",
        "class BankAccount:",
        "    def __init__(self):",
        "        self.balance = 0",
        "",
        "    def deposit(self, amount):",
        "        self.balance = self.balance + amount",
        "```",
      ].join("\n")
    );
    const { documentXml } = await unpack(buffer);
    const paragraphs = paragraphsOf(documentXml);

    const classLine = paragraphs.find((p) => p.includes("class BankAccount:"));
    const initLine = paragraphs.find((p) => p.includes("__init__"));
    const balanceLine = paragraphs.find((p) => p.includes("self.balance = 0"));
    const depositLine = paragraphs.find((p) => p.includes("def deposit"));
    const addLine = paragraphs.find((p) => p.includes("self.balance + amount"));

    // Zero-indent line: no leading whitespace to preserve.
    expect(classLine).toContain(">class BankAccount:<");
    // Four-space and eight-space (nested one level deeper) indent lines:
    // xml:space="preserve" is what keeps Word from collapsing the leading
    // run of spaces - it must be present, and the exact prefix must survive
    // verbatim in the <w:t> text.
    expect(initLine).toMatch(/<w:t xml:space="preserve">    def __init__\(self\):<\/w:t>/);
    expect(balanceLine).toMatch(/<w:t xml:space="preserve">        self\.balance = 0<\/w:t>/);
    expect(depositLine).toMatch(/<w:t xml:space="preserve">    def deposit\(self, amount\):<\/w:t>/);
    expect(addLine).toMatch(/<w:t xml:space="preserve">        self\.balance = self\.balance \+ amount<\/w:t>/);
  });

  it("preserves leading whitespace even when the payload also triggers normalizeTypography's dash/quote substitutions elsewhere", async () => {
    // normalizeTypography only runs its substitutions when the whole payload
    // contains at least one target character (its own fast-path check) -
    // this proves that, once triggered, its fence-aware line-by-line pass
    // still leaves an indented fenced line completely untouched rather than
    // accidentally normalizing (or otherwise mutating) it too.
    const emDash = String.fromCharCode(0x2014);
    const buffer = await buildDocxFromPlainText(
      [
        `A quick aside${emDash}before the example.`,
        "```python",
        "class Counter:",
        "    def __init__(self):",
        "        self.count = 0",
        "```",
      ].join("\n")
    );
    const { documentXml } = await unpack(buffer);
    const paragraphs = paragraphsOf(documentXml);

    expect(documentXml).not.toContain(emDash);
    expect(documentXml).toContain("A quick aside - before the example.");

    const initLine = paragraphs.find((p) => p.includes("__init__"));
    expect(initLine).toMatch(/<w:t xml:space="preserve">    def __init__\(self\):<\/w:t>/);
  });

  it("preserves a tab-indented line verbatim (no tab-to-space or width conversion)", async () => {
    const buffer = await buildDocxFromPlainText(["```python", "def f():", "\treturn 1", "```"].join("\n"));
    const { documentXml } = await unpack(buffer);
    const paragraphs = paragraphsOf(documentXml);

    const returnLine = paragraphs.find((p) => p.includes("return 1"));
    expect(returnLine).toMatch(/<w:t xml:space="preserve">\treturn 1<\/w:t>/);
  });
});
