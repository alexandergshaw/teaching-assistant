// Wiring guards for F2 and F3
// (docs/grading-results-file-viewer-acceptance-criteria.md).
//
// Both defects are invisible to a normal unit test of gradeRepoAction /
// gradeReposAction: these are "use server" action files with heavy runtime
// dependencies (requireOwner -> Supabase auth, ingestRepo -> live GitHub
// fetches, gradeEntries -> an LLM call), and nothing in this repo imports
// them directly in a test today - the actions/ folder's own precedent
// (syllabusUploadTransport.wiring.test.ts, taskCellAttachments.wiring.test.ts)
// is to prove wiring by reading source text rather than executing the action.
// The underlying FACTS these guards depend on - that ingestRepo computes a
// real per-file `truncated` flag, and that repoDigestToEmbeddedEntry turns a
// non-empty digest into a non-empty submittedFiles array - are exercised
// directly (no mocking needed) in github.digest.test.ts.
//
// F2: gradeRepoAction (github-repos.ts) and gradeReposAction (github.ts) both
// used to build their LLM-path entry/entries with a hardcoded
// `submittedFiles: []`, so a repo-graded row had nothing to preview even once
// the Preview button worked (F1). Both must now reuse
// repoDigestToEmbeddedEntry - the SAME conversion the embedded-provider path
// a few lines above already performs - rather than a second, empty-producing
// mapper.
//
// F3: that same repoDigestToEmbeddedEntry used to hardcode
// `previewTruncated: false` for every file, on both the embedded and (once F2
// lands) the LLM path - suppressing the truncation notice on exactly the
// files that were cut. It must read `file.truncated` instead.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

function readSource(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}

const GITHUB_REPOS = readSource("src/app/actions/github-repos.ts");
const GITHUB = readSource("src/app/actions/github.ts");

describe("F3: previewTruncated is read from the computed fact, never hardcoded false", () => {
  it("canary: the regressed literal is detected by a simple substring check", () => {
    const buggy = "previewContent: file.content,\n      previewTruncated: false,\n      mimeType: \"text/plain\",";
    expect(buggy).toContain("previewTruncated: false");
  });

  it("canary: the fixed literal is NOT detected as the bug", () => {
    const fixed = "previewContent: file.content,\n      previewTruncated: file.truncated,\n      mimeType: \"text/plain\",";
    expect(fixed).not.toContain("previewTruncated: false");
  });

  it("github-repos.ts's repoDigestToEmbeddedEntry no longer hardcodes previewTruncated: false", () => {
    expect(GITHUB_REPOS).not.toContain("previewTruncated: false");
    expect(GITHUB_REPOS).toContain("previewTruncated: file.truncated");
  });

  it("github.ts's repoDigestToEmbeddedEntry no longer hardcodes previewTruncated: false", () => {
    expect(GITHUB).not.toContain("previewTruncated: false");
    expect(GITHUB).toContain("previewTruncated: file.truncated");
  });
});

describe("F2: the LLM-graded repo path reuses repoDigestToEmbeddedEntry instead of an always-empty submittedFiles", () => {
  it("canary: the regressed literal (a bare empty array) is detected", () => {
    const buggy = "const entry: StudentSubmissionEntry = {\n      student: digest.fullName,\n      content: digest.text,\n      mergedFileCount: digest.fileCount,\n      submittedFiles: [],\n    };";
    expect(buggy).toMatch(/submittedFiles:\s*\[\]/);
  });

  it("canary: the fixed literal (reusing the mapper) is NOT detected as the bug", () => {
    const fixed = "const entry: StudentSubmissionEntry = repoDigestToEmbeddedEntry(digest);";
    expect(fixed).not.toMatch(/submittedFiles:\s*\[\]/);
  });

  it("github-repos.ts's gradeRepoAction (per-cell, LLM path) no longer hardcodes submittedFiles: []", () => {
    expect(GITHUB_REPOS).not.toMatch(/submittedFiles:\s*\[\]/);
    // `gradedDigest`, not `digest`, since the fix for the README-graded-as-
    // submission defect (github.digest.ts's excludeInstructionsFromDigest) -
    // grading must read the digest with the instructions file excluded, not
    // the raw ingest result.
    expect(GITHUB_REPOS).toMatch(/const entry: StudentSubmissionEntry = repoDigestToEmbeddedEntry\(gradedDigest\);/);
  });

  it("github.ts's gradeReposAction (bulk, LLM path) no longer hardcodes submittedFiles: []", () => {
    expect(GITHUB).not.toMatch(/submittedFiles:\s*\[\]/);
    expect(GITHUB).toMatch(
      /digests\.map\(\(\{ label, digest \}\) => repoDigestToEmbeddedEntry\(digest, label\)\)/
    );
  });
});
