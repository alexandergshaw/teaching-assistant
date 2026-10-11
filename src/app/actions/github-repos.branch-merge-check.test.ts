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

vi.mock("@/lib/grade", () => ({
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
  branchMergeCheck?: { status: string; targetBranch: string; foundOnBranch?: string; undeterminedReason?: string };
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

  it("a whitespace-only target is forwarded as undefined, with no merge check", async () => {
    ingestRepo.mockResolvedValue(digestOf([{ path: "module_02/a.py", content: "x=1" }]));
    const result = await gradeRepoAction("org/student-repo", "Do it.", "", "gemini", "   ", "module_02");
    expect(ingestRepo.mock.calls[0][3]).toBeUndefined();
    expect("branchMergeCheck" in result ? result.branchMergeCheck : "absent").toBeUndefined();
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
  });

  it("gemini/LLM success return carries status merged and still grades", async () => {
    const result = await gradeRepoAction("org/student-repo", "Do it.", "rubric", "gemini", "main", "module_02");
    if (!("run" in result)) throw new Error("expected a graded result");
    expect(result.branchMergeCheck).toEqual({ status: "merged", targetBranch: "main" });
    expect(gradeEntries).toHaveBeenCalled();
    expect(listBranches).not.toHaveBeenCalled();
  });

  it("EMBEDDED success return carries status merged", async () => {
    const result = await gradeRepoAction("org/student-repo", "Do it.", "rubric", "embedded", "main", "module_02");
    if (!("run" in result)) throw new Error("expected a graded result");
    expect(result.branchMergeCheck).toEqual({ status: "merged", targetBranch: "main" });
    expect(gradeEntriesEmbedded).toHaveBeenCalled();
    expect(listBranches).not.toHaveBeenCalled();
  });

  it("no target: no branchMergeCheck on either engine", async () => {
    const a = await gradeRepoAction("org/student-repo", "Do it.", "rubric", "gemini", undefined, "module_02");
    const b = await gradeRepoAction("org/student-repo", "Do it.", "rubric", "embedded", undefined, "module_02");
    for (const r of [a, b]) {
      if (!("run" in r)) throw new Error("expected a graded result");
      expect(r.branchMergeCheck).toBeUndefined();
    }
  });
});

describe("gradeRepoAction - empty target: not-merged vs no-submission vs unknown", () => {
  it("branch present but unmerged -> not-merged, determination agrees, no score", async () => {
    listBranches.mockResolvedValue({ branches: ["main", "feature-x"], defaultBranch: "main" });
    getRepoTreeWithMeta.mockImplementation(async (_o: string, _r: string, b: string) =>
      b === "feature-x"
        ? { entries: [{ path: "module_02/a.py", type: "blob" }], truncated: false }
        : { entries: [], truncated: false }
    );
    const result = await gradeRepoAction("org/student-repo", "Do it.", "", "gemini", "main", "module_02");
    expectNoSubmission(result);
    expect(result.branchMergeCheck).toEqual({ status: "not-merged", targetBranch: "main", foundOnBranch: "feature-x" });
    expect(result.determination).toBe("no-submission-unmerged-branch");
    expect(result.reason).toContain('"feature-x"');
    expect(result.reason).toContain('"main"');
    expect("totalScore" in result).toBe(false);
    expect(gradeEntries).not.toHaveBeenCalled();
  });

  it("no branch holds the work -> no-submission with no foundOnBranch and no determination", async () => {
    listBranches.mockResolvedValue({ branches: ["main", "other"], defaultBranch: "main" });
    getRepoTreeWithMeta.mockResolvedValue({ entries: [], truncated: false });
    const result = await gradeRepoAction("org/student-repo", "Do it.", "", "gemini", "main", "module_02");
    expectNoSubmission(result);
    expect(result.branchMergeCheck).toEqual({ status: "no-submission", targetBranch: "main" });
    expect(result.determination).toBeUndefined();
    expect("totalScore" in result).toBe(false);
  });

  it("the not-merged note TEXT differs from the no-submission note TEXT (AC-4), both non-accusatory", async () => {
    listBranches.mockResolvedValue({ branches: ["main", "feature-x"], defaultBranch: "main" });
    getRepoTreeWithMeta.mockImplementation(async (_o: string, _r: string, b: string) =>
      b === "feature-x"
        ? { entries: [{ path: "module_02/a.py", type: "blob" }], truncated: false }
        : { entries: [], truncated: false }
    );
    const notMerged = await gradeRepoAction("org/student-repo", "Do it.", "", "gemini", "main", "module_02");
    getRepoTreeWithMeta.mockResolvedValue({ entries: [], truncated: false });
    const none = await gradeRepoAction("org/student-repo", "Do it.", "", "gemini", "main", "module_02");
    expectNoSubmission(notMerged);
    expectNoSubmission(none);
    expect(notMerged.reason).not.toBe(none.reason);
    expect(none.reason).toContain("No branch of this repository has submitted work");
    expect(none.reason).not.toContain("feature-x");
    for (const text of [notMerged.reason, none.reason]) {
      for (const w of BANNED) expect(text.toLowerCase()).not.toContain(w);
    }
  });

  it("an undetermined scan -> unknown with a reason, never a confident no-submission, determination unset", async () => {
    listBranches.mockRejectedValue(new Error("boom"));
    const result = await gradeRepoAction("org/student-repo", "Do it.", "", "gemini", "main", "module_02");
    expectNoSubmission(result);
    expect(result.branchMergeCheck?.status).toBe("unknown");
    expect(result.branchMergeCheck?.undeterminedReason).toBeTruthy();
    expect(result.determination).toBeUndefined();
    expect(result.reason).toContain('"main"');
  });

  it("no target set: no branchMergeCheck and today's wording is unchanged", async () => {
    listBranches.mockResolvedValue({ branches: ["main", "feature-x"], defaultBranch: "main" });
    getRepoTreeWithMeta.mockImplementation(async (_o: string, _r: string, b: string) =>
      b === "feature-x"
        ? { entries: [{ path: "module_02/a.py", type: "blob" }], truncated: false }
        : { entries: [], truncated: false }
    );
    const result = await gradeRepoAction("org/student-repo", "Do it.", "", "gemini", undefined, "module_02");
    expectNoSubmission(result);
    expect(result.branchMergeCheck).toBeUndefined();
    expect(result.determination).toBe("no-submission-unmerged-branch");
    expect(result.reason).toContain("never merged into the graded branch");
  });

  it("AC-6: determination is unmerged-branch iff status is not-merged", async () => {
    listBranches.mockResolvedValue({ branches: ["main"], defaultBranch: "main" });
    const result = await gradeRepoAction("org/student-repo", "Do it.", "", "gemini", "main", "module_02");
    expectNoSubmission(result);
    expect(result.branchMergeCheck?.status === "not-merged").toBe(result.determination === "no-submission-unmerged-branch");
  });
});
