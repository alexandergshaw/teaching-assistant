import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { buildSlidesPptx, normalizeSlideTypography, type PptxSlide } from "./pptx";
import type { Matrix2x2Graphic, ProcessGraphic, TableGraphic } from "./slide-graphics";

// Fixture characters built from their numeric code point, not typed as
// literals - matching normalizeTypography's own house-rule note (only ASCII
// hyphens belong in code and comments).
const EM_DASH = String.fromCharCode(0x2014);
const RIGHT_SINGLE_QUOTE = String.fromCharCode(0x2019);

describe("normalizeSlideTypography (pure)", () => {
  it("normalizes the title and every bullet", () => {
    const slide: PptxSlide = {
      title: `Case Study: TJX${EM_DASH}A Retail Breach`,
      bullets: [`Tesla${RIGHT_SINGLE_QUOTE}s plan`, `word${EM_DASH}word`],
    };
    const result = normalizeSlideTypography(slide);
    expect(result.title).toBe("Case Study: TJX - A Retail Breach");
    expect(result.bullets).toEqual(["Tesla's plan", "word - word"]);
  });

  it("normalizes speaker notes", () => {
    const slide: PptxSlide = { title: "T", bullets: [], notes: `word${EM_DASH}word` };
    expect(normalizeSlideTypography(slide).notes).toBe("word - word");
  });

  it("leaves notes as undefined when the slide has none", () => {
    const slide: PptxSlide = { title: "T", bullets: [] };
    expect(normalizeSlideTypography(slide).notes).toBeUndefined();
  });

  it("never touches the code or codeLanguage fields", () => {
    const slide: PptxSlide = {
      title: "T",
      bullets: [],
      code: `const label = "word${EM_DASH}word";`,
      codeLanguage: "javascript",
    };
    const result = normalizeSlideTypography(slide);
    expect(result.code).toBe(`const label = "word${EM_DASH}word";`);
    expect(result.codeLanguage).toBe("javascript");
  });

  it("normalizes a table graphic's headers and every row cell", () => {
    const graphic: TableGraphic = {
      kind: "table",
      headers: [`Term${EM_DASH}defined`, "Meaning"],
      rows: [[`word${EM_DASH}word`, `Tesla${RIGHT_SINGLE_QUOTE}s`]],
    };
    const slide: PptxSlide = { title: "T", bullets: [], graphic };
    const result = normalizeSlideTypography(slide) as PptxSlide & { graphic: TableGraphic };
    expect(result.graphic.headers).toEqual(["Term - defined", "Meaning"]);
    expect(result.graphic.rows).toEqual([["word - word", "Tesla's"]]);
  });

  it("normalizes a matrix2x2 graphic's axis labels and every quadrant's label/items", () => {
    const graphic: Matrix2x2Graphic = {
      kind: "matrix2x2",
      xAxisLabel: `Low${EM_DASH}High`,
      yAxisLabel: "Impact",
      quadrants: {
        topLeft: { label: `Quick Win${EM_DASH}Low Effort`, items: [`item${EM_DASH}one`] },
        topRight: { label: "Major", items: [] },
        bottomLeft: { label: "Fill-in", items: [] },
        bottomRight: { label: "Thankless", items: [] },
      },
    };
    const slide: PptxSlide = { title: "T", bullets: [], graphic };
    const result = normalizeSlideTypography(slide) as PptxSlide & { graphic: Matrix2x2Graphic };
    // "Low"/"High" are not digits, so this is the generic parenthetical rule
    // (spaced hyphen), not the numeric-range rule.
    expect(result.graphic.xAxisLabel).toBe("Low - High");
    expect(result.graphic.quadrants.topLeft.label).toBe("Quick Win - Low Effort");
    expect(result.graphic.quadrants.topLeft.items).toEqual(["item - one"]);
    // A hyphenated word inside quadrant text must survive untouched.
    expect(result.graphic.quadrants.bottomLeft.label).toBe("Fill-in");
  });

  it("normalizes a process graphic's step labels and captions", () => {
    const graphic: ProcessGraphic = {
      kind: "process",
      steps: [
        { label: `Step One${EM_DASH}Kickoff`, caption: `word${EM_DASH}word` },
        { label: "Step Two" }, // no caption
      ],
    };
    const slide: PptxSlide = { title: "T", bullets: [], graphic };
    const result = normalizeSlideTypography(slide) as PptxSlide & { graphic: ProcessGraphic };
    expect(result.graphic.steps[0]).toEqual({ label: "Step One - Kickoff", caption: "word - word" });
    expect(result.graphic.steps[1]).toEqual({ label: "Step Two" });
    expect(result.graphic.steps[1].caption).toBeUndefined();
  });
});

// ── End-to-end: prove buildSlidesPptx actually calls the normalizer ────────
// normalizeSlideTypography's own tests above prove the substitution rules in
// isolation; these prove buildSlidesPptx actually wires it into the real
// build - a bug in that wiring would pass every unit test above and still
// ship an em dash straight into a real .pptx.
async function slideXml(buffer: ArrayBuffer, slideNumber: number): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  return zip.file(`ppt/slides/slide${slideNumber}.xml`)!.async("string");
}
async function notesXml(buffer: ArrayBuffer, slideNumber: number): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  return zip.file(`ppt/notesSlides/notesSlide${slideNumber}.xml`)!.async("string");
}

describe("buildSlidesPptx typography normalization (end-to-end, real XML)", () => {
  it("normalizes the presentation title in the real title-slide XML", async () => {
    const buffer = await buildSlidesPptx({
      presentationTitle: `Case Study: TJX${EM_DASH}A Retail Breach`,
      slides: [{ title: "Overview", bullets: ["A plain bullet."] }],
    });
    const xml = await slideXml(buffer, 1);
    expect(xml).not.toContain(EM_DASH);
    expect(xml).toContain("Case Study: TJX - A Retail Breach");
  });

  it("normalizes a bullet in the real content-slide XML", async () => {
    const buffer = await buildSlidesPptx({
      presentationTitle: "Deck Title",
      slides: [
        { title: "Overview", bullets: [`TJX Companies${EM_DASH}the parent company${EM_DASH}suffered a breach.`] },
      ],
    });
    const xml = await slideXml(buffer, 2);
    expect(xml).not.toContain(EM_DASH);
    expect(xml).toContain("TJX Companies - the parent company - suffered a breach.");
  });

  it("normalizes speaker notes in the real notes-slide XML", async () => {
    const buffer = await buildSlidesPptx({
      presentationTitle: "Deck Title",
      slides: [{ title: "Overview", bullets: ["A bullet."], notes: `word${EM_DASH}word` }],
    });
    const xml = await notesXml(buffer, 2);
    expect(xml).not.toContain(EM_DASH);
    expect(xml).toContain("word - word");
  });

  it("normalizes a curly apostrophe in a bullet in the real content-slide XML", async () => {
    const buffer = await buildSlidesPptx({
      presentationTitle: "Deck Title",
      slides: [{ title: "Overview", bullets: [`Tesla${RIGHT_SINGLE_QUOTE}s Gigafactory program.`] }],
    });
    const xml = await slideXml(buffer, 2);
    expect(xml).not.toContain(RIGHT_SINGLE_QUOTE);
    expect(xml).toContain("Tesla&apos;s Gigafactory program.");
  });

  it("does not normalize a dash inside the code field", async () => {
    const buffer = await buildSlidesPptx({
      presentationTitle: "Deck Title",
      slides: [
        {
          title: "Example",
          bullets: [],
          code: `const label = "word${EM_DASH}word";`,
          codeLanguage: "javascript",
        },
      ],
    });
    const xml = await slideXml(buffer, 2);
    expect(xml).toContain(EM_DASH);
  });

  it("normalizes a table graphic's cell text in the real content-slide XML", async () => {
    const buffer = await buildSlidesPptx({
      presentationTitle: "Deck Title",
      slides: [
        {
          title: "Artifact",
          bullets: ["one", "two"],
          graphic: { kind: "table", headers: ["Term", "Meaning"], rows: [[`word${EM_DASH}word`, "plain"]] },
        },
      ],
    });
    const xml = await slideXml(buffer, 2);
    expect(xml).not.toContain(EM_DASH);
    expect(xml).toContain("word - word");
  });
});
