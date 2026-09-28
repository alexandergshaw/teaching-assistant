import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// generateAnnouncementImageAction calls requireOwner() (auth) and
// generateGeminiImage() (network) - both mocked so the action's own
// validation/error-formatting logic runs for real without hitting Supabase
// or Gemini. describeLlmFailure/describeEmptyLlmImage are kept as the REAL
// implementations (vi.importActual) since the whole point of these tests is
// proving the action wires generateGeminiImage's result into the exact
// message those two functions would produce - a mocked formatter would hide
// a wiring bug (e.g. swapped label, wrong function called) behind a fake
// passthrough.
vi.mock("@/lib/supabase/auth", () => ({
  requireOwner: vi.fn().mockResolvedValue({ id: "owner-1", email: "owner@example.com" }),
}));

vi.mock("@/lib/llm", async () => {
  const actual = await vi.importActual<typeof import("@/lib/llm")>("@/lib/llm");
  return {
    ...actual,
    generateGeminiImage: vi.fn(),
  };
});

// The nine landed assertions below (I-4) run against the REAL raceWithTimeout
// (vi.fn(actual.raceWithTimeout) below delegates to it by default) - that is
// what makes them the enforcer of the {kind:"failed"} translation (two of
// them rely on a generateGeminiImage REJECTION reaching the outer catch).
// Only the I-1/I-3 describe blocks further down override the implementation,
// and each one restores it in its own afterEach.
vi.mock("@/lib/bounded-race", async () => {
  const actual = await vi.importActual<typeof import("@/lib/bounded-race")>("@/lib/bounded-race");
  return { raceWithTimeout: vi.fn(actual.raceWithTimeout) };
});

import { generateGeminiImage } from "@/lib/llm";
import { requireOwner } from "@/lib/supabase/auth";
import { raceWithTimeout } from "@/lib/bounded-race";
import { generateAnnouncementImageAction } from "./announcement-image";

async function restoreRealRaceWithTimeout(): Promise<void> {
  const actual = await vi.importActual<typeof import("@/lib/bounded-race")>("@/lib/bounded-race");
  vi.mocked(raceWithTimeout).mockImplementation(actual.raceWithTimeout);
}

describe("generateAnnouncementImageAction", () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    vi.mocked(requireOwner).mockResolvedValue({ id: "owner-1", email: "owner@example.com" });
    await restoreRealRaceWithTimeout();
  });

  it("rejects an empty prompt without ever calling generateGeminiImage", async () => {
    const result = await generateAnnouncementImageAction("   ");
    expect(result).toEqual({
      error: "Draft the announcement text first - the image is generated from its content.",
    });
    expect(generateGeminiImage).not.toHaveBeenCalled();
  });

  it("returns the image on success, passing the prompt through unchanged", async () => {
    vi.mocked(generateGeminiImage).mockResolvedValue({
      ok: true,
      base64: "ZmFrZS1pbWFnZQ==",
      mimeType: "image/png",
    });

    const result = await generateAnnouncementImageAction("draw a simple illustration of a library");

    expect(generateGeminiImage).toHaveBeenCalledWith("draw a simple illustration of a library");
    expect(result).toEqual({ base64: "ZmFrZS1pbWFnZQ==", mimeType: "image/png" });
  });

  it("formats an HTTP failure via describeLlmFailure (real implementation, not mocked)", async () => {
    vi.mocked(generateGeminiImage).mockResolvedValue({ ok: false, status: 429, body: "Quota exceeded" });

    const result = await generateAnnouncementImageAction("a prompt");
    expect(result).toEqual({ error: "Image generation failed: HTTP 429 — Quota exceeded" });
  });

  it("formats a network failure (status 0) via describeLlmFailure's network-error wording", async () => {
    vi.mocked(generateGeminiImage).mockResolvedValue({ ok: false, status: 0, body: "fetch failed" });

    const result = await generateAnnouncementImageAction("a prompt");
    expect(result).toEqual({ error: "Image generation failed: network error — fetch failed" });
  });

  it("formats a refusal (ok:true, base64:null) via describeEmptyLlmImage, surfacing the model's own text", async () => {
    vi.mocked(generateGeminiImage).mockResolvedValue({
      ok: true,
      base64: null,
      text: "I can't create an image of a real, identifiable person.",
    });

    const result = await generateAnnouncementImageAction("a photo of my professor");
    expect(result).toEqual({
      error:
        'Image generation failed: the model did not return an image - it said: "I can\'t create an image of a real, identifiable person."',
    });
  });

  it("formats a refusal with no text via describeEmptyLlmImage's finishReason fallback", async () => {
    vi.mocked(generateGeminiImage).mockResolvedValue({ ok: true, base64: null, text: "", finishReason: "SAFETY" });

    const result = await generateAnnouncementImageAction("a prompt");
    expect(result).toEqual({
      error: "Image generation failed: the model did not return an image (finishReason: SAFETY).",
    });
  });

  it("converts a requireOwner rejection into an error result, never a thrown exception (unauthenticated)", async () => {
    vi.mocked(requireOwner).mockRejectedValueOnce(new Error("not signed in"));

    const result = await generateAnnouncementImageAction("a prompt");
    expect(result).toEqual({ error: "not signed in" });
    expect(generateGeminiImage).not.toHaveBeenCalled();
  });

  it("converts a generateGeminiImage rejection (e.g. missing GEMINI_API_KEY) into an error result, never a thrown exception", async () => {
    vi.mocked(generateGeminiImage).mockRejectedValue(new Error("Missing environment variable: GEMINI_API_KEY"));

    const result = await generateAnnouncementImageAction("a prompt");
    expect(result).toEqual({ error: "Missing environment variable: GEMINI_API_KEY" });
  });

  it("falls back to a generic message when a thrown value is not an Error instance", async () => {
    vi.mocked(generateGeminiImage).mockRejectedValue("a raw string, not an Error");

    const result = await generateAnnouncementImageAction("a prompt");
    expect(result).toEqual({ error: "Could not generate an image for this announcement." });
  });
});

// I-1/I-2 (RULING 76): the wait passed to raceWithTimeout is a function of
// how much of the wall-clock budget the auth preamble already spent, never a
// fixed literal - and it is read BEFORE requireOwner() runs, so the
// preamble's own latency counts against it. Both are observed the same way:
// raceWithTimeout is mocked so its second positional argument (the emitted
// wait) can be read straight off mock.calls, while a stubbed Date.now lets
// each test control how much time the mocked requireOwner() appears to
// spend. generateGeminiImage must also be mocked to a never-settling promise
// here - raceWithTimeout(generateGeminiImage(prompt), waitMs) evaluates the
// inner call eagerly, and an unmocked one would hit vitest.setup.ts's
// throwing fetch stub.
describe("I-1/I-2: the emitted wait is a function of the preamble's elapsed time, read before requireOwner() runs", () => {
  let nowMs = 1_000_000;
  let dateNowSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetAllMocks();
    nowMs = 1_000_000;
    dateNowSpy = vi.spyOn(Date, "now").mockImplementation(() => nowMs);
    vi.mocked(raceWithTimeout).mockResolvedValue({ kind: "timedout" });
    vi.mocked(generateGeminiImage).mockImplementation(() => new Promise(() => {}));
  });

  afterEach(() => {
    dateNowSpy.mockRestore();
  });

  async function runWithPreambleElapsed(preambleElapsedMs: number): Promise<void> {
    vi.mocked(requireOwner).mockImplementation(async () => {
      nowMs += preambleElapsedMs;
      return { id: "owner-1", email: "owner@example.com" };
    });
    await generateAnnouncementImageAction("a prompt");
  }

  // RULING 77's four constants, substituted into
  // waitMs(e) = min(24_000, max(8_000, 48_000 - e)): R1 (at/above the MAX
  // clamp), R3 (the linear, discriminating region below the clamp), R5 (the
  // MIN clamp active), R6 (the remainder negative, MIN floor still holds).
  // Hand-written decimal literals, not read from the implementation - the
  // implementation cannot export them for the test to read (see the module
  // header comment on announcement-image.ts).
  const rows: Array<{ preambleElapsedMs: number; expectedWaitMs: number }> = [
    { preambleElapsedMs: 0, expectedWaitMs: 24_000 },
    { preambleElapsedMs: 30_000, expectedWaitMs: 18_000 },
    { preambleElapsedMs: 42_000, expectedWaitMs: 8_000 },
    { preambleElapsedMs: 60_000, expectedWaitMs: 8_000 },
  ];

  it.each(rows)(
    "preamble elapsed $preambleElapsedMs ms emits a raceWithTimeout wait of $expectedWaitMs ms",
    async ({ preambleElapsedMs, expectedWaitMs }) => {
      await runWithPreambleElapsed(preambleElapsedMs);
      expect(raceWithTimeout).toHaveBeenCalledTimes(1);
      expect(vi.mocked(raceWithTimeout).mock.calls[0][1]).toBe(expectedWaitMs);
    }
  );

  it("emits a different wait at preamble 0 than at preamble 30_000 - the wait is a function of elapsed time, not a constant", async () => {
    await runWithPreambleElapsed(0);
    const first = vi.mocked(raceWithTimeout).mock.calls[0][1];

    vi.mocked(raceWithTimeout).mockClear();
    nowMs = 1_000_000;
    await runWithPreambleElapsed(30_000);
    const second = vi.mocked(raceWithTimeout).mock.calls[0][1];

    expect({ first, second }).toEqual({ first: 24_000, second: 18_000 });
  });
});

// I-3 (RULING 75/94): the wait bounds this action's own patience, not the
// underlying generateGeminiImage call - losing the race must translate to a
// specific, worded {error}, never a thrown exception or the generic catch
// message.
describe("I-3: the timeout branch returns the frozen timeout wording", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(requireOwner).mockResolvedValue({ id: "owner-1", email: "owner@example.com" });
    vi.mocked(raceWithTimeout).mockResolvedValue({ kind: "timedout" });
    vi.mocked(generateGeminiImage).mockImplementation(() => new Promise(() => {}));
  });

  it("resolves to the frozen timeout message when raceWithTimeout reports timedout", async () => {
    const result = await generateAnnouncementImageAction("a prompt");
    expect(result).toEqual({
      error: "Image generation timed out. The announcement text is unaffected - try the image again.",
    });
  });
});
