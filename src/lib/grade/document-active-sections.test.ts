import { describe, expect, it } from "vitest";
import { activeDocxHeaderFooterPaths } from "./document-active-sections";
const word = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const office = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const doc = `<w:document xmlns:w="${word}" xmlns:r="${office}"><w:body><w:sectPr><w:headerReference r:id="one"/></w:sectPr></w:body></w:document>`;
const rels = (inner: string) => `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${inner}</Relationships>`;
const rel = (extra = "") => `<Relationship Id="one" Type="${office}/header" Target="header1.xml" ${extra}/>`;
describe("active DOCX section relationships", () => {
  it("resolves a section reference and ignores unrelated relationships", () => {
    expect(activeDocxHeaderFooterPaths(doc, rels(rel() + `<Relationship Id="orphan" Type="${office}/header" Target="header2.xml"/>`))).toEqual(["word/header1.xml"]);
  });
  it.each([
    ["external", rel(`TargetMode="External"`)],
    ["wrong kind", `<Relationship Id="one" Type="${office}/footer" Target="header1.xml"/>`],
    ["duplicate", rel() + rel()],
    ["missing", ""],
    ["traversal", `<Relationship Id="one" Type="${office}/header" Target="../../header1.xml"/>`],
  ])("fails closed for %s relationships", (_label, value) => {
    expect(() => activeDocxHeaderFooterPaths(doc, rels(value))).toThrow();
  });
  it("accepts strict OOXML section namespaces and relationship types", () => {
    const strictWord = "http://purl.oclc.org/ooxml/wordprocessingml/main";
    const strictOffice = "http://purl.oclc.org/ooxml/officeDocument/relationships";
    expect(activeDocxHeaderFooterPaths(doc.replaceAll(word, strictWord).replaceAll(office, strictOffice), rels(rel().replaceAll(office, strictOffice)))).toEqual(["word/header1.xml"]);
  });  it("does not treat deleted section history as active", () => {
    const history = doc.replace("<w:sectPr>", "<w:sectPrChange><w:sectPr>").replace("</w:sectPr>", "</w:sectPr></w:sectPrChange>");
    expect(activeDocxHeaderFooterPaths(history, null)).toEqual([]);
  });
});
