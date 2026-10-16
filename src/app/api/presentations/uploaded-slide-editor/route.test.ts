import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/auth", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/llm", () => ({ callLlm: vi.fn() }));
vi.mock("@/lib/course-intel/fetch", () => ({ withDeadline: vi.fn((work: Promise<unknown>) => work) }));
vi.mock("@/lib/presentations/uploaded-slide-editor", async () => {
  const actual = await vi.importActual<typeof import("@/lib/presentations/uploaded-slide-editor")>("@/lib/presentations/uploaded-slide-editor");
  return { ...actual, inspectUploadedPptx: vi.fn() };
});

import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/supabase/auth";
import { callLlm } from "@/lib/llm";
import { inspectUploadedPptx } from "@/lib/presentations/uploaded-slide-editor";
import { UPLOAD_WIRE_BUDGET_BYTES } from "@/lib/upload-budget";
import { POST } from "./route";

function request(body: unknown): NextRequest {
  return { text: async () => typeof body === "string" ? body : JSON.stringify(body) } as unknown as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireUser).mockResolvedValue({ id: "user-1", email: "owner@example.com" } as never);
  vi.mocked(inspectUploadedPptx).mockResolvedValue([
    { number: 1, title: "First slide", paragraphs: [{ id: "s0_p0", text: "First slide private text", editable: true }] },
    { number: 2, title: "Second slide", paragraphs: [{ id: "s1_p0", text: "Selected slide text", editable: true }] },
  ]);
});

describe("POST /api/presentations/uploaded-slide-editor", () => {
  it("requires authentication before model dispatch", async () => {
    vi.mocked(requireUser).mockRejectedValueOnce(new Error("not signed in"));
    const response = await POST(request({ op: "regenerate", base64: "AA==", slideNumber: 1, instruction: "Rewrite it" }));
    expect(response.status).toBe(401);
    expect(callLlm).not.toHaveBeenCalled();
  });

  it("refuses request bodies over the combined wire budget before parsing or dispatch", async () => {
    const response = await POST(request(`{"x":"${"a".repeat(UPLOAD_WIRE_BUDGET_BYTES)}"}`));
    expect(response.status).toBe(413);
    expect(callLlm).not.toHaveBeenCalled();
  });

  it("requests a one-slide candidate and accepts exactly one output per supplied paragraph id", async () => {
    vi.mocked(callLlm).mockResolvedValue({ ok: true, text: JSON.stringify({ paragraphs: [{ id: "s1_p0", text: "A clearer slide" }] }) } as never);
    const response = await POST(request({ op: "regenerate", base64: "AA==", slideNumber: 2, instruction: "Make it clearer", paragraphs: [{ id: "s0_p0", text: "Attacker supplied other slide" }], secretBytes: "must never be forwarded" }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ paragraphs: [{ id: "s1_p0", text: "A clearer slide" }], operations: [], sourceDigest: expect.stringMatching(/^[a-f0-9]{64}$/) });
    const call = vi.mocked(callLlm).mock.calls[0]?.[0];
    const firstPart = call?.contents?.[0]?.parts?.[0];
    const prompt = firstPart && "text" in firstPart ? firstPart.text : "";
    expect(prompt).toContain("Make it clearer");
    expect(prompt).toContain("Selected slide text");
    expect(prompt).not.toContain("First slide private text");
    expect(prompt).not.toContain("Attacker supplied other slide");
    expect(prompt).not.toContain("must never be forwarded");
  });

  it("rejects a model result that retargets or changes the selected slide's paragraph set", async () => {
    vi.mocked(callLlm).mockResolvedValue({ ok: true, text: JSON.stringify({ paragraphs: [{ id: "s0_p0", text: "Wrong slide" }] }) } as never);
    const response = await POST(request({ op: "regenerate", base64: "AA==", slideNumber: 2, instruction: "Rewrite it" }));
    expect(response.status).toBe(502);
    expect(callLlm).toHaveBeenCalledTimes(1);
  });

  it("rejects an out-of-range slide before calling the model", async () => {
    const response = await POST(request({ op: "regenerate", base64: "AA==", slideNumber: 6, instruction: "Rewrite it" }));
    expect(response.status).toBe(400);
    expect(callLlm).not.toHaveBeenCalled();
  });

  it("accepts only a typed operation targeting a selected editable native object", async () => {
    vi.mocked(inspectUploadedPptx).mockResolvedValueOnce([
      { number: 1, title: "First slide", paragraphs: [{ id: "s0_p0", text: "First slide private text", editable: true }] },
      { number: 2, title: "Second slide", paragraphs: [], objects: [
        { id: "package:s2:o3:shape", kind: "shape", name: "Title box", editable: true, text: "Selected slide text", geometry: { x: 0, y: 0, width: 20, height: 30, rotation: 0 } },
        { id: "package:s2:o4:chart", kind: "chart", name: "Chart", editable: false, reason: "read-only", text: "" },
      ] },
    ] as never);
    vi.mocked(callLlm).mockResolvedValue({ ok: true, text: JSON.stringify({ paragraphs: [], operations: [{ objectId: "package:s2:o3:shape", kind: "shape", action: "setGeometry", geometry: { x: 1, y: 2, width: 20, height: 30, rotation: 0 } }] }) } as never);
    const response = await POST(request({ op: "regenerate", base64: "AA==", slideNumber: 2, instruction: "Move it" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ operations: [{ objectId: "package:s2:o3:shape", action: "setGeometry" }], sourceDigest: expect.stringMatching(/^[a-f0-9]{64}$/) });
    const prompt = vi.mocked(callLlm).mock.calls[0]?.[0].contents?.[0]?.parts?.[0];
    const promptText = prompt && "text" in prompt ? prompt.text : "";
    expect(promptText).toContain("Title box");
    expect(promptText).not.toContain("First slide private text");
  });

  it("rejects model operations for unsupported objects", async () => {
    vi.mocked(inspectUploadedPptx).mockResolvedValueOnce([
      { number: 1, title: "First slide", paragraphs: [], objects: [
        { id: "package:s1:o3:shape", kind: "shape", name: "Shape", editable: true, text: "" },
        { id: "package:s1:o4:chart", kind: "chart", name: "Chart", editable: false, text: "" },
      ] },
    ] as never);
    vi.mocked(callLlm).mockResolvedValue({ ok: true, text: JSON.stringify({ paragraphs: [], operations: [{ objectId: "package:s1:o4:chart", kind: "chart", action: "setGeometry", geometry: { x: 1, y: 2, width: 3, height: 4, rotation: 0 } }] }) } as never);
    const response = await POST(request({ op: "regenerate", base64: "AA==", slideNumber: 1, instruction: "Move it" }));
    expect(response.status).toBe(502);
  });

  it("accepts chart data candidates only for editable charts with a fixed category count", async () => {
    vi.mocked(inspectUploadedPptx).mockResolvedValueOnce([
      { number: 1, title: "Enrollment", paragraphs: [], objects: [
        { id: "package:s1:o4:chart", kind: "chart", name: "Enrollment", editable: true, text: "", chartData: { seriesName: "Students", categories: ["Alpha", "Beta"], values: [2, 3] } },
      ] },
    ] as never);
    vi.mocked(callLlm).mockResolvedValueOnce({ ok: true, text: JSON.stringify({ paragraphs: [], operations: [{ objectId: "package:s1:o4:chart", kind: "chart", action: "setData", data: { seriesName: "Enrollment", categories: ["Freshman", "Senior"], values: [12, 18] } }] }) } as never);
    const response = await POST(request({ op: "regenerate", base64: "AA==", slideNumber: 1, instruction: "Update the enrollment figures" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ operations: [{ kind: "chart", action: "setData", data: { categories: ["Freshman", "Senior"], values: [12, 18] } }] });

    vi.mocked(inspectUploadedPptx).mockResolvedValueOnce([
      { number: 1, title: "Enrollment", paragraphs: [], objects: [
        { id: "package:s1:o4:chart", kind: "chart", name: "Enrollment", editable: true, text: "", chartData: { seriesName: "Students", categories: ["Alpha", "Beta"], values: [2, 3] } },
      ] },
    ] as never);
    vi.mocked(callLlm).mockResolvedValueOnce({ ok: true, text: JSON.stringify({ paragraphs: [], operations: [{ objectId: "package:s1:o4:chart", kind: "chart", action: "setData", data: { seriesName: "Enrollment", categories: ["Only one"], values: [12] } }] }) } as never);
    expect((await POST(request({ op: "regenerate", base64: "AA==", slideNumber: 1, instruction: "Change chart" }))).status).toBe(502);
  });

  it("offers only the selected SmartArt leaf nodes to regeneration and accepts typed leaf edits", async () => {
    vi.mocked(inspectUploadedPptx).mockResolvedValueOnce([
      { number: 1, title: "Hierarchy", paragraphs: [], objects: [
        { id: "package:s1:o5:smartart", kind: "smartart", name: "Hierarchy", editable: true, text: "", smartArtNodes: [{ id: "leaf-a", text: "First" }, { id: "leaf-b", text: "Second" }] },
      ] },
      { number: 2, title: "Other slide", paragraphs: [{ id: "s1_p0", text: "private other slide" }] },
    ] as never);
    vi.mocked(callLlm).mockResolvedValueOnce({ ok: true, text: JSON.stringify({ paragraphs: [], operations: [{ objectId: "package:s1:o5:smartart", kind: "smartart", action: "setNodeText", nodeId: "leaf-a", text: "Updated" }] }) } as never);
    const response = await POST(request({ op: "regenerate", base64: "AA==", slideNumber: 1, instruction: "Clarify the hierarchy" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ operations: [{ kind: "smartart", action: "setNodeText", nodeId: "leaf-a", text: "Updated" }] });
    const promptPart = vi.mocked(callLlm).mock.calls[0]?.[0].contents?.[0]?.parts?.[0];
    const prompt = promptPart && "text" in promptPart ? promptPart.text : "";
    expect(prompt).toContain("leaf-a");
    expect(prompt).toContain("First");
    expect(prompt).not.toContain("private other slide");

    vi.mocked(inspectUploadedPptx).mockResolvedValueOnce([
      { number: 1, title: "Hierarchy", paragraphs: [], objects: [
        { id: "package:s1:o5:smartart", kind: "smartart", name: "Hierarchy", editable: true, text: "", smartArtNodes: [{ id: "leaf-a", text: "First" }] },
      ] },
    ] as never);
    vi.mocked(callLlm).mockResolvedValueOnce({ ok: true, text: JSON.stringify({ paragraphs: [], operations: [{ objectId: "package:s1:o5:smartart", kind: "smartart", action: "setNodeText", nodeId: "parent", text: "Retargeted parent" }] }) } as never);
    expect((await POST(request({ op: "regenerate", base64: "AA==", slideNumber: 1, instruction: "Change the parent" }))).status).toBe(502);
  });

  it("rejects a stale candidate before applying any package change", async () => {
    const response = await POST(request({ op: "apply", base64: "AA==", slideNumber: 1, replacements: [{ id: "s0_p0", text: "stale" }], expectedDigest: "0".repeat(64) }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining("earlier version") });
  });

  it("exposes only the selected slide's notes to regeneration and validates the returned notes identity", async () => {
    vi.mocked(inspectUploadedPptx).mockResolvedValueOnce([
      { number: 1, title: "First slide", paragraphs: [], notes: { member: "ppt/notesSlides/notesSlide1.xml", id: "s1:notes:first", text: "first notes", editable: true }, objects: [] },
      { number: 2, title: "Second slide", paragraphs: [], notes: { member: "ppt/notesSlides/notesSlide2.xml", id: "s2:notes:second", text: "other secret notes", editable: true }, objects: [] },
    ] as never);
    vi.mocked(callLlm).mockResolvedValue({ ok: true, text: JSON.stringify({ paragraphs: [], operations: [], notes: [{ id: "s1:notes:first", text: "revised notes" }] }) } as never);
    const response = await POST(request({ op: "regenerate", base64: "AA==", slideNumber: 1, instruction: "Clarify the speaker notes" }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.notes).toEqual([{ id: "s1:notes:first", text: "revised notes" }]);
    const promptPart = vi.mocked(callLlm).mock.calls[0]?.[0].contents?.[0]?.parts?.[0];
    const prompt = promptPart && "text" in promptPart ? promptPart.text : "";
    expect(prompt).toContain("first notes");
    expect(prompt).not.toContain("other secret notes");
    vi.mocked(inspectUploadedPptx).mockResolvedValueOnce([
      { number: 1, title: "First slide", paragraphs: [], notes: { member: "ppt/notesSlides/notesSlide1.xml", id: "s1:notes:first", text: "first notes", editable: true }, objects: [] },
    ] as never);
    vi.mocked(callLlm).mockResolvedValueOnce({ ok: true, text: JSON.stringify({ paragraphs: [], operations: [], notes: [{ id: "other-slide", text: "retargeted" }] }) } as never);
    const invalid = await POST(request({ op: "regenerate", base64: "AA==", slideNumber: 1, instruction: "Rewrite notes" }));
    expect(invalid.status).toBe(502);
  });

  it("rejects a stale note apply before changing the package", async () => {
    const response = await POST(request({ op: "apply", base64: "AA==", slideNumber: 1, replacements: [], operations: [], notes: [{ id: "s1:notes:one", text: "stale" }], expectedDigest: "0".repeat(64) }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining("earlier version") });
  });
});
