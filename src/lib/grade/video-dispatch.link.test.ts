// VIDEO-GRADING W1, T7 for the extraction.ts link-resolution dispatch site
// (resolveEntryLinksUnsafe): a Drive-linked video is flagged through the
// existing link-note channel, never extracted as a zip. Flag forced ON.
import { describe, it, expect, vi } from "vitest";
import JSZip from "jszip";

vi.mock("./constants", async () => {
  const actual = await vi.importActual<typeof import("./constants")>("./constants");
  return { ...actual, VIDEO_GRADING_ENABLED: true };
});
vi.mock("./repo-content", () => ({ fetchGradableRepoContent: vi.fn() }));
vi.mock("./google-drive-content", () => ({ fetchGoogleDriveFile: vi.fn() }));

import { resolveEntryLinks } from "./extraction";
import { fetchGoogleDriveFile } from "./google-drive-content";
import { VIDEO_LINK_NOTE } from "./video-grading";
import type { StudentSubmissionEntry } from "./types";

const DRIVE_FILE_URL = "https://drive.google.com/file/d/1AbC_dEf-123/view";

describe("resolveEntryLinks - Drive-linked video (flag ON)", () => {
  it("flags the entry with the video note and never reaches JSZip", async () => {
    vi.mocked(fetchGoogleDriveFile).mockResolvedValue({ name: "demo.mp4", buffer: Buffer.from("ftyp") });
    const loadAsync = vi.spyOn(JSZip, "loadAsync");
    const entry: StudentSubmissionEntry = {
      student: "ada",
      content: `Submitted link: ${DRIVE_FILE_URL}`,
      mergedFileCount: 1,
      submittedFiles: [],
      submissionUrl: DRIVE_FILE_URL,
    };
    const out = await resolveEntryLinks(entry);
    expect(out.linkFetch).toBe("flagged");
    expect(out.content).toContain(VIDEO_LINK_NOTE);
    expect(loadAsync).not.toHaveBeenCalled();
    loadAsync.mockRestore();
  });
});
