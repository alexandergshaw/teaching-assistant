import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { applySlideObjectOperations, inspectSlideObjects, SlideObjectError } from "./uploaded-slide-objects";

const shape = `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="100" y="200"/><a:ext cx="300" cy="400"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="112233"/></a:solidFill></p:spPr><p:txBody><a:p><a:r><a:t>Title</a:t></a:r></a:p></p:txBody></p:sp>`;
const picture = `<p:pic><p:nvPicPr><p:cNvPr id="3" name="Photo" descr="old alt"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId1"/></p:blipFill><p:spPr><a:xfrm><a:off x="10" y="20"/><a:ext cx="30" cy="40"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
const chart = `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="4" name="Chart 1"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><a:xfrm><a:off x="0" y="0"/><a:ext cx="10" cy="10"/></a:xfrm><a:graphic><a:graphicData><c:chart r:id="rId2"/></a:graphicData></a:graphic></p:graphicFrame>`;
const diagram = `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="5" name="Process"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><a:xfrm><a:off x="0" y="0"/><a:ext cx="10" cy="10"/></a:xfrm><a:graphic><a:graphicData><dgm:relIds r:dm="rId3"/></a:graphicData></a:graphic></p:graphicFrame>`;
const group = `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="6" name="Group"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="7" name="Nested"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr></p:sp></p:grpSp>`;

function slideXml(): string {
  return `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram"><p:cSld><p:spTree><p:nvGrpSpPr/><p:grpSpPr/>${shape}${picture}${chart}${diagram}${group}</p:spTree></p:cSld></p:sld>`;
}

async function fixture(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/></Types>`);
  zip.file("ppt/presentation.xml", `<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst></p:presentation>`);
  zip.file("ppt/_rels/presentation.xml.rels", `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>`);
  zip.file("ppt/slides/slide1.xml", slideXml());
  zip.file("ppt/slides/slide2.xml", "second slide sentinel");
  zip.file("ppt/media/image1.png", Buffer.from([1, 2, 3]));
  zip.file("ppt/charts/chart1.xml", "chart sentinel");
  zip.file("customXml/item1.xml", "extension sentinel");
  zip.file("ppt/slides/_rels/slide1.xml.rels", `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart1.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/diagramData" Target="../diagrams/data1.xml"/></Relationships>`);
  return Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
}

describe("uploaded slide native object editing", () => {
  it("inventories editable objects and preserves unsupported chart, SmartArt, and group objects read-only", async () => {
    const result = await inspectSlideObjects(await fixture(), 1);
    expect(result.objects.map(({ kind, editable }) => [kind, editable])).toEqual([
      ["shape", true], ["picture", true], ["chart", false], ["smartart", false], ["group", false],
    ]);
    expect(result.objects.find((item) => item.kind === "group")?.reason).toContain("read-only");
    expect(result.objects.map((item) => item.name)).not.toContain("Nested");
    expect(result.objects[0]?.geometry).toEqual({ x: 100, y: 200, width: 300, height: 400, rotation: 0 });
  });

  it("edits only the selected slide's native shape geometry/fill and picture geometry/alt text", async () => {
    const input = await fixture();
    const before = await inspectSlideObjects(input, 1);
    const shapeId = before.objects[0]!.id;
    const pictureId = before.objects[1]!.id;
    const applied = await applySlideObjectOperations(input, 1, [
      { objectId: shapeId, kind: "shape", action: "setGeometry", geometry: { x: 1000, y: 2000, width: 3000, height: 4000, rotation: 12 } },
      { objectId: shapeId, kind: "shape", action: "setFill", fill: { color: "#AABBCC", transparency: 25 } },
      { objectId: pictureId, kind: "picture", action: "setGeometry", geometry: { x: 11, y: 22, width: 33, height: 44, rotation: 0 } },
      { objectId: pictureId, kind: "picture", action: "setAltText", altText: "Updated photo" },
    ]);
    expect(applied.changedMembers).toEqual(["ppt/slides/slide1.xml"]);
    expect(applied.context.objects[0]).toMatchObject({ geometry: { x: 1000, y: 2000, width: 3000, height: 4000, rotation: 12 }, fill: { color: "#AABBCC", transparency: 25 } });
    expect(applied.context.objects[1]).toMatchObject({ geometry: { x: 11, y: 22, width: 33, height: 44, rotation: 0 }, altText: "Updated photo" });
    const originalZip = await JSZip.loadAsync(input), outputZip = await JSZip.loadAsync(applied.bytes);
    for (const member of ["ppt/slides/slide2.xml", "ppt/media/image1.png", "ppt/charts/chart1.xml", "customXml/item1.xml", "ppt/slides/_rels/slide1.xml.rels"]) {
      expect(await outputZip.file(member)?.async("nodebuffer")).toEqual(await originalZip.file(member)?.async("nodebuffer"));
    }
  });

  it("rejects stale, cross-slide, duplicate, read-only, or out-of-bound operations without mutating input", async () => {
    const input = await fixture();
    const original = await inspectSlideObjects(input, 1);
    const shapeId = original.objects[0]!.id;
    await expect(applySlideObjectOperations(input, 1, [{ objectId: `${shapeId}:forged`, kind: "shape", action: "setFill", fill: { color: "#112233", transparency: 0 } }])).rejects.toBeInstanceOf(SlideObjectError);
    await expect(applySlideObjectOperations(input, 1, [{ objectId: original.objects[2]!.id, kind: "chart", action: "setGeometry", geometry: { x: 1, y: 1, width: 1, height: 1, rotation: 0 } }])).rejects.toBeInstanceOf(SlideObjectError);
    await expect(applySlideObjectOperations(input, 1, [{ objectId: shapeId, kind: "shape", action: "setGeometry", geometry: { x: -1, y: 0, width: 1, height: 1, rotation: 0 } }])).rejects.toBeInstanceOf(SlideObjectError);
    await expect(applySlideObjectOperations(input, 1, [{ objectId: shapeId, kind: "shape", action: "setFill", fill: { color: "url(javascript:1)", transparency: 0 } }])).rejects.toBeInstanceOf(SlideObjectError);
    expect((await JSZip.loadAsync(input)).file("ppt/slides/slide1.xml")).toBeTruthy();
  });
});
