import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { buildDocxFromPlainText } from "./docx";

// `buildDocxFromPlainText` returns a real .docx (a zip of XML parts). These
// tests unpack it and assert on the raw XML rather than mocking the `docx`
// library, so a regression in the actual rendered output — not just in how
// we call the library — is what turns them red.
async function unpack(buffer: ArrayBuffer) {
  const zip = await JSZip.loadAsync(buffer);
  const documentXml = await zip.file("word/document.xml")!.async("string");
  const stylesXml = await zip.file("word/styles.xml")!.async("string");
  const relsFile = zip.file("word/_rels/document.xml.rels");
  const relsXml = relsFile ? await relsFile.async("string") : "";
  return { documentXml, stylesXml, relsXml };
}

// Split document.xml into its top-level <w:p>...</w:p> paragraph strings so
// assertions can target one paragraph at a time instead of the whole blob.
function paragraphsOf(documentXml: string): string[] {
  return documentXml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? [];
}

// Split a paragraph (or the whole document) into its individual <w:r>...</w:r>
// run strings, so assertions can target one run's formatting (bold, color,
// underline) without the surrounding paragraph/hyperlink markup getting in the
// way. A run inside a <w:hyperlink> is still a plain <w:r>...</w:r>, so this
// picks those up too.
function runsOf(xml: string): string[] {
  return xml.match(/<w:r>[\s\S]*?<\/w:r>/g) ?? [];
}

// Look up the hyperlink relationship target for a given r:id in the unpacked
// document.xml.rels - the id docx assigns is an opaque generated string, not
// a small integer, so tests must resolve it rather than hardcoding "rId7".
function relationshipTarget(relsXml: string, rId: string): string | undefined {
  const match = relsXml.match(new RegExp(`<Relationship Id="${rId}"[^>]*Target="([^"]+)"`));
  return match?.[1];
}

describe("buildDocxFromPlainText", () => {
  it("promotes markdown headings to real Word heading styles at the right depth", async () => {
    const buffer = await buildDocxFromPlainText(
      ["# Doc Title", "", "## Section One", "", "### Subsection", "", "#### Detail", "", "Body text."].join("\n")
    );
    const { documentXml } = await unpack(buffer);
    const paragraphs = paragraphsOf(documentXml);

    expect(paragraphs.find((p) => p.includes(">Doc Title<"))).toMatch(/<w:pStyle w:val="Title"\/>/);
    expect(paragraphs.find((p) => p.includes(">Section One<"))).toMatch(/<w:pStyle w:val="Heading1"\/>/);
    expect(paragraphs.find((p) => p.includes(">Subsection<"))).toMatch(/<w:pStyle w:val="Heading2"\/>/);
    expect(paragraphs.find((p) => p.includes(">Detail<"))).toMatch(/<w:pStyle w:val="Heading3"\/>/);
  });

  it("defines the Title/Heading1/Heading2/Heading3 paragraph styles in styles.xml with the branded look", async () => {
    const buffer = await buildDocxFromPlainText("# Title");
    const { stylesXml } = await unpack(buffer);

    const styleBlock = (id: string) =>
      stylesXml.match(new RegExp(`<w:style[^>]*w:styleId="${id}"[^>]*>[\\s\\S]*?<\\/w:style>`))?.[0];

    // Docx always emits *some* Title/Heading1/2/3 style (its own generic blue
    // defaults) even with no customization at all, so these assertions check
    // the actual branded values from the AC, not just the styleId's presence.
    const title = styleBlock("Title");
    expect(title).toMatch(/w:color w:val="1A2744"/);
    expect(title).toMatch(/w:sz w:val="36"/);
    expect(title).toMatch(/w:bottom w:val="single"[^>]*w:sz="12"/);

    const heading1 = styleBlock("Heading1");
    expect(heading1).toMatch(/w:color w:val="1A2744"/);
    expect(heading1).toMatch(/w:sz w:val="24"/);
    expect(heading1).toMatch(/<w:caps\/>/);
    expect(heading1).toMatch(/w:bottom w:val="single"[^>]*w:sz="4"/);

    const heading2 = styleBlock("Heading2");
    expect(heading2).toMatch(/w:color w:val="1A2744"/);
    expect(heading2).toMatch(/w:sz w:val="22"/);
    expect(heading2).not.toMatch(/<w:caps\/>/);
    expect(heading2).not.toMatch(/pBdr/);

    const heading3 = styleBlock("Heading3");
    expect(heading3).toMatch(/w:color w:val="1F2937"/);
    expect(heading3).toMatch(/w:sz w:val="22"/);
    expect(heading3).not.toMatch(/pBdr/);
  });

  it("gives a plain body line a paragraph with no heading pStyle", async () => {
    // Surrounded by non-blank neighbors so the no-markdown heading heuristic
    // (isolated short line) does not fire — this is a genuine body line.
    const buffer = await buildDocxFromPlainText(
      ["Intro line leads in.", "Just a plain paragraph of body text that is not a heading.", "More text follows."].join(
        "\n"
      )
    );
    const { documentXml } = await unpack(buffer);
    const paragraphs = paragraphsOf(documentXml);
    const bodyParagraph = paragraphs.find((p) => p.includes("Just a plain paragraph"));

    expect(bodyParagraph).toBeDefined();
    expect(bodyParagraph).not.toMatch(/w:pStyle/);
  });

  it("derives bullet nesting level from leading indentation (0, 2, 4 spaces)", async () => {
    const buffer = await buildDocxFromPlainText(["- top level", "  - one level in", "    - two levels in"].join("\n"));
    const { documentXml } = await unpack(buffer);
    const paragraphs = paragraphsOf(documentXml);

    const top = paragraphs.find((p) => p.includes(">top level<"));
    const one = paragraphs.find((p) => p.includes(">one level in<"));
    const two = paragraphs.find((p) => p.includes(">two levels in<"));

    expect(top).toMatch(/<w:ilvl w:val="0"\/>/);
    expect(one).toMatch(/<w:ilvl w:val="1"\/>/);
    expect(two).toMatch(/<w:ilvl w:val="2"\/>/);
  });

  it("renders a fenced code block as non-bulleted monospace paragraphs and drops the fence markers", async () => {
    const buffer = await buildDocxFromPlainText(
      ["Before the block.", "```js", "const x = 1;", "function f() {}", "```", "After the block."].join("\n")
    );
    const { documentXml } = await unpack(buffer);
    const paragraphs = paragraphsOf(documentXml);

    // Fence delimiter lines never appear anywhere in the output text.
    expect(documentXml).not.toContain("```");

    const codeLine1 = paragraphs.find((p) => p.includes("const x = 1;"));
    const codeLine2 = paragraphs.find((p) => p.includes("function f() {}"));
    expect(codeLine1).toBeDefined();
    expect(codeLine2).toBeDefined();
    // Not bulleted.
    expect(codeLine1).not.toMatch(/w:ilvl/);
    expect(codeLine2).not.toMatch(/w:ilvl/);
    // Monospace font.
    expect(codeLine1).toMatch(/w:ascii="Consolas"/);
    expect(codeLine2).toMatch(/w:ascii="Consolas"/);

    // Text before/after the block still renders as normal paragraphs.
    expect(documentXml).toContain("Before the block.");
    expect(documentXml).toContain("After the block.");
  });

  it("does not promote a heading-shaped or bullet-shaped line inside a fence", async () => {
    const buffer = await buildDocxFromPlainText(
      ["```", "# not a heading", "- not a bullet", "```"].join("\n")
    );
    const { documentXml } = await unpack(buffer);
    const paragraphs = paragraphsOf(documentXml);

    const headingLine = paragraphs.find((p) => p.includes("not a heading"));
    const bulletLine = paragraphs.find((p) => p.includes("not a bullet"));

    expect(headingLine).toBeDefined();
    expect(headingLine).not.toMatch(/w:pStyle/);
    expect(bulletLine).toBeDefined();
    expect(bulletLine).not.toMatch(/w:ilvl/);
    // The literal "#" and "-" markers are preserved verbatim, unlike outside a fence.
    expect(headingLine).toContain("# not a heading");
    expect(bulletLine).toContain("- not a bullet");
  });

  it("linkifies a bare URL outside a fence but leaves one inside a fence as plain text", async () => {
    const buffer = await buildDocxFromPlainText(
      ["See https://example.com/outside for details.", "```", "https://example.com/inside", "```"].join("\n")
    );
    const { documentXml, relsXml } = await unpack(buffer);

    expect(documentXml).toMatch(/<w:hyperlink /);
    expect(relsXml).toMatch(/Type="http:\/\/schemas\.openxmlformats\.org\/officeDocument\/2006\/relationships\/hyperlink"/);
    expect(relsXml).toContain("https://example.com/outside");
    expect(relsXml).not.toContain("https://example.com/inside");

    const paragraphs = paragraphsOf(documentXml);
    const insideFence = paragraphs.find((p) => p.includes("example.com/inside"));
    expect(insideFence).not.toMatch(/w:hyperlink/);
  });

  it("does not throw on an unterminated fence and still emits its lines", async () => {
    const buffer = await buildDocxFromPlainText(["```", "orphaned code line one", "orphaned code line two"].join("\n"));
    const { documentXml } = await unpack(buffer);

    expect(documentXml).toContain("orphaned code line one");
    expect(documentXml).toContain("orphaned code line two");
    expect(documentXml).not.toContain("```");
  });

  it("restricts heading promotion to the templateHeadings allow-list", async () => {
    const buffer = await buildDocxFromPlainText(
      ["Overview", "", "Some body text under overview.", "", "Not Allowed", "", "More body text."].join("\n"),
      ["Overview"]
    );
    const { documentXml } = await unpack(buffer);
    const paragraphs = paragraphsOf(documentXml);

    const overview = paragraphs.find((p) => p.includes(">Overview<"));
    const notAllowed = paragraphs.find((p) => p.includes("Not Allowed"));

    expect(overview).toMatch(/w:pStyle/);
    expect(notAllowed).not.toMatch(/w:pStyle/);
  });

  it("leaves the creator empty when no author is supplied", async () => {
    const buffer = await buildDocxFromPlainText("Some text.");
    const zip = await JSZip.loadAsync(buffer);
    const coreXml = await zip.file("docProps/core.xml")!.async("string");

    expect(coreXml).not.toContain("Un-named");
    // docx omits the element entirely for an empty creator string, rather
    // than writing a placeholder or an empty tag.
    expect(coreXml).not.toContain("<dc:creator>");
  });

  // ── Markdown-link rendering (document-level) ─────────────────────────────
  // tokenizeInline (docx-blocks.test.ts) proves the tokenizer in isolation;
  // these prove the renderer actually wires those tokens into a real
  // hyperlink in the finished .docx - a bug in the docx.ts <-> docx-blocks.ts
  // wiring would pass every tokenizeInline test and still ship broken links.
  describe("markdown links", () => {
    it("renders a markdown link as a hyperlink whose display text is the label, not the url", async () => {
      const buffer = await buildDocxFromPlainText(
        "[python.org](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AbC)"
      );
      const { documentXml, relsXml } = await unpack(buffer);
      const paragraphs = paragraphsOf(documentXml);
      const linkParagraph = paragraphs.find((p) => p.includes("<w:hyperlink"));
      expect(linkParagraph).toBeDefined();

      // Display text is the label, never the raw url.
      expect(linkParagraph).toContain(">python.org<");
      expect(linkParagraph).not.toContain(
        ">https://vertexaisearch.cloud.google.com/grounding-api-redirect/AbC<"
      );

      // The relationship target IS the url.
      const rId = linkParagraph!.match(/<w:hyperlink[^>]*r:id="([^"]+)"/)?.[1];
      expect(rId).toBeTruthy();
      expect(relationshipTarget(relsXml, rId!)).toBe(
        "https://vertexaisearch.cloud.google.com/grounding-api-redirect/AbC"
      );
    });

    it("still renders a bare URL with its own url as the display text", async () => {
      const buffer = await buildDocxFromPlainText(
        ["Intro paragraph before.", "https://example.com/bare", "Trailing paragraph after."].join("\n")
      );
      const { documentXml, relsXml } = await unpack(buffer);
      const paragraphs = paragraphsOf(documentXml);
      const linkParagraph = paragraphs.find((p) => p.includes("<w:hyperlink"));
      expect(linkParagraph).toBeDefined();

      expect(linkParagraph).toContain(">https://example.com/bare<");
      const rId = linkParagraph!.match(/<w:hyperlink[^>]*r:id="([^"]+)"/)?.[1];
      expect(relationshipTarget(relsXml, rId!)).toBe("https://example.com/bare");
    });

    it("does not linkify a markdown link inside a fenced code block, and keeps its literal brackets", async () => {
      const buffer = await buildDocxFromPlainText(
        ["```", "See [python.org](https://python.org) for docs.", "```"].join("\n")
      );
      const { documentXml } = await unpack(buffer);

      expect(documentXml).not.toMatch(/<w:hyperlink/);
      expect(documentXml).toContain("See [python.org](https://python.org) for docs.");
    });

    it("bolds a Label: prefix and still linkifies a markdown link in the remainder", async () => {
      const buffer = await buildDocxFromPlainText(
        "Source: [python.org](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AbC)"
      );
      const { documentXml, relsXml } = await unpack(buffer);
      const paragraphs = paragraphsOf(documentXml);
      const paragraph = paragraphs.find((p) => p.includes(">Source:<") && p.includes("<w:hyperlink"));
      expect(paragraph).toBeDefined();

      const runs = runsOf(paragraph!);
      const labelRun = runs.find((r) => r.includes(">Source:<"));
      expect(labelRun).toBeDefined();
      expect(labelRun).toMatch(/<w:b\/>/);
      expect(labelRun).not.toMatch(/<w:b w:val="false"/);

      const linkRun = runs.find((r) => r.includes(">python.org<"));
      expect(linkRun).toBeDefined();

      const rId = paragraph!.match(/<w:hyperlink[^>]*r:id="([^"]+)"/)?.[1];
      expect(relationshipTarget(relsXml, rId!)).toBe(
        "https://vertexaisearch.cloud.google.com/grounding-api-redirect/AbC"
      );
    });

    it("renders plain text, a markdown link, and a bare URL as runs in source order", async () => {
      const buffer = await buildDocxFromPlainText(
        [
          "Intro paragraph before.",
          "Check out [python.org](https://a.example/x) or https://b.example for more.",
          "Trailing paragraph after.",
        ].join("\n")
      );
      const { documentXml } = await unpack(buffer);
      const paragraphs = paragraphsOf(documentXml);
      const mixed = paragraphs.find((p) => p.includes("Check out "));
      expect(mixed).toBeDefined();

      const textIdx = mixed!.indexOf(">Check out <");
      const linkIdx = mixed!.indexOf(">python.org<");
      const orIdx = mixed!.indexOf("> or <");
      const bareIdx = mixed!.indexOf(">https://b.example<");
      const tailIdx = mixed!.indexOf("> for more.<");

      for (const idx of [textIdx, linkIdx, orIdx, bareIdx, tailIdx]) expect(idx).toBeGreaterThan(-1);
      expect(textIdx).toBeLessThan(linkIdx);
      expect(linkIdx).toBeLessThan(orIdx);
      expect(orIdx).toBeLessThan(bareIdx);
      expect(bareIdx).toBeLessThan(tailIdx);
    });

    it("styles a markdown link's display text exactly like a bare-URL link (color, underline, font)", async () => {
      const buffer = await buildDocxFromPlainText(
        ["Intro paragraph before.", "Check out [python.org](https://a.example/x) or https://b.example for more.", "Trailing paragraph after."].join(
          "\n"
        )
      );
      const { documentXml } = await unpack(buffer);
      const runs = runsOf(documentXml);

      const markdownLinkRun = runs.find((r) => r.includes(">python.org<"));
      const bareLinkRun = runs.find((r) => r.includes(">https://b.example<"));
      expect(markdownLinkRun).toBeDefined();
      expect(bareLinkRun).toBeDefined();

      for (const run of [markdownLinkRun!, bareLinkRun!]) {
        expect(run).toMatch(/<w:color w:val="2563EB"\/>/);
        expect(run).toMatch(/<w:u w:val="single"\/>/);
        expect(run).toMatch(/w:ascii="Calibri"/);
      }
    });
  });

  // ── U5 (shipped bug, end-to-end) ──────────────────────────────────────────
  // The previous fix for this class of bug (P1-AC6, "no URL in any generated
  // document ends in . , ; or )") was verified only on sanitizeResourceUrl in
  // isolation and still shipped broken: three of six hyperlink targets in a
  // real generated zip ended in "." because the bare-URL auto-linker in
  // tokenizeInline (docx-blocks.ts) re-introduced the defect when it linkified
  // a URL sitting in rendered prose - a path sanitizeResourceUrl never touches.
  // These tests render an ACTUAL .docx and unzip it, so a regression here can
  // only be caught by inspecting the real word/_rels/document.xml.rels
  // relationship target - never by asserting on the regex or the tokenizer
  // in isolation again.
  describe("U5: bare URL trailing punctuation, end to end", () => {
    it("does not carry a trailing period into the hyperlink relationship target when a bare URL ends a sentence", async () => {
      const buffer = await buildDocxFromPlainText(
        [
          "Intro paragraph before.",
          "For scheduling help, see https://academy.asana.com/guide. It covers dependencies.",
          "Trailing paragraph after.",
        ].join("\n")
      );
      const { documentXml, relsXml } = await unpack(buffer);
      const paragraphs = paragraphsOf(documentXml);
      const linkParagraph = paragraphs.find((p) => p.includes("<w:hyperlink"));
      expect(linkParagraph).toBeDefined();

      const rId = linkParagraph!.match(/<w:hyperlink[^>]*r:id="([^"]+)"/)?.[1];
      expect(rId).toBeTruthy();
      const target = relationshipTarget(relsXml, rId!);
      expect(target).toBe("https://academy.asana.com/guide");
      expect(target).not.toMatch(/[.,;:!?]$/);

      // The stripped period is not lost - it still appears in the document as
      // ordinary text right after the link, not swallowed entirely.
      expect(documentXml).toContain(">. It covers dependencies.<");
    });

    it("does not carry a trailing period into the relationship target for a root URL ending in a slash (the exact shape that 403'd)", async () => {
      const buffer = await buildDocxFromPlainText(
        [
          "Intro paragraph before.",
          "See the docs at https://help.miro.com/. That should answer it.",
          "Trailing paragraph after.",
        ].join("\n")
      );
      const { relsXml, documentXml } = await unpack(buffer);
      const paragraphs = paragraphsOf(documentXml);
      const linkParagraph = paragraphs.find((p) => p.includes("<w:hyperlink"));
      const rId = linkParagraph!.match(/<w:hyperlink[^>]*r:id="([^"]+)"/)?.[1];
      const target = relationshipTarget(relsXml, rId!);

      expect(target).toBe("https://help.miro.com/");
      expect(target).not.toMatch(/\.$/);
    });

    it("relationship targets across every hyperlink in a document with several sentence-ending bare URLs are all free of trailing punctuation", async () => {
      // Mirrors the audited zip: several bare URLs, each immediately followed
      // by a sentence period, mixed with body text.
      const buffer = await buildDocxFromPlainText(
        [
          "Tools You Will Use",
          "",
          "Asana: https://academy.asana.com/guide. Use it to track tasks.",
          "Google Sheets: https://support.google.com/docs/answer/1. Use it for the schedule.",
          "Miro: https://help.miro.com/. Use it for the board.",
        ].join("\n")
      );
      const { relsXml } = await unpack(buffer);
      const targets = [...relsXml.matchAll(/Target="(https?:\/\/[^"]+)"/g)].map((m) => m[1]);

      expect(targets.length).toBeGreaterThanOrEqual(3);
      for (const target of targets) {
        expect(target).not.toMatch(/[.,;:!?]$/);
      }
    });
  });

  // ── Heading precedence when the document already uses markdown headings ──
  // (see hasMarkdownHeading in docx-blocks.ts). The bug: the length/blank-line
  // heuristic used to run on every non-"#" line regardless of whether the
  // document already had explicit markdown headings, so ordinary body text
  // sitting between blank lines (like a Q&A answer, or an example's
  // explanation) was wrongly promoted to Heading 1.
  describe("markdown-heading precedence over the length heuristic", () => {
    it("keeps body text as body paragraphs in a document that already uses markdown headings (lecture Q&A shape)", async () => {
      const buffer = await buildDocxFromPlainText(
        [
          "# Course - Module: Anticipated student questions",
          "",
          "## Q1: Why does split() drop spaces?",
          "",
          "Because it splits on runs of whitespace.",
          "",
          "## Example programs",
          "",
          "### Word counter",
          "",
          "Shows split() and len() together.",
          "",
          "```python",
          "def count(t):",
          "    return len(t.split())",
          "```",
        ].join("\n")
      );
      const { documentXml } = await unpack(buffer);
      const paragraphs = paragraphsOf(documentXml);

      expect(paragraphs.find((p) => p.includes(">Course - Module: Anticipated student questions<"))).toMatch(
        /<w:pStyle w:val="Title"\/>/
      );
      expect(paragraphs.find((p) => p.includes(">Q1: Why does split() drop spaces?<"))).toMatch(
        /<w:pStyle w:val="Heading1"\/>/
      );
      expect(paragraphs.find((p) => p.includes(">Example programs<"))).toMatch(/<w:pStyle w:val="Heading1"\/>/);
      expect(paragraphs.find((p) => p.includes(">Word counter<"))).toMatch(/<w:pStyle w:val="Heading2"\/>/);

      // The bug: these two lines are short and sit between blank lines, so
      // the length heuristic used to promote them to Heading 1 even though
      // this document already has explicit markdown headings.
      const answer = paragraphs.find((p) => p.includes("Because it splits on runs of whitespace."));
      expect(answer).toBeDefined();
      expect(answer).not.toMatch(/w:pStyle/);

      const explanation = paragraphs.find((p) => p.includes("Shows split() and len() together."));
      expect(explanation).toBeDefined();
      expect(explanation).not.toMatch(/w:pStyle/);
    });

    it("still promotes an isolated short line to a heading when the document has NO markdown headings at all", async () => {
      const buffer = await buildDocxFromPlainText(
        [
          "Intro Topic",
          "",
          "Some longer body paragraph that is definitely not a heading because it runs on.",
          "",
          "Another Topic",
          "",
          "More body text here as well, also not a heading.",
        ].join("\n")
      );
      const { documentXml } = await unpack(buffer);
      const paragraphs = paragraphsOf(documentXml);

      // First isolated short line is the Title; the next one is Heading 1 -
      // exactly today's two-level heuristic behavior, unchanged.
      expect(paragraphs.find((p) => p.includes(">Intro Topic<"))).toMatch(/<w:pStyle w:val="Title"\/>/);
      expect(paragraphs.find((p) => p.includes(">Another Topic<"))).toMatch(/<w:pStyle w:val="Heading1"\/>/);
    });
  });
});
