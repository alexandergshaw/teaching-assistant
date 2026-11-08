import { beforeEach, describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import type { NextRequest } from "next/server";

vi.mock("@/lib/supabase/auth", () => ({ requireAppOwner: vi.fn(async () => ({ id: "owner" })) }));
vi.mock("@/lib/llm", async (original) => ({ ...await original<typeof import("@/lib/llm")>(), callLlm: vi.fn() }));
vi.mock("@/lib/gemini", async (original) => ({ ...await original<typeof import("@/lib/gemini")>(), getGeminiInterRequestDelayMs: () => 0 }));
vi.mock("@/lib/code-runner", () => ({ runSubmittedCode: vi.fn(async () => null) }));

import { callLlm } from "../llm";
import { canvasWorkToEntry } from "./extraction";
import { gradeEntries } from "./engine";
import { hasCanvasPdfEnvelope } from "./canvas-pdf";
import { POST } from "@/app/api/grade-run-item/route";
import { buildRunItemRequests, stripUnneededRawBase64 } from "@/app/components/grading/incrementalRunPlan";

const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6l1sAAAAASUVORK5CYII=";
async function pdf(image: boolean): Promise<string> {
  const doc = await PDFDocument.create(); const page = doc.addPage();
  if (image) page.drawImage(await doc.embedPng(Buffer.from(png, "base64")), { x: 0, y: 0, width: 20, height: 20 });
  else page.drawText("A text answer");
  return Buffer.from(await doc.save()).toString("base64");
}
async function canvasPdf(base64: string, mimeType = "application/octet-stream") {
  return canvasWorkToEntry({ student: "Ada", userId: 8, text: "", contributionCount: 1, files: [{ name: "answer.pdf", mimeType, base64 }] });
}
function request(entry: Awaited<ReturnType<typeof canvasPdf>>): NextRequest {
  const [body] = buildRunItemRequests({ tickets: [{ sourceIndex: 0, entry: stripUnneededRawBase64(entry) }], assignmentInstructions: "Read the answer.", rubric: "Correctness (10 pts)", provider: "gemini", pointsPossible: 10 });
  return { headers: { get: (key: string) => key === "content-type" ? "application/json" : null }, json: async () => body } as unknown as NextRequest;
}
beforeEach(() => { vi.clearAllMocks(); vi.mocked(callLlm).mockResolvedValue({ ok: true, text: JSON.stringify({ overallComment: "Good.", rubricResults: [{ area: "Correctness", score: "9/10" }], totalScore: "9/10" }) }); });

describe("Canvas PDF evidence", () => {
  it("treats an envelope as a sanity check, not a complete PDF validation", () => {
    expect(hasCanvasPdfEnvelope(Buffer.from("%PDF-1.7\nnot a real document\n%%EOF").toString("base64"))).toBe(true);
  });
  it.each([false, true])("sends a valid %s-image PDF even when Canvas gives it a generic MIME", async (image) => {
    const bytes = await pdf(image), entry = await canvasPdf(bytes);
    expect(entry.submittedFiles[0].mimeType).toBe("application/pdf");
    const response = await POST(request(entry)); expect(response.status).toBe(200);
    expect(JSON.stringify(vi.mocked(callLlm).mock.calls[0][0])).toContain(bytes);
  });
  it("refuses a corrupt PDF before a model call and names the affected attachment", async () => {
    const entry = await canvasPdf(Buffer.from("%PDF-1.7 broken").toString("base64"));
    const response = await POST(request(entry));
    expect(response.status).toBe(422); expect((await response.json()).error).toContain("answer.pdf");
    expect(callLlm).not.toHaveBeenCalled();
  });
  it("keeps the affected Canvas row ungraded while a valid sibling is graded", async () => {
    const bad = await canvasPdf(Buffer.from("%PDF-1.7 broken").toString("base64"));
    const good = { ...await canvasPdf(await pdf(false)), student: "Lin", userId: 9 };
    const run = await gradeEntries([bad, good], "Read the answer.", "Correctness (10 pts)", "gemini", 10, { source: "canvas", autoRunCode: false });
    expect(run.results[0].ungraded?.message).toContain("answer.pdf");
    expect(run.results[1].ungraded).toBeUndefined(); expect(run.results[1].userId).toBe(9);
    expect(callLlm).toHaveBeenCalledTimes(1);
  });
});
