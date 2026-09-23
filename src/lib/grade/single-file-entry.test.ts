// A39 wave 1 ("one submission needs no zip"), docs/a39-waves.md section 7.3.
// W1-1: classifyGradingUpload must never call a .docx "zip" - a .docx IS a
// valid zip archive (JSZip.loadAsync opens it), and TEXT_EXTENSIONS contains
// "xml", so a naive "try to open it" classifier would route it through the
// archive path and grade raw OOXML under the student name "document"
// (RES-A39A-9). W1-2: buildSingleFileEntry must return exactly one entry
// with a non-empty student, without going through groupSubmissionsByStudent
// (whose leafStemFallback is exactly the "document" failure mode above).
import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { classifyGradingUpload, buildSingleFileEntry } from "./single-file-entry";

/** A minimal but real .docx: a zip containing word/document.xml, the same
 * shape office-extract.ts's extractDocxText reads. Needed because a .docx IS
 * a zip archive - a plain text buffer named "essay.docx" is not a valid one
 * and extractTextFromBuffer correctly fails to read it. */
async function fakeDocxBuffer(paragraphText: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    "word/document.xml",
    `<w:document><w:body><w:p><w:t>${paragraphText}</w:t></w:p></w:body></w:document>`
  );
  return zip.generateAsync({ type: "nodebuffer" });
}

describe("classifyGradingUpload (W1-1)", () => {
  it.each([
    ["a.zip", "zip"],
    ["essay.docx", "single"],
    ["paper.pdf", "single"],
    ["notes.txt", "single"],
    ["shot.png", "single"],
    ["x.exe", "unsupported"],
  ] as const)("classifies %s as %s", (name, expected) => {
    expect(classifyGradingUpload(name)).toBe(expected);
  });

  it("never classifies a .docx as a zip, even though a .docx is a valid zip archive", () => {
    expect(classifyGradingUpload("essay.docx")).not.toBe("zip");
  });

  it("is case-insensitive on the extension", () => {
    expect(classifyGradingUpload("ESSAY.DOCX")).toBe("single");
    expect(classifyGradingUpload("ARCHIVE.ZIP")).toBe("zip");
  });

  it("classifies a name with no extension as unsupported", () => {
    expect(classifyGradingUpload("makefile")).toBe("unsupported");
  });
});

describe("buildSingleFileEntry (W1-2)", () => {
  it("returns exactly one entry for a .docx upload, with a non-empty student", async () => {
    const buffer = await fakeDocxBuffer("Dear grader, here is my essay.");
    const entry = await buildSingleFileEntry("essay.docx", buffer);

    expect(entry).not.toBeNull();
    // "one entry" - a single object, not an array of entries.
    expect(Array.isArray(entry)).toBe(false);
    expect(entry!.student).not.toBe("");
    expect(entry!.student.length).toBeGreaterThan(0);
    // The failure mode this guards: groupSubmissionsByStudent's
    // leafStemFallback would name this student "document" (the stem of
    // word/document.xml), never the uploaded file's own name.
    expect(entry!.student).not.toBe("document");
    expect(entry!.mergedFileCount).toBe(1);
    expect(entry!.submittedFiles).toHaveLength(1);
  });

  it("names the student after the uploaded file's own stem, not a filename-convention guess", async () => {
    const buffer = Buffer.from("plain text submission", "utf-8");
    const entry = await buildSingleFileEntry("Jordan Lee - reflection.txt", buffer);

    expect(entry).not.toBeNull();
    expect(entry!.student).toBe("Jordan Lee - reflection");
  });

  it("carries the extracted text as content, and a preview in submittedFiles", async () => {
    const text = "line one\nline two";
    const entry = await buildSingleFileEntry("notes.txt", Buffer.from(text, "utf-8"));

    expect(entry).not.toBeNull();
    expect(entry!.content).toBe(text);
    expect(entry!.submittedFiles[0].previewContent).toBe(text);
    expect(entry!.submittedFiles[0].previewTruncated).toBe(false);
    expect(entry!.submittedFiles[0].extension).toBe("txt");
  });

  it("attaches an image as rawBase64 with an image mimeType, rather than extracting text", async () => {
    const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const entry = await buildSingleFileEntry("shot.png", buffer);

    expect(entry).not.toBeNull();
    expect(entry!.submittedFiles[0].mimeType).toBe("image/png");
    expect(entry!.submittedFiles[0].rawBase64).toBe(buffer.toString("base64"));
  });

  it("returns null for an unsupported extension", async () => {
    const entry = await buildSingleFileEntry("run.exe", Buffer.from([0, 1, 2]));
    expect(entry).toBeNull();
  });

  it("returns null when a document's text could not be extracted", async () => {
    // An empty buffer is not valid OOXML - extractTextFromBuffer's docx
    // extractor falls through to OfficeParser, which cannot parse it, and
    // the function resolves to a falsy/empty result rather than throwing.
    const entry = await buildSingleFileEntry("essay.docx", Buffer.alloc(0));
    expect(entry).toBeNull();
  });
});
