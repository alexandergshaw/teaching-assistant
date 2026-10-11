import { describe, it, expect, vi, beforeEach } from "vitest";

// VIDEO-GRADING W2 (ops O-1, T14, part of T11): the grade-run-item entry guard
// accepts a well-formed `videoRef` and REJECTS a video entry that also carries
// rawBase64, a videoRef with extra (client-forged provider) keys, or a
// malformed ref. Auth and the model seam are mocked; nothing dials out.
vi.mock("@/lib/supabase/auth", () => ({
  requireAppOwner: vi.fn(async () => ({ id: "u1", email: "owner@example.com" })),
}));
// The entry guard is independent of the video flag; drive it EXPLICITLY off so
// the positive control reaches the (mocked) model seam instead of the real
// grade-time Storage download (the enabled path is route.videoseam.test.ts).
vi.mock("@/lib/grade/constants", async () => {
  const actual = await vi.importActual<typeof import("@/lib/grade/constants")>("@/lib/grade/constants");
  return { ...actual, VIDEO_GRADING_ENABLED: false };
});
vi.mock("@/lib/grade/engine", () => ({ gradeEntries: vi.fn() }));
vi.mock("@/lib/bounded-race", () => ({ raceWithTimeout: vi.fn() }));
vi.mock("@/lib/grade/extraction", () => ({ resolveEntryLinks: vi.fn(async (entry: unknown) => entry) }));

import { gradeEntries } from "@/lib/grade/engine";
import { raceWithTimeout } from "@/lib/bounded-race";
import { POST } from "./route";
import type { NextRequest } from "next/server";

const mockGrade = vi.mocked(gradeEntries);
const mockRace = vi.mocked(raceWithTimeout);

const REF = { storagePath: "u1/grading-uploads/2f8a4b1e-5c3d-4e6f-8a9b-0c1d2e3f4a5b.mp4", sizeBytes: 123 };

function videoFile(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: "demo.mp4",
    extension: "mp4",
    previewContent: "[Video file: demo.mp4, 0.0MB, mp4]",
    previewTruncated: false,
    mimeType: "video/mp4",
    videoRef: REF,
    ...extra,
  };
}

function request(file: Record<string, unknown>): NextRequest {
  const body = {
    sourceIndex: 0,
    entry: { student: "Alice", content: "c", mergedFileCount: 1, submittedFiles: [file] },
    assignmentInstructions: "do it",
    rubric: "r",
    provider: "gemini",
    pointsPossible: 10,
    commentSplit: false,
    harshness: "balanced",
  };
  return { headers: { get: () => "application/json" }, json: vi.fn(async () => body) } as unknown as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGrade.mockResolvedValue([] as never);
  mockRace.mockImplementation((async (work: Promise<unknown>) => ({ kind: "settled", value: await work })) as never);
});

describe("grade-run-item isSubmittedFileInfo: videoRef", () => {
  it("accepts a well-formed videoRef with no rawBase64 (positive control: it reaches the model seam)", async () => {
    const res = await POST(request(videoFile()));
    expect(res.status).not.toBe(400);
    expect(mockGrade).toHaveBeenCalledTimes(1);
  });

  it("T14: videoRef + rawBase64 together is 400 and never reaches the model seam", async () => {
    const res = await POST(request(videoFile({ rawBase64: "AAAA" })));
    expect(res.status).toBe(400);
    expect(mockGrade).not.toHaveBeenCalled();
  });

  it("an EMPTY-string rawBase64 beside a videoRef is still refused (the key must be absent)", async () => {
    const res = await POST(request(videoFile({ rawBase64: "" })));
    expect(res.status).toBe(400);
    expect(mockGrade).not.toHaveBeenCalled();
  });

  it.each([
    ["a forged fileUri on the ref", { ...REF, fileUri: "https://generativelanguage.googleapis.com/v1beta/files/x" }],
    ["a url on the ref", { ...REF, url: "https://evil.example/v.mp4" }],
    ["a missing sizeBytes", { storagePath: REF.storagePath }],
    ["a non-numeric sizeBytes", { ...REF, sizeBytes: "big" }],
    ["a negative sizeBytes", { ...REF, sizeBytes: -1 }],
    ["a non-finite sizeBytes", { ...REF, sizeBytes: null }],
    ["an empty storagePath", { ...REF, storagePath: "" }],
    ["a non-string storagePath", { ...REF, storagePath: 7 }],
    ["a non-object ref", "u1/grading-uploads/x.mp4"],
    ["a null ref", null],
  ])("rejects %s", async (_label, videoRef) => {
    const res = await POST(request(videoFile({ videoRef })));
    expect(res.status).toBe(400);
    expect(mockGrade).not.toHaveBeenCalled();
  });

  it("a file WITHOUT videoRef is judged exactly as before (rawBase64 still allowed)", async () => {
    const image = { name: "a.png", extension: "png", previewContent: "[Image file: a.png]", previewTruncated: false, rawBase64: "AAAA", mimeType: "image/png" };
    const res = await POST(request(image));
    expect(res.status).not.toBe(400);
  });
});
