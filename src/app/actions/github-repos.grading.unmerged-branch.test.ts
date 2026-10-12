// TDD for docs/no-submission-and-requirement-checking-acceptance-criteria.md
// section 3 (G3), re-pointed by docs/repo-grades-no-submission-graded-scope.md:
// when the graded ref has nothing, gradeRepoAction checks the repo's OTHER
// branches and now returns a GRADED bare "0" whose COMMENT carries the
// branch-aware note (it used to return an ungraded sentinel with a transient
// reason). Only an undetermined scan stays ungraded (RES-1).
//
// This file proves the WIRING between the action and the scan - the pure scan
// module's own behaviour (found/not-found/undetermined, the branch cap,
// classification) is covered directly by repo-grade-branch-scan.test.ts.
//
// Same mocking posture as github-repos.grading.test.ts (a "use server"
// action with heavy runtime dependencies, every one mocked so this exercises
// gradeRepoAction's own orchestration, not a real network/model call).
import { describe, it, expect, vi, beforeEach } from "vitest";

const ingestRepo = vi.fn();
const generateRubric = vi.fn();
const gradeEntries = vi.fn();
const listBranches = vi.fn();
const getRepoTreeWithMeta = vi.fn();

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
  // Partial: the real comment composers stay real (grade-zeros.ts builds the
  // graded-zero result from them); only the LLM entry points are mocked.
  ...(await importOriginal<typeof import("@/lib/grade")>()),
  generateRubric: (...args: unknown[]) => generateRubric(...args),
  gradeEntries: (...args: unknown[]) => gradeEntries(...args),
}));

vi.mock("@/lib/embedded-grader", () => ({
  buildEmbeddedRubric: vi.fn(),
  gradeEntriesEmbedded: vi.fn(),
  renderRubricText: vi.fn(),
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

interface ZeroRun {
  run: { results: Array<{ totalScore: string; determination?: string; overallComment: string; improvements: string }> };
  branchMergeCheck?: { status: string; targetBranch: string; targetWasExplicit: boolean; foundOnBranch?: string };
}

// Confirmed absence (or an unmerged branch) is a GRADED bare "0", never the
// ungraded noSubmission sentinel.
function expectZeroRun(result: unknown): asserts result is ZeroRun {
  if (typeof result !== "object" || result === null || !("run" in result)) throw new Error("expected a graded zero run");
  if ("noSubmission" in result) throw new Error("must not be the ungraded sentinel");
}

function expectUngradedSentinel(result: unknown): asserts result is { noSubmission: true; reason: string; determination?: string } {
  if (typeof result !== "object" || result === null || !("noSubmission" in result)) throw new Error("expected noSubmission");
}

beforeEach(() => {
  vi.clearAllMocks();
  ingestRepo.mockResolvedValue(digestOf([]));
});

describe("gradeRepoAction - G3: checking other branches for the same folder when the graded ref has nothing", () => {
  it("names the unmerged branch in the COMMENT, sets determination, and grades a bare 0 with no model call", async () => {
    listBranches.mockResolvedValue({ branches: ["main", "feature-add-trip-math"], defaultBranch: "main" });
    getRepoTreeWithMeta.mockImplementation(async (_owner: string, _repo: string, branch: string) =>
      branch === "feature-add-trip-math"
        ? { entries: [{ path: "module_02/trip_math.py", type: "blob" }], truncated: false }
        : { entries: [], truncated: false }
    );

    const result = await gradeRepoAction("org/student-repo", "Do the assignment.", "", "gemini", undefined, "module_02");

    expectZeroRun(result);
    const first = result.run.results[0];
    expect(first.totalScore).toBe("0");
    // RULING 2: the purpose-built member, distinct from absent-everywhere.
    expect(first.determination).toBe("no-submission-unmerged-branch");
    expect(first.overallComment).toContain("feature-add-trip-math");
    expect(first.overallComment).toContain('never merged into the default branch "main"');
    expect(first.overallComment.toLowerCase()).toContain("nothing was submitted");
    expect(result.branchMergeCheck).toEqual({
      status: "not-merged",
      targetBranch: "main",
      targetWasExplicit: false,
      foundOnBranch: "feature-add-trip-math",
    });
    expect(gradeEntries).not.toHaveBeenCalled();
    expect(generateRubric).not.toHaveBeenCalled();
  });

  it("the comment is non-accusatory", async () => {
    listBranches.mockResolvedValue({ branches: ["main", "unmerged-fix"], defaultBranch: "main" });
    getRepoTreeWithMeta.mockImplementation(async (_owner: string, _repo: string, branch: string) =>
      branch === "unmerged-fix"
        ? { entries: [{ path: "module_02/solution.py", type: "blob" }], truncated: false }
        : { entries: [], truncated: false }
    );

    const result = await gradeRepoAction("org/student-repo", "Do the assignment.", "", "gemini", undefined, "module_02");
    expectZeroRun(result);
    const comment = result.run.results[0].overallComment;
    expect(comment).toContain('"unmerged-fix"');
    // Whole-word match: "default branch" legitimately contains the letters "fault".
    for (const word of ["cheat", "cheated", "plagiar", "dishonest", "lied", "fault", "blame"]) {
      expect(comment.toLowerCase()).not.toMatch(new RegExp(`\\b${word}`));
    }
  });

  it("a genuinely empty repo (no other branches at all) grades 0 with plain determination no-submission", async () => {
    listBranches.mockResolvedValue({ branches: ["main"], defaultBranch: "main" });

    const result = await gradeRepoAction("org/student-repo", "Do the assignment.", "", "gemini", undefined, "module_02");

    expectZeroRun(result);
    const first = result.run.results[0];
    expect(first.totalScore).toBe("0");
    expect(first.determination).toBe("no-submission");
    expect(first.overallComment).toContain('No submission was found on the default branch "main" or on any other branch');
    expect(getRepoTreeWithMeta).not.toHaveBeenCalled();
    expect(result.branchMergeCheck?.status).toBe("no-submission");
  });

  it("other branches that are equally empty (or only scaffolding/README) also grade 0 as no-submission", async () => {
    listBranches.mockResolvedValue({ branches: ["main", "also-empty"], defaultBranch: "main" });
    getRepoTreeWithMeta.mockResolvedValue({
      entries: [{ path: "module_02/README.md", type: "blob" }],
      truncated: false,
    });

    const result = await gradeRepoAction("org/student-repo", "Do the assignment.", "", "gemini", undefined, "module_02");
    expectZeroRun(result);
    expect(result.run.results[0].determination).toBe("no-submission");
  });

  it("the unmerged-branch zero and the absent-everywhere zero differ in determination AND comment (RULING 2)", async () => {
    listBranches.mockResolvedValue({ branches: ["main", "side"], defaultBranch: "main" });
    getRepoTreeWithMeta.mockImplementation(async (_o: string, _r: string, b: string) =>
      b === "side" ? { entries: [{ path: "module_02/a.py", type: "blob" }], truncated: false } : { entries: [], truncated: false }
    );
    const unmerged = await gradeRepoAction("org/student-repo", "Do it.", "", "gemini", undefined, "module_02");
    getRepoTreeWithMeta.mockResolvedValue({ entries: [], truncated: false });
    const absent = await gradeRepoAction("org/student-repo", "Do it.", "", "gemini", undefined, "module_02");
    expectZeroRun(unmerged);
    expectZeroRun(absent);
    expect(unmerged.run.results[0].determination).not.toBe(absent.run.results[0].determination);
    expect(unmerged.run.results[0].overallComment).not.toBe(absent.run.results[0].overallComment);
  });

  describe("could-not-determine states never read as a confident negative or a zero (G3d, RES-1)", () => {
    it("listBranches failing (e.g. a 404) stays ungraded and says the check could not be completed", async () => {
      listBranches.mockRejectedValue(new Error("GitHub resource not found (404). Check the owner/repo and the token's access."));

      const result = await gradeRepoAction("org/student-repo", "Do the assignment.", "", "gemini", undefined, "module_02");
      expectUngradedSentinel(result);

      expect(result.determination).toBeUndefined();
      expect(result.reason).toContain("could not be checked");
      expect(result.reason.toLowerCase()).not.toContain("no other branch");
      expect("run" in result).toBe(false);
    });

    it("a rate-limited branch fetch stays ungraded and says the check could not be completed", async () => {
      listBranches.mockResolvedValue({ branches: ["main", "some-branch"], defaultBranch: "main" });
      getRepoTreeWithMeta.mockRejectedValue(new Error("GitHub request failed (HTTP 429): secondary rate limit."));

      const result = await gradeRepoAction("org/student-repo", "Do the assignment.", "", "gemini", undefined, "module_02");
      expectUngradedSentinel(result);

      expect(result.determination).toBeUndefined();
      expect(result.reason).toContain("could not be checked");
      expect(result.reason).toContain("rate limit was hit");
    });

    it("a truncated, empty-looking branch tree stays ungraded and says the check could not be completed", async () => {
      listBranches.mockResolvedValue({ branches: ["main", "huge-branch"], defaultBranch: "main" });
      getRepoTreeWithMeta.mockResolvedValue({ entries: [], truncated: true });

      const result = await gradeRepoAction("org/student-repo", "Do the assignment.", "", "gemini", undefined, "module_02");
      expectUngradedSentinel(result);

      expect(result.determination).toBeUndefined();
      expect(result.reason).toContain("could not be checked");
      expect(result.reason).toContain("truncated");
    });

    it("a 409 empty-repository response fetching a branch stays ungraded and says the check could not be completed", async () => {
      listBranches.mockResolvedValue({ branches: ["main", "odd-branch"], defaultBranch: "main" });
      getRepoTreeWithMeta.mockRejectedValue(new Error("GitHub request failed (HTTP 409): Git Repository is empty."));

      const result = await gradeRepoAction("org/student-repo", "Do the assignment.", "", "gemini", undefined, "module_02");
      expectUngradedSentinel(result);

      expect(result.determination).toBeUndefined();
      expect(result.reason).toContain("could not be checked");
      expect(result.reason).toContain("HTTP 409");
    });
  });

  it("the branch cap is enforced and reported in the graded-zero comment", async () => {
    const others = Array.from({ length: 14 }, (_, i) => `branch-${i}`);
    listBranches.mockResolvedValue({ branches: ["main", ...others], defaultBranch: "main" });
    getRepoTreeWithMeta.mockResolvedValue({ entries: [], truncated: false });

    const result = await gradeRepoAction("org/student-repo", "Do the assignment.", "", "gemini", undefined, "module_02");
    expectZeroRun(result);

    // 14 other branches, MAX_BRANCHES_SCANNED (10) checked, 4 skipped.
    expect(getRepoTreeWithMeta).toHaveBeenCalledTimes(10);
    expect(result.run.results[0].overallComment).toContain("4 other branches");
    expect(result.run.results[0].overallComment).toContain("were not checked");
  });

  it("a repo that submitted something is graded for real; the scan now runs once with no typed target", async () => {
    ingestRepo.mockResolvedValue(digestOf([{ path: "module_02/trip_math.py", content: "def trip_math(): return 7" }]));
    gradeEntries.mockResolvedValue({ results: [{ student: "s", totalScore: "8/10", rubricAreas: [] }], rubricAreaNames: [], fullCreditChecklist: [] });
    listBranches.mockResolvedValue({ branches: ["main"], defaultBranch: "main" });
    getRepoTreeWithMeta.mockResolvedValue({ entries: [{ path: "module_02/trip_math.py", type: "blob" }], truncated: false });

    const result = await gradeRepoAction("org/student-repo", "Do the assignment.", "", "gemini", undefined, "module_02");

    expect("noSubmission" in result).toBe(false);
    expect(listBranches).toHaveBeenCalledTimes(1);
    expect(gradeEntries).toHaveBeenCalledTimes(1);
  });
});
