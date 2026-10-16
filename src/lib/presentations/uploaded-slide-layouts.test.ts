import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { inspectUploadedSlideLayoutSet, inspectUploadedSlideLayouts } from "./uploaded-slide-layouts";

const P = "http://schemas.openxmlformats.org/presentationml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PR = "http://schemas.openxmlformats.org/package/2006/relationships";
async function fixture(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/></Types>`);
  zip.file("ppt/presentation.xml", `<p:presentation xmlns:p="${P}" xmlns:r="${R}"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst></p:presentation>`);
  zip.file("ppt/_rels/presentation.xml.rels", `<Relationships xmlns="${PR}"><Relationship Id="rId1" Type="${R}/slide" Target="slides/slide1.xml"/></Relationships>`);
  zip.file("ppt/slides/slide1.xml", `<p:sld xmlns:p="${P}"><p:cSld/></p:sld>`);
  zip.file("ppt/slides/_rels/slide1.xml.rels", `<Relationships xmlns="${PR}"><Relationship Id="layout" Type="${R}/slideLayout" Target="../slideLayouts/layout1.xml"/></Relationships>`);
  zip.file("ppt/slideLayouts/layout1.xml", `<p:sldLayout xmlns:p="${P}"><p:cSld name="Title"><p:sp><p:nvSpPr><p:nvPr><p:ph type="title" idx="0"/></p:nvPr></p:nvSpPr></p:sp></p:cSld></p:sldLayout>`);
  zip.file("ppt/slideLayouts/orphan.xml", `<p:sldLayout xmlns:p="${P}"><p:cSld name="Unregistered"/></p:sldLayout>`);
  zip.file("ppt/slideLayouts/_rels/layout1.xml.rels", `<Relationships xmlns="${PR}"><Relationship Id="master" Type="${R}/slideMaster" Target="../slideMasters/master1.xml"/></Relationships>`);
  zip.file("ppt/slideLayouts/_rels/orphan.xml.rels", `<Relationships xmlns="${PR}"><Relationship Id="master" Type="${R}/slideMaster" Target="../slideMasters/master1.xml"/></Relationships>`);
  zip.file("ppt/slideMasters/master1.xml", `<p:sldMaster xmlns:p="${P}" xmlns:r="${R}"><p:sldLayoutIdLst><p:sldLayoutId id="1" r:id="layout1"/></p:sldLayoutIdLst><p:cSld/></p:sldMaster>`);
  zip.file("ppt/slideMasters/_rels/master1.xml.rels", `<Relationships xmlns="${PR}"><Relationship Id="layout1" Type="${R}/slideLayout" Target="../slideLayouts/layout1.xml"/></Relationships>`);
  return Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
}

describe("uploaded slide layout inventory", () => {
  it("lists existing package layouts, placeholder identity, current relation, and digest", async () => {
    const bytes = await fixture(); const result = await inspectUploadedSlideLayouts(bytes, 1);
    expect(result.packageDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(result.slideNumber).toBe(1);
    expect(result.currentLayoutMember).toBe("ppt/slideLayouts/layout1.xml");
    expect(result.layouts).toEqual([{ member: "ppt/slideLayouts/layout1.xml", name: "Title", placeholders: [{ type: "title", index: "0" }] }]);
  });
  it("refuses an invalid slide number", async () => { await expect(inspectUploadedSlideLayouts(await fixture(), 2)).rejects.toThrow("layout_inventory_unavailable"); });
  it("excludes orphan slideLayout parts not registered by the slide master", async () => {
    const result = await inspectUploadedSlideLayouts(await fixture(), 1);
    expect(result.layouts.map((layout) => layout.member)).toEqual(["ppt/slideLayouts/layout1.xml"]);
  });
  it("builds one bounded layout set for an 80-slide upload and refuses slide 81", async () => {
    const zip = await JSZip.loadAsync(await fixture());
    const slideIds = Array.from({ length: 80 }, (_, index) => index + 1);
    zip.file("ppt/presentation.xml", `<p:presentation xmlns:p="${P}" xmlns:r="${R}"><p:sldIdLst>${slideIds.map((n) => `<p:sldId id="${255 + n}" r:id="rId${n}"/>`).join("")}</p:sldIdLst></p:presentation>`);
    zip.file("ppt/_rels/presentation.xml.rels", `<Relationships xmlns="${PR}">${slideIds.map((n) => `<Relationship Id="rId${n}" Type="${R}/slide" Target="slides/slide${n}.xml"/>`).join("")}</Relationships>`);
    for (const n of slideIds) {
      zip.file(`ppt/slides/slide${n}.xml`, `<p:sld xmlns:p="${P}"/>`);
      zip.file(`ppt/slides/_rels/slide${n}.xml.rels`, `<Relationships xmlns="${PR}"><Relationship Id="layout" Type="${R}/slideLayout" Target="../slideLayouts/layout1.xml"/></Relationships>`);
    }
    const bytes = Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
    const set = await inspectUploadedSlideLayoutSet(bytes, slideIds.map((n) => ({ id: `ppt/slides/slide${n}.xml` })));
    expect(set).toHaveLength(80);
    expect(set[79]?.slideNumber).toBe(80);
    await expect(inspectUploadedSlideLayoutSet(bytes, [...slideIds, 81].map((n) => ({ id: `ppt/slides/slide${n}.xml` })))).rejects.toThrow("layout_inventory_unavailable");
  });
});
