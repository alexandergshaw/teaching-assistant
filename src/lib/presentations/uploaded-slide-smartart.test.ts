import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { applySlideObjectOperations, inspectSlideObjects } from "./uploaded-slide-objects";

const P = "http://schemas.openxmlformats.org/presentationml/2006/main";
const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const REL = "http://schemas.openxmlformats.org/package/2006/relationships";
const DGM = "http://schemas.openxmlformats.org/drawingml/2006/diagram";
const DSP = "http://schemas.microsoft.com/office/drawing/2008/diagram";

function paragraph(text: string) { return `<a:p><a:r><a:rPr lang="en-US"/><a:t>${text}</a:t></a:r><a:endParaRPr lang="en-US"/></a:p>`; }
function dataXml(options: { duplicate?: boolean; unsupported?: boolean; mismatch?: boolean; cycle?: boolean; hostileExtension?: boolean } = {}) {
  const points = [
    `<dgm:pt modelId="doc" type="doc"><dgm:t>${paragraph("Document")}</dgm:t></dgm:pt>`,
    `<dgm:pt modelId="parent" type="node"><dgm:t>${paragraph("Parent")}</dgm:t></dgm:pt>`,
    `<dgm:pt modelId="leaf1" type="node"><dgm:t>${paragraph("First leaf")}</dgm:t></dgm:pt>`,
    `<dgm:pt modelId="leaf2" type="${options.unsupported ? "asst" : "node"}"><dgm:t>${paragraph("Second leaf")}</dgm:t></dgm:pt>`,
    ...(options.duplicate ? [`<dgm:pt modelId="leaf1" type="node"><dgm:t>${paragraph("Duplicate")}</dgm:t></dgm:pt>`] : []),
  ];
  const connections = `<dgm:cxn type="parOf" srcId="doc" destId="parent"/><dgm:cxn type="parOf" srcId="parent" destId="leaf1"/><dgm:cxn type="parOf" srcId="parent" destId="leaf2"/>${options.cycle ? `<dgm:cxn type="parOf" srcId="leaf1" destId="parent"/>` : ""}`;
  return `<dgm:dataModel xmlns:dgm="${DGM}" xmlns:a="${A}" xmlns:dsp="${DSP}" xmlns:evil="urn:hostile"><dgm:ptLst>${points.join("")}</dgm:ptLst><dgm:cxnLst>${connections}</dgm:cxnLst><dgm:extLst><a:ext uri="http://schemas.microsoft.com/office/drawing/2008/diagram"><dsp:dataModelExt relId="drawRel" minVer="http://schemas.openxmlformats.org/drawingml/2006/diagram"/>${options.hostileExtension ? "<evil:payload>unrecognized behavior</evil:payload>" : ""}</a:ext></dgm:extLst></dgm:dataModel>`;
}
function drawingXml(options: { mismatch?: boolean } = {}) {
  const models = ["doc", "parent", "leaf1", options.mismatch ? "other-leaf" : "leaf2"];
  return `<dsp:drawing xmlns:dsp="${DSP}" xmlns:a="${A}"><dsp:spTree>${models.map(modelId => `<dsp:sp modelId="${modelId}"><dsp:nvSpPr/><dsp:spPr><a:xfrm><a:off x="11" y="22"/><a:ext cx="33" cy="44"/></a:xfrm></dsp:spPr><dsp:txBody><a:bodyPr/><a:lstStyle/>${paragraph(modelId === "doc" ? "Document" : modelId === "parent" ? "Parent" : modelId === "leaf1" ? "First leaf" : "Second leaf")}</dsp:txBody></dsp:sp>`).join("")}</dsp:spTree></dsp:drawing>`;
}
async function fixture(options: { duplicate?: boolean; unsupported?: boolean; mismatch?: boolean; cycle?: boolean; external?: boolean; sharedData?: boolean; sharedDrawing?: boolean; malformedMode?: boolean; hostileExtension?: boolean } = {}) {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>`);
  zip.file("ppt/presentation.xml", `<p:presentation xmlns:p="${P}" xmlns:r="${R}"><p:sldIdLst><p:sldId id="256" r:id="slideRel"/></p:sldIdLst></p:presentation>`);
  zip.file("ppt/_rels/presentation.xml.rels", `<Relationships xmlns="${REL}"><Relationship Id="slideRel" Type="${R}/slide" Target="slides/slide1.xml"/></Relationships>`);
  zip.file("ppt/slides/slide1.xml", `<p:sld xmlns:p="${P}" xmlns:a="${A}" xmlns:r="${R}" xmlns:dgm="${DGM}"><p:cSld><p:spTree><p:nvGrpSpPr/><p:grpSpPr/><p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="5" name="Hierarchy"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><a:xfrm><a:off x="5" y="6"/><a:ext cx="7" cy="8"/></a:xfrm><a:graphic><a:graphicData><dgm:relIds r:dm="diagramRel"/></a:graphicData></a:graphic></p:graphicFrame></p:spTree></p:cSld></p:sld>`);
  zip.file("ppt/slides/_rels/slide1.xml.rels", `<Relationships xmlns="${REL}"><Relationship Id="diagramRel" Type="${R}/diagramData" Target="../diagrams/data1.xml"${options.malformedMode ? ` TargetMode="maybe"` : ""}/>${options.sharedData ? `<Relationship Id="secondDiagramRel" Type="${R}/diagramData" Target="../diagrams/data1.xml"/>` : ""}</Relationships>`);
  zip.file("ppt/diagrams/data1.xml", dataXml(options));
  zip.file("ppt/diagrams/_rels/data1.xml.rels", `<Relationships xmlns="${REL}"><Relationship Id="drawRel" Type="http://schemas.microsoft.com/office/2007/relationships/diagramDrawing" Target="drawing1.xml"${options.external ? ` TargetMode="External"` : ""}/>${options.sharedDrawing ? `<Relationship Id="anotherDrawRel" Type="http://schemas.microsoft.com/office/2007/relationships/diagramDrawing" Target="drawing1.xml"/>` : ""}</Relationships>`);
  zip.file("ppt/diagrams/drawing1.xml", drawingXml(options));
  zip.file("ppt/slides/slide2.xml", "other slide must remain byte-identical");
  zip.file("customXml/item1.xml", "untouched companion sentinel");
  return Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
}

describe("uploaded slide SmartArt leaf text", () => {
  it("edits the selected leaf in data and cached drawing and preserves every other package member", async () => {
    const input = await fixture();
    const before = await inspectSlideObjects(input, 1);
    const smartart = before.objects[0]!;
    expect(smartart).toMatchObject({ kind: "smartart", editable: true, smartArtNodes: [{ id: "leaf1", text: "First leaf" }, { id: "leaf2", text: "Second leaf" }] });
    const edited = await applySlideObjectOperations(input, 1, [{ objectId: smartart.id, kind: "smartart", action: "setNodeText", nodeId: "leaf1", text: "Updated leaf" }]);
    expect(edited.changedMembers.sort()).toEqual(["ppt/diagrams/data1.xml", "ppt/diagrams/drawing1.xml"]);
    expect(edited.context.objects[0]?.smartArtNodes).toEqual([{ id: "leaf1", text: "Updated leaf" }, { id: "leaf2", text: "Second leaf" }]);
    const original = await JSZip.loadAsync(input), output = await JSZip.loadAsync(edited.bytes);
    for (const member of ["ppt/presentation.xml", "ppt/_rels/presentation.xml.rels", "ppt/slides/slide1.xml", "ppt/slides/_rels/slide1.xml.rels", "ppt/slides/slide2.xml", "customXml/item1.xml"]) {
      expect(await output.file(member)!.async("nodebuffer"), member).toEqual(await original.file(member)!.async("nodebuffer"));
    }
    expect(await output.file("ppt/diagrams/data1.xml")!.async("string")).toContain("Updated leaf");
    expect(await output.file("ppt/diagrams/drawing1.xml")!.async("string")).toContain("Updated leaf");
    expect(await output.file("ppt/diagrams/drawing1.xml")!.async("string")).toContain('x="11" y="22"');
  });

  it("edits a different leaf without changing the first leaf in either SmartArt representation", async () => {
    const input = await fixture();
    const object = (await inspectSlideObjects(input, 1)).objects[0]!;
    const edited = await applySlideObjectOperations(input, 1, [{ objectId: object.id, kind: "smartart", action: "setNodeText", nodeId: "leaf2", text: "Second leaf changed" }]);
    const output = await JSZip.loadAsync(edited.bytes);
    const data = await output.file("ppt/diagrams/data1.xml")!.async("string");
    const drawing = await output.file("ppt/diagrams/drawing1.xml")!.async("string");
    expect(data).toContain("Second leaf changed"); expect(drawing).toContain("Second leaf changed");
    expect(data).toContain("First leaf"); expect(drawing).toContain("First leaf");
  });

  it.each([
    ["duplicate model IDs", { duplicate: true }],
    ["unsupported point types", { unsupported: true }],
    ["data/drawing model mismatch", { mismatch: true }],
    ["cyclic hierarchies", { cycle: true }],
    ["external drawing relationships", { external: true }],
    ["shared diagram data parts", { sharedData: true }],
    ["shared cached drawing parts", { sharedDrawing: true }],
    ["invalid relationship mode", { malformedMode: true }],
    ["unknown extension payload", { hostileExtension: true }],
  ] as const)("keeps %s read-only", async (_label, options) => {
    expect((await inspectSlideObjects(await fixture(options), 1)).objects[0]).toMatchObject({ kind: "smartart", editable: false });
  });

  it("rejects parent-node, unknown-node, and duplicate-node edits transactionally", async () => {
    const input = await fixture();
    const object = (await inspectSlideObjects(input, 1)).objects[0]!;
    const operation = (nodeId: string, text = "New text") => ({ objectId: object.id, kind: "smartart" as const, action: "setNodeText" as const, nodeId, text });
    await expect(applySlideObjectOperations(input, 1, [operation("parent")])).rejects.toThrow();
    await expect(applySlideObjectOperations(input, 1, [operation("unknown")])).rejects.toThrow();
    await expect(applySlideObjectOperations(input, 1, [operation("leaf1"), operation("leaf1", "Twice")])).rejects.toThrow();
    const untouched = await JSZip.loadAsync(input);
    expect(await untouched.file("ppt/diagrams/data1.xml")!.async("string")).toContain("First leaf");
  });
});
