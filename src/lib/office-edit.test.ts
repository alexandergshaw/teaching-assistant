import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { parseOfficeParagraphs, applyOfficeSections, type RunSpan } from "./office-edit";

// This suite pins the contract office-edit.ts states in its own header
// (:3-15) and above applyOfficeSections (:383-392): an unedited paragraph is
// carried through byte-for-byte, and the pptx write path can rewrite, clone
// or delete a paragraph but cannot add a slide. No .pptx/.potx fixture is
// tracked in this repo (docs/a43-scope.md section 3.2), so every fixture here
// is built in-memory with jszip, which is already a dependency
// (package.json:33) and already used this way by other test files (e.g.
// src/lib/grade/extraction.test.ts).

function slideXml(paragraphsXml: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ` +
    `xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">` +
    `<p:cSld><p:spTree><p:sp><p:txBody>${paragraphsXml}</p:txBody></p:sp></p:spTree></p:cSld>` +
    `</p:sld>`
  );
}

function pptxParagraph(text: string, opts?: { sz?: number; bold?: boolean }): string {
  const rpr = `<a:rPr lang="en-US"${opts?.sz != null ? ` sz="${opts.sz}"` : ""}${
    opts?.bold ? ' b="1"' : ""
  }/>`;
  return `<a:p><a:r>${rpr}<a:t>${text}</a:t></a:r></a:p>`;
}

/** Build a minimal .pptx buffer with the given slide-file entries, added to the
 * zip in the given (possibly out-of-order) sequence, so tests can prove
 * sortedSlides sorts numerically rather than relying on insertion order. */
async function buildPptx(slides: Array<{ path: string; xml: string }>): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>`
  );
  for (const s of slides) zip.file(s.path, s.xml);
  return Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
}

describe("office-edit: pptx read/write round trip and byte-identity contract", () => {
  it("OfficeKind round trip for pptx: parses paragraphs from a minimal built .pptx matching what was written", async () => {
    const buffer = await buildPptx([
      { path: "ppt/slides/slide1.xml", xml: slideXml(pptxParagraph("Hello World", { sz: 2800 })) },
    ]);

    const paragraphs = await parseOfficeParagraphs("pptx", buffer);

    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0].slide).toBe(1);
    expect(paragraphs[0].text).toBe("Hello World");
    expect(paragraphs[0].runs).toHaveLength(1);
    expect(paragraphs[0].runs[0]).toMatchObject({ text: "Hello World", sizePt: 28 });
  });

  it("byte-identity: editing one paragraph leaves every other paragraph's XML byte-for-byte identical to the input", async () => {
    // The untouched paragraph's <a:rPr> attribute order is deliberately NOT
    // the order office-edit.ts's own rebuild path would emit (which always
    // appends sz then b/i/u last, buildPptxRunProps:316-323). A correct,
    // guarantee-respecting run never re-serialises this paragraph at all
    // (the spansEqual short-circuit at :418), so the original order survives.
    // Only a broken guard would rebuild it and reorder these attributes -
    // which is exactly the regression this test exists to catch.
    const para1 = `<a:p><a:r><a:rPr b="1" lang="en-US" sz="3200"/><a:t>Keep me exactly as I am</a:t></a:r></a:p>`;
    const para2 = pptxParagraph("Edit me");
    const originalSlideXml = slideXml(`${para1}${para2}`);
    const buffer = await buildPptx([{ path: "ppt/slides/slide1.xml", xml: originalSlideXml }]);

    const originals = await parseOfficeParagraphs("pptx", buffer);
    expect(originals).toHaveLength(2);
    const untouchedId = originals[0].id; // "Keep me exactly as I am"
    const editedId = originals[1].id; // "Edit me"

    const sections: Array<{ sourceId: string; spans: RunSpan[] }> = [
      { sourceId: untouchedId, spans: originals[0].runs }, // unchanged: same spans back
      { sourceId: editedId, spans: [{ text: "Edited text" }] },
    ];
    const result = await applyOfficeSections("pptx", buffer, sections);

    const zip = await JSZip.loadAsync(result);
    const newSlideXml = await zip.file("ppt/slides/slide1.xml")?.async("string");
    expect(newSlideXml).toBeDefined();

    // Strict byte-identity assertion: replacing ONLY the edited paragraph's
    // exact substring in the ORIGINAL xml with its substring from the NEW xml
    // must reproduce the new xml exactly. That proves everything surrounding
    // the edited paragraph - the untouched paragraph's XML, all whitespace,
    // attribute ordering, the wrapper elements - is byte-for-byte unchanged,
    // not merely equivalent.
    const PPTX_PARA = /<a:p\b[^>]*(?<!\/)>[\s\S]*?<\/a:p>/g;
    const originalParas = [...originalSlideXml.matchAll(PPTX_PARA)].map((m) => m[0]);
    const newParas = [...(newSlideXml as string).matchAll(PPTX_PARA)].map((m) => m[0]);
    expect(originalParas).toHaveLength(2);
    expect(newParas).toHaveLength(2);

    // The untouched paragraph's own XML substring did not change one byte.
    expect(newParas[0]).toBe(originalParas[0]);

    // And reconstructing the whole document from the original by swapping in
    // only the edited paragraph's new substring reproduces the new document
    // exactly - i.e. nothing else in the file moved or was re-serialised.
    const reconstructed = originalSlideXml.replace(originalParas[1], newParas[1]);
    expect(reconstructed).toBe(newSlideXml);
  });

  it("sortedSlides orders slides numerically, not lexicographically, even when zip entries are added out of order", async () => {
    // Deliberately out-of-order insertion, and deliberately including a
    // double-digit slide number so a lexicographic sort ("slide10" < "slide9")
    // would misorder it.
    const buffer = await buildPptx([
      { path: "ppt/slides/slide9.xml", xml: slideXml(pptxParagraph("slide nine")) },
      { path: "ppt/slides/slide10.xml", xml: slideXml(pptxParagraph("slide ten")) },
      { path: "ppt/slides/slide2.xml", xml: slideXml(pptxParagraph("slide two")) },
      { path: "ppt/slides/slide1.xml", xml: slideXml(pptxParagraph("slide one")) },
    ]);

    const paragraphs = await parseOfficeParagraphs("pptx", buffer);

    expect(paragraphs.map((p) => p.text)).toEqual(["slide one", "slide two", "slide nine", "slide ten"]);
    expect(paragraphs.map((p) => p.slide)).toEqual([1, 2, 3, 4]);
  });

  it("documented limit: applyOfficeSections cannot add a slide - the output has exactly the input's slide count", async () => {
    // If a future reader adds slide-cloning support (docs/a43-scope.md 3.5
    // calls this "not optional" for a wave-3 lecture-deck feature), this test
    // should start failing here and be the prompt to update this contract.
    const buffer = await buildPptx([
      { path: "ppt/slides/slide1.xml", xml: slideXml(pptxParagraph("Only slide")) },
    ]);

    const originals = await parseOfficeParagraphs("pptx", buffer);
    expect(originals).toHaveLength(1);

    // A sourceId that names no real paragraph is the shape a caller would use
    // to try to append new content; the machinery has no append/insert path
    // for pptx (only rewrite/clone/delete of an EXISTING paragraph, keyed by
    // an id that already exists in the file), so this section is inert.
    const sections: Array<{ sourceId: string; spans: RunSpan[] }> = [
      { sourceId: originals[0].id, spans: originals[0].runs },
      { sourceId: "s99_p99", spans: [{ text: "A brand new slide's worth of content" }] },
    ];
    const result = await applyOfficeSections("pptx", buffer, sections);

    const zip = await JSZip.loadAsync(result);
    const slideNames = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/i.test(n));
    expect(slideNames).toHaveLength(1);

    const reparsed = await parseOfficeParagraphs("pptx", result);
    expect(reparsed).toHaveLength(1);
    expect(reparsed[0].text).toBe("Only slide");
  });

  it("a pptx-shaped file with zero ppt/slides/ entries (the .potx shape) parses to zero paragraphs rather than throwing", async () => {
    // docs/a43-scope.md 3.5 flags this as an unresolved risk: a .potx commonly
    // carries its design in ppt/slideLayouts/ + ppt/slideMasters/ with ZERO
    // ppt/slides/ entries, and sortedSlides only matches ppt/slides/slideN.xml.
    // This pins what that read path actually does today: it is reachable and
    // silent (an empty result), not a throw.
    const zip = new JSZip();
    zip.file(
      "ppt/slideLayouts/slideLayout1.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ` +
        `xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">` +
        `<p:cSld><p:spTree><p:sp><p:txBody>${pptxParagraph("Layout placeholder text")}</p:txBody></p:sp></p:spTree></p:cSld>` +
        `</p:sldLayout>`
    );
    const buffer = Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));

    const paragraphs = await parseOfficeParagraphs("pptx", buffer);

    expect(paragraphs).toEqual([]);
  });
});
