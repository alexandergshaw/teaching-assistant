import { expect, it } from "vitest";
import { repoFilesToSubmittedFiles } from "./repo-file-submissions";
it("preserves structured repository file previews and explicit truncation", () => {
  expect(repoFilesToSubmittedFiles([{ path: "src/MAIN.PY", text: "original", truncated: true }, { path: "README", text: "plain" }])).toEqual([
    { name: "src/MAIN.PY", extension: "py", previewContent: "original", previewTruncated: true, mimeType: "text/plain" },
    { name: "README", extension: "", previewContent: "plain", previewTruncated: false, mimeType: "text/plain" },
  ]);
});
it("a dotted parent directory does not invent an extension for a required extensionless file", () => {
  const files = repoFilesToSubmittedFiles([{ path: "project.v2/REQUIRED", text: "" }, { path: "project.v2/.env", text: "" }]);
  expect(files.map((file) => [file.name, file.extension])).toEqual([["project.v2/REQUIRED", ""], ["project.v2/.env", ""]]);
});
