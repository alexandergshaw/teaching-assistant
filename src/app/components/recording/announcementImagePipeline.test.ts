import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// generateAnnouncementImageAction is the only thing mocked - generateImage
// (the REAL module) is driven directly, confirming it is node-testable with
// no component ever rendered (docs/g5-test-notes.md E6). buildAnnouncementImagePrompt
// is left as the real implementation: it is a pure leaf and mocking it would
// hide a wiring bug in what prompt actually reaches the action.
vi.mock("@/app/actions/announcement-image", () => ({
  generateAnnouncementImageAction: vi.fn(),
}));

import { generateAnnouncementImageAction } from "@/app/actions/announcement-image";
import { generateImage, CLIENT_PATIENCE_MS, type AnnouncementImageDeps } from "./announcementImagePipeline";

function makeDeps(overrides: Partial<AnnouncementImageDeps> = {}): {
  deps: AnnouncementImageDeps;
  calls: { setImageState: unknown[]; setImageBase64: unknown[]; setImageMimeType: unknown[]; setImageError: unknown[] };
} {
  const calls = {
    setImageState: [] as unknown[],
    setImageBase64: [] as unknown[],
    setImageMimeType: [] as unknown[],
    setImageError: [] as unknown[],
  };
  const deps: AnnouncementImageDeps = {
    subject: "Midterm reminder",
    body: "The midterm is Friday.",
    imageBase64: null,
    imageMimeType: null,
    setImageState: (v) => calls.setImageState.push(v),
    setImageBase64: (v) => calls.setImageBase64.push(v),
    setImageMimeType: (v) => calls.setImageMimeType.push(v),
    setImageError: (v) => calls.setImageError.push(v),
    setLogImageAttempts: () => {},
    autoImageAttemptedRef: { current: false },
    ...overrides,
  };
  return { deps, calls };
}

describe("O-1: CLIENT_PATIENCE_MS is the frozen constant", () => {
  // DOES NOT DISCRIMINATE (docs/g5-test-notes.md section 6): measured GREEN
  // on the unwrapped shape too. A constant can exist, be exported, be
  // asserted, and be used by nothing - it earns its place only paired with
  // O-2 and the wiring file's W-2 outer arm, which prove it is actually the
  // value raceWithTimeout is called with.
  it("is exactly 30_000", () => {
    expect(CLIENT_PATIENCE_MS).toBe(30_000);
  });
});

describe("O-2: the outer bound fires at CLIENT_PATIENCE_MS, and not before", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("has not settled at 29_999 ms and has settled by 30_000 ms, landing in the frozen failed state", async () => {
    vi.mocked(generateAnnouncementImageAction).mockImplementation(() => new Promise(() => {}));
    const { deps, calls } = makeDeps();

    let settled = false;
    const done = generateImage(deps).then(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(29_999);
    expect(settled).toBe(false);
    expect(calls.setImageState).not.toContain("failed");
    expect(calls.setImageState).not.toContain("ready");

    await vi.advanceTimersByTimeAsync(1);
    await done;

    expect(settled).toBe(true);
    expect(calls.setImageState).toEqual(["generating", "failed"]);
    expect(calls.setImageError).toEqual([
      null,
      "The image request timed out before the server answered. The announcement text is unaffected - try the image again.",
    ]);
    expect(calls.setImageBase64).toEqual([null]);
    expect(calls.setImageMimeType).toEqual([null]);
  });
});

describe("O-3: a fast success and an {error} result are unchanged", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // DOES NOT DISCRIMINATE (docs/g5-test-notes.md section 6): both cases here
  // measured GREEN on the unwrapped shape too. Regression guards on the two
  // paths that exist today, correctly, and nothing more.
  it("a fast success reaches ready with the returned image", async () => {
    vi.mocked(generateAnnouncementImageAction).mockResolvedValue({
      base64: "ZmFrZS1pbWFnZQ==",
      mimeType: "image/png",
    });
    const { deps, calls } = makeDeps();

    await generateImage(deps);

    expect(calls.setImageState).toEqual(["generating", "ready"]);
    expect(calls.setImageBase64).toEqual(["ZmFrZS1pbWFnZQ=="]);
    expect(calls.setImageMimeType).toEqual(["image/png"]);
    expect(calls.setImageError).toEqual([null]);
  });

  it("a fast {error} result reaches failed with the action's own message, verbatim", async () => {
    vi.mocked(generateAnnouncementImageAction).mockResolvedValue({
      error: "Image generation failed: HTTP 429 - Quota exceeded",
    });
    const { deps, calls } = makeDeps();

    await generateImage(deps);

    expect(calls.setImageState).toEqual(["generating", "failed"]);
    expect(calls.setImageError).toEqual([null, "Image generation failed: HTTP 429 - Quota exceeded"]);
    expect(calls.setImageBase64).toEqual([null]);
    expect(calls.setImageMimeType).toEqual([null]);
  });
});
