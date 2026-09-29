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

import { canvasWorkToEntry, extractSubmissions, extractStudentEntries, disambiguateCanvasEntries } from "./extraction";
import { fetchGradableRepoContent } from "./repo-content";
import type { CanvasStudentWork, DiscussionActivity, DiscussionPost } from "../canvas/discussions";
import type { StudentSubmissionEntry } from "./types";
import { truncateSubmission } from "./utils";
import { buildSubmittedFileNamesBlock } from "./prompts";
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

// RULING 129 (docs/ruling-129.md): Canvas's `student` display is not
// guaranteed unique the way the zip path's identity key is - two enrolments
// can share a `sortable_name`/`display_name`, or both fall back to the
// literal "Unknown student". disambiguateCanvasEntries is the pure function
// applied at extraction.ts's, engine.ts's and grading.ts's three
// canvasWorkToEntry call sites so no two entries reaching the results/review
// layer (seedEdits, GradingResults.tsx) ever share a display.
describe("disambiguateCanvasEntries (RULING 129)", () => {
  function buildEntry(student: string, userId: number): StudentSubmissionEntry {
    return {
      student,
      content: `content for ${userId}`,
      mergedFileCount: 1,
      submittedFiles: [],
      userId,
    };
  }

  it("makes two Canvas entries sharing a display pairwise distinct, without touching userId, content, or entry count", () => {
    const input = [buildEntry("Smith, John", 101), buildEntry("Smith, John", 102)];
    const result = disambiguateCanvasEntries(input);

    expect(result).toHaveLength(2);
    // INVARIANT D, reused from the zip path's own oracle
    // (identityInvariants.test.ts:505): no two returned entries share a
    // display.
    const displays = result.map((e) => e.student);
    expect(new Set(displays).size).toBe(displays.length);
    // userId is the authoritative identity and must never be touched or
    // reordered by the relabeling.
    expect(result.map((e) => e.userId)).toEqual([101, 102]);
    // Only `student` may change - every other field passes through.
    expect(result[0].content).toBe("content for 101");
    expect(result[1].content).toBe("content for 102");
  });

  it("positive control: a single Canvas entry is returned unchanged (nothing to disambiguate)", () => {
    const input = [buildEntry("Ada Lovelace", 7)];
    const result = disambiguateCanvasEntries(input);
    expect(result).toEqual(input);
  });

  it("positive control: two Canvas entries with different displays are returned unchanged - a disambiguator that renames when it does not need to is its own defect", () => {
    const input = [buildEntry("Ada Lovelace", 7), buildEntry("Grace Hopper", 8)];
    const result = disambiguateCanvasEntries(input);
    expect(result).toEqual(input);
    expect(result[0]).toBe(input[0]);
    expect(result[1]).toBe(input[1]);
  });

  it("three entries sharing one display each get a distinct, first-unclaimed label, in entry order", () => {
    const input = [buildEntry("Smith, John", 1), buildEntry("Smith, John", 2), buildEntry("Smith, John", 3)];
    const result = disambiguateCanvasEntries(input);
    expect(result.map((e) => e.student)).toEqual(["Smith, John", "Smith, John (2)", "Smith, John (3)"]);
    expect(result.map((e) => e.userId)).toEqual([1, 2, 3]);
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
// A8 wave 2 (docs/a8-architecture.md, docs/a8-test-notes.md REQ-1/2/3/5/7):
// canvasWorkToEntry's discussion branch builds content/submittedFiles from
// work.discussion (initialPosts vs replies) instead of the flat work.text
// concatenation, so a reply can never be represented as an initial post.
// Fixtures are named FIX-A..FIX-G to match docs/a8-test-notes.md section 2.
describe("canvasWorkToEntry - discussion recognition (A8 wave 2)", () => {
  function initialPost(text: string): DiscussionPost {
    return { text, createdAt: null, isReply: false, parentUserId: null };
  }

  function reply(text: string, parentName?: string): DiscussionPost {
    return {
      text,
      createdAt: null,
      isReply: true,
      parentUserId: parentName ? 1 : null,
      parentName,
    };
  }

  function discussionWork(
    discussion: DiscussionActivity,
    overrides?: Partial<CanvasStudentWork>
  ): CanvasStudentWork {
    // work.text mirrors what fetchDiscussion really produces
    // (discussions.ts:154-156) so REQ-1's "no Discussion post pseudo-file"
    // assertion is meaningful: on HEAD (no discussion branch) this fixture
    // would take the work.text path and emit a "Discussion post" file.
    const flatText = [...discussion.initialPosts, ...discussion.replies]
      .map((p) => `${p.isReply ? "Reply" : "Post"}: ${p.text}`)
      .join("\n\n---\n\n");
    return {
      student: "Test Student",
      userId: 42,
      text: flatText,
      files: [],
      contributionCount: discussion.initialPosts.length + discussion.replies.length,
      discussion,
      ...overrides,
    };
  }

  // FIX-A: one initial post, one reply.
  const FIX_A: CanvasStudentWork = discussionWork({
    initialPosts: [initialPost("INITIALSENTINEL_alpha")],
    replies: [reply("REPLYSENTINEL_bravo", "Alice Adams")],
  });

  // FIX-B: 1 initial / 2 replies (REQ-2 fixture a).
  const FIX_B: CanvasStudentWork = discussionWork({
    initialPosts: [initialPost("INITIALSENTINEL_alpha")],
    replies: [
      reply("REPLYSENTINEL_bravo", "Alice Adams"),
      reply("REPLYSENTINEL_charlie", "Alice Adams"),
    ],
  });

  // FIX-C: 2 initial / 1 reply - the anti-vacuity twin (REQ-2 fixture b).
  const FIX_C: CanvasStudentWork = discussionWork({
    initialPosts: [initialPost("INITIALSENTINEL_alpha"), initialPost("INITIALSENTINEL_delta")],
    replies: [reply("REPLYSENTINEL_bravo", "Alice Adams")],
  });

  // FIX-D: huge initial post, one reply - drives truncation survival (REQ-3).
  const FIX_D: CanvasStudentWork = discussionWork({
    initialPosts: [initialPost("INITIALSENTINEL_alpha" + "x".repeat(50000))],
    replies: [reply("REPLYSENTINEL_bravo", "Alice Adams")],
  });

  // FIX-E: replies but no initial post (REQ-5).
  const FIX_E: CanvasStudentWork = discussionWork({
    initialPosts: [],
    replies: [reply("REPLYSENTINEL_bravo", "Alice Adams")],
  });

  // FIX-F: initial post but no replies (REQ-5).
  const FIX_F: CanvasStudentWork = discussionWork({
    initialPosts: [initialPost("INITIALSENTINEL_alpha")],
    replies: [],
  });

  // FIX-G: adversarial - a parentName containing a period (REQ-7, F-1).
  const FIX_G: CanvasStudentWork = discussionWork({
    initialPosts: [initialPost("INITIALSENTINEL_alpha")],
    replies: [reply("REPLYSENTINEL_bravo", "Dr. Alan Turing")],
  });

  // --- REQ-1 (AC-1): the entry carries the initial/reply distinction as files
  it("REQ-1: submittedFiles distinguishes the initial post from the reply, with no generic Discussion post pseudo-file", async () => {
    const entry = await canvasWorkToEntry(FIX_A);

    expect(entry.submittedFiles.filter((f) => /^initial post/i.test(f.name))).toHaveLength(1);
    expect(entry.submittedFiles.some((f) => /^repl/i.test(f.name))).toBe(true);
    const initialName = entry.submittedFiles.find((f) => /^initial post/i.test(f.name))?.name;
    const replyName = entry.submittedFiles.find((f) => /^repl/i.test(f.name))?.name;
    expect(initialName).not.toBe(replyName);
    // Proves the discussion branch REPLACED the work.text branch (both did
    // not run) - the double-emit self-attack docs/a8-test-notes.md warns of.
    expect(entry.submittedFiles.some((f) => f.name === "Discussion post")).toBe(false);
  });

  // --- REQ-2 (AC-2): the front-loaded manifest states the counts, on TWO
  // count-shape fixtures (the anti-vacuity guard against a hardcoded string)
  it("REQ-2: the manifest states the initial-post and reply counts (fixture a: 1 initial / 2 replies)", async () => {
    const entry = await canvasWorkToEntry(FIX_B);
    const manifest = entry.content.split("\n\n")[0];
    expect(manifest).toMatch(/1\s+initial post/i);
    expect(manifest).toMatch(/2\s+repl(y|ies)/i);
  });

  it("REQ-2: the manifest states the initial-post and reply counts (fixture b: 2 initial / 1 reply, the anti-vacuity twin)", async () => {
    const entry = await canvasWorkToEntry(FIX_C);
    const manifest = entry.content.split("\n\n")[0];
    expect(manifest).toMatch(/2\s+initial post/i);
    expect(manifest).toMatch(/1\s+repl(y|ies)/i);
  });

  // --- REQ-3 (AC-2, the load-bearing oracle): the distinction survives a
  // prefix slice through the REAL production truncateSubmission.
  describe("REQ-3: truncation survival", () => {
    it("keeps the reply-count distinction (and the initial-post marker) after a small-cap truncation that cuts the reply prose", async () => {
      const entry = await canvasWorkToEntry(FIX_D);
      const cap = 2000;
      const result = truncateSubmission(entry.content, cap);

      expect(result.truncated).toBe(true);
      expect(result.text).toMatch(/1\s+repl(y|ies)/i);
      expect(result.text).toMatch(/initial/i);
      // The reply prose itself (past 50000 chars) is expected absent at this
      // cap - AC-2 requires the DISTINCTION to survive, not the prose.
      expect(result.text).not.toContain("REPLYSENTINEL_bravo");
    });

    it("keeps the full reply prose at the realistic (untruncated) cap", async () => {
      const entry = await canvasWorkToEntry(FIX_D);
      const cap = 400000;
      const result = truncateSubmission(entry.content, cap);

      expect(result.truncated).toBe(false);
      expect(result.text).toContain("REPLYSENTINEL_bravo");
    });
  });

  // --- REQ-5 (AC-4): two distinct empty states
  it("REQ-5: replies-but-no-initial-post reads differently from initial-post-but-no-replies", async () => {
    const noInitial = await canvasWorkToEntry(FIX_E);
    const noReplies = await canvasWorkToEntry(FIX_F);

    expect(noInitial.content).toMatch(/no initial post|did not (write|post)[\s\S]{0,40}initial/i);
    expect(noReplies.content).not.toMatch(/no initial post|did not (write|post)[\s\S]{0,40}initial/i);
    expect(noInitial.submittedFiles.some((f) => /^initial post/i.test(f.name))).toBe(false);
    expect(noReplies.submittedFiles.some((f) => /^repl/i.test(f.name))).toBe(false);
    expect(noInitial.content).not.toBe(noReplies.content);
  });

  // --- REQ-7 (regression guard, F-1): contribution labels must not leak into
  // the model's file-list block - and a dotted parentName is the adversarial
  // case that breaks a naive `"Reply to " + parentName` build.
  describe("REQ-7: no contribution label leaks into buildSubmittedFileNamesBlock", () => {
    it("fixture (a): dot-free labels do not appear in the model file-list block", async () => {
      const entry = await canvasWorkToEntry(FIX_A);
      const block = buildSubmittedFileNamesBlock(entry.submittedFiles);
      expect(block).not.toContain("Initial post");
      expect(block).not.toContain("Reply to Alice Adams");
    });

    it("fixture (b), ADVERSARIAL: a parentName containing a period ('Dr. Alan Turing') must not leak either", async () => {
      const entry = await canvasWorkToEntry(FIX_G);
      const block = buildSubmittedFileNamesBlock(entry.submittedFiles);
      expect(block).not.toContain("Reply to Dr");
      expect(block).not.toContain("Turing");
    });
  });
});

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
