import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { parseOfficeParagraphs, applyOfficeSections, type RunSpan } from "@/lib/office-edit";
import {
  buildOfficeTemplateParagraphList,
  fillOfficeTemplate,
  groupOfficeTemplateParagraphsBySlide,
  planSlideTemplateFill,
  type OfficeTemplateReplacement,
} from "./office-template-fill";

// docs/a43-scope.md section 3.2/3.3: this module is a PORT/EXTRACTION of
// src/app/actions/syllabus-templates.ts's fill pipeline, generalised over
// OfficeKind. No .pptx/.docx fixture is tracked in this repo
// (git ls-files | grep -icE "\.(pptx|potx|docx|thmx)$" -> 0), so every
// fixture here is built in-memory with jszip, the same idiom
// src/lib/office-edit.test.ts already uses.

function pptxSlideXml(paragraphsXml: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ` +
    `xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">` +
    `<p:cSld><p:spTree><p:sp><p:txBody>${paragraphsXml}</p:txBody></p:sp></p:spTree></p:cSld>` +
    `</p:sld>`
  );
}

function pptxParagraph(text: string, opts?: { bold?: boolean }): string {
  const rpr = `<a:rPr lang="en-US"${opts?.bold ? ' b="1"' : ""}/>`;
  return `<a:p><a:r>${rpr}<a:t>${text}</a:t></a:r></a:p>`;
}

async function buildPptxFixture(slides: string[]): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>`
  );
  slides.forEach((xml, i) => zip.file(`ppt/slides/slide${i + 1}.xml`, pptxSlideXml(xml)));
  return Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
}

function docxParagraph(text: string, opts?: { bold?: boolean }): string {
  const rpr = opts?.bold ? "<w:rPr><w:b/></w:rPr>" : "";
  return `<w:p><w:r>${rpr}<w:t>${text}</w:t></w:r></w:p>`;
}

async function buildDocxFixture(paragraphsXml: string[]): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
      `<w:body>${paragraphsXml.join("")}</w:body></w:document>`
  );
  return Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
}

describe("office-template-fill: H1, the structural deletion guarantee", () => {
  it("emits one section per parsed paragraph even when only some are replaced (docx)", async () => {
    const buffer = await buildDocxFixture([
      docxParagraph("Course Name: PLACEHOLDER"),
      docxParagraph("Policy boilerplate that never changes."),
      docxParagraph("Term: PLACEHOLDER"),
    ]);
    const paragraphs = await parseOfficeParagraphs("docx", buffer);
    expect(paragraphs).toHaveLength(3);

    const replacements: OfficeTemplateReplacement[] = [
      { id: paragraphs[0].id, text: "Course Name: Intro to Testing" },
      { id: paragraphs[2].id, text: "Term: Fall 2026" },
    ];
    const out = await fillOfficeTemplate("docx", buffer, replacements);

    const reparsed = await parseOfficeParagraphs("docx", out);
    // If the untouched paragraph had been omitted from the section list,
    // applyOfficeSections would have deleted it and this would be 2, not 3.
    expect(reparsed).toHaveLength(3);
    expect(reparsed.map((p) => p.text)).toEqual([
      "Course Name: Intro to Testing",
      "Policy boilerplate that never changes.",
      "Term: Fall 2026",
    ]);
  });

  it("emits one section per parsed paragraph even when only some are replaced (pptx)", async () => {
    const buffer = await buildPptxFixture([
      `${pptxParagraph("Title placeholder")}${pptxParagraph("Body placeholder")}`,
    ]);
    const paragraphs = await parseOfficeParagraphs("pptx", buffer);
    expect(paragraphs).toHaveLength(2);

    // Replace only the title; the body paragraph gets no replacement at all.
    const replacements: OfficeTemplateReplacement[] = [{ id: paragraphs[0].id, text: "Real Title" }];
    const out = await fillOfficeTemplate("pptx", buffer, replacements);

    const reparsed = await parseOfficeParagraphs("pptx", out);
    expect(reparsed).toHaveLength(2);
    expect(reparsed.map((p) => p.text)).toEqual(["Real Title", "Body placeholder"]);
  });

  it("H1 SABOTAGE: a hand-built section list that omits a paragraph deletes it - the defect this module exists to make unreachable", async () => {
    // This directly exercises the low-level primitive fillOfficeTemplate is
    // built on top of, to prove the failure mode is real and to prove the
    // section-3.5 instrument (XML-substring reconstruction) catches it. No
    // export of office-template-fill.ts lets a caller build a partial
    // section list this way - fillOfficeTemplate always maps over every
    // parsed paragraph - so this test calls applyOfficeSections directly to
    // show what the naive, wrong implementation would have done.
    const buffer = await buildPptxFixture([
      `${pptxParagraph("Title placeholder")}${pptxParagraph("Body placeholder")}`,
    ]);
    const paragraphs = await parseOfficeParagraphs("pptx", buffer);
    expect(paragraphs).toHaveLength(2);

    const zip = await JSZip.loadAsync(buffer);
    const originalSlideXml = await zip.file("ppt/slides/slide1.xml")?.async("string");
    expect(originalSlideXml).toBeDefined();

    // The naive, WRONG implementation: emit a section only for the paragraph
    // that was actually replaced.
    const partialSections: Array<{ sourceId: string; spans: RunSpan[] }> = [
      { sourceId: paragraphs[0].id, spans: [{ text: "Real Title" }] },
    ];
    const result = await applyOfficeSections("pptx", buffer, partialSections);
    const resultZip = await JSZip.loadAsync(result);
    const newSlideXml = await resultZip.file("ppt/slides/slide1.xml")?.async("string");
    expect(newSlideXml).toBeDefined();

    const PPTX_PARA = /<a:p\b[^>]*(?<!\/)>[\s\S]*?<\/a:p>/g;
    const originalParas = [...(originalSlideXml as string).matchAll(PPTX_PARA)].map((m) => m[0]);
    const newParas = [...(newSlideXml as string).matchAll(PPTX_PARA)].map((m) => m[0]);

    // The body paragraph is gone: two paragraphs in, one out. This is the
    // exact defect H1 exists to prevent, watched RED here.
    expect(originalParas).toHaveLength(2);
    expect(newParas).toHaveLength(1);

    // The section-3.5 instrument goes red on this too: there is no way to
    // reconstruct the new document from the original by substituting only
    // the changed paragraph's substring, because a whole paragraph vanished.
    const reparsed = await parseOfficeParagraphs("pptx", result);
    expect(reparsed).toHaveLength(1);
    expect(reparsed.map((p) => p.text)).not.toContain("Body placeholder");
  });

  it("H1 holds through fillOfficeTemplate even when NO replacement is supplied at all", async () => {
    // The degenerate case: an empty replacement list must still round-trip
    // every paragraph, because the section list is still built from every
    // parsed paragraph, not from the (empty) replacement list.
    const buffer = await buildPptxFixture([`${pptxParagraph("A")}${pptxParagraph("B")}${pptxParagraph("C")}`]);
    const out = await fillOfficeTemplate("pptx", buffer, []);
    const reparsed = await parseOfficeParagraphs("pptx", out);
    expect(reparsed.map((p) => p.text)).toEqual(["A", "B", "C"]);
  });

  it("byte-identity: an untouched paragraph survives a fillOfficeTemplate call byte-for-byte (section 3.5 instrument)", async () => {
    // Deliberately non-canonical <a:rPr> attribute order on the untouched
    // paragraph (RES-A43-12): a correct implementation short-circuits and
    // never re-serialises it, so this order survives. Only a broken guard
    // would rebuild it and reorder these attributes.
    const untouchedXml = `<a:p><a:r><a:rPr b="1" lang="en-US" sz="3200"/><a:t>Keep me exactly as I am</a:t></a:r></a:p>`;
    const editedXml = pptxParagraph("Edit me");
    const originalSlideXml = pptxSlideXml(`${untouchedXml}${editedXml}`);
    const zip = new JSZip();
    zip.file(
      "[Content_Types].xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>`
    );
    zip.file("ppt/slides/slide1.xml", originalSlideXml);
    const buffer = Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));

    const paragraphs = await parseOfficeParagraphs("pptx", buffer);
    expect(paragraphs).toHaveLength(2);
    const editedId = paragraphs[1].id;

    const out = await fillOfficeTemplate("pptx", buffer, [{ id: editedId, text: "Edited text" }]);
    const outZip = await JSZip.loadAsync(out);
    const newSlideXml = await outZip.file("ppt/slides/slide1.xml")?.async("string");
    expect(newSlideXml).toBeDefined();

    const PPTX_PARA = /<a:p\b[^>]*(?<!\/)>[\s\S]*?<\/a:p>/g;
    const originalParas = [...originalSlideXml.matchAll(PPTX_PARA)].map((m) => m[0]);
    const newParas = [...(newSlideXml as string).matchAll(PPTX_PARA)].map((m) => m[0]);
    expect(originalParas).toHaveLength(2);
    expect(newParas).toHaveLength(2);
    expect(newParas[0]).toBe(originalParas[0]);

    const reconstructed = originalSlideXml.replace(originalParas[1], newParas[1]);
    expect(reconstructed).toBe(newSlideXml);
  });

  it("RES-A43-16: a bold leading label is preserved on a replaced pptx paragraph, watched red with the prefix logic removed", async () => {
    const buffer = await buildPptxFixture([`${pptxParagraph("Label: old value", { bold: true })}`]);
    // The fixture paragraph's whole run is bold (a single run cannot mix
    // marks), so the bold-prefix detection walks p.runs and stops at the
    // first non-bold run; here there is none, so the whole original run's
    // text is the bold prefix candidate. That only matters when the
    // replacement text actually starts with it.
    const paragraphs = await parseOfficeParagraphs("pptx", buffer);
    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0].runs[0].bold).toBe(true);

    const out = await fillOfficeTemplate("pptx", buffer, [
      { id: paragraphs[0].id, text: "Label: old value continues with more detail" },
    ]);
    const reparsed = await parseOfficeParagraphs("pptx", out);
    expect(reparsed).toHaveLength(1);
    expect(reparsed[0].text).toBe("Label: old value continues with more detail");
    expect(reparsed[0].runs[0].bold).toBe(true);
    expect(reparsed[0].runs[0].text).toBe("Label: old value");
  });
});

describe("office-template-fill: buildOfficeTemplateParagraphList", () => {
  it("prefixes a pptx line with its slide number and a docx line with none", async () => {
    const pptxBuffer = await buildPptxFixture([pptxParagraph("Slide one text")]);
    const pptxParagraphs = await parseOfficeParagraphs("pptx", pptxBuffer);
    const pptxList = buildOfficeTemplateParagraphList(pptxParagraphs);
    expect(pptxList).toBe(`[${pptxParagraphs[0].id}] (slide 1) Slide one text`);

    const docxBuffer = await buildDocxFixture([docxParagraph("Docx text")]);
    const docxParagraphs = await parseOfficeParagraphs("docx", docxBuffer);
    const docxList = buildOfficeTemplateParagraphList(docxParagraphs);
    expect(docxList).toBe(`[${docxParagraphs[0].id}] Docx text`);
  });

  it("caps the list at maxChars rather than blowing out an arbitrarily long template", async () => {
    const longParagraphs = Array.from({ length: 50 }, (_, i) => pptxParagraph(`Paragraph number ${i} `.repeat(5)));
    const buffer = await buildPptxFixture([longParagraphs.join("")]);
    const paragraphs = await parseOfficeParagraphs("pptx", buffer);
    const list = buildOfficeTemplateParagraphList(paragraphs, 200);
    expect(list.length).toBeLessThanOrEqual(200);
  });
});

describe("office-template-fill: groupOfficeTemplateParagraphsBySlide", () => {
  it("groups pptx paragraphs by slide, in ascending slide order, each slide's own order preserved", async () => {
    const buffer = await buildPptxFixture([
      `${pptxParagraph("Slide 1 title")}${pptxParagraph("Slide 1 body")}`,
      `${pptxParagraph("Slide 2 title")}`,
    ]);
    const groups = await groupOfficeTemplateParagraphsBySlide("pptx", buffer);
    expect(groups).toHaveLength(2);
    expect(groups[0].slide).toBe(1);
    expect(groups[0].paragraphs.map((p) => p.text)).toEqual(["Slide 1 title", "Slide 1 body"]);
    expect(groups[1].slide).toBe(2);
    expect(groups[1].paragraphs.map((p) => p.text)).toEqual(["Slide 2 title"]);
  });

  it("returns an empty grouping for docx, which has no slide dimension", async () => {
    const buffer = await buildDocxFixture([docxParagraph("Docx text")]);
    const groups = await groupOfficeTemplateParagraphsBySlide("docx", buffer);
    expect(groups).toEqual([]);
  });
});

describe("office-template-fill: planSlideTemplateFill (wave T2, docs/a43-scope.md section 11.4)", () => {
  it("WATCHED RED before this wave: a template with fewer slides than the deck needs must not silently drop the rest", async () => {
    // This is the exact shape of the bug docs/a43-scope.md's wave T2 exists
    // to close: src/app/actions/deck-template-files.ts's fillDeckTemplateFileAction
    // used to compute slideCount = Math.min(groups.length, deck.slides.length)
    // and simply never look at the remaining deck slides - no error, no
    // count, nothing. Before planSlideTemplateFill existed, there was no
    // function in this module a caller could ask "does this fit?", so this
    // test failed to even compile/import (TS2305: no exported member
    // 'planSlideTemplateFill') - that import failure IS the red result this
    // wave's watched failure requires; pasted verbatim in the wave report.
    const buffer = await buildPptxFixture([
      `${pptxParagraph("Slide 1 title")}${pptxParagraph("Slide 1 body")}`,
      `${pptxParagraph("Slide 2 title")}`,
    ]);
    const groups = await groupOfficeTemplateParagraphsBySlide("pptx", buffer);
    expect(groups).toHaveLength(2);

    const fiveGeneratedSlides = [
      { title: "Gen 1", bullets: ["a"] },
      { title: "Gen 2", bullets: [] },
      { title: "Gen 3", bullets: [] },
      { title: "Gen 4", bullets: [] },
      { title: "Gen 5", bullets: [] },
    ];

    const plan = planSlideTemplateFill(groups, fiveGeneratedSlides);

    // The defect this wave closes: three of the five generated slides
    // (indices 2-4) have nowhere to go in a 2-slide template. A plan that
    // silently maps only the first two and says nothing about the other
    // three is exactly today's bug. The fix must refuse outright and name
    // both counts, not produce a partial, silently-truncated fill.
    expect(plan.ok).toBe(false);
    if (plan.ok) throw new Error("expected a refusal");
    expect(plan.fitReport.adjustments).toHaveLength(1);
    expect(plan.fitReport.adjustments[0]).toEqual({
      class: "slide-count-refusal",
      templateSlideCount: 2,
      requiredSlideCount: 5,
      reason: "Your template has 2 slides and this deck needs 5. Pick a shorter shape or a longer template.",
    });
  });

  it("produces a full, correct replacement list with no refusal when the deck fits the template", async () => {
    const buffer = await buildPptxFixture([
      `${pptxParagraph("Slide 1 title")}${pptxParagraph("Slide 1 body")}`,
      `${pptxParagraph("Slide 2 title")}`,
    ]);
    const groups = await groupOfficeTemplateParagraphsBySlide("pptx", buffer);

    const plan = planSlideTemplateFill(groups, [
      { title: "Gen 1", bullets: ["Gen 1 body"] },
      { title: "Gen 2", bullets: [] },
    ]);

    expect(plan.ok).toBe(true);
    if (!plan.ok) throw new Error("expected a fill plan");
    expect(plan.fitReport.adjustments).toHaveLength(0);
    expect(plan.replacements).toEqual([
      { id: groups[0].paragraphs[0].id, text: "Gen 1" },
      { id: groups[0].paragraphs[1].id, text: "Gen 1 body" },
      { id: groups[1].paragraphs[0].id, text: "Gen 2" },
    ]);
  });

  it("does not refuse when the template has slides to spare - the untouched slides keep their own text (H1)", async () => {
    const buffer = await buildPptxFixture([
      `${pptxParagraph("Slide 1 title")}`,
      `${pptxParagraph("Slide 2 title")}`,
      `${pptxParagraph("Slide 3 title")}`,
    ]);
    const groups = await groupOfficeTemplateParagraphsBySlide("pptx", buffer);

    const plan = planSlideTemplateFill(groups, [{ title: "Gen 1", bullets: [] }]);

    expect(plan.ok).toBe(true);
    if (!plan.ok) throw new Error("expected a fill plan");
    expect(plan.replacements).toEqual([{ id: groups[0].paragraphs[0].id, text: "Gen 1" }]);
  });

  it("skips a template slide with no paragraphs at all, rather than throwing", async () => {
    const buffer = await buildPptxFixture([`${pptxParagraph("Slide 1 title")}`]);
    const groups = await groupOfficeTemplateParagraphsBySlide("pptx", buffer);

    const plan = planSlideTemplateFill(groups, [{ title: "Gen 1", bullets: [] }]);
    expect(plan.ok).toBe(true);
  });
});
