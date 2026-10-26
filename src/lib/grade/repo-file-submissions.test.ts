import { expect, it } from "vitest";
import { repoFilesToSubmittedFiles } from "./repo-file-submissions";
it("preserves structured repository file previews and explicit truncation", () => {
  expect(repoFilesToSubmittedFiles([{ path: "src/MAIN.PY", text: "original", truncated: true }, { path: "README", text: "plain" }])).toEqual([
    { name: "src/MAIN.PY", extension: "py", previewContent: "original", previewTruncated: true, mimeType: "text/plain" },
    { name: "README", extension: "", previewContent: "plain", previewTruncated: false, mimeType: "text/plain" },
  ]);
});