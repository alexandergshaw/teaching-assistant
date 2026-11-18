import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("./repo-content", () => ({ fetchGradableRepoContent: vi.fn(async () => ({ repo: "owner/repo", ref: "a".repeat(40), content: "source", fileCount: 1, files: [{ path: "work.py", text: "source" }] })) }));
import { isExactNotebookRepositoryEntry } from "./notebook-single-source";
const url = "https://github.com/owner/repo", sha = "a".repeat(40);
const entry = { student: "Student", submissionUrl: url, content: "Part 1 - owner/repo:\n\nsource", mergedFileCount: 1, submittedFiles: [{ name: "work.py", extension: "py", previewContent: "source", previewTruncated: false, mimeType: "text/plain" }] };
it("accepts the exact reconstructed one-part entry", async () => { expect(await isExactNotebookRepositoryEntry(entry, url, sha)).toBe(true); });
it("refuses companion text and files", async () => {
  expect(await isExactNotebookRepositoryEntry({ ...entry, content: `${entry.content}\n\nextra` }, url, sha)).toBe(false);
  expect(await isExactNotebookRepositoryEntry({ ...entry, submittedFiles: [...entry.submittedFiles, { name: "extra.txt" }] }, url, sha)).toBe(false);
});
