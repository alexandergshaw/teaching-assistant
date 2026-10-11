import { describe, it, expect, vi, beforeEach } from "vitest";

// VIDEO-GRADING W3 (ops T11 + the cleanup-on-deadline wiring): the grade-run-item
// route with the dark flag forced ON. Auth, Storage, the Files client and the
// model seam are all mocked; nothing dials out. The flag-OFF behaviour is pinned
// by route.videoref.test.ts (which runs against the real, false constant).
vi.mock("@/lib/supabase/auth", () => ({
  requireAppOwner: vi.fn(async () => ({ id: "u1", email: "owner@example.com" })),
}));
vi.mock("@/lib/grade/constants", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/grade/constants")>()),
  VIDEO_GRADING_ENABLED: true,
}));
vi.mock("@/lib/grade/engine", () => ({ gradeEntries: vi.fn() }));
vi.mock("@/lib/bounded-race", () => ({ raceWithTimeout: vi.fn() }));
vi.mock("@/lib/grade/extraction", () => ({ resolveEntryLinks: vi.fn(async (entry: unknown) => entry) }));
vi.mock("@/lib/supabase/storage", () => ({ downloadFile: vi.fn(), removeFiles: vi.fn(async () => ({ error: null })) }));
vi.mock("@/lib/gemini", () => ({ getGeminiApiKey: () => "test-key" }));
vi.mock("@/lib/gemini-files", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/gemini-files")>()),
  createGeminiFilesClient: vi.fn(),
}));

import { gradeEntries } from "@/lib/grade/engine";
import { raceWithTimeout } from "@/lib/bounded-race";
import { downloadFile, removeFiles } from "@/lib/supabase/storage";
import { createGeminiFilesClient } from "@/lib/gemini-files";
import { POST } from "./route";
import type { NextRequest } from "next/server";

const mockGrade = vi.mocked(gradeEntries);
const mockRace = vi.mocked(raceWithTimeout);
const mockDownload = vi.mocked(downloadFile);
const mockRemove = vi.mocked(removeFiles);
const mockClientFactory = vi.mocked(createGeminiFilesClient);

const OWN = "u1/grading-uploads/2f8a4b1e-5c3d-4e6f-8a9b-0c1d2e3f4a5b.mp4";
const FOREIGN = "u2/grading-uploads/2f8a4b1e-5c3d-4e6f-8a9b-0c1d2e3f4a5b.mp4";
const URI = "https://generativelanguage.googleapis.com/v1beta/files/r-1";
const MP4 = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 2, 0, 0x69, 0x73, 0x6f, 0x6d, 0x6d, 0x70, 0x34, 0x31, 1, 2, 3]);

function request(storagePath: string): NextRequest {
  const body = {
    sourceIndex: 0,
    entry: {
      student: "Alice",
      content: "c",
      mergedFileCount: 1,
      submittedFiles: [
        {
          name: "demo.mp4",
          extension: "mp4",
          previewContent: "[Video file: demo.mp4]",
          previewTruncated: false,
          mimeType: "video/mp4",
          videoRef: { storagePath, sizeBytes: MP4.byteLength },
        },
      ],
    },
    assignmentInstructions: "do it",
    rubric: "r",
    provider: "gemini",
    pointsPossible: 10,
    commentSplit: false,
    harshness: "balanced",
  };
  return { headers: { get: () => "application/json" }, json: vi.fn(async () => body) } as unknown as NextRequest;
}

function fakeFiles() {
  const client = {
    upload: vi.fn(async () => ({ name: "files/r-1", uri: URI })),
    waitActive: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
  };
  mockClientFactory.mockReturnValue(client);
  return client;
}

function storageHas(path: string): void {
  mockDownload.mockImplementation((async (_bucket: string, p: string) =>
    p === path
      ? { data: { size: MP4.byteLength, arrayBuffer: async () => MP4.buffer.slice(0) }, error: null }
      : { data: null, error: { message: "nope" } }) as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRace.mockImplementation((async (work: Promise<unknown>) => ({ kind: "settled", value: await work })) as never);
});

describe("grade-run-item with VIDEO_GRADING_ENABLED forced on", () => {
  it("T11: a foreign-user videoRef is a 400 and Storage, the Files client and the model are never touched", async () => {
    const files = fakeFiles();
    storageHas(FOREIGN);
    const res = await POST(request(FOREIGN));
    expect(res.status).toBe(400);
    expect(mockDownload).not.toHaveBeenCalled();
    expect(files.upload).not.toHaveBeenCalled();
    expect(mockGrade).not.toHaveBeenCalled();
  });

  it("an owned videoRef reaches the model as a Files API attachment, and the Files object is deleted", async () => {
    const files = fakeFiles();
    storageHas(OWN);
    mockGrade.mockResolvedValue({ results: [{ student: "Alice" }] } as never);
    const res = await POST(request(OWN));
    expect(res.status).toBe(200);
    expect(files.upload).toHaveBeenCalledTimes(1);
    expect(mockGrade).toHaveBeenCalledTimes(1);
    const options = mockGrade.mock.calls[0][5];
    expect(options?.extraAttachments).toEqual([{ name: "demo.mp4", fileUri: URI, mimeType: "video/mp4" }]);
    expect(files.delete).toHaveBeenCalledWith("files/r-1");
    expect(mockRemove).toHaveBeenCalledTimes(1);
  });

  it("a non-video body behind a video path is a typed 422 and the model is never called", async () => {
    const files = fakeFiles();
    mockDownload.mockResolvedValue({
      data: { size: 20, arrayBuffer: async () => new TextEncoder().encode("plain text, not video").buffer },
      error: null,
    } as never);
    const res = await POST(request(OWN));
    expect(res.status).toBe(422);
    expect(((await res.json()) as { videoFailure: string }).videoFailure).toBe("unsupported format");
    expect(files.upload).not.toHaveBeenCalled();
    expect(mockGrade).not.toHaveBeenCalled();
  });

  it("when the route's own deadline wins, it aborts and the uploaded file is deleted without waiting for the model", async () => {
    const files = fakeFiles();
    storageHas(OWN);
    mockGrade.mockImplementation(() => new Promise(() => undefined));
    mockRace.mockImplementation((async (work: Promise<unknown>) => {
      void work.catch(() => undefined);
      // let download + upload + ACTIVE resolve and the model call start
      await new Promise((r) => setTimeout(r, 20));
      return { kind: "timedout" };
    }) as never);
    const res = await POST(request(OWN));
    expect(res.status).toBe(504);
    await new Promise((r) => setTimeout(r, 20));
    expect(files.upload).toHaveBeenCalledTimes(1);
    expect(files.delete).toHaveBeenCalledWith("files/r-1");
  });
});
