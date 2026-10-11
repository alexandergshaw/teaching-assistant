// VIDEO-GRADING W3: with the dark flag ON, a video-only student is no longer a
// W1 named skip; it is emitted as an entry and graded at grade time through the
// Files API. (Flag OFF is pinned by ndjson-ingest-parser.video.test.ts.)
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/grade/constants", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/grade/constants")>()),
  VIDEO_GRADING_ENABLED: true,
}));

import { buildIngestLines } from "./ndjson-ingest-parser";
import type { StudentSubmissionEntry } from "./types";

function videoOnly(): StudentSubmissionEntry {
  return {
    student: "Vic",
    content: "[Video file: a.mp4, 0.0MB, mp4]",
    mergedFileCount: 1,
    submittedFiles: [
      {
        name: "a.mp4",
        extension: "mp4",
        previewContent: "",
        previewTruncated: false,
        mimeType: "video/mp4",
        videoRef: { storagePath: "u1/grading-uploads/2f8a4b1e-5c3d-4e6f-8a9b-0c1d2e3f4a5b.mp4", sizeBytes: 5 },
      },
    ],
  };
}

describe("buildIngestLines with VIDEO_GRADING_ENABLED on", () => {
  it("emits a video-only student as an entry, not a skip", () => {
    const lines = buildIngestLines([videoOnly()], []);
    expect(lines[0]).toMatchObject({ type: "entry" });
    expect(lines[lines.length - 1]).toMatchObject({ type: "done", studentsFound: 1, studentsEmitted: 1, skipped: [] });
  });

  it("still skips (named) an oversized entry", () => {
    const lines = buildIngestLines([videoOnly()], [], 1);
    expect(lines[0]).toMatchObject({ type: "skip", student: "Vic" });
  });
});
