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

import { canvasWorkToEntry, extractSubmissions, extractStudentEntries } from "./extraction";
import { fetchGradableRepoContent } from "./repo-content";
import type { CanvasStudentWork } from "../canvas/discussions";
import JSZip from "jszip";

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
      files: [{ path: "main.py", text: "print('hello')", truncated: false }],
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
    // F5: the real file, not only the "Submission link" pseudo-file, is
    // surfaced in submittedFiles.
    const repoFile = entry.submittedFiles.find((f) => f.name === "main.py");
    expect(repoFile?.previewContent).toBe("print('hello')");
    expect(repoFile?.previewTruncated).toBe(false);
    expect(entry.submittedFiles.some((f) => f.name === "Submission link")).toBe(true);
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

// A14: extractSubmissions must record the whole zip-crossing chain a file
// passed through (outermost first), and must NOT record anything for a file
// that crossed no zip boundary at all - groupSubmissionsByStudent (./utils)
// treats an absent key exactly like an empty chain, so this distinction is
// what lets the fix reproduce today's behavior byte-for-byte on flat/
// folder-only entries while still fixing the nested-zip case.
//
// Trap paid for by a prior pass: `generateAsync({ type: "nodebuffer" })`
// returns a Node Buffer backed by a SHARED 8KB pool. Calling `.buffer` on it
// hands JSZip that whole shared pool (with the buffer's own byteOffset/
// byteLength ignored), which throws "End of data reached" the moment
// anything else in the same test run dirties the pool. Passing the
// nodebuffer directly (JSZip accepts it) - or generating with
// `type: "arraybuffer"` - avoids this entirely.
describe("extractSubmissions - zipParents (A14)", () => {
  it("records the outermost zip entry name for a file that crossed a zip boundary, and omits it for one that didn't", async () => {
    const inner = new JSZip();
    inner.file("main.py", "print('jane')");
    const innerBuffer = await inner.generateAsync({ type: "nodebuffer" });

    const outer = new JSZip();
    // A plain .txt leaf, not .docx: DOCUMENT_EXTENSIONS routes through a real
    // Word-document parser (extractTextFromBuffer), which would reject this
    // fixture's plain-string bytes as not-a-real-docx and report it as a
    // failed extraction rather than a flat submission - unrelated to what
    // this test checks (zipParents), so TEXT_EXTENSIONS's plain pass-through
    // keeps the fixture focused on the zip-crossing bookkeeping.
    outer.folder("Homework1")!.file("janedoe_2024-01-01_120000_report.txt", "flat text");
    outer.file("janedoe_2024-01-01_120000_project.zip", innerBuffer);

    const outerBuffer = await outer.generateAsync({ type: "arraybuffer" });
    const { submissions, zipParents } = await extractSubmissions(outerBuffer);

    expect(submissions["janedoe_2024-01-01_120000_project.zip/main.py"]).toBe("print('jane')");
    expect(zipParents["janedoe_2024-01-01_120000_project.zip/main.py"]).toEqual([
      "janedoe_2024-01-01_120000_project.zip",
    ]);
    expect(submissions["Homework1/janedoe_2024-01-01_120000_report.txt"]).toBe("flat text");
    expect(zipParents["Homework1/janedoe_2024-01-01_120000_report.txt"]).toBeUndefined();
  });

  it("carries the whole outward-in chain through more than one layer of nested zips", async () => {
    const perStudent = new JSZip();
    perStudent.file("main.py", "print('jane')");
    const perStudentBuffer = await perStudent.generateAsync({ type: "nodebuffer" });

    const bulk = new JSZip();
    bulk.file("janedoe_2024-01-01_120000_project.zip", perStudentBuffer);
    const bulkBuffer = await bulk.generateAsync({ type: "nodebuffer" });

    const wrapper = new JSZip();
    wrapper.file("bulk.zip", bulkBuffer);
    const wrapperBuffer = await wrapper.generateAsync({ type: "arraybuffer" });

    const { zipParents } = await extractSubmissions(wrapperBuffer);
    const key = "bulk.zip/janedoe_2024-01-01_120000_project.zip/main.py";
    expect(zipParents[key]).toEqual(["bulk.zip", "bulk.zip/janedoe_2024-01-01_120000_project.zip"]);
  });

  // A14 rulings v2 CONDITION 1: the zipParents write on the IMAGE branch
  // (extraction.ts's collectFromZip, the `if (isImage)` block) was entirely
  // untested before this - every other zipParents test above goes through
  // the text/document extraction branch instead. Same trap as the rest of
  // this describe block applies: generate with type "nodebuffer" for the
  // inner archive and pass it directly (or generate "arraybuffer") rather
  // than reading `.buffer` off the resulting Node Buffer.
  it("records the zip-crossing chain for an image file nested inside a per-student zip (the untested IMAGE branch)", async () => {
    const inner = new JSZip();
    // A minimal PNG signature is enough - the image branch never tries to
    // decode the bytes, it only records a placeholder plus the raw base64.
    inner.file("screenshot.png", Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const innerBuffer = await inner.generateAsync({ type: "nodebuffer" });

    const outer = new JSZip();
    outer.file("janedoe_2024-01-01_120000_project.zip", innerBuffer);
    const outerBuffer = await outer.generateAsync({ type: "arraybuffer" });

    const { submissions, rawData, zipParents } = await extractSubmissions(outerBuffer);
    const key = "janedoe_2024-01-01_120000_project.zip/screenshot.png";

    expect(submissions[key]).toBe("[Image file: screenshot.png]");
    expect(rawData[key]).toBeTruthy();
    expect(zipParents[key]).toEqual(["janedoe_2024-01-01_120000_project.zip"]);
  });
});

// A14 rulings v2 CONDITION 2: the end-to-end path nobody had a test for -
// a real nested JSZip going through extractSubmissions -> extractStudentEntries
// (which itself calls groupSubmissionsByStudent, in ./extraction) with no
// mocking anywhere in between. Every other A14 test either exercises
// extractSubmissions alone (zipParents bookkeeping) or groupSubmissionsByStudent
// alone (with a hand-built zipParents literal) - this is the one test proving
// the two are actually glued together correctly on real archive bytes. It
// passes today (executed per the ruling); this pins it so it stays passing.
describe("extractStudentEntries - end to end through a real nested JSZip (A14 rulings v2 CONDITION 2)", () => {
  it("groups two students' per-student zips into two separate entries, not one merged row", async () => {
    const janeInner = new JSZip();
    janeInner.file("main.py", "print('jane')");
    const janeInnerBuffer = await janeInner.generateAsync({ type: "nodebuffer" });

    const johnInner = new JSZip();
    johnInner.file("main.py", "print('john')");
    const johnInnerBuffer = await johnInner.generateAsync({ type: "nodebuffer" });

    const outer = new JSZip();
    outer.file("janedoe_2024-01-01_120000_project.zip", janeInnerBuffer);
    outer.file("johndoe_2024-01-01_130000_project.zip", johnInnerBuffer);
    const outerBuffer = await outer.generateAsync({ type: "arraybuffer" });

    const entries = await extractStudentEntries(outerBuffer);

    expect(entries.map((e) => e.student).sort()).toEqual(["janedoe", "johndoe"]);
    const jane = entries.find((e) => e.student === "janedoe");
    const john = entries.find((e) => e.student === "johndoe");
    expect(jane?.content).toContain("print('jane')");
    expect(jane?.content).not.toContain("print('john')");
    expect(john?.content).toContain("print('john')");
    expect(john?.content).not.toContain("print('jane')");
  });
});
