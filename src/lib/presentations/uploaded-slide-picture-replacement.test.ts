import JSZip from "jszip";
import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { inspectSlideObjects } from "./uploaded-slide-objects";
import { replaceUploadedSlidePicture } from "./uploaded-slide-picture-replacement";

const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function pngChunk(type: string, data: Buffer): Buffer {
  const header = Buffer.alloc(4); header.writeUInt32BE(data.length);
  const kind = Buffer.from(type, "ascii"); const checksum = Buffer.alloc(4); checksum.writeUInt32BE(crc32(Buffer.concat([kind, data])));
  return Buffer.concat([header, kind, data, checksum]);
}
const image = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  pngChunk("IHDR", Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0])),
  pngChunk("IDAT", deflateSync(Buffer.from([0, 255, 0, 0, 255]))),
  pngChunk("IEND", Buffer.alloc(0)),
]);
async function fixture(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Default Extension="png" ContentType="image/png"/></Types>`);
  zip.file("ppt/presentation.xml", `<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="${R}"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst></p:presentation>`);
  zip.file("ppt/_rels/presentation.xml.rels", `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/slide" Target="slides/slide1.xml"/></Relationships>`);
  zip.file("ppt/slides/slide1.xml", `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="${R}"><p:cSld><p:spTree><p:pic><p:nvPicPr><p:cNvPr id="3" name="Photo"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rIdImage"/></p:blipFill><p:spPr><a:xfrm><a:off x="1" y="2"/><a:ext cx="3" cy="4"/></a:xfrm></p:spPr></p:pic></p:spTree></p:cSld></p:sld>`);
  zip.file("ppt/slides/_rels/slide1.xml.rels", `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdImage" Type="${R}/image" Target="../media/old.png"/></Relationships>`);
  zip.file("ppt/media/old.png", Buffer.from([1, 2, 3])); zip.file("customXml/keep.xml", "unchanged");
  return Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
}

describe("uploaded slide picture replacement", () => {
  it("replaces only the selected picture and required package members", async () => {
    const original = await fixture();
    const picture = (await inspectSlideObjects(original, 1)).objects[0]!;
    const result = await replaceUploadedSlidePicture(original, 1, picture.id, "image/png", image.toString("base64"));
    expect(result.changedMembers).toHaveLength(4);
    const before = await JSZip.loadAsync(original), after = await JSZip.loadAsync(result.bytes);
    const names = Object.keys(before.files).filter((name) => !before.files[name]!.dir).sort();
    expect(Object.keys(after.files).filter((name) => !after.files[name]!.dir).sort()).toEqual([...names, result.changedMembers.find((name) => name.startsWith("ppt/media/slide-editor-"))!].sort());
    for (const name of names.filter((item) => !result.changedMembers.includes(item))) expect(await after.file(name)?.async("nodebuffer")).toEqual(await before.file(name)?.async("nodebuffer"));
    expect((await after.file("ppt/slides/slide1.xml")!.async("string"))).toContain("rIdSlideEditor");
    expect((await after.file("ppt/slides/_rels/slide1.xml.rels")!.async("string"))).toContain("slide-editor-");
    expect(await after.file(result.changedMembers.find((name) => name.startsWith("ppt/media/slide-editor-"))!)?.async("nodebuffer")).toEqual(image);
  });

  it("rejects non-image bytes, external targets and an object from another package", async () => {
    const original = await fixture(); const picture = (await inspectSlideObjects(original, 1)).objects[0]!;
    await expect(replaceUploadedSlidePicture(original, 1, picture.id, "image/png", Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0]).toString("base64"))).rejects.toMatchObject({ code: "invalid_image" });
    await expect(replaceUploadedSlidePicture(original, 1, picture.id, "image/jpeg", Buffer.from([255, 216, 255, 224, 0, 16, 74]).toString("base64"))).rejects.toMatchObject({ code: "invalid_image" });
    await expect(replaceUploadedSlidePicture(original, 1, "forged", "image/png", image.toString("base64"))).rejects.toMatchObject({ code: "invalid_picture" });
    const zip = await JSZip.loadAsync(original); const rel = await zip.file("ppt/slides/_rels/slide1.xml.rels")!.async("string");
    zip.file("ppt/slides/_rels/slide1.xml.rels", rel.replace("../media/old.png", "https://example.com/x.png"));
    await expect(replaceUploadedSlidePicture(Buffer.from(await zip.generateAsync({ type: "nodebuffer" })), 1, (await inspectSlideObjects(original, 1)).objects[0]!.id, "image/png", image.toString("base64"))).rejects.toMatchObject({ code: "invalid_package" });
  });
});
