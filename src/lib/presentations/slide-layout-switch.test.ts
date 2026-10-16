import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { SlideLayoutSwitchError, switchSlideLayout } from "./slide-layout-switch";

const P = "http://schemas.openxmlformats.org/presentationml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PR = "http://schemas.openxmlformats.org/package/2006/relationships";
const SLIDE = `${R}/slide`;
const LAYOUT = `${R}/slideLayout`;

function slideXml(type = "body", index = "1"): string {
  return `<p:sld xmlns:p="${P}"><p:cSld><p:spTree><p:sp><p:nvSpPr><p:nvPr><p:ph type="${type}" idx="${index}"/></p:nvPr></p:nvSpPr></p:sp></p:spTree></p:cSld></p:sld>`;
}

function layoutXml(placeholders: Array<{ type: string; index: string }>): string {
  const entries = placeholders.map(({ type, index }) => `<p:sp><p:nvSpPr><p:nvPr><p:ph type="${type}" idx="${index}"/></p:nvPr></p:nvSpPr></p:sp>`).join("");
  return `<p:sldLayout xmlns:p="${P}"><p:cSld><p:spTree>${entries}</p:spTree></p:cSld></p:sldLayout>`;
}

interface FixtureOptions {
  presentationOrder?: number[];
  slideRelationships?: Array<{ id: string; target: string; type?: string; targetMode?: string }>;
  targetLayoutXml?: string;
  sourceLayoutRelationships?: Array<{ id: string; target: string; type?: string; targetMode?: string }>;
  targetLayoutRelationships?: Array<{ id: string; target: string; type?: string; targetMode?: string }>;
  masterXml?: string;
}

async function fixture(options: FixtureOptions = {}): Promise<Buffer> {
  const order = options.presentationOrder ?? [2, 1];
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/></Types>`);
  zip.file("ppt/presentation.xml", `<p:presentation xmlns:p="${P}" xmlns:r="${R}"><p:sldIdLst>${order.map((number, index) => `<p:sldId id="${256 + index}" r:id="rId${index + 1}"/>`).join("")}</p:sldIdLst></p:presentation>`);
  zip.file("ppt/_rels/presentation.xml.rels", `<Relationships xmlns="${PR}">${order.map((number, index) => `<Relationship Id="rId${index + 1}" Type="${SLIDE}" Target="slides/slide${number}.xml"/>`).join("")}</Relationships>`);
  for (const number of new Set([...order, 3])) zip.file(`ppt/slides/slide${number}.xml`, slideXml());
  const relationships = options.slideRelationships ?? [
    { id: "rIdLayout", target: "../slideLayouts/slideLayout1.xml", type: LAYOUT },
    { id: "rIdImage", target: "../media/image1.png", type: `${R}/image` },
  ];
  zip.file("ppt/slides/_rels/slide2.xml.rels", `<Relationships xmlns="${PR}">${relationships.map(({ id, target, type = LAYOUT, targetMode }) => `<Relationship Id="${id}" Type="${type}" Target="${target}"${targetMode ? ` TargetMode="${targetMode}"` : ""}/>`).join("")}</Relationships>`);
  zip.file("ppt/slides/_rels/slide1.xml.rels", `<Relationships xmlns="${PR}"><Relationship Id="layout" Type="${LAYOUT}" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`);
  zip.file("ppt/slideLayouts/slideLayout1.xml", layoutXml([{ type: "body", index: "1" }]));
  zip.file("ppt/slideLayouts/slideLayout2.xml", options.targetLayoutXml ?? layoutXml([{ type: "body", index: "1" }, { type: "title", index: "0" }]));
  const relsXml = (relations: FixtureOptions["targetLayoutRelationships"] = [{ id: "master", target: "../slideMasters/slideMaster1.xml", type: `${R}/slideMaster` }]) =>
    `<Relationships xmlns="${PR}">${relations.map(({ id, target, type = `${R}/slideMaster`, targetMode }) => `<Relationship Id="${id}" Type="${type}" Target="${target}"${targetMode ? ` TargetMode="${targetMode}"` : ""}/>`).join("")}</Relationships>`;
  zip.file("ppt/slideLayouts/_rels/slideLayout1.xml.rels", relsXml(options.sourceLayoutRelationships));
  zip.file("ppt/slideLayouts/_rels/slideLayout2.xml.rels", relsXml(options.targetLayoutRelationships));
  zip.file("ppt/slideMasters/slideMaster1.xml", options.masterXml ?? `<p:sldMaster xmlns:p="${P}"><p:cSld/></p:sldMaster>`);
  zip.file("ppt/theme/theme1.xml", "<theme>shared theme</theme>");
  zip.file("ppt/media/image1.png", Buffer.from([0, 1, 2, 3]));
  zip.file("ppt/slides/slide3.xml", slideXml("title", "0")); // Orphan part, intentionally outside presentation order.
  return Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
}

async function member(bytes: Buffer, name: string): Promise<Buffer> {
  const zip = await JSZip.loadAsync(bytes);
  const entry = zip.file(name);
  if (!entry) throw new Error(`Missing fixture member: ${name}`);
  return entry.async("nodebuffer");
}

describe("switchSlideLayout", () => {
  it("resolves the selected slide through presentation order despite orphan and reordered slide parts", async () => {
    const original = await fixture();
    const result = await switchSlideLayout(original, 1, "ppt/slideLayouts/slideLayout2.xml");

    expect(result.relationship).toEqual({
      id: "rIdLayout",
      before: "ppt/slideLayouts/slideLayout1.xml",
      after: "ppt/slideLayouts/slideLayout2.xml",
    });
    expect((await member(result.bytes, "ppt/slides/_rels/slide2.xml.rels")).toString("utf8")).toContain("slideLayout2.xml");
    expect(await member(result.bytes, "ppt/slides/_rels/slide1.xml.rels")).toEqual(await member(original, "ppt/slides/_rels/slide1.xml.rels"));
    expect(await member(result.bytes, "ppt/slides/slide3.xml")).toEqual(await member(original, "ppt/slides/slide3.xml"));
  });

  it("returns exact structural placeholder compatibility and the before/after layout diff", async () => {
    const result = await switchSlideLayout(await fixture(), 1, "ppt/slideLayouts/slideLayout2.xml");
    expect(result.placeholders).toEqual({
      slide: [{ type: "body", index: "1" }],
      beforeLayout: [{ type: "body", index: "1" }],
      afterLayout: [{ type: "body", index: "1" }, { type: "title", index: "0" }],
      added: [{ type: "title", index: "0" }],
      removed: [],
    });
  });

  it("refuses a target layout missing a selected-slide placeholder", async () => {
    await expect(switchSlideLayout(await fixture({ targetLayoutXml: layoutXml([{ type: "title", index: "0" }]) }), 1, "ppt/slideLayouts/slideLayout2.xml"))
      .rejects.toMatchObject({ code: "placeholder_mismatch" });
  });

  it("refuses orphan and wrong-type layout parts", async () => {
    await expect(switchSlideLayout(await fixture({ targetLayoutRelationships: [] }), 1, "ppt/slideLayouts/slideLayout2.xml"))
      .rejects.toMatchObject({ code: "invalid_relationship" });
    await expect(switchSlideLayout(await fixture({ targetLayoutXml: `<p:sld xmlns:p="${P}"/>` }), 1, "ppt/slideLayouts/slideLayout2.xml"))
      .rejects.toMatchObject({ code: "invalid_package" });
  });

  it("requires exactly one internal master relationship to an existing typed slide master for both layouts", async () => {
    await expect(switchSlideLayout(await fixture({ targetLayoutRelationships: [{ id: "master", target: "../slideMasters/slideMaster1.xml", type: `${R}/image` }] }), 1, "ppt/slideLayouts/slideLayout2.xml"))
      .rejects.toMatchObject({ code: "invalid_relationship" });
    await expect(switchSlideLayout(await fixture({ sourceLayoutRelationships: [] }), 1, "ppt/slideLayouts/slideLayout2.xml"))
      .rejects.toMatchObject({ code: "invalid_relationship" });
    await expect(switchSlideLayout(await fixture({ targetLayoutRelationships: [{ id: "master", target: "https://example.com/master.xml", type: `${R}/slideMaster`, targetMode: "External" }] }), 1, "ppt/slideLayouts/slideLayout2.xml"))
      .rejects.toMatchObject({ code: "invalid_target" });
    await expect(switchSlideLayout(await fixture({ masterXml: `<p:sld xmlns:p="${P}"/>` }), 1, "ppt/slideLayouts/slideLayout2.xml"))
      .rejects.toMatchObject({ code: "invalid_package" });
  });

  it("rejects duplicate relationship IDs and hostile DTD/entity XML", async () => {
    await expect(switchSlideLayout(await fixture({ slideRelationships: [
      { id: "duplicate", target: "../slideLayouts/slideLayout1.xml" },
      { id: "duplicate", target: "../media/image1.png", type: `${R}/image` },
    ] }), 1, "ppt/slideLayouts/slideLayout2.xml"))
      .rejects.toMatchObject({ code: "invalid_relationship" });
    await expect(switchSlideLayout(await fixture({ targetLayoutXml: `<!DOCTYPE x [<!ENTITY bad "bad">]><p:sldLayout xmlns:p="${P}"><p:cSld>&bad;</p:cSld></p:sldLayout>` }), 1, "ppt/slideLayouts/slideLayout2.xml"))
      .rejects.toMatchObject({ code: "invalid_package" });
  });

  it("rejects external and traversal targets in the selected slide relationship", async () => {
    await expect(switchSlideLayout(await fixture({ slideRelationships: [{ id: "layout", target: "https://example.com/layout.xml", targetMode: "External" }] }), 1, "ppt/slideLayouts/slideLayout2.xml"))
      .rejects.toMatchObject({ code: "invalid_target" });
    await expect(switchSlideLayout(await fixture({ slideRelationships: [{ id: "layout", target: "../../../outside.xml" }] }), 1, "ppt/slideLayouts/slideLayout2.xml"))
      .rejects.toMatchObject({ code: "invalid_target" });
  });

  it("rejects invalid requested package paths, missing layouts, and the current layout", async () => {
    const original = await fixture();
    await expect(switchSlideLayout(original, 1, "ppt/slideLayouts/../slides/slide1.xml"))
      .rejects.toBeInstanceOf(SlideLayoutSwitchError);
    await expect(switchSlideLayout(original, 1, "ppt/slideLayouts/slideLayout9.xml"))
      .rejects.toMatchObject({ code: "layout_missing" });
    await expect(switchSlideLayout(original, 1, "ppt/slideLayouts/slideLayout1.xml"))
      .rejects.toMatchObject({ code: "same_layout" });
  });

  it("changes only the selected slide relationship member and preserves every other package member byte-for-byte", async () => {
    const original = await fixture();
    const result = await switchSlideLayout(original, 1, "ppt/slideLayouts/slideLayout2.xml");
    const before = await JSZip.loadAsync(original);
    const after = await JSZip.loadAsync(result.bytes);
    const beforeNames = Object.keys(before.files).filter((name) => !before.files[name].dir).sort();
    const afterNames = Object.keys(after.files).filter((name) => !after.files[name].dir).sort();
    expect(afterNames).toEqual(beforeNames);
    const changedMember = "ppt/slides/_rels/slide2.xml.rels";
    for (const name of beforeNames.filter((entry) => entry !== changedMember)) {
      expect(await after.file(name)?.async("nodebuffer")).toEqual(await before.file(name)?.async("nodebuffer"));
    }
    expect(await member(result.bytes, "ppt/slideLayouts/slideLayout1.xml")).toEqual(await member(original, "ppt/slideLayouts/slideLayout1.xml"));
    expect(await member(result.bytes, "ppt/slideLayouts/slideLayout2.xml")).toEqual(await member(original, "ppt/slideLayouts/slideLayout2.xml"));
    expect(await member(result.bytes, "ppt/slideMasters/slideMaster1.xml")).toEqual(await member(original, "ppt/slideMasters/slideMaster1.xml"));
    expect(await member(result.bytes, "ppt/theme/theme1.xml")).toEqual(await member(original, "ppt/theme/theme1.xml"));
  });
});
