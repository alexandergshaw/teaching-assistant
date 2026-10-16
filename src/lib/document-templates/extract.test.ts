import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { extractDocument, decodeDocumentBase64, outputBase64 } from "./extract";
import { parseOfficeParagraphs } from "@/lib/office-edit";
import { UPLOAD_WIRE_BUDGET_BYTES } from "@/lib/upload-budget";

async function word(main = '<w:p><w:r><w:t>Course Alpha</w:t></w:r></w:p>') {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", '<Types><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file("word/document.xml", `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${main}</w:body></w:document>`);
  return zip.generateAsync({ type: "nodebuffer" });
}
function pdf(text: string) {
  const stream = text ? `BT /F1 12 Tf 50 750 Td (${text}) Tj ET` : "";
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let out = "%PDF-1.4\n"; const offsets = [0];
  objects.forEach((obj, i) => { offsets.push(Buffer.byteLength(out)); out += `${i + 1} 0 obj\n${obj}\nendobj\n`; });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out).toString("base64");
}
describe("document source boundary", () => {
  it("extracts actual Word paragraphs and keeps original bytes and hash", async () => {
    const bytes = await word(); const result = await extractDocument({ fileName: "a.docx", base64: bytes.toString("base64") });
    expect(result.source.equals(bytes)).toBe(true); expect(result.paragraphs.map((p) => p.text)).toEqual(["Course Alpha"]); expect(result.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
  });
  it("uses the installed PDF parser and produces inspectable editable Word text", async () => {
    const result = await extractDocument({ fileName: "a.pdf", base64: pdf("Course Alpha") });
    expect(result.sourceKind).toBe("pdf"); expect((await parseOfficeParagraphs("docx", result.docx)).map((p) => p.text).join("\n")).toContain("Course Alpha");
  }, 30000);
  it("refuses a real no-text PDF", async () => { await expect(extractDocument({ fileName: "scan.pdf", base64: pdf("") })).rejects.toThrow(/No readable text/); }, 30000);
  it("rejects misleading signatures, corrupt ZIP/PDF, unsupported fields, macros and excessive text", async () => {
    await expect(extractDocument({ fileName: "bad.pdf", base64: Buffer.from("not a pdf").toString("base64") })).rejects.toThrow(/not a readable PDF/);
    await expect(extractDocument({ fileName: "bad.docx", base64: Buffer.from("PK\x03\x04broken").toString("base64") })).rejects.toThrow(/damaged/);
    await expect(extractDocument({ fileName: "bad.pdf", base64: Buffer.from("%PDF-broken").toString("base64") })).rejects.toThrow(/unreadable/);
    await expect(extractDocument({ fileName: "bad.docx", base64: (await word('<w:sdt><w:p><w:r><w:t>Alpha</w:t></w:r></w:p></w:sdt>')).toString("base64") })).rejects.toThrow(/unsupported/);
    const z = await JSZip.loadAsync(await word()); z.file("word/vbaProject.bin", "macro");
    await expect(extractDocument({ fileName: "macro.docx", base64: await z.generateAsync({ type: "base64" }) })).rejects.toThrow(/Macro/);
    await expect(extractDocument({ fileName: "big.docx", base64: (await word(`<w:p><w:r><w:t>${"x".repeat(24001)}</w:t></w:r></w:p>`)).toString("base64") })).rejects.toThrow(/smaller/);
  });
  it("rejects noncanonical base64, unsupported extensions and wire excess before decoding", async () => {
    for (const b64 of ["YWJj\n", "YQ=", "YR==", "----"]) expect(() => decodeDocumentBase64(b64)).toThrow();
    expect(() => decodeDocumentBase64("A".repeat(UPLOAD_WIRE_BUDGET_BYTES + 4))).toThrow(/smaller/);
    expect(() => outputBase64(Buffer.alloc(UPLOAD_WIRE_BUDGET_BYTES))).toThrow(/too large/);
    await expect(extractDocument({ fileName: "a.txt", base64: Buffer.from("hello").toString("base64") })).rejects.toThrow(/DOCX|docx/);
  });
});

describe("round-two Word XML boundary", () => {
  it.each([
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Course Alpha</w:t></w:r></w:p>',
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Course Alpha</w:r></w:t></w:p></w:body></w:document>',
    '<w:document xmlns:w="urn:wrong"><w:body><w:p><w:r><w:t>Course Alpha</w:t></w:r></w:p></w:body></w:document>',
    '<!DOCTYPE w:document SYSTEM "https://example.invalid/external.dtd"><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Course Alpha</w:t></w:r></w:p></w:body></w:document>',
  ])("refuses well-packaged but malformed/unsupported Word XML %#", async (xml) => {
    const zip = await JSZip.loadAsync(await word()); zip.file("word/document.xml", xml);
    await expect(extractDocument({ fileName: "broken.docx", base64: await zip.generateAsync({ type: "base64" }) })).rejects.toMatchObject({ code: "invalid_file" });
  });
});

describe("strict source XML decoding", () => {
  it("refuses invalid UTF-8 and malformed ancillary XML with fixed input errors", async () => {
    const invalidBytes = await JSZip.loadAsync(await word());
    const main = await invalidBytes.file("word/document.xml")!.async("nodebuffer");
    invalidBytes.file("word/document.xml", Buffer.concat([main.subarray(0, main.length - 13), Buffer.from([255]), main.subarray(main.length - 13)]));
    await expect(extractDocument({ fileName: "invalid.docx", base64: await invalidBytes.generateAsync({ type: "base64" }) })).rejects.toMatchObject({ code: "invalid_file" });
    const invalidMember = await JSZip.loadAsync(await word()); invalidMember.file("word/styles.xml", "<styles><style></styles>");
    await expect(extractDocument({ fileName: "invalid.docx", base64: await invalidMember.generateAsync({ type: "base64" }) })).rejects.toMatchObject({ code: "invalid_file" });
  });
});
