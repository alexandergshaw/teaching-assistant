// TDD for docs/no-submission-and-requirement-checking-acceptance-criteria.md
// section 3 (G3): the owner's second ask - "this repo grader should also be
// capable of checking to see if there are other branches with appropriate
// folder with files in it (i.e. a merge did not occur). in that case, it
// still counts as not submitting, but this should be flagged in comments".
//
// gradeRepoAction's no-submission branch (github-repos.ts) now calls
// scanBranchesForUnmergedSubmission (repo-grade-branch-scan.ts) before
// returning. This file proves the WIRING between the two - the pure scan
// module's own behaviour (found/not-found/undetermined, the branch cap,
// classification) is covered directly and exhaustively by
// repo-grade-branch-scan.test.ts and is not re-tested here.
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

vi.mock("@/lib/supabase/auth", () => ({ requireOwner: vi.fn(async () => ({ id: "owner" })) }));

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

vi.mock("@/lib/grade", () => ({
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

beforeEach(() => {
  vi.clearAllMocks();
  ingestRepo.mockResolvedValue(digestOf([]));
});

describe("gradeRepoAction - G3: checking other branches for the same folder when the graded ref has nothing", () => {
  it("names the unmerged branch, sets determination, and produces no grade/score - the outcome is unchanged", async () => {
    listBranches.mockResolvedValue({ branches: ["main", "feature-add-trip-math"], defaultBranch: "main" });
    getRepoTreeWithMeta.mockImplementation(async (_owner: string, _repo: string, branch: string) =>
      branch === "feature-add-trip-math"
        ? { entries: [{ path: "module_02/trip_math.py", type: "blob" }], truncated: false }
        : { entries: [], truncated: false }
    );

    const result = await gradeRepoAction("org/student-repo", "Do the assignment.", "", "gemini", undefined, "module_02");

    expect("noSubmission" in result).toBe(true);
    if (!("noSubmission" in result)) throw new Error("expected noSubmission");
    // Still not a grade, still no score - the outcome does not change (G3a).
    expect("run" in result).toBe(false);
    expect(gradeEntries).not.toHaveBeenCalled();
    expect(result.determination).toBe("no-submission-unmerged-branch");
    expect(result.reason).toContain("feature-add-trip-math");
    expect(result.reason.toLowerCase()).toContain("nothing was submitted");
    // The branch name must never be smuggled into anything a first-number
    // score parser could misread (G1a) - this return shape has no score
    // field at all on the no-submission path, which this assertion pins.
    expect("totalScore" in result).toBe(false);
  });

  it("the comment names the branch and states the work was not on the graded branch, without accusing the student of misconduct", async () => {
    listBranches.mockResolvedValue({ branches: ["main", "unmerged-fix"], defaultBranch: "main" });
    getRepoTreeWithMeta.mockImplementation(async (_owner: string, _repo: string, branch: string) =>
      branch === "unmerged-fix"
        ? { entries: [{ path: "module_02/solution.py", type: "blob" }], truncated: false }
        : { entries: [], truncated: false }
    );

    const result = await gradeRepoAction("org/student-repo", "Do the assignment.", "", "gemini", undefined, "module_02");
    if (!("noSubmission" in result)) throw new Error("expected noSubmission");

    expect(result.reason).toContain('"unmerged-fix"');
    expect(result.reason).toContain("never merged into the graded branch");
    // No accusatory language.
    for (const word of ["cheat", "cheated", "plagiar", "dishonest", "lied", "fault", "blame"]) {
      expect(result.reason.toLowerCase()).not.toContain(word);
    }
  });

  it("a genuinely empty repo (no other branches at all) yields plain no-submission with no determination", async () => {
    listBranches.mockResolvedValue({ branches: ["main"], defaultBranch: "main" });

    const result = await gradeRepoAction("org/student-repo", "Do the assignment.", "", "gemini", undefined, "module_02");

    expect("noSubmission" in result).toBe(true);
    if (!("noSubmission" in result)) throw new Error("expected noSubmission");
    expect(result.determination).toBeUndefined();
    expect(getRepoTreeWithMeta).not.toHaveBeenCalled();
  });

  it("other branches that are equally empty (or only scaffolding/README) also yield plain no-submission", async () => {
    listBranches.mockResolvedValue({ branches: ["main", "also-empty"], defaultBranch: "main" });
    getRepoTreeWithMeta.mockResolvedValue({
      entries: [{ path: "module_02/README.md", type: "blob" }],
      truncated: false,
    });

    const result = await gradeRepoAction("org/student-repo", "Do the assignment.", "", "gemini", undefined, "module_02");
    if (!("noSubmission" in result)) throw new Error("expected noSubmission");

    expect(result.determination).toBeUndefined();
  });

  describe("could-not-determine states never read as a confident negative (G3d)", () => {
    it("listBranches failing (e.g. a 404) leaves determination unset but says the check could not be completed", async () => {
      listBranches.mockRejectedValue(new Error("GitHub resource not found (404). Check the owner/repo and the token's access."));

      const result = await gradeRepoAction("org/student-repo", "Do the assignment.", "", "gemini", undefined, "module_02");
      if (!("noSubmission" in result)) throw new Error("expected noSubmission");

      expect(result.determination).toBeUndefined();
      expect(result.reason).toContain("could not be checked");
      expect(result.reason.toLowerCase()).not.toContain("no other branch");
    });

    it("a rate-limited branch fetch leaves determination unset but says the check could not be completed", async () => {
      listBranches.mockResolvedValue({ branches: ["main", "some-branch"], defaultBranch: "main" });
      getRepoTreeWithMeta.mockRejectedValue(new Error("GitHub request failed (HTTP 429): secondary rate limit."));

      const result = await gradeRepoAction("org/student-repo", "Do the assignment.", "", "gemini", undefined, "module_02");
      if (!("noSubmission" in result)) throw new Error("expected noSubmission");

      expect(result.determination).toBeUndefined();
      expect(result.reason).toContain("could not be checked");
      expect(result.reason).toContain("rate limit was hit");
    });

    it("a truncated, empty-looking branch tree leaves determination unset but says the check could not be completed", async () => {
      listBranches.mockResolvedValue({ branches: ["main", "huge-branch"], defaultBranch: "main" });
      getRepoTreeWithMeta.mockResolvedValue({ entries: [], truncated: true });

      const result = await gradeRepoAction("org/student-repo", "Do the assignment.", "", "gemini", undefined, "module_02");
      if (!("noSubmission" in result)) throw new Error("expected noSubmission");

      expect(result.determination).toBeUndefined();
      expect(result.reason).toContain("could not be checked");
      expect(result.reason).toContain("truncated");
    });

    it("a 409 empty-repository response fetching a branch leaves determination unset but says the check could not be completed", async () => {
      listBranches.mockResolvedValue({ branches: ["main", "odd-branch"], defaultBranch: "main" });
      getRepoTreeWithMeta.mockRejectedValue(new Error("GitHub request failed (HTTP 409): Git Repository is empty."));

      const result = await gradeRepoAction("org/student-repo", "Do the assignment.", "", "gemini", undefined, "module_02");
      if (!("noSubmission" in result)) throw new Error("expected noSubmission");

      expect(result.determination).toBeUndefined();
      expect(result.reason).toContain("could not be checked");
      expect(result.reason).toContain("HTTP 409");
    });
  });

  it("the branch cap is enforced and reported in the comment", async () => {
    const others = Array.from({ length: 14 }, (_, i) => `branch-${i}`);
    listBranches.mockResolvedValue({ branches: ["main", ...others], defaultBranch: "main" });
    getRepoTreeWithMeta.mockResolvedValue({ entries: [], truncated: false });

    const result = await gradeRepoAction("org/student-repo", "Do the assignment.", "", "gemini", undefined, "module_02");
    if (!("noSubmission" in result)) throw new Error("expected noSubmission");

    // 14 other branches, MAX_BRANCHES_SCANNED (10) checked, 4 skipped.
    expect(getRepoTreeWithMeta).toHaveBeenCalledTimes(10);
    expect(result.reason).toContain("4 other branches");
    expect(result.reason).toContain("were not checked");
  });

  it("the scan is never invoked for a repo that submitted something", async () => {
    ingestRepo.mockResolvedValue(digestOf([{ path: "module_02/trip_math.py", content: "def trip_math(): return 7" }]));
    gradeEntries.mockResolvedValue({ results: [{ student: "s", totalScore: "8/10", rubricAreas: [] }], rubricAreaNames: [], fullCreditChecklist: [] });

    const result = await gradeRepoAction("org/student-repo", "Do the assignment.", "", "gemini", undefined, "module_02");

    expect("noSubmission" in result).toBe(false);
    expect(listBranches).not.toHaveBeenCalled();
    expect(getRepoTreeWithMeta).not.toHaveBeenCalled();
  });
});
