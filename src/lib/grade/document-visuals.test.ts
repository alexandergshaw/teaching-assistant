import { beforeEach, describe, expect, it, vi } from "vitest";
import JSZip from "jszip";
import type { NextRequest } from "next/server";

vi.mock("@/lib/supabase/auth", () => ({ requireAppOwner: vi.fn(async () => ({ id: "u1" })) }));
const storage = vi.hoisted(() => ({ download: vi.fn(), remove: vi.fn(), list: vi.fn() }));
vi.mock("@/lib/supabase/storage", () => ({ downloadFile: storage.download, removeFiles: storage.remove }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ storage: { from: () => ({ list: storage.list }) } }) }));
vi.mock("@/lib/llm", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/llm")>(), callLlm: vi.fn() }));
vi.mock("@/lib/gemini", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/gemini")>(), getGeminiInterRequestDelayMs: () => 0 }));
vi.mock("@/lib/code-runner", () => ({ runSubmittedCode: vi.fn(async () => null) }));

import { callLlm } from "../llm";
import { prepareChatSubmissionAction } from "@/app/actions/grading-chat-intake";
import { POST as storedPost } from "@/app/api/grade-submission-file/route";
import { POST as gradePost } from "@/app/api/grade-run-item/route";
import { buildRunItemRequests, stripUnneededRawBase64, estimateEntryWireBytes, estimateNeededWireBytes, ITEM_REQUEST_BYTE_BUDGET } from "@/app/components/grading/incrementalRunPlan";
import { buildGradeItemDetail } from "@/app/components/grading-chat/chatGradeDetail";
import { sanitizeSessionDiagnosticDetail } from "../session-diagnostic-log";
import { prepareDocumentVisuals } from "./document-visuals";
import { DOCUMENT_PICTURE_LIMIT, DOCUMENT_PICTURE_BYTE_LIMIT, DOCUMENT_VISUAL_BYTE_LIMIT, isDocumentVisuals } from "./document-visual-schema";
import { canvasWorkToEntry } from "./extraction";
import { gradeEntries } from "./engine";
import { collectInlineVisualEvidence } from "./inline-visuals";
import type { StudentSubmissionEntry } from "./types";

// Literal expected PNG bytes, never read back from the implementation.
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6l1sAAAAASUVORK5CYII=";
const TEXT = "Author: Synthetic Writer. My solution uses the diagram below.";
const RUBRIC = "Clarity (10 pts): Explain the diagram.";
const fixture = async (kind: "docx" | "pptx", options: { text?: string; pictures?: number; unsupported?: boolean; broken?: boolean; bytes?: number } = {}) => {
  const zip = new JSZip();
  const { text = TEXT, pictures = 1, unsupported = false, broken = false, bytes } = options;
  const png = bytes ? Buffer.alloc(bytes, 117) : Buffer.from(PNG, "base64");
  const pic = kind === "docx"
    ? '<w:drawing><wp:docPr id="1" name="Fixture"/><a:blip r:embed="rId1"/></w:drawing>'
    : '<p:pic><p:nvPicPr><p:cNvPr id="1" name="Fixture"/></p:nvPicPr><p:blipFill><a:blip r:embed="rId1"/></p:blipFill></p:pic>';
  const drawings = pic.repeat(pictures) + (unsupported ? pic.replace("rId1", "rId2") : "");
  const rels = `<Relationships><Relationship Id="rId1" Target="${kind === "pptx" ? "../" : ""}media/fixture.png"/><Relationship Id="rId2" Target="${kind === "pptx" ? "../" : ""}media/fixture.emf"/></Relationships>`;
  if (kind === "docx") {
    zip.file("word/document.xml", `<w:document><w:body><w:p><w:r><w:t>${text}</w:t></w:r>${drawings}</w:p></w:body></w:document>`);
    if (!broken) zip.file("word/_rels/document.xml.rels", rels);
    zip.file("word/media/fixture.png", png);
    if (unsupported) zip.file("word/media/fixture.emf", "unsupported");
  } else {
    zip.file("ppt/slides/slide1.xml", `<p:sld><p:cSld><p:spTree><a:p><a:r><a:t>${text}</a:t></a:r></a:p>${drawings}</p:spTree></p:cSld></p:sld>`);
    if (!broken) zip.file("ppt/slides/_rels/slide1.xml.rels", rels);
    zip.file("ppt/media/fixture.png", png);
    if (unsupported) zip.file("ppt/media/fixture.emf", "unsupported");
  }
  return zip.generateAsync({ type: "nodebuffer", compression: "STORE" });
};
function request(body: unknown): NextRequest {
  return { headers: { get: (key: string) => key === "content-type" ? "application/json" : null }, json: async () => body } as unknown as NextRequest;
}
async function intake(kind: "docx" | "pptx", bytes: Buffer, stored: boolean): Promise<StudentSubmissionEntry> {
  const name = `Synthetic Writer.${kind}`;
  if (stored) {
    storage.download.mockResolvedValue({ data: new Blob([new Uint8Array(bytes)]), error: null });
    storage.list.mockResolvedValue({ data: [{ name: `fixture.${kind}`, metadata: { size: bytes.length } }], error: null });
    const res = await storedPost(request({ storagePath: `u1/grading-uploads/fixture.${kind}`, name, label: "Synthetic Writer", provider: "gemini" }));
    expect(res.status).toBe(200);
    expect(storage.remove).toHaveBeenCalled();
    const { entry } = await res.json();
    expect(entry.submittedFiles[0].rawBase64).toBeUndefined();
    return entry;
  }
  const form = new FormData();
  form.set("kind", "file"); form.set("label", "Synthetic Writer"); form.set("provider", "gemini");
  form.set("file", new File([new Uint8Array(bytes)], name));
  const out = await prepareChatSubmissionAction(form);
  expect(out.kind).toBe("entries");
  if (out.kind !== "entries") throw new Error("Unexpected refusal");
  return out.entries[0];
}
function body(entry: StudentSubmissionEntry) {
  return buildRunItemRequests({ tickets: [{ sourceIndex: 0, entry: stripUnneededRawBase64(entry) }], assignmentInstructions: "Explain your diagram.", rubric: RUBRIC, provider: "gemini", pointsPossible: null })[0];
}
beforeEach(() => {
  vi.clearAllMocks();
  storage.remove.mockResolvedValue({ error: null });
  vi.mocked(callLlm).mockResolvedValue({ ok: true, text: JSON.stringify({ overallComment: "Clear.", rubricResults: [{ area: "Clarity", score: "9/10" }], totalScore: "9/10" }) });
});

describe.each(["docx", "pptx"] as const)("%s intake through actual model request", kind => {
  it("prepared pictures replace container bytes even when the UI text preview was truncated", async () => {
    const entry = await intake(kind, await fixture(kind, { text: TEXT.repeat(400) }), false);
    expect(entry.submittedFiles[0].previewTruncated).toBe(true);
    expect(entry.submittedFiles[0].rawBase64).toBeDefined();
    const wire = body(entry);
    expect(wire.entry.submittedFiles[0].rawBase64).toBeUndefined();
    expect(wire.entry.submittedFiles[0].documentVisuals?.parts[0].base64).toBe(PNG);
    expect(wire.entry.content).toBe(entry.content);
  });
  for (const stored of [false, true]) for (const imageOnly of [false, true]) {
    it(`${stored ? "stored" : "small"}, ${imageOnly ? "image-only" : "text and picture"}`, async () => {
      const entry = await intake(kind, await fixture(kind, { text: imageOnly ? "" : TEXT }), stored);
      expect(entry.student).toBe("Synthetic Writer"); expect(entry.mergedFileCount).toBe(1);
      expect(entry.submittedFiles.map(f => f.name)).toEqual([`Synthetic Writer.${kind}`]);
      expect(entry.content).toContain(imageOnly ? "no extracted text" : TEXT);
      if (!stored) expect(entry.submittedFiles[0].rawBase64).toBeDefined();
      const wire = body(entry);
      expect(wire.entry.submittedFiles[0].rawBase64).toBeUndefined();
      const res = await gradePost(request(wire));
      expect(res.status).toBe(200);
      const response = await res.json();
      expect(response.result.ungraded).toBeUndefined();
      expect(callLlm).toHaveBeenCalledTimes(1);
      const sent = vi.mocked(callLlm).mock.calls[0][0];
      expect(sent.contents.flatMap(c => c.parts).filter(p => "inlineData" in p)).toEqual([{ inlineData: { mimeType: "image/png", data: PNG } }]);
      expect(JSON.stringify(sent)).toContain(imageOnly ? "no extracted text" : TEXT);
      const detail = sanitizeSessionDiagnosticDetail(buildGradeItemDetail({}, response.diagnostic));
      expect(detail).toMatchObject({ picturesPrepared: 1, picturesSent: 1, picturesOmitted: 0, visualCoverage: "complete", passes: 1 });
      expect(JSON.stringify(detail)).not.toContain("Synthetic"); expect(JSON.stringify(detail)).not.toContain(PNG);
      expect(isDocumentVisuals(entry.submittedFiles[0].documentVisuals)).toBe(true);
    });
  }
});

describe("coverage and boundaries", () => {
  it("Canvas image-only DOCX reaches the actual grading request", async () => {
    const bytes = await fixture("docx", { text: "" });
    const entry = await canvasWorkToEntry({ student: "Synthetic Writer", userId: 17, text: "", contributionCount: 1, files: [{ name: "Canvas.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", base64: bytes.toString("base64") }] });
    expect((await gradePost(request(body(entry)))).status).toBe(200);
    expect(JSON.stringify(vi.mocked(callLlm).mock.calls[0][0])).toContain(PNG);
  });
  it("plain text and standalone PNG/PDF keep their successful request behavior", async () => {
    for (const extension of ["txt", "png", "pdf"]) {
      const entry: StudentSubmissionEntry = { student: "Synthetic Writer", content: TEXT, mergedFileCount: 1, submittedFiles: [{ name: "standalone." + extension, extension, previewContent: TEXT, previewTruncated: false, mimeType: extension === "txt" ? "text/plain" : extension === "pdf" ? "application/pdf" : "image/png", ...(extension === "txt" ? {} : { rawBase64: PNG }) }] };
      expect((await gradePost(request(body(entry)))).status).toBe(200);
    }
    expect(callLlm).toHaveBeenCalledTimes(3);
  });
  it.each([{ pictures: DOCUMENT_PICTURE_LIMIT + 1 }, { bytes: DOCUMENT_PICTURE_BYTE_LIMIT + 1 }, { bytes: DOCUMENT_PICTURE_BYTE_LIMIT, pictures: 4 }])("budget omission refuses actual scoring: %j", async options => {
    const entry = await intake("docx", await fixture("docx", options), true);
    const response = await (await gradePost(request(body(entry)))).json();
    expect(response.result.ungraded.kind).toBe("grading-failed");
    expect(response.diagnostic.passes).toBe(0);
    expect(callLlm).not.toHaveBeenCalled();
  });
  it("raw multi-document fallback shares one picture budget and refuses partial scoring", async () => {
    const bytes = await fixture("docx", { pictures: 9 });
    const first = await intake("docx", bytes, false);
    const raw = first.submittedFiles.map(({ documentVisuals: _dropped, ...f }) => { void _dropped; return f; });
    const entry = { ...first, submittedFiles: [...raw, ...raw.map(f => ({ ...f, name: "Second.docx" }))], mergedFileCount: 2 };
    const response = await (await gradePost(request(body(entry)))).json();
    expect(response.result.ungraded.kind).toBe("grading-failed");
    expect(response.diagnostic).toMatchObject({ visualCoverage: "incomplete", picturesSent: 0, picturesOmitted: 2, passes: 0 });
    expect(callLlm).not.toHaveBeenCalled();
  });
  it("maximum-sized prepared picture validates without recursive regex overflow", async () => {
    const coverage = await prepareDocumentVisuals("docx", await fixture("docx", { bytes: DOCUMENT_PICTURE_BYTE_LIMIT }));
    expect(isDocumentVisuals(coverage)).toBe(true);
    coverage.parts[0].base64 = Buffer.alloc(DOCUMENT_PICTURE_BYTE_LIMIT + 1).toString("base64");
    expect(isDocumentVisuals(coverage)).toBe(false);
  });
  it.each([{ unsupported: true }, { broken: true }])("known omission is ungraded without any model pass: %j", async options => {
    const entry = await intake("docx", await fixture("docx", options), false);
    const response = await (await gradePost(request(body(entry)))).json();
    expect(response.result.ungraded.kind).toBe("grading-failed");
    expect(response.result.totalScore).toBe("");
    expect(response.result.overallComment).toContain("Synthetic Writer.docx");
    expect(response.result.overallComment).toContain("supported PDF");
    expect(callLlm).not.toHaveBeenCalled();
    expect(response.diagnostic).toMatchObject({ visualCoverage: "incomplete", picturesSent: 0, picturesOmitted: 1, passes: 0 });
  });
  it("raw Canvas/archive fallback includes coverage and prepared payload prevents duplicates", async () => {
    const entry = await intake("docx", await fixture("docx"), false);
    const prepared = await collectInlineVisualEvidence(entry.submittedFiles);
    const raw = await collectInlineVisualEvidence(entry.submittedFiles.map(({ documentVisuals: _dropped, ...f }) => { void _dropped; return f; }));
    expect(prepared.parts).toHaveLength(1); expect(raw.parts).toHaveLength(1);
    expect(raw.documents[0].coverage.status).toBe("complete");
  });
  it("known no drawing, legacy DOC, RTF and sibling still grade with truthful unavailable coverage", async () => {
    const noDrawing = await intake("docx", await fixture("docx", { pictures: 0 }), false);
    const bad = await intake("docx", await fixture("docx", { broken: true }), false);
    const legacy = (ext: string): StudentSubmissionEntry => ({ student: ext, content: TEXT, mergedFileCount: 1, submittedFiles: [{ name: `legacy.${ext}`, extension: ext, previewContent: TEXT, previewTruncated: false }] });
    const result = await gradeEntries([bad, noDrawing, legacy("doc"), legacy("rtf"), { ...noDrawing, student: "Sibling" }], "Read", RUBRIC, "gemini");
    expect(result.results.map(r => Boolean(r.ungraded))).toEqual([true, false, false, false, false]);
    expect(callLlm).toHaveBeenCalledTimes(4);
    expect(JSON.stringify(vi.mocked(callLlm).mock.calls[1][0])).toContain("visual inspection unavailable");
  });
  it.each([DOCUMENT_PICTURE_LIMIT - 1, DOCUMENT_PICTURE_LIMIT, DOCUMENT_PICTURE_LIMIT + 1])("part cap at %i", async pictures => {
    const coverage = await prepareDocumentVisuals("docx", await fixture("docx", { pictures }));
    expect(coverage.parts.length).toBe(Math.min(pictures, DOCUMENT_PICTURE_LIMIT));
    expect(coverage.omitted).toBe(Math.max(0, pictures - DOCUMENT_PICTURE_LIMIT));
    expect(coverage.status).toBe(pictures > DOCUMENT_PICTURE_LIMIT ? "incomplete" : "complete");
  });
  it.each([DOCUMENT_PICTURE_BYTE_LIMIT - 1, DOCUMENT_PICTURE_BYTE_LIMIT, DOCUMENT_PICTURE_BYTE_LIMIT + 1])("pre-read picture cap at %i", async bytes => {
    const coverage = await prepareDocumentVisuals("docx", await fixture("docx", { bytes }));
    expect(coverage.status).toBe(bytes > DOCUMENT_PICTURE_BYTE_LIMIT ? "incomplete" : "complete");
    expect(coverage.omitted).toBe(bytes > DOCUMENT_PICTURE_BYTE_LIMIT ? 1 : 0);
  });
  it("encoded aggregate cap is bounded and incomplete rather than silently partial", async () => {
    const coverage = await prepareDocumentVisuals("pptx", await fixture("pptx", { bytes: DOCUMENT_PICTURE_BYTE_LIMIT, pictures: 4 }));
    expect(coverage.status).toBe("incomplete"); expect(coverage.reason).toBe("budget"); expect(coverage.omitted).toBeGreaterThan(0);
    expect(Buffer.byteLength(JSON.stringify(coverage))).toBeLessThanOrEqual(DOCUMENT_VISUAL_BYTE_LIMIT);
  });
  it("raw corrupt document is an ungraded request with zero model passes", async () => {
    const entry: StudentSubmissionEntry = { student: "Synthetic Writer", content: TEXT, mergedFileCount: 1, submittedFiles: [{ name: "corrupt.docx", extension: "docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", rawBase64: Buffer.from("corrupt").toString("base64"), previewContent: TEXT, previewTruncated: false }] };
    const res = await (await gradePost(request(body(entry)))).json();
    expect(res.result.ungraded.kind).toBe("grading-failed");
    expect(res.diagnostic).toMatchObject({ visualCoverage: "failed", passes: 0 });
    expect(callLlm).not.toHaveBeenCalled();
  });
  it("corrupt and ZIP entry-cap containers fail closed", async () => {
    expect((await prepareDocumentVisuals("docx", Buffer.from("corrupt"))).status).toBe("failed");
    const zip = new JSZip(); zip.file("word/document.xml", "<w:document><w:body/></w:document>"); for (let i = 0; i < 1001; i++) zip.file(`f${i}`, "");
    expect((await prepareDocumentVisuals("docx", await zip.generateAsync({ type: "nodebuffer" }))).status).toBe("failed");
    expect(callLlm).not.toHaveBeenCalled();
  });
  it("final encoded body cap includes instructions and metadata beyond a permitted entry", async () => {
    const entry = await intake("docx", await fixture("docx"), false);
    entry.content = "";
    const available = ITEM_REQUEST_BYTE_BUDGET - estimateNeededWireBytes(entry) - 10;
    entry.content = "文".repeat(Math.floor(available / 3)) + "a".repeat(available % 3);
    expect(estimateNeededWireBytes(entry)).toBeLessThan(ITEM_REQUEST_BYTE_BUDGET);
    expect(Buffer.byteLength(JSON.stringify(body(entry)))).toBeGreaterThan(ITEM_REQUEST_BYTE_BUDGET);
    expect((await gradePost(request(body(entry)))).status).toBe(400);
    expect(callLlm).not.toHaveBeenCalled();
  });
  it("prepared payload uses encoded JSON accounting for combined text and pictures", async () => {
    const entry = await intake("docx", await fixture("docx"), false);
    entry.content = "文".repeat(Math.ceil(ITEM_REQUEST_BYTE_BUDGET / 3));
    expect(estimateNeededWireBytes(entry)).toBe(Buffer.byteLength(JSON.stringify(stripUnneededRawBase64(entry))));
    expect(estimateEntryWireBytes(entry)).toBe(Buffer.byteLength(JSON.stringify(entry)));
    expect((await gradePost(request(body(entry)))).status).toBe(400); expect(callLlm).not.toHaveBeenCalled();
  });
  it.each([
    { status: "unavailable", reason: "unsupported-format", found: 0, parts: [] },
    { status: "invented" }, { found: -1 }, { found: 20 }, { omitted: 1 },
    { parts: [{ name: "p", mimeType: "image/emf", base64: PNG }] },
    { parts: [{ name: "p", mimeType: "image/png", base64: "bad!" }] },
    { parts: Array.from({ length: 17 }, () => ({ name: "p", mimeType: "image/png", base64: PNG })), found: 17 },
    { arbitrary: "private" },
  ])("forged nested payload refused before model: %j", async override => {
    const entry = await intake("docx", await fixture("docx"), false);
    Object.assign(entry.submittedFiles[0].documentVisuals!, override);
    expect((await gradePost(request(body(entry)))).status).toBe(400); expect(callLlm).not.toHaveBeenCalled();
  });
});
