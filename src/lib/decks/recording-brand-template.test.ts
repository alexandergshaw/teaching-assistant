import { describe, expect, it, vi } from "vitest";
import JSZip from "jszip";
import { prepareRecordingBrandTemplate } from "./recording-brand-template";

vi.mock("server-only", () => ({}));

const p = "http://schemas.openxmlformats.org/presentationml/2006/main";
const a = "http://schemas.openxmlformats.org/drawingml/2006/main";
const r = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const rel = "http://schemas.openxmlformats.org/package/2006/relationships";
const mime = "application/vnd.openxmlformats-officedocument.presentationml";
const relationships = (entries: string[]) => `<Relationships xmlns="${rel}">${entries.join("")}</Relationships>`;
const relation = (id: string, type: string, path: string) => `<Relationship Id="${id}" Type="${r}/${type}" Target="${path}"/>`;
const override = (path: string, type: string) => `<Override PartName="/${path}" ContentType="${mime}.${type}+xml"/>`;
const text = (value: string) => `<a:p><a:r><a:t>${value}</a:t></a:r></a:p>`;
const xml = (name: string, body: string) => `<p:${name} xmlns:p="${p}" xmlns:a="${a}" xmlns:r="${r}">${body}</p:${name}>`;
const shape = (type: string, index: number, value: string) =>
  `<p:sp><p:nvSpPr><p:nvPr><p:ph type="${type}" idx="${index}"/></p:nvPr></p:nvSpPr><p:txBody>${text(value)}</p:txBody></p:sp>`;

async function fixture({
  extension = "pptx", slideCount = 1, staticBrand = false, custom = false, invalidReverse = false, notes = true,
}: { extension?: "potx" | "pptx"; slideCount?: number; staticBrand?: boolean; custom?: boolean; invalidReverse?: boolean; notes?: boolean } = {}) {
  const zip = new JSZip();
  const layouts = [1, 2].map((num) => `ppt/slideLayouts/slideLayout${num}.xml`);
  for (const [index, layout] of layouts.entries()) {
    const n = index + 1;
    zip.file(layout, xml("sldLayout", `<p:cSld><p:spTree>${shape("title", n * 100 + 1, "Template title")}${shape("body", n * 100 + 2, "Template body")}<p:sp><p:txBody>${text(`Brand on layout ${n}`)}</p:txBody></p:sp></p:spTree></p:cSld>`));
    zip.file(`ppt/slideLayouts/_rels/slideLayout${n}.xml.rels`, relationships([
      relation("rId1", "slideMaster", `../slideMasters/slideMaster${invalidReverse ? 2 : 1}.xml`),
    ]));
  }
  zip.file("ppt/slideMasters/slideMaster1.xml", xml("sldMaster", `<p:sldLayoutIdLst><p:sldLayoutId id="1" r:id="L1"/><p:sldLayoutId id="2" r:id="L2"/></p:sldLayoutIdLst>`));
  zip.file("ppt/slideMasters/_rels/slideMaster1.xml.rels", relationships(layouts.map((path, i) => relation(`L${i + 1}`, "slideLayout", `../${path.slice(4)}`))));
  const slideIds = Array.from({ length: slideCount }, (_, i) => i + 1);
  zip.file("ppt/presentation.xml", xml("presentation", `<p:sldMasterIdLst><p:sldMasterId id="1" r:id="rMaster"/></p:sldMasterIdLst>${slideCount ? `<p:sldIdLst>${slideIds.map((i) => `<p:sldId id="${255 + i}" r:id="rSample${i}"/>`).join("")}</p:sldIdLst>` : ""}<p:sldSz cx="9144000" cy="5143500"/>${custom ? "<p:custShowLst/>" : ""}`));
  zip.file("ppt/_rels/presentation.xml.rels", relationships([
    relation("rMaster", "slideMaster", "slideMasters/slideMaster1.xml"),
    ...slideIds.map((i) => relation(`rSample${i}`, "slide", `slides/slide${i}.xml`)),
    relation("rIdRecordingSlide1", "theme", "theme/theme1.xml"),
  ]));
  zip.file("ppt/theme/theme1.xml", "Exact branded theme");
  for (const i of slideIds) {
    zip.file(`ppt/slides/slide${i}.xml`, xml("sld", `<p:cSld><p:spTree>${shape("title", 201, "Old sample title")}${shape("body", 202, "Old sample content")}${staticBrand ? `<p:sp><p:txBody>${text("Brand on sample")}</p:txBody></p:sp>` : ""}</p:spTree></p:cSld>`));
    zip.file(`ppt/slides/_rels/slide${i}.xml.rels`, relationships([
      relation("rId1", "slideLayout", "../slideLayouts/slideLayout2.xml"),
      ...(notes ? [relation("rId2", "notesSlide", `../notesSlides/notesSlide${i}.xml`)] : []),
    ]));
    if (notes) zip.file(`ppt/notesSlides/notesSlide${i}.xml`, xml("notes", shape("body", 1, "Original notes stay private")));
  }
  zip.file("[Content_Types].xml", `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${override("ppt/presentation.xml", extension === "potx" ? "template.main" : "presentation.main")}${slideIds.map((i) => override(`ppt/slides/slide${i}.xml`, "slide")).join("")}</Types>`);
  return zip;
}

const slides = [{ title: "Introduction & ideas", bullets: ["One < two"] }, { title: "Practice", bullets: ["Try it"] }];

describe("native branded recording PowerPoint", () => {
  it.each(["pptx", "potx"] as const)("inherits the actual attached layout from %s and removes the sample text/notes", async (extension) => {
    const input = await fixture({ extension });
    const source = await input.generateAsync({ type: "nodebuffer" });
    const template = await prepareRecordingBrandTemplate(source, extension);
    expect(template.fit).toEqual({ kind: "layout" });
    const output = await JSZip.loadAsync(await template.fill(slides));
    expect(await output.file("[Content_Types].xml")?.async("string")).toContain(`${mime}.presentation.main+xml`);
    for (const i of [1, 2]) {
      const layout = `ppt/slideLayouts/slideLayout${i}.xml`;
      expect(await output.file(layout)?.async("string")).toBe(await input.file(layout)?.async("string"));
    }
    expect(await output.file("ppt/theme/theme1.xml")?.async("string")).toBe("Exact branded theme");
    expect(await output.file("ppt/slides/_rels/slide2.xml.rels")?.async("string")).toContain("slideLayout2.xml");
    expect(await output.file("ppt/slides/slide2.xml")?.async("string")).toContain('type="body" idx="202"');
    expect(await output.file("ppt/slides/slide2.xml")?.async("string")).toContain("Introduction &amp; ideas");
    expect(await output.file("ppt/slides/slide2.xml")?.async("string")).toContain("One &lt; two");
    expect(output.file("ppt/notesSlides/notesSlide1.xml")).toBeNull();
    expect(output.file("ppt/slides/slide1.xml")).toBeNull();
    expect(await output.file("ppt/_rels/presentation.xml.rels")?.async("string")).toContain("rIdRecordingSlide1");
    expect(await output.file("ppt/_rels/presentation.xml.rels")?.async("string")).toContain("rIdRecordingSlide2");
  });

  it("creates slides from a genuinely slide-free template with a valid master", async () => {
    const source = await (await fixture({ slideCount: 0, extension: "potx" })).generateAsync({ type: "nodebuffer" });
    const template = await prepareRecordingBrandTemplate(source, "potx");
    const output = await JSZip.loadAsync(await template.fill(slides));
    expect(await output.file("ppt/presentation.xml")?.async("string")).toContain("<p:sldIdLst>");
    expect(await output.file("ppt/slides/_rels/slide2.xml.rels")?.async("string")).toContain("slideLayout1.xml");
  });

  it("does not lose branding or leave dangling slide references from special sample decks", async () => {
    for (const [options, reason] of [
      [{ staticBrand: true }, /Move branding/], [{ custom: true }, /sections and custom shows/],
      [{ slideCount: 0, invalidReverse: true }, /incompatible/], [{ slideCount: 2 }, /Clear speaker notes/],
      [{ slideCount: 2, notes: false, staticBrand: true }, /Move logos, footer text/],
    ] as const) {
      const source = await (await fixture(options)).generateAsync({ type: "nodebuffer" });
      await expect(prepareRecordingBrandTemplate(source, "pptx")).rejects.toThrow(reason);
    }
  });

  it("uses the existing strict positional renderer when a template has multiple editable sample slides", async () => {
    const source = await (await fixture({ slideCount: 2, notes: false })).generateAsync({ type: "nodebuffer" });
    const template = await prepareRecordingBrandTemplate(source, "pptx");
    expect(template.fit).toEqual({ kind: "fixed", bulletSlots: [1, 1] });
    await expect(template.fill(slides.slice(0, 1))).rejects.toThrow(/same number of slides/);
    const output = await JSZip.loadAsync(await template.fill(slides));
    expect(await output.file("ppt/slides/slide1.xml")?.async("string")).toContain("Introduction &amp; ideas");
    expect(await output.file("ppt/theme/theme1.xml")?.async("string")).toBe("Exact branded theme");
  });
});
