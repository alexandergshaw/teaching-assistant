import { describe, it, expect, beforeEach, vi } from "vitest";
vi.mock("@/app/actions/document-template-files", () => ({ previewDocumentTemplateAction: vi.fn() }));
import { previewDocumentTemplateAction } from "@/app/actions/document-template-files";
import { createDocumentRequestGate, documentOperation, previewReviewedDocument, readDocumentFile, reviewDocumentProposal } from "./panel-logic";
import { readSessionDiagnosticLogState, resetSessionDiagnosticLogForTests } from "@/lib/session-diagnostic-log";
beforeEach(() => resetSessionDiagnosticLogForTests("2026-10-15T00:00:00Z"));
describe("document client operation boundaries", () => {
  it("invalidates stale file, reopen and unmounted requests", () => { const gate = createDocumentRequestGate(); const first = gate.next(); expect(gate.current(first)).toBe(true); const second = gate.next(); expect(gate.current(first)).toBe(false); expect(gate.current(second)).toBe(true); gate.invalidate(); expect(gate.current(second)).toBe(false); });
  it("records load, analyze, save, reuse and download outcome and duration without source, names, fields or model response", async () => {
    for (const operation of ["load", "analyze", "save", "reuse", "download"]) await documentOperation(operation, async () => ({ name: "PRIVATE_FILENAME.docx", text: "PRIVATE_SOURCE", value: "PRIVATE_FIELD", model: "PRIVATE_MODEL" }));
    await documentOperation("save", async () => ({ error: "Could not save the template.", code: "save_failed" }));
    const state = readSessionDiagnosticLogState(); const json = JSON.stringify(state);
    for (const secret of ["PRIVATE_FILENAME", "PRIVATE_SOURCE", "PRIVATE_FIELD", "PRIVATE_MODEL"]) expect(json).not.toContain(secret);
    expect(state.entries.map((e) => e.operation)).toEqual(["document_template_load", "document_template_analyze", "document_template_save", "document_template_reuse", "document_template_download", "document_template_save"]);
    expect(state.entries.every((e) => e.surface === "templates" && typeof e.durationMs === "number")).toBe(true); expect(state.entries.at(-1)).toMatchObject({ outcome: "failure", code: "SAVE_FAILED" });
  });
  it("reports thrown requests as fixed retryable failure", async () => { expect(await documentOperation("load", async () => { throw new Error("PRIVATE"); })).toEqual({ error: "The request failed. Try again.", code: "request_failed" }); expect(JSON.stringify(readSessionDiagnosticLogState())).not.toContain("PRIVATE"); });
  it("refuses a large file before FileReader and validates extension", async () => {
    const reader = vi.fn(); vi.stubGlobal("FileReader", reader);
    await expect(readDocumentFile({ name: "a.docx", size: 4_000_000 } as File)).rejects.toThrow(/too large/); await expect(readDocumentFile({ name: "a.exe", size: 1 } as File)).rejects.toThrow(/DOCX/); expect(reader).not.toHaveBeenCalled(); vi.unstubAllGlobals();
  });
});


describe("round-two review and saved proposal preview", () => {
  it("merges edited replacement with server-derived retained text without accepting foreign source IDs", () => {
    const source = [{ id: "p0", sourceText: "Course Alpha", templateText: "Course {{course}}", replaced: true }, { id: "p1", sourceText: "Keep policy", templateText: "Keep policy", replaced: false }];
    const proposal = JSON.stringify({ replacements: [{ id: "p0", text: "Edited {{course}}" }, { id: "foreign", text: "Injected source" }] });
    expect(reviewDocumentProposal(source, proposal).map((paragraph) => paragraph.templateText)).toEqual(["Edited {{course}}", "Keep policy"]);
    expect(reviewDocumentProposal(source, "invalid JSON")).toEqual(source);
  });
  it("routes current reopened edits to authenticated stored-source preview, without upload or mutation, and keeps diagnostics private", async () => {
    const proposal = { version: 1, fields: [{ key: "course", label: "Private label" }], replacements: [{ id: "p0", text: "PRIVATE_REVIEW {{course}}" }] };
    vi.mocked(previewDocumentTemplateAction).mockResolvedValue({ base64: "PRIVATE_BINARY", fileName: "PRIVATE_FILENAME.docx" });
    const result = await documentOperation("download", () => previewReviewedDocument(null, "saved-id", JSON.stringify(proposal)));
    expect(previewDocumentTemplateAction).toHaveBeenLastCalledWith(null, proposal, "saved-id"); expect(result).toHaveProperty("base64", "PRIVATE_BINARY");
    expect(JSON.stringify(readSessionDiagnosticLogState())).not.toMatch(/PRIVATE_REVIEW|PRIVATE_BINARY|PRIVATE_FILENAME|Private label/);
    expect(await previewReviewedDocument(null, "saved-id", "bad JSON")).toMatchObject({ code: "invalid_proposal" });
  });
});
