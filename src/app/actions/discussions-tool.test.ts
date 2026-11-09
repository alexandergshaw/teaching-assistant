import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), callLlm: vi.fn() }));
vi.mock("@/lib/supabase/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/llm", () => ({ callLlm: mocks.callLlm }));
import { generateDiscussionTemplateAction } from "./discussions-tool";

describe("discussion template action", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.requireUser.mockResolvedValue({ id: "owner" }); });
  it("sends exactly the instructor-edited prompt after authentication", async () => {
    mocks.callLlm.mockResolvedValue({ ok: true, text: "Hello {{name}}, thank you." });
    expect(await generateDiscussionTemplateAction("Edited prompt", "gemini")).toEqual({ template: "Hello {{name}}, thank you." });
    expect(mocks.callLlm).toHaveBeenCalledWith(expect.objectContaining({ contents: [{ role: "user", parts: [{ text: "Edited prompt" }] }], generationConfig: { temperature: 0.5, maxOutputTokens: 2048 } }), "gemini", expect.objectContaining({ deadlineMs: expect.any(Number), maxAttempts: 1, responseByteLimit: 262_144, hardOutputTokenCap: 2048 }));
  });
  it("refuses malformed, oversized, and unsupported-provider input before dispatch", async () => {
    for (const prompt of [null, 12, {}, "x".repeat(32001)]) {
      expect(await generateDiscussionTemplateAction(prompt as string)).toHaveProperty("error");
    }
    for (const provider of ["other", "embedded", "bad", null]) {
      expect(await generateDiscussionTemplateAction("Prompt", provider as "gemini")).toHaveProperty("error");
    }
    expect(mocks.callLlm).not.toHaveBeenCalled();
  });
  it("sets a bounded deadline and returns a generic error for provider failures", async () => {
    const now = Date.now();
    mocks.callLlm.mockResolvedValueOnce({ ok: false, status: 503, body: "private provider detail" });
    expect(await generateDiscussionTemplateAction("Prompt")).toEqual({ error: "Could not generate a template. Try again." });
    const options = mocks.callLlm.mock.calls[0][2];
    expect(options.deadlineMs).toBeGreaterThanOrEqual(now + 45_000);
    expect(options.deadlineMs).toBeLessThanOrEqual(Date.now() + 45_000);
  });
  it("does not dispatch on auth failure or blank input", async () => {
    mocks.requireUser.mockRejectedValueOnce(new Error("no session"));
    expect(await generateDiscussionTemplateAction("test")).toHaveProperty("error");
    expect(await generateDiscussionTemplateAction("  ")).toHaveProperty("error");
    expect(mocks.callLlm).not.toHaveBeenCalled();
  });
});
