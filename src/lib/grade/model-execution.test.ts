import { afterEach, describe, expect, it, vi } from "vitest";
import { LlmOutcomeUnknownError } from "../llm";
import { gradeEntries } from "./engine";
import { BoundedRubricRefusalError, generateRubric } from "./rubric";

describe("opt-in grading model execution", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("types a bounded rubric refusal separately from an ambiguous response", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(generateRubric("Grade for correctness.", "gemini", "coding", { deadlineMs: Date.now() + 10_000 }))
      .rejects.toBeInstanceOf(BoundedRubricRefusalError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("preserves legacy rubric fallback and empty output handling", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ candidates: [{ content: { parts: [{ text: "  Legacy rubric prose.  " }] } }] }))
      .mockResolvedValueOnce(Response.json({ promptFeedback: { blockReason: "SAFETY" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateRubric("Grade for correctness.")).resolves.toBe("Legacy rubric prose.");
    await expect(generateRubric("Grade for correctness.")).rejects.toThrow("Gemini returned an empty rubric.");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  describe.each([
    ["rubric generation", (deadlineMs: number) =>
      generateRubric("Grade for correctness.", "gemini", "coding", { deadlineMs })],
    ["repository grading", (deadlineMs: number) =>
      gradeEntries(
        [{ student: "Jane Doe", content: "Sample", mergedFileCount: 1, submittedFiles: [] }],
        "Grade for correctness.", "Correctness (100%): Results", "gemini", null,
        { autoRunCode: false, modelExecution: { deadlineMs } },
      )],
  ] as const)("%s", (_name, run) => {
    it.each([
      ["lost connection", () => Promise.reject(new TypeError("Connection lost"))],
      ["null envelope", () => Promise.resolve(Response.json(null))],
      ["object-valued parts", () => Promise.resolve(Response.json({ candidates: [{ content: { parts: {} } }] }))],
    ] as const)("propagates an unknown model outcome for %s", async (_failure, respond) => {
      vi.stubEnv("GEMINI_API_KEY", "test-key");
      const fetchMock = vi.fn<typeof fetch>(respond);
      vi.stubGlobal("fetch", fetchMock);

      await expect(run(Date.now() + 10_000)).rejects.toBeInstanceOf(LlmOutcomeUnknownError);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
    });
  });
});
