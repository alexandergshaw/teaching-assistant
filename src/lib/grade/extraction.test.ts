import { describe, it, expect, vi, beforeEach } from "vitest";

// canvasWorkToEntry follows a GitHub-looking submissionUrl through
// fetchGradableRepoContent (src/lib/grade/repo-content.ts) - mock just that
// one seam so these tests exercise canvasWorkToEntry's own wiring (does it
// call the fetch, does it fold success/failure into content and
// gradedRepo/gradedRef correctly) without hitting GitHub. repo-content.ts's
// own URL-parsing/fetch-orchestration logic is unit-tested directly in
// repo-content.test.ts.
vi.mock("./repo-content", () => ({
  fetchGradableRepoContent: vi.fn(),
}));

import { canvasWorkToEntry } from "./extraction";
import { fetchGradableRepoContent } from "./repo-content";
import type { CanvasStudentWork } from "../canvas/discussions";

const mockFetchGradableRepoContent = vi.mocked(fetchGradableRepoContent);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("canvasWorkToEntry - submission URL", () => {
  it("notes the submitted link in content for a URL-only submission (no empty content)", async () => {
    mockFetchGradableRepoContent.mockResolvedValue({ error: "not a github.com repository link." });
    const work: CanvasStudentWork = {
      student: "Ada Lovelace",
      userId: 1,
      text: "",
      files: [],
      contributionCount: 1,
      submissionUrl: "https://not-github.example.com/student/hw1",
    };

    const entry = await canvasWorkToEntry(work);

    expect(entry.content).not.toBe("");
    expect(entry.content).toContain("https://not-github.example.com/student/hw1");
    expect(entry.submissionUrl).toBe("https://not-github.example.com/student/hw1");
    expect(entry.submittedFiles.some((f) => f.name === "Submission link")).toBe(true);
    // Not a GitHub URL: fetchGradableRepoContent is never even called.
    expect(mockFetchGradableRepoContent).not.toHaveBeenCalled();
  });

  it("adds no link note and a null submissionUrl when nothing was submitted as a URL", async () => {
    const work: CanvasStudentWork = {
      student: "Bo Text",
      userId: 2,
      text: "My essay.",
      files: [],
      contributionCount: 1,
    };

    const entry = await canvasWorkToEntry(work);

    expect(entry.content).toBe("My essay.");
    expect(entry.submissionUrl).toBeNull();
    expect(entry.submittedFiles.some((f) => f.name === "Submission link")).toBe(false);
    expect(mockFetchGradableRepoContent).not.toHaveBeenCalled();
  });

  // --- AC2.2: a GitHub repo URL is followed and its CODE is graded, not the
  // URL string ---------------------------------------------------------------
  it("fetches and grades the repo's actual code for a GitHub submission URL, and records gradedRepo/gradedRef", async () => {
    mockFetchGradableRepoContent.mockResolvedValue({
      repo: "student/hw1",
      ref: "abc123def456",
      content: "File: main.py\n\nprint('hello')",
      fileCount: 1,
      truncated: false,
    });

    const work: CanvasStudentWork = {
      student: "Ada Lovelace",
      userId: 1,
      text: "",
      files: [],
      contributionCount: 1,
      submissionUrl: "https://github.com/student/hw1",
    };

    const entry = await canvasWorkToEntry(work);

    expect(mockFetchGradableRepoContent).toHaveBeenCalledWith("https://github.com/student/hw1");
    // The grader sees the actual code, not just the URL string.
    expect(entry.content).toContain("print('hello')");
    expect(entry.gradedRepo).toBe("student/hw1");
    expect(entry.gradedRef).toBe("abc123def456");
    expect(entry.repoReadNote).toBeNull();
  });

  // --- AC2.3: degrade to text-only grading, with a note, on every failure
  // mode - never fail the whole entry ------------------------------------
  it("degrades to text-only grading with a note when the repo cannot be read (private/404/API failure)", async () => {
    mockFetchGradableRepoContent.mockResolvedValue({
      error: 'could not find "student/hw1" on GitHub (private, deleted, or the configured GITHUB_TOKEN lacks access)',
    });

    const work: CanvasStudentWork = {
      student: "Ada Lovelace",
      userId: 1,
      text: "",
      files: [],
      contributionCount: 1,
      submissionUrl: "https://github.com/student/hw1",
    };

    const entry = await canvasWorkToEntry(work);

    // Still names the link (pre-existing behavior) plus a note on why the
    // code could not be read - never silently grades the URL as if it were code.
    expect(entry.content).toContain("https://github.com/student/hw1");
    expect(entry.content).toContain("Could not read the linked GitHub repository");
    expect(entry.content).toContain("could not find \"student/hw1\" on GitHub");
    expect(entry.gradedRepo).toBeNull();
    expect(entry.gradedRef).toBeNull();
    expect(entry.repoReadNote).toContain("could not find \"student/hw1\" on GitHub");
  });

  it("never throws (degrades with a note instead) when fetchGradableRepoContent itself rejects unexpectedly", async () => {
    // canvasWorkToEntry must not let one bad student's repo fetch blow up an
    // entire batch of otherwise-gradable entries (AC2.3's "never fail a
    // whole grading run" also covers this defensive path, not just the
    // reported { error } case).
    mockFetchGradableRepoContent.mockRejectedValue(new Error("network exploded"));

    const work: CanvasStudentWork = {
      student: "Ada Lovelace",
      userId: 1,
      text: "",
      files: [],
      contributionCount: 1,
      submissionUrl: "https://github.com/student/hw1",
    };

    const entry = await canvasWorkToEntry(work);
    expect(entry.content).toContain("Could not read the linked GitHub repository: network exploded.");
    expect(entry.gradedRepo).toBeNull();
    expect(entry.repoReadNote).toContain("network exploded");
  });
});
