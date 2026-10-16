import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { applyUploadedSlideNotes, inspectUploadedSlideNotesSet } from "./uploaded-slide-notes";

const P = "http://schemas.openxmlformats.org/presentationml/2006/main";
const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PR = "http://schemas.openxmlformats.org/package/2006/relationships";
const notesXml = (text: string) => `<p:notes xmlns:p="${P}" xmlns:a="${A}"><p:cSld><p:spTree><p:sp><p:nvSpPr><p:cNvPr id="2" name="Notes"/><p:cNvSpPr/><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:pPr/><a:r><a:rPr/><a:t>${text}</a:t></a:r><a:endParaRPr/></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:notes>`;
async function fixture(shared = false): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/></Types>`);
  zip.file("ppt/presentation.xml", `<p:presentation xmlns:p="${P}" xmlns:r="${R}"><p:sldIdLst><p:sldId id="256" r:id="rId1"/><p:sldId id="257" r:id="rId2"/></p:sldIdLst></p:presentation>`);
  zip.file("ppt/_rels/presentation.xml.rels", `<Relationships xmlns="${PR}"><Relationship Id="rId1" Type="${R}/slide" Target="slides/slide1.xml"/><Relationship Id="rId2" Type="${R}/slide" Target="slides/slide2.xml"/></Relationships>`);
  for (const n of [1, 2]) {
    zip.file(`ppt/slides/slide${n}.xml`, `<p:sld xmlns:p="${P}"></p:sld>`);
    const target = n === 2 && shared ? "notesSlide1.xml" : `notesSlide${n}.xml`;
    zip.file(`ppt/slides/_rels/slide${n}.xml.rels`, `<Relationships xmlns="${PR}"><Relationship Id="notes" Type="${R}/notesSlide" Target="../notesSlides/${target}"/></Relationships>`);
    zip.file(`ppt/notesSlides/notesSlide${n}.xml`, notesXml(`note ${n}`));
    zip.file(`ppt/notesSlides/_rels/notesSlide${n}.xml.rels`, `<Relationships xmlns="${PR}"><Relationship Id="slide" Type="${R}/slide" Target="../slides/slide${n}.xml"/></Relationships>`);
  }
  zip.file("ppt/theme/theme1.xml", "keep theme");
  return Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
}
async function member(bytes: Buffer, name: string): Promise<Buffer> { return (await JSZip.loadAsync(bytes)).file(name)!.async("nodebuffer"); }

describe("uploaded selected-slide speaker notes", () => {
  it("edits only the selected notes body and preserves other slides and note relationships", async () => {
    const original = await fixture(); const notes = await inspectUploadedSlideNotesSet(original, [{ id: "ppt/slides/slide1.xml" }, { id: "ppt/slides/slide2.xml" }]);
    expect(notes.map((item) => item?.text)).toEqual(["note 1", "note 2"]);
    expect(notes.every((item) => item?.editable)).toBe(true);
    const changed = await applyUploadedSlideNotes(original, 1, { id: notes[0]!.id, text: "updated note\nsecond paragraph" });
    expect(changed.changedMembers).toEqual(["ppt/notesSlides/notesSlide1.xml"]);
    expect((await member(changed.bytes, "ppt/notesSlides/notesSlide1.xml")).toString("utf8")).toContain("second paragraph");
    for (const name of ["ppt/notesSlides/notesSlide2.xml", "ppt/notesSlides/_rels/notesSlide1.xml.rels", "ppt/slides/_rels/slide1.xml.rels", "ppt/slides/slide2.xml", "ppt/theme/theme1.xml"]) {
      expect(await member(changed.bytes, name)).toEqual(await member(original, name));
    }
  });

  it("represents a slide without notes as missing and refuses shared notes for editing", async () => {
    const noNotesZip = await JSZip.loadAsync(await fixture()); noNotesZip.remove("ppt/slides/_rels/slide2.xml.rels");
    const noNotes = await inspectUploadedSlideNotesSet(Buffer.from(await noNotesZip.generateAsync({ type: "nodebuffer" })), [{ id: "ppt/slides/slide1.xml" }, { id: "ppt/slides/slide2.xml" }]);
    expect(noNotes[1]).toBeNull();
    const shared = await fixture(true); const inventory = await inspectUploadedSlideNotesSet(shared, [{ id: "ppt/slides/slide1.xml" }, { id: "ppt/slides/slide2.xml" }]);
    expect(inventory[0]).toMatchObject({ editable: false, reason: expect.stringContaining("shared") });
    await expect(applyUploadedSlideNotes(shared, 1, { id: inventory[0]!.id, text: "unsafe" })).rejects.toMatchObject({ code: "shared_notes" });
  });

  it("refuses stale or forged note identities and leaves the source package unchanged", async () => {
    const original = await fixture(); const notes = await inspectUploadedSlideNotesSet(original, [{ id: "ppt/slides/slide1.xml" }, { id: "ppt/slides/slide2.xml" }]);
    await expect(applyUploadedSlideNotes(original, 1, { id: "forged", text: "changed" })).rejects.toMatchObject({ code: "invalid_notes_edit" });
    await expect(applyUploadedSlideNotes(original, 1, { id: notes[0]!.id, text: "x".repeat(1001) })).rejects.toMatchObject({ code: "invalid_notes_edit" });
    expect(await member(original, "ppt/notesSlides/notesSlide1.xml")).toEqual(Buffer.from(await member(original, "ppt/notesSlides/notesSlide1.xml")));
  });
});
