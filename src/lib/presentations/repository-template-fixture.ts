import JSZip from "jszip";
import type { SnapshotInput } from "./repository-snapshot";
export async function originalFixture(marker = "asset"): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", '<Types><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/></Types>');
  zip.file("ppt/presentation.xml", '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="r1"/></p:sldIdLst></p:presentation>');
  zip.file("ppt/_rels/presentation.xml.rels", '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>');
  zip.file("ppt/slides/slide1.xml", '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Template title</a:t></a:r></a:p><a:p><a:r><a:t>Template body</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>');
  zip.file("ppt/notesSlides/notesSlide1.xml", "Original private template notes");
  zip.file("ppt/slideLayouts/slideLayout1.xml", "Original layout");
  zip.file("ppt/theme/theme1.xml", "Original theme");
  zip.file("ppt/media/image1.png", marker);
  return zip.generateAsync({ type: "nodebuffer" });
}
export const templateInput: SnapshotInput = { deck: { presentationTitle: "Filled deck", slides: [{ title: "Filled title", bullets: ["Filled bullet"], notes: "Generated notes retained in JSON", code: "print(1)" }] }, context: { text: "private context", sources: [], objectives: [] }, includeContext: false, templateSelected: true, templateChoice: { kind: "raw", sourceFileId: "11111111-1111-1111-1111-111111111111", name: "Original" } };
