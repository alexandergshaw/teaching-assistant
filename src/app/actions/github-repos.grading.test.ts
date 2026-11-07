// TDD for a live correctness bug in repo grading (real student grades were
// wrong): gradeRepoAction (github-repos.ts) used to pull a folder's README
// out of its own ingested digest to use as the ASSIGNMENT INSTRUCTIONS
// (useReadmeInstructions), but left that same README sitting in the digest
// - so it was ALSO graded as if it were the student's SUBMISSION. In the
// reported course, that README was a full tutorial containing a worked
// solution; a student whose folder held only `.gitkeep`, `README.md`, and a
// test file (no submission at all) was graded 10.80/12 with feedback
// praising her for code she never wrote.
//
// FIX 1: the file used as instructions is excluded from what is graded
// (excludeInstructionsFromDigest, github.digest.ts).
// FIX 2: once that file and universal scaffolding (.gitkeep) are removed, an
// empty graded folder must never be MODEL-graded. It now returns a
// deterministic graded "0" (determination "no-submission", no model call)
// whose comment says nothing was submitted - see expectGradedZero below.
//
// This is a "use server" action with heavy runtime dependencies
// (requireOwner -> Supabase auth, ingestRepo -> live GitHub fetches,
// gradeEntries/generateRubric -> an LLM call) - every one of them is mocked
// so the test exercises gradeRepoAction's own orchestration directly, not a
// real network/model call. `pickReadmeInstructions` is left REAL (it is
// pure and already has its own dedicated test file) so this test proves the
// two modules are actually wired together correctly, not just each in
// isolation.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as admissionMode from "@/lib/repo-grades-dashboard/admission-mode";
import { claimRepoGrade } from "@/lib/repo-grades-dashboard/ledger";

const ingestRepo = vi.fn();
const generateRubric = vi.fn();
const gradeEntries = vi.fn();
const buildEmbeddedRubric = vi.fn();
const gradeEntriesEmbedded = vi.fn();
const renderRubricText = vi.fn();
const attachCodeRuns = vi.fn();
const rememberRubric = vi.fn();
// G3 (docs/no-submission-and-requirement-checking-acceptance-criteria.md
// section 3): the branch-scan check gradeRepoAction's no-submission branch
// now runs. Defaulted below (beforeEach) to "no other branches" so every
// existing test in this file - none of which cares about the branch scan -
// keeps seeing the exact same `reason` prefix it always did. Dedicated
// coverage for the scan itself, and for its wiring into gradeRepoAction's
// `determination`/`reason`, lives in
// github-repos.grading.unmerged-branch.test.ts.
const listBranches = vi.fn();
const getRepoTreeWithMeta = vi.fn();

vi.mock("@/lib/supabase/auth", () => ({ requireAppOwner: vi.fn(async () => ({ id: "owner" })) }));
vi.mock("@/lib/repo-grades-dashboard/ledger", () => ({ claimRepoGrade: vi.fn(), settleRepoGrade: vi.fn() }));

vi.mock("@/lib/github", async (importOriginal) => {
  // Partial mock: everything gradeRepoAction actually calls that hits the
  // network/LLM/db is replaced above, but `excludeInstructionsFromDigest` and
  // `isScaffoldingFile` (FIX 1's other half, and FIX 2's no-submission rule -
  // now shared with gradeReposAction in github.ts, see
  // src/lib/github.digest.ts's isScaffoldingFile doc comment) are kept REAL
  // via importOriginal. Both are pure (no I/O) and both have dedicated unit
  // tests in github.digest.test.ts - `excludeInstructionsFromDigest` always
  // did; `isScaffoldingFile` did NOT until 2026-08-31, when this very comment
  // was found asserting coverage that did not exist. Re-mocking either here
  // would hide any wiring mismatch between the two files, which is exactly
  // what this test exists to catch.
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
  // graded-zero result from them); only the network/LLM entry points are mocked.
  ...(await importOriginal<typeof import("@/lib/grade")>()),
  generateRubric: (...args: unknown[]) => generateRubric(...args),
  gradeEntries: (...args: unknown[]) => gradeEntries(...args),
}));

vi.mock("@/lib/embedded-grader", () => ({
  buildEmbeddedRubric: (...args: unknown[]) => buildEmbeddedRubric(...args),
  gradeEntriesEmbedded: (...args: unknown[]) => gradeEntriesEmbedded(...args),
  renderRubricText: (...args: unknown[]) => renderRubricText(...args),
}));

vi.mock("@/lib/code-runner", () => ({
  attachCodeRuns: (...args: unknown[]) => attachCodeRuns(...args),
}));

vi.mock("@/lib/research/rubric-bank", () => ({
  rememberRubric: (...args: unknown[]) => rememberRubric(...args),
}));

const { gradeRepoAction } = await import("./github-repos");

afterEach(() => vi.restoreAllMocks());

it("keeps a manual repository grade outside the evaluator when the shared reservation is busy", async () => {
  vi.spyOn(admissionMode, "repoGradeAdmissionMode").mockReturnValue("coordinated");
  vi.mocked(claimRepoGrade).mockResolvedValueOnce({ status: "busy" });
  await expect(gradeRepoAction("org/student", "Instructions", "", "gemini", undefined, "module_01"))
    .resolves.toEqual({ error: "Repository grading is already in progress or awaiting reconciliation.", admissionStatus: "blocked" });
  expect(claimRepoGrade).toHaveBeenCalledExactlyOnceWith({ mode: "manual", repo: "org/student" });
  expect(ingestRepo).not.toHaveBeenCalled();
  expect(gradeEntries).not.toHaveBeenCalled();
});

function file(path: string, content: string) {
  return { path, content, truncated: false };
}

function digestOf(files: ReturnType<typeof file>[], overrides: Partial<Record<string, unknown>> = {}) {
  return {
    fullName: "org/student-repo",
    description: "",
    fileCount: files.length,
    text: "# Repository: org/student-repo" + files.map((f) => `\n\n--- FILE: ${f.path} ---\n${f.content}`).join(""),
    truncated: false,
    files,
    prefixMatchedNothing: false,
    skipped: { type: 0, size: 0, budget: 0, fetchError: 0 },
    treeTruncated: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  gradeEntries.mockResolvedValue({ results: [{ student: "s", totalScore: "0/10", rubricAreas: [] }], rubricAreaNames: [], fullCreditChecklist: [] });
  generateRubric.mockResolvedValue("Generated rubric text");
  // No other branches by default, so the branch scan resolves to
  // `{ kind: "not-found", branchesChecked: 0, branchesSkipped: 0 }` and
  // every existing `reason` assertion in this file is unaffected.
  listBranches.mockResolvedValue({ branches: ["main"], defaultBranch: "main" });
  getRepoTreeWithMeta.mockResolvedValue({ entries: [], truncated: false });
});

it("excludes student assignment READMEs from a rubric-only unpinned grade", async () => {
  ingestRepo.mockResolvedValue(digestOf([file("module_02/main.py", "print(1)")]));
  await gradeRepoAction("org/student-repo", "", "Correctness: 100 points", "gemini", undefined, "module_02");
  expect(ingestRepo).toHaveBeenCalledWith("org", "student-repo", {
    pathPrefix: "module_02", excludeInstructionReadme: true,
  }, undefined);
});

// An empty graded folder with no other branch holding it: a graded bare "0",
// determination "no-submission", NO model call (the leverage removal test).
function expectGradedZero(result: unknown): void {
  if (typeof result !== "object" || result === null || !("run" in result)) throw new Error("expected a graded zero run");
  const first = (result as { run: { results: Array<{ totalScore: string; determination?: string; overallComment: string }> } }).run.results[0];
  expect(first.totalScore).toBe("0");
  expect(first.determination).toBe("no-submission");
  expect(first.overallComment.toLowerCase()).toContain("nothing was submitted");
  expect("noSubmission" in result).toBe(false);
}

const SOLUTION_README = "How to complete this assignment:\n\ndef trip_math():\n    return 42  # full worked solution";

describe("gradeRepoAction - FIX 1 + FIX 2: a README used as instructions must never also be graded as the submission", () => {
  it.each(["gemini", "embedded"] as const)("refuses student README instruction mode before reading a repo for %s", async (provider) => {
    const result = await gradeRepoAction("org/student-repo", "", "", provider, undefined, "module_02", true);
    expect(result).toEqual({ error: "Template instructions are required. Use the repository gradebook to grade with the course template." });
    expect(ingestRepo).not.toHaveBeenCalled();
    expect(gradeEntries).not.toHaveBeenCalled();
    expect(gradeEntriesEmbedded).not.toHaveBeenCalled();
  });

  it("also excludes the README by CONTENT when a caller pre-fetches it itself and passes it as assignmentInstructions (no useReadmeInstructions flag)", async () => {
    // Mirrors steps.grading-repos.helpers.ts's resolveReadmeInstructions
    // pattern: the caller already read the README text itself and hands it
    // straight in as `assignmentInstructions`, never setting
    // `useReadmeInstructions`. gradeRepoAction has no path to go on here -
    // only the text - which is exactly what the content-match half of
    // excludeInstructionsFromDigest exists to catch.
    ingestRepo.mockResolvedValue(digestOf([file("module_02/README.md", SOLUTION_README)]));

    const result = await gradeRepoAction(
      "org/student-repo",
      SOLUTION_README,
      "",
      "gemini",
      undefined,
      "module_02"
      // useReadmeInstructions omitted entirely
    );

    expectGradedZero(result);
    expect(gradeEntries).not.toHaveBeenCalled();
  });

  it("an entirely empty (or nonexistent) folder is also reported as a deterministic graded zero (no model call)", async () => {
    ingestRepo.mockResolvedValue(digestOf([], { prefixMatchedNothing: true }));

    const result = await gradeRepoAction("org/student-repo", "Do the assignment.", "", "gemini", undefined, "module_09");

    expectGradedZero(result);
    expect(gradeEntries).not.toHaveBeenCalled();
  });


});

describe("gradeRepoAction - compiler auto-run control", () => {
  it("threads the Repo Grades checkbox value into LLM grading options", async () => {
    ingestRepo.mockResolvedValue(digestOf([file("module_02/main.py", "print(1)")]));

    await gradeRepoAction("org/student-repo", "Do the assignment.", "", "gemini", undefined, "module_02", false, false);

    expect(gradeEntries).toHaveBeenCalledOnce();
    expect((gradeEntries.mock.calls[0] as unknown[])[5]).toMatchObject({ autoRunCode: false });
  });

  it("enables compiler execution in LLM grading when the checkbox is on", async () => {
    ingestRepo.mockResolvedValue(digestOf([file("module_02/main.py", "print(1)")]));

    await gradeRepoAction("org/student-repo", "Do the assignment.", "", "gemini", undefined, "module_02", false, true);

    expect(gradeEntries).toHaveBeenCalledOnce();
    expect((gradeEntries.mock.calls[0] as unknown[])[5]).toMatchObject({ autoRunCode: true });
  });
});
