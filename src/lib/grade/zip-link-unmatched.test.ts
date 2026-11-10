import { describe, expect, it, vi } from "vitest";
import JSZip from "jszip";

// Simulate the existing disambiguation path that changes a grouped display
// after link keys were derived, without replacing the real ZIP extraction.
vi.mock("./utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./utils")>();
  return {
    ...actual,
    groupSubmissionsByStudent: (...args: Parameters<typeof actual.groupSubmissionsByStudent>) =>
      actual.groupSubmissionsByStudent(...args).map((entry) => ({ ...entry, student: `${entry.student} (2)` })),
  };
});

import { ingestZipEntries } from "./extraction";

describe("deferred ZIP link attribution", () => {
  it("flags a real extracted Canvas link whose student was relabelled", async () => {
    const zip = new JSZip();
    zip.file("ada_1_2_link.html", '<meta http-equiv="refresh" content="0; url=https://docs.google.com/document/d/example123/edit"><p>This submission was a url</p>');
    const { entries } = await ingestZipEntries(await zip.generateAsync({ type: "arraybuffer" }), { deferLinks: true });
    expect(entries).toHaveLength(1);
    expect(entries[0].content).toContain("Submitted link:");
    expect(entries[0].submissionUrl).toBeUndefined();
    expect(entries[0].linkFetch).toBe("flagged");
    expect(entries[0].repoReadNote).toContain("could not be matched");
  });
});
