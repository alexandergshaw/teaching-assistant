// The inference gate: the model is called ONLY for an unusable, unlabelled
// text/document submission. callLlm is mocked; fetch is network-blocked.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../llm", () => ({ callLlm: vi.fn() }));

import { callLlm, type LlmResult } from "../llm";
import { buildSingleFileEntry, inferStudentNameFromContent } from "./single-file-entry";

const callLlmMock = vi.mocked(callLlm);

function llmText(text: string): LlmResult {
  return { ok: true, text };
}

const BODY = Buffer.from("By Jordan Lee\nMy essay body.", "utf-8");

beforeEach(() => {
  callLlmMock.mockReset();
  callLlmMock.mockResolvedValue(llmText("Jordan Lee"));
});

describe("buildSingleFileEntry inference gate", () => {
  it("makes zero model calls for a real-named file", async () => {
    const entry = await buildSingleFileEntry("Jordan Lee - reflection.txt", BODY, "gemini");
    expect(callLlmMock).toHaveBeenCalledTimes(0);
    expect(entry!.studentNameSource).toBe("filename");
    expect(entry!.student).toBe("Jordan Lee - reflection");
  });

  it("makes zero model calls for a labelled file with a generic name", async () => {
    const entry = await buildSingleFileEntry("essay.txt", BODY, "gemini", true);
    expect(callLlmMock).toHaveBeenCalledTimes(0);
    expect(entry!.studentNameSource).toBe("filename");
  });

  it("makes zero model calls on the image branch and flags a generic image as unresolved", async () => {
    const entry = await buildSingleFileEntry("scan.png", Buffer.from([0x89, 0x50]), "gemini");
    expect(callLlmMock).toHaveBeenCalledTimes(0);
    expect(entry!.studentNameSource).toBe("unresolved");
    expect(entry!.student).toBe("scan");
  });

  it("leaves a real-named image as filename-sourced with no call", async () => {
    const entry = await buildSingleFileEntry("Jordan Lee.png", Buffer.from([0x89, 0x50]), "gemini");
    expect(callLlmMock).toHaveBeenCalledTimes(0);
    expect(entry!.studentNameSource).toBe("filename");
  });

  it("makes exactly one model call for an unnamed, unlabelled text submission and uses the inferred name", async () => {
    const entry = await buildSingleFileEntry("essay.txt", BODY, "gemini");
    expect(callLlmMock).toHaveBeenCalledTimes(1);
    expect(entry!.student).toBe("Jordan Lee");
    expect(entry!.studentNameSource).toBe("inferred");
  });

  it("keeps the stem and flags unresolved when the model abstains with NONE", async () => {
    callLlmMock.mockResolvedValue(llmText("NONE"));
    const entry = await buildSingleFileEntry("essay.txt", BODY, "gemini");
    expect(callLlmMock).toHaveBeenCalledTimes(1);
    expect(entry!.student).toBe("essay");
    expect(entry!.studentNameSource).toBe("unresolved");
  });

  it("flags unresolved when the model call fails or throws", async () => {
    callLlmMock.mockResolvedValueOnce({ ok: false, status: 500, body: "x" });
    const failed = await buildSingleFileEntry("essay.txt", BODY, "gemini");
    expect(failed!.studentNameSource).toBe("unresolved");
    callLlmMock.mockRejectedValueOnce(new Error("network"));
    const thrown = await buildSingleFileEntry("essay.txt", BODY, "gemini");
    expect(thrown!.studentNameSource).toBe("unresolved");
  });

  it("makes no call and flags unresolved when no provider is supplied", async () => {
    const entry = await buildSingleFileEntry("essay.txt", BODY);
    expect(callLlmMock).toHaveBeenCalledTimes(0);
    expect(entry!.studentNameSource).toBe("unresolved");
  });
});

describe("inferStudentNameFromContent", () => {
  it("sends only the first 2000 characters at temperature 0 with a small token cap", async () => {
    await inferStudentNameFromContent("a".repeat(5000), "gemini");
    const req = callLlmMock.mock.calls[0][0];
    const sent = (req.contents[0].parts[0] as { text: string }).text;
    expect(sent).toContain("a".repeat(2000));
    expect(sent).not.toContain("a".repeat(2001));
    expect(req.generationConfig).toEqual({ temperature: 0, maxOutputTokens: 60 });
  });

  it("rejects a returned value that is itself unusable or over-long", async () => {
    callLlmMock.mockResolvedValueOnce(llmText("Untitled"));
    expect(await inferStudentNameFromContent("x", "gemini")).toBeNull();
    callLlmMock.mockResolvedValueOnce(llmText("A".repeat(501)));
    expect(await inferStudentNameFromContent("x", "gemini")).toBeNull();
    callLlmMock.mockResolvedValueOnce(llmText("none"));
    expect(await inferStudentNameFromContent("x", "gemini")).toBeNull();
  });

  it("strips a Name: prefix and surrounding quotes", async () => {
    callLlmMock.mockResolvedValueOnce(llmText('Name: "Ada Lovelace"\nextra'));
    expect(await inferStudentNameFromContent("x", "gemini")).toBe("Ada Lovelace");
  });
});
