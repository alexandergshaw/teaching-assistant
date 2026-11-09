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
    expect(mocks.callLlm).toHaveBeenCalledWith(expect.objectContaining({ contents: [{ role: "user", parts: [{ text: "Edited prompt" }] }] }), "gemini");
  });
  it("does not dispatch on auth failure or blank input", async () => {
    mocks.requireUser.mockRejectedValueOnce(new Error("no session"));
    expect(await generateDiscussionTemplateAction("test")).toHaveProperty("error");
    expect(await generateDiscussionTemplateAction("  ")).toHaveProperty("error");
    expect(mocks.callLlm).not.toHaveBeenCalled();
  });
});
