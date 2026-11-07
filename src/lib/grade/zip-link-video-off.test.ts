import { describe, expect, it, vi } from "vitest";
import JSZip from "jszip";

vi.mock("./constants", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./constants")>()),
  VIDEO_GRADING_ENABLED: false,
}));
vi.mock("./google-drive-content", () => ({ fetchGoogleDriveFile: vi.fn() }));
vi.mock("./repo-content", () => ({ fetchGradableRepoContent: vi.fn() }));

import { fetchGoogleDriveFile } from "./google-drive-content";
import { resolveEntryLinks } from "./extraction";

describe("linked Drive archives with video grading disabled", () => {
  it("still marks an unstaged video as unavailable rather than complete", async () => {
    const zip = new JSZip();
    zip.file("ada_1_2_work.txt", "Readable work");
    zip.file("ada_1_2_clip.mp4", "not decoded as video");
    vi.mocked(fetchGoogleDriveFile).mockResolvedValue({ name: "work.zip", buffer: Buffer.from(await zip.generateAsync({ type: "arraybuffer" })) });
    const result = await resolveEntryLinks({
      student: "Ada", content: "Submitted link", mergedFileCount: 0, submittedFiles: [],
      submissionUrl: "https://drive.google.com/file/d/1AbC_dEf-123/view",
    });
    expect(result.linkFetch).toBe("flagged");
    expect(result.repoReadNote).toContain("video file(s) that were not available for grading");
    expect(result.content).toContain("Readable work");
    expect(result.submittedFiles.find((file) => file.extension === "mp4")?.videoRef).toBeUndefined();
  });
});
