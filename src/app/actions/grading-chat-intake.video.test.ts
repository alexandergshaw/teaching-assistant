// VIDEO-GRADING W1, T7 (ops section 11): with the dark flag ON, a video that
// reaches the grading-chat dispatch lands on a DEFINED handler and never falls
// into the zip branch (where JSZip would throw on mp4 bytes). The flag is
// forced ON for this whole file by mocking the constants module.
import { describe, it, expect, vi, beforeEach } from "vitest";
import JSZip from "jszip";

vi.mock("@/lib/supabase/auth", () => ({
  requireAppOwner: vi.fn().mockResolvedValue({ id: "owner-1", email: "owner@example.com" }),
  requireUser: vi.fn().mockRejectedValue(new Error("requireUser should never be called by this action")),
}));

vi.mock("@/lib/grade/constants", async () => {
  const actual = await vi.importActual<typeof import("@/lib/grade/constants")>("@/lib/grade/constants");
  return { ...actual, VIDEO_GRADING_ENABLED: true };
});

vi.mock("@/lib/grade/extraction", () => ({
  ingestZipEntries: vi.fn(),
  extractStudentEntries: vi.fn(),
  extractCanvasEntries: vi.fn(),
}));
vi.mock("@/lib/grade/repo-content", () => ({ fetchGradableRepoContent: vi.fn() }));
vi.mock("@/lib/canvas-url", () => ({ detectCanvasUrlKind: vi.fn().mockReturnValue(null) }));
vi.mock("@/lib/grade/google-drive-content", () => ({ fetchGoogleDriveFile: vi.fn() }));

import { ingestZipEntries, extractStudentEntries } from "@/lib/grade/extraction";
import { fetchGoogleDriveFile } from "@/lib/grade/google-drive-content";
import { prepareChatSubmissionAction, prepareCompositeSubmissionAction } from "./grading-chat-intake";
import {
  VIDEO_DRIVE_MESSAGE,
  VIDEO_PENDING_MESSAGE,
  VIDEO_UNSUPPORTED_FORMAT_MESSAGE,
} from "@/lib/grade/video-grading";

const mockFetchDrive = vi.mocked(fetchGoogleDriveFile);

/** A valid ISO BMFF head: size 24, "ftyp", brand "isom", padded. */
function mp4Bytes(): Uint8Array {
  const out = new Uint8Array(64);
  out.set([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
  return out;
}

function fileForm(file: File): FormData {
  const fd = new FormData();
  fd.set("kind", "file");
  fd.set("file", file);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveOnePart kind file - video (flag ON)", () => {
  it("a valid mp4 is received-not-graded, never reaches JSZip or the zip ingest", async () => {
    const loadAsync = vi.spyOn(JSZip, "loadAsync");
    const outcome = await prepareChatSubmissionAction(
      fileForm(new File([mp4Bytes() as BlobPart], "walkthrough.mp4", { type: "video/mp4" }))
    );
    expect(outcome).toEqual({ kind: "refused", reason: VIDEO_PENDING_MESSAGE });
    expect(loadAsync).not.toHaveBeenCalled();
    expect(vi.mocked(ingestZipEntries)).not.toHaveBeenCalled();
    expect(vi.mocked(extractStudentEntries)).not.toHaveBeenCalled();
    loadAsync.mockRestore();
  });

  it("bytes decide: a zip renamed .mp4 is an unsupported format, not a zip", async () => {
    const loadAsync = vi.spyOn(JSZip, "loadAsync");
    const zipBytes = new Uint8Array(64);
    zipBytes.set([0x50, 0x4b, 0x03, 0x04]);
    const outcome = await prepareChatSubmissionAction(
      fileForm(new File([zipBytes as BlobPart], "fake.mp4", { type: "video/mp4" }))
    );
    expect(outcome).toEqual({ kind: "refused", reason: VIDEO_UNSUPPORTED_FORMAT_MESSAGE });
    expect(loadAsync).not.toHaveBeenCalled();
    expect(vi.mocked(ingestZipEntries)).not.toHaveBeenCalled();
    loadAsync.mockRestore();
  });

  it("the File.type header never decides: a valid mp4 labelled text/plain is still a video", async () => {
    const outcome = await prepareChatSubmissionAction(
      fileForm(new File([mp4Bytes() as BlobPart], "clip.mp4", { type: "text/plain" }))
    );
    expect(outcome).toEqual({ kind: "refused", reason: VIDEO_PENDING_MESSAGE });
  });

  it("a composite with a video part is refused through the same sink (nothing graded)", async () => {
    const fd = new FormData();
    fd.set("student", "Ada");
    fd.set("partCount", "1");
    fd.set("part.0.kind", "file");
    fd.set("part.0.file", new File([mp4Bytes() as BlobPart], "clip.mp4", { type: "video/mp4" }));
    const outcome = await prepareCompositeSubmissionAction(fd);
    expect(outcome).toEqual({ kind: "refused", reason: VIDEO_PENDING_MESSAGE });
  });

  it("a Google Drive link to a video is refused with the Drive wording, never extracted", async () => {
    mockFetchDrive.mockResolvedValue({ name: "recording.mp4", buffer: Buffer.from(mp4Bytes()) });
    const fd = new FormData();
    fd.set("kind", "url");
    fd.set("url", "https://drive.google.com/file/d/1AbC_dEf-123/view");
    const outcome = await prepareChatSubmissionAction(fd);
    expect(outcome).toEqual({ kind: "refused", reason: VIDEO_DRIVE_MESSAGE });
    expect(vi.mocked(extractStudentEntries)).not.toHaveBeenCalled();
  });
});
