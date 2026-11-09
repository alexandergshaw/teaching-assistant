import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/supabase/auth", () => ({ requireUser: vi.fn() }));
vi.mock("@/app/actions/live-class", () => ({ transcribeLiveAudioAction: vi.fn() }));
import { requireUser } from "@/lib/supabase/auth";
import { transcribeLiveAudioAction } from "@/app/actions/live-class";
import { POST } from "./route";

function request(body: unknown) { return new Request("http://localhost/api/recording-transcription", { method: "POST", body: JSON.stringify(body) }); }
beforeEach(() => { vi.resetAllMocks(); vi.mocked(requireUser).mockResolvedValue({ id: "user" } as never); });
describe("recording transcription JSON transport", () => {
  it("forwards a payload above React's action-array limit intact", async () => {
    const audio = "a".repeat(1_100_000);
    vi.mocked(transcribeLiveAudioAction).mockResolvedValue({ text: "spoken words" });
    const response = await POST(request({ audio, provider: "gemini" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ text: "spoken words" });
    expect(transcribeLiveAudioAction).toHaveBeenCalledWith(audio, { provider: "gemini" });
  });
  it("refuses unauthenticated and malformed requests before transcription", async () => {
    vi.mocked(requireUser).mockRejectedValueOnce(new Error("no session"));
    expect((await POST(request({ audio: "abc", provider: "gemini" }))).status).toBe(401);
    expect((await POST(request({ audio: 4, provider: "gemini" }))).status).toBe(400);
    expect((await POST(request({ audio: "abc", provider: "unknown" }))).status).toBe(400);
    expect(transcribeLiveAudioAction).not.toHaveBeenCalled();
  });
  it("refuses over-budget audio and reports unexpected server failures", async () => {
    expect((await POST(request({ audio: "a".repeat(3_670_017), provider: "gemini" }))).status).toBe(413);
    vi.mocked(transcribeLiveAudioAction).mockRejectedValueOnce(new Error("sensitive"));
    const response = await POST(request({ audio: "abc", provider: "gemini" }));
    expect(response.status).toBe(502);
    expect(JSON.stringify(await response.json())).not.toContain("sensitive");
  });
});
