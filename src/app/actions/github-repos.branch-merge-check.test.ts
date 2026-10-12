// Wiring tests for the target-branch merge check inside gradeRepoAction
// (docs/repo-grades-branch-merge-check-scope.md sections 3.2, 3.4, 6.2).
// Same mocking posture as github-repos.grading.unmerged-branch.test.ts: every
// heavy dependency is mocked, never fetch.
import { describe, it, expect, vi, beforeEach } from "vitest";

const ingestRepo = vi.fn();
const generateRubric = vi.fn();
const gradeEntries = vi.fn();
const listBranches = vi.fn();
const getRepoTreeWithMeta = vi.fn();
const buildEmbeddedRubric = vi.fn();
const gradeEntriesEmbedded = vi.fn();
const renderRubricText = vi.fn();

vi.mock("@/lib/supabase/auth", () => ({ requireAppOwner: vi.fn(async () => ({ id: "owner" })) }));

vi.mock("@/lib/github", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/github")>();
  return {
    parseRepoRef: (ref: string) => {
      const m = ref.trim().match(/^([^/\s]+)\/([^/\s]+)$/);
      return m ? { owner: m[1], repo: m[2] } : null;
    },
    ingestRepo: (...args: unknown[]) => ingestRepo(...args),
    excludeInstructionsFromDigest: actual.excludeInstructionsFromDigest,
    isScaffoldingFile: actual.isScaffoldingFile,
    listBranches: (...args: unknown[]) => listBranches(...args),
    getRepoTreeWithMeta: (...args: unknown[]) => getRepoTreeWithMeta(...args),
  };
});

vi.mock("@/lib/grade", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/grade")>()),
  generateRubric: (...args: unknown[]) => generateRubric(...args),
  gradeEntries: (...args: unknown[]) => gradeEntries(...args),
}));

vi.mock("@/lib/embedded-grader", () => ({
  buildEmbeddedRubric: (...args: unknown[]) => buildEmbeddedRubric(...args),
  gradeEntriesEmbedded: (...args: unknown[]) => gradeEntriesEmbedded(...args),
  renderRubricText: (...args: unknown[]) => renderRubricText(...args),
}));

vi.mock("@/lib/code-runner", () => ({ attachCodeRuns: vi.fn() }));
vi.mock("@/lib/research/rubric-bank", () => ({ rememberRubric: vi.fn() }));

const { gradeRepoAction } = await import("./github-repos");

function digestOf(files: Array<{ path: string; content: string }>) {
  return {
    fullName: "org/student-repo",
    description: "",
    fileCount: files.length,
    text: "# Repository: org/student-repo",
    truncated: false,
    files: files.map((f) => ({ ...f, truncated: false })),
    prefixMatchedNothing: false,
    skipped: { type: 0, size: 0, budget: 0, fetchError: 0 },
    treeTruncated: false,
  };
}

const BANNED = ["cheat", "plagiar", "dishonest", "lied", "fault", "blame"];

beforeEach(() => {
  vi.clearAllMocks();
  ingestRepo.mockResolvedValue(digestOf([]));
  buildEmbeddedRubric.mockReturnValue({ checks: [{ id: "c" }], warnings: [] });
  gradeEntriesEmbedded.mockReturnValue({ results: [] });
  renderRubricText.mockReturnValue("rubric text");
  gradeEntries.mockResolvedValue({ results: [] });
});

function expectNoSubmission(result: unknown): asserts result is {
  noSubmission: true;
  reason: string;
  determination?: string;
  branchMergeCheck?: { status: string; targetBranch: string; targetWasExplicit: boolean; foundOnBranch?: string; undeterminedReason?: string };
} {
  if (typeof result !== "object" || result === null || !("noSubmission" in result)) throw new Error("expected noSubmission");
}

describe("gradeRepoAction - target branch validation (I-3)", () => {
  it("a '..' target returns { error } and makes ZERO GitHub calls", async () => {
    const result = await gradeRepoAction("org/student-repo", "Do it.", "", "gemini", "..", "module_02");
    expect("error" in result).toBe(true);
    expect(ingestRepo).not.toHaveBeenCalled();
    expect(listBranches).not.toHaveBeenCalled();
    expect(getRepoTreeWithMeta).not.toHaveBeenCalled();
  });

  it("a whitespace-only target is forwarded as undefined, and the check is NOT marked explicit", async () => {
    ingestRepo.mockResolvedValue(digestOf([{ path: "module_02/a.py", content: "x=1" }]));
    const result = await gradeRepoAction("org/student-repo", "Do it.", "", "gemini", "   ", "module_02");
    expect(ingestRepo.mock.calls[0][3]).toBeUndefined();
    expect("branchMergeCheck" in result ? result.branchMergeCheck?.targetWasExplicit : "absent").toBe(false);
  });

  it("a padded valid target is trimmed before it reaches ingestRepo", async () => {
    ingestRepo.mockResolvedValue(digestOf([{ path: "module_02/a.py", content: "x=1" }]));
    await gradeRepoAction("org/student-repo", "Do it.", "", "gemini", "  main ", "module_02");
    expect(ingestRepo.mock.calls[0][3]).toBe("main");
  });
});

describe("gradeRepoAction - merged (work on the target branch), all return paths", () => {
  beforeEach(() => {
    ingestRepo.mockResolvedValue(digestOf([{ path: "module_02/a.py", content: "x=1" }]));
    // The success path now scans: the graded ref (main) holds a.py and the only
    // other branch holds the same path -> nothing is missing from the target.
    listBranches.mockResolvedValue({ branches: ["main", "stale"], defaultBranch: "main" });
    getRepoTreeWithMeta.mockResolvedValue({ entries: [{ path: "module_02/a.py", type: "blob" }], truncated: false });
  });

  it("gemini/LLM success return carries status merged and still grades", async () => {
    const result = await gradeRepoAction("org/student-repo", "Do it.", "rubric", "gemini", "main", "module_02");
    if (!("run" in result)) throw new Error("expected a graded result");
    expect(result.branchMergeCheck).toEqual({ status: "merged", targetBranch: "main", targetWasExplicit: true });
    expect(gradeEntries).toHaveBeenCalled();
    expect(listBranches).toHaveBeenCalledTimes(1);
  });

  it("EMBEDDED success return carries status merged", async () => {
    const result = await gradeRepoAction("org/student-repo", "Do it.", "rubric", "embedded", "main", "module_02");
    if (!("run" in result)) throw new Error("expected a graded result");
    expect(result.branchMergeCheck).toEqual({ status: "merged", targetBranch: "main", targetWasExplicit: true });
    expect(gradeEntriesEmbedded).toHaveBeenCalled();
    expect(listBranches).toHaveBeenCalledTimes(1);
  });

  it("GAP 2: no target -> the scan RUNS against the default branch on both engines, check is not explicit, one scan per grade (AC3, AC6)", async () => {
    const a = await gradeRepoAction("org/student-repo", "Do it.", "rubric", "gemini", undefined, "module_02");
    const b = await gradeRepoAction("org/student-repo", "Do it.", "rubric", "embedded", undefined, "module_02");
    for (const r of [a, b]) {
      if (!("run" in r)) throw new Error("expected a graded result");
      expect(r.branchMergeCheck).toEqual({ status: "merged", targetBranch: "main", targetWasExplicit: false });
    }
    // Two grades: each one branch list; per grade 1 graded-ref tree + 1 tree for
    // the single other branch ("stale") = 2 trees, 4 total.
    expect(listBranches).toHaveBeenCalledTimes(2);
    expect(getRepoTreeWithMeta).toHaveBeenCalledTimes(4);
  });
});

describe("gradeRepoAction - success path with a non-empty target (the branch-merge fix)", () => {
  const treeBy = (byBranch: Record<string, Array<{ path: string; type: string }>>) =>
    getRepoTreeWithMeta.mockImplementation(async (_o: string, _r: string, b: string) => ({
      entries: byBranch[b] ?? [],
      truncated: false,
    }));

  beforeEach(() => {
    ingestRepo.mockResolvedValue(digestOf([{ path: "module_02/a.py", content: "x=1" }]));
    listBranches.mockResolvedValue({ branches: ["main", "old-draft"], defaultBranch: "main" });
  });

  it("another branch has a folder path the target lacks -> not-merged, grade stands, determination unset", async () => {
    treeBy({
      main: [{ path: "module_02/a.py", type: "blob" }],
      "old-draft": [{ path: "module_02/a.py", type: "blob" }, { path: "module_02/b.py", type: "blob" }],
    });
    const result = await gradeRepoAction("org/student-repo", "Do it.", "rubric", "gemini", "main", "module_02");
    if (!("run" in result)) throw new Error("expected a graded result");
    expect(result.branchMergeCheck).toEqual({ status: "not-merged", targetBranch: "main", targetWasExplicit: true, foundOnBranch: "old-draft" });
    expect(gradeEntries).toHaveBeenCalled();
    expect("determination" in result ? result.determination : undefined).toBeUndefined();
  });

  it("SYMMETRY: a non-text file on the graded tree that the digest drops, also on a stale branch, is NOT flagged", async () => {
    // The ingest digest holds only a.py (diagram.png is dropped as non-text),
    // but the graded REF's tree has both. A digest-sourced graded set would
    // wrongly report not-merged on diagram.png.
    treeBy({
      main: [{ path: "module_02/a.py", type: "blob" }, { path: "module_02/diagram.png", type: "blob" }],
      "old-draft": [{ path: "module_02/a.py", type: "blob" }, { path: "module_02/diagram.png", type: "blob" }],
    });
    const result = await gradeRepoAction("org/student-repo", "Do it.", "rubric", "embedded", "main", "module_02");
    if (!("run" in result)) throw new Error("expected a graded result");
    expect(result.branchMergeCheck).toEqual({ status: "merged", targetBranch: "main", targetWasExplicit: true });
  });

  it("call count (RES-4): one graded-ref tree, one branch list, one tree per other branch", async () => {
    treeBy({ main: [{ path: "module_02/a.py", type: "blob" }], "old-draft": [] });
    await gradeRepoAction("org/student-repo", "Do it.", "rubric", "gemini", "main", "module_02");
    expect(listBranches).toHaveBeenCalledTimes(1);
    expect(getRepoTreeWithMeta).toHaveBeenCalledTimes(2);
    expect(getRepoTreeWithMeta.mock.calls.map((c) => c[2])).toEqual(["main", "old-draft"]);
  });

  it("an unreadable graded tree never throws and never guesses not-merged", async () => {
    getRepoTreeWithMeta.mockRejectedValue(new Error("boom"));
    const result = await gradeRepoAction("org/student-repo", "Do it.", "rubric", "gemini", "main", "module_02");
    if (!("run" in result)) throw new Error("expected a graded result");
    expect(result.branchMergeCheck).toEqual({ status: "merged", targetBranch: "main", targetWasExplicit: true });
  });

  it("a truncated graded tree skips the scan (the path set would be incomplete)", async () => {
    getRepoTreeWithMeta.mockResolvedValue({ entries: [{ path: "module_02/a.py", type: "blob" }], truncated: true });
    const result = await gradeRepoAction("org/student-repo", "Do it.", "rubric", "gemini", "main", "module_02");
    if (!("run" in result)) throw new Error("expected a graded result");
    expect(result.branchMergeCheck).toEqual({ status: "merged", targetBranch: "main", targetWasExplicit: true });
    expect(listBranches).not.toHaveBeenCalled();
  });
});

const treeWithFeatureX = async (_o: string, _r: string, b: string) =>
  b === "feature-x"
    ? { entries: [{ path: "module_02/a.py", type: "blob" }], truncated: false }
    : { entries: [], truncated: false };

interface ZeroRun {
  run: { results: Array<{ totalScore: string; determination?: string; overallComment: string; improvements: string; strengths: string }> };
  branchMergeCheck?: { status: string; targetBranch: string; targetWasExplicit: boolean; foundOnBranch?: string };
}
function expectZeroRun(result: unknown): asserts result is ZeroRun {
  if (typeof result !== "object" || result === null || !("run" in result)) throw new Error("expected a graded zero run");
  if ("noSubmission" in result) throw new Error("must not be the ungraded sentinel");
}

describe("gradeRepoAction - empty graded ref: not-merged vs no-submission vs unknown", () => {
  it("branch present but unmerged -> graded 0, not-merged, determination unmerged-branch, comment names both branches", async () => {
    listBranches.mockResolvedValue({ branches: ["main", "feature-x"], defaultBranch: "main" });
    getRepoTreeWithMeta.mockImplementation(treeWithFeatureX);
    const result = await gradeRepoAction("org/student-repo", "Do it.", "", "gemini", "main", "module_02");
    expectZeroRun(result);
    expect(result.branchMergeCheck).toEqual({ status: "not-merged", targetBranch: "main", targetWasExplicit: true, foundOnBranch: "feature-x" });
    const first = result.run.results[0];
    expect(first.totalScore).toBe("0");
    expect(first.determination).toBe("no-submission-unmerged-branch");
    expect(first.overallComment).toContain('"feature-x"');
    expect(first.overallComment).toContain('"main" (the target branch you set)');
    expect(gradeEntries).not.toHaveBeenCalled();
  });

  it("no branch holds the work -> graded 0, no-submission, no foundOnBranch, determination no-submission", async () => {
    listBranches.mockResolvedValue({ branches: ["main", "other"], defaultBranch: "main" });
    getRepoTreeWithMeta.mockResolvedValue({ entries: [], truncated: false });
    const result = await gradeRepoAction("org/student-repo", "Do it.", "", "gemini", "main", "module_02");
    expectZeroRun(result);
    expect(result.branchMergeCheck).toEqual({ status: "no-submission", targetBranch: "main", targetWasExplicit: true });
    expect(result.run.results[0].totalScore).toBe("0");
    expect(result.run.results[0].determination).toBe("no-submission");
  });

  it("the not-merged comment TEXT differs from the no-submission comment TEXT (AC-4), both non-accusatory", async () => {
    listBranches.mockResolvedValue({ branches: ["main", "feature-x"], defaultBranch: "main" });
    getRepoTreeWithMeta.mockImplementation(treeWithFeatureX);
    const notMerged = await gradeRepoAction("org/student-repo", "Do it.", "", "gemini", "main", "module_02");
    getRepoTreeWithMeta.mockResolvedValue({ entries: [], truncated: false });
    const none = await gradeRepoAction("org/student-repo", "Do it.", "", "gemini", "main", "module_02");
    expectZeroRun(notMerged);
    expectZeroRun(none);
    const a = notMerged.run.results[0].overallComment;
    const b = none.run.results[0].overallComment;
    expect(a).not.toBe(b);
    expect(b).toContain("No submission was found on");
    expect(b).not.toContain("feature-x");
    for (const text of [a, b]) {
      for (const w of BANNED) expect(text.toLowerCase()).not.toContain(w);
    }
  });

  it("an undetermined scan -> unknown with a reason, stays UNGRADED (RES-1), determination unset", async () => {
    listBranches.mockRejectedValue(new Error("boom"));
    const result = await gradeRepoAction("org/student-repo", "Do it.", "", "gemini", "main", "module_02");
    expectNoSubmission(result);
    expect(result.branchMergeCheck?.status).toBe("unknown");
    expect(result.branchMergeCheck?.undeterminedReason).toBeTruthy();
    expect(result.determination).toBeUndefined();
    expect(result.reason).toContain('"main"');
    expect("run" in result).toBe(false);
  });

  it("no target set: the unmerged zero names the DEFAULT branch and the check is not explicit", async () => {
    listBranches.mockResolvedValue({ branches: ["main", "feature-x"], defaultBranch: "main" });
    getRepoTreeWithMeta.mockImplementation(treeWithFeatureX);
    const result = await gradeRepoAction("org/student-repo", "Do it.", "", "gemini", undefined, "module_02");
    expectZeroRun(result);
    expect(result.branchMergeCheck).toEqual({ status: "not-merged", targetBranch: "main", targetWasExplicit: false, foundOnBranch: "feature-x" });
    expect(result.run.results[0].determination).toBe("no-submission-unmerged-branch");
    expect(result.run.results[0].overallComment).toContain('never merged into the default branch "main"');
    expect(result.run.results[0].overallComment).not.toContain("you set");
  });

  it("AC-6: determination no-submission-unmerged-branch IMPLIES status not-merged (one direction)", async () => {
    listBranches.mockResolvedValue({ branches: ["main", "feature-x"], defaultBranch: "main" });
    getRepoTreeWithMeta.mockImplementation(treeWithFeatureX);
    const result = await gradeRepoAction("org/student-repo", "Do it.", "", "gemini", "main", "module_02");
    expectZeroRun(result);
    expect(result.run.results[0].determination).toBe("no-submission-unmerged-branch");
    expect(result.branchMergeCheck?.status).toBe("not-merged");
  });

  it("AC-6: the plain no-submission determination is set when no branch holds the work", async () => {
    listBranches.mockResolvedValue({ branches: ["main"], defaultBranch: "main" });
    const result = await gradeRepoAction("org/student-repo", "Do it.", "", "gemini", "main", "module_02");
    expectZeroRun(result);
    expect(result.run.results[0].determination).toBe("no-submission");
    expect(result.branchMergeCheck?.status).not.toBe("not-merged");
  });

  it("AC-6: a success-path not-merged carries NO determination (the real grade is kept)", async () => {
    ingestRepo.mockResolvedValue(digestOf([{ path: "module_02/a.py", content: "x=1" }]));
    listBranches.mockResolvedValue({ branches: ["main", "feature-x"], defaultBranch: "main" });
    getRepoTreeWithMeta.mockImplementation(async (_o: string, _r: string, b: string) =>
      b === "feature-x"
        ? { entries: [{ path: "module_02/b.py", type: "blob" }], truncated: false }
        : { entries: [{ path: "module_02/a.py", type: "blob" }], truncated: false }
    );
    const result = await gradeRepoAction("org/student-repo", "Do it.", "rubric", "gemini", "main", "module_02");
    if (!("run" in result)) throw new Error("expected a graded result");
    expect(result.branchMergeCheck?.status).toBe("not-merged");
    expect("determination" in result ? result.determination : undefined).toBeUndefined();
  });
});

// AC3 / AC4: a PRESENT module with newer work on an unmerged branch keeps its
// real grade and gains a branch note in the comment - with NO typed target.
describe("gradeRepoAction - success-path not-merged folds a note into the REAL grade (AC3, AC4)", () => {
  const realGrade = () => ({
    results: [
      {
        student: "s",
        totalScore: "8/10",
        strengths: "Good work.",
        improvements: "Add docstrings.",
        resubmitNotice: "You are welcome to resubmit.",
        overallComment: "Good work. Add docstrings. You are welcome to resubmit.",
        feedback: "",
        rubricAreas: [],
        mergedFileCount: 1,
        submittedFiles: [],
      },
    ],
    rubricAreaNames: [],
    fullCreditChecklist: [],
  });

  beforeEach(() => {
    ingestRepo.mockResolvedValue(digestOf([{ path: "module_02/a.py", content: "x=1" }]));
    listBranches.mockResolvedValue({ branches: ["main", "later-work"], defaultBranch: "main" });
    getRepoTreeWithMeta.mockImplementation(async (_o: string, _r: string, b: string | undefined) =>
      b === "later-work"
        ? { entries: [{ path: "module_02/a.py", type: "blob" }, { path: "module_02/b.py", type: "blob" }], truncated: false }
        : { entries: [{ path: "module_02/a.py", type: "blob" }], truncated: false }
    );
    gradeEntries.mockResolvedValue(realGrade());
  });

  it("no typed target: the real 8/10 stands, determination unset, the note is appended to improvements and the recomposed comment", async () => {
    const result = await gradeRepoAction("org/student-repo", "Do it.", "rubric", "gemini", undefined, "module_02");
    if (!("run" in result)) throw new Error("expected a graded result");
    const first = result.run.results[0];
    expect(first.totalScore).toBe("8/10");
    expect(first.determination).toBeUndefined();
    expect(first.strengths).toBe("Good work.");
    const note = 'The work exists on the branch "later-work", which was never merged into the default branch "main". Merging or re-pointing it to "main" would let it be graded.';
    expect(first.improvements).toBe(`Add docstrings. ${note}`);
    expect(first.overallComment).toBe(`Good work. Add docstrings. ${note} You are welcome to resubmit.`);
    expect(result.branchMergeCheck).toEqual({ status: "not-merged", targetBranch: "main", targetWasExplicit: false, foundOnBranch: "later-work" });
  });

  it("a merged result gets NO note appended (the comment is the model's, untouched)", async () => {
    getRepoTreeWithMeta.mockResolvedValue({ entries: [{ path: "module_02/a.py", type: "blob" }], truncated: false });
    const result = await gradeRepoAction("org/student-repo", "Do it.", "rubric", "gemini", undefined, "module_02");
    if (!("run" in result)) throw new Error("expected a graded result");
    expect(result.run.results[0].overallComment).toBe("Good work. Add docstrings. You are welcome to resubmit.");
  });

  it("AC6: fetchTree calls are bounded - 1 graded-ref tree + min(B-1, 10) branch trees, 1 branch list", async () => {
    const others = Array.from({ length: 14 }, (_, i) => `b-${i}`);
    listBranches.mockResolvedValue({ branches: ["main", ...others], defaultBranch: "main" });
    getRepoTreeWithMeta.mockResolvedValue({ entries: [{ path: "module_02/a.py", type: "blob" }], truncated: false });
    await gradeRepoAction("org/student-repo", "Do it.", "rubric", "gemini", undefined, "module_02");
    expect(listBranches).toHaveBeenCalledTimes(1);
    expect(getRepoTreeWithMeta).toHaveBeenCalledTimes(1 + 10);
  });
});
