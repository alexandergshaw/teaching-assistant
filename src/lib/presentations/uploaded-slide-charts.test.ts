import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { applySlideObjectOperations, inspectSlideObjects } from "./uploaded-slide-objects";

const P = "http://schemas.openxmlformats.org/presentationml/2006/main";
const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const C = "http://schemas.openxmlformats.org/drawingml/2006/chart";
const REL = "http://schemas.openxmlformats.org/package/2006/relationships";
const S = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";

function chartXml(categories = ["Alpha", "Beta"], values = [2, 3]) {
  const points = (items: Array<string | number>) => `<c:ptCount val="${items.length}"/>${items.map((item, index) => `<c:pt idx="${index}"><c:v>${item}</c:v></c:pt>`).join("")}`;
  return `<c:chartSpace xmlns:c="${C}" xmlns:r="${R}"><c:chart><c:plotArea><c:layout/><c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:strRef><c:f>'Sheet1'!$B$1</c:f><c:strCache>${points(["Enrollment"])}</c:strCache></c:strRef></c:tx><c:cat><c:strRef><c:f>'Sheet1'!$A$2:$A$3</c:f><c:strCache>${points(categories)}</c:strCache></c:strRef></c:cat><c:val><c:numRef><c:f>'Sheet1'!$B$2:$B$3</c:f><c:numCache><c:formatCode>General</c:formatCode>${points(values)}</c:numCache></c:numRef></c:val></c:ser><c:axId val="10"/><c:axId val="20"/></c:barChart><c:catAx><c:axId val="10"/></c:catAx><c:valAx><c:axId val="20"/></c:valAx></c:plotArea></c:chart><c:externalData r:id="rId1"/></c:chartSpace>`;
}

function workbookXml() {
  return `<workbook xmlns="${S}" xmlns:r="${R}"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`;
}
function sheetXml(categories = ["Alpha", "Beta"], values = [2, 3]) {
  const inline = (ref: string, text: string) => `<c r="${ref}" t="inlineStr"><is><t>${text}</t></is></c>`;
  const numeric = (ref: string, value: number) => `<c r="${ref}"><v>${value}</v></c>`;
  return `<worksheet xmlns="${S}"><sheetData><row r="1">${inline("B1", "Enrollment")}</row>${categories.map((value, index) => `<row r="${index + 2}">${inline(`A${index + 2}`, value)}${numeric(`B${index + 2}`, values[index]!)}</row>`).join("")}</sheetData></worksheet>`;
}

async function fixture(options: { formula?: string; staleCache?: boolean; extraSeries?: boolean; sharedStrings?: boolean } = {}) {
  const zip = new JSZip();
  const workbook = new JSZip();
  workbook.file("xl/workbook.xml", workbookXml());
  workbook.file("xl/_rels/workbook.xml.rels", `<Relationships xmlns="${REL}"><Relationship Id="rId1" Type="${R}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`);
  workbook.file("xl/worksheets/sheet1.xml", sheetXml());
  if (options.sharedStrings) workbook.file("xl/sharedStrings.xml", `<sst xmlns="${S}"/>`);
  const workbookBytes = await workbook.generateAsync({ type: "nodebuffer" });
  zip.file("[Content_Types].xml", `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>`);
  zip.file("ppt/presentation.xml", `<p:presentation xmlns:p="${P}" xmlns:r="${R}"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst></p:presentation>`);
  zip.file("ppt/_rels/presentation.xml.rels", `<Relationships xmlns="${REL}"><Relationship Id="rId1" Type="${R}/slide" Target="slides/slide1.xml"/></Relationships>`);
  zip.file("ppt/slides/slide1.xml", `<p:sld xmlns:p="${P}" xmlns:a="${A}" xmlns:r="${R}" xmlns:c="${C}"><p:cSld><p:spTree><p:nvGrpSpPr/><p:grpSpPr/><p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="4" name="Enrollment chart"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><a:xfrm><a:off x="0" y="0"/><a:ext cx="100" cy="100"/></a:xfrm><a:graphic><a:graphicData><c:chart r:id="chartRel"/></a:graphicData></a:graphic></p:graphicFrame></p:spTree></p:cSld></p:sld>`);
  zip.file("ppt/slides/_rels/slide1.xml.rels", `<Relationships xmlns="${REL}"><Relationship Id="chartRel" Type="${R}/chart" Target="../charts/chart1.xml"/></Relationships>`);
  const chart = chartXml(options.staleCache ? ["Wrong", "Beta"] : undefined);
  zip.file("ppt/charts/chart1.xml", options.extraSeries ? chart.replace("<c:axId val=\"10\"/>", `<c:ser><c:idx val="1"/><c:order val="1"/></c:ser><c:axId val="10"/>`) : options.formula ? chart.replace("'Sheet1'!$A$2:$A$3", options.formula) : chart);
  zip.file("ppt/charts/_rels/chart1.xml.rels", `<Relationships xmlns="${REL}"><Relationship Id="rId1" Type="${R}/package" Target="../embeddings/book1.xlsx"/></Relationships>`);
  zip.file("ppt/embeddings/book1.xlsx", workbookBytes);
  zip.file("ppt/slides/slide2.xml", "unmodified-slide");
  return Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
}

describe("uploaded slide supported chart data", () => {
  it("edits chart labels and values in both cache and workbook while preserving other members", async () => {
    const input = await fixture();
    const object = (await inspectSlideObjects(input, 1)).objects[0]!;
    expect(object).toMatchObject({ kind: "chart", editable: true, chartData: { seriesName: "Enrollment", categories: ["Alpha", "Beta"], values: [2, 3] } });
    const applied = await applySlideObjectOperations(input, 1, [{ objectId: object.id, kind: "chart", action: "setData", data: { seriesName: "Student Count", categories: ["Freshman", "Senior"], values: [12, 18] } }]);
    expect(applied.changedMembers.sort()).toEqual(["ppt/charts/chart1.xml", "ppt/embeddings/book1.xlsx"]);
    expect(applied.context.objects[0]?.chartData).toEqual({ seriesName: "Student Count", categories: ["Freshman", "Senior"], values: [12, 18] });
    const original = await JSZip.loadAsync(input), output = await JSZip.loadAsync(applied.bytes);
    expect(await output.file("ppt/slides/slide1.xml")!.async("nodebuffer")).toEqual(await original.file("ppt/slides/slide1.xml")!.async("nodebuffer"));
    expect(await output.file("ppt/slides/slide2.xml")!.async("nodebuffer")).toEqual(await original.file("ppt/slides/slide2.xml")!.async("nodebuffer"));
    const chart = await output.file("ppt/charts/chart1.xml")!.async("string");
    const workbook = await JSZip.loadAsync(await output.file("ppt/embeddings/book1.xlsx")!.async("nodebuffer"));
    expect(chart).toContain("Freshman"); expect(chart).toContain("18"); expect(chart).toContain("'Sheet1'!$A$2:$A$3");
    expect(await workbook.file("xl/worksheets/sheet1.xml")!.async("string")).toContain("Student Count");
    expect(await workbook.file("xl/worksheets/sheet1.xml")!.async("string")).toContain("Freshman");
  });

  it.each([
    ["wrong formula range", { formula: "'Sheet1'!$A$2:$A$4" }],
    ["stale cache", { staleCache: true }],
    ["extra series", { extraSeries: true }],
    ["shared strings", { sharedStrings: true }],
  ])("keeps %s read-only", async (_name, options) => {
    const objects = (await inspectSlideObjects(await fixture(options), 1)).objects;
    expect(objects[0]).toMatchObject({ kind: "chart", editable: false });
    expect(objects[0]?.reason).toContain("read-only");
  });

  it("rejects changes that alter category count or contain nonnumeric values", async () => {
    const input = await fixture(); const object = (await inspectSlideObjects(input, 1)).objects[0]!;
    await expect(applySlideObjectOperations(input, 1, [{ objectId: object.id, kind: "chart", action: "setData", data: { seriesName: "x", categories: ["only one"], values: [4] } }])).rejects.toThrow();
  });
});
