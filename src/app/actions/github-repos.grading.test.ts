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
// empty graded folder must not receive a grade at all - gradeRepoAction
// returns `{ noSubmission: true, ... }` instead.
//
// This is a "use server" action with heavy runtime dependencies
// (requireOwner -> Supabase auth, ingestRepo -> live GitHub fetches,
// gradeEntries/generateRubric -> an LLM call) - every one of them is mocked
// so the test exercises gradeRepoAction's own orchestration directly, not a
// real network/model call. `pickReadmeInstructions` is left REAL (it is
// pure and already has its own dedicated test file) so this test proves the
// two modules are actually wired together correctly, not just each in
// isolation.
import { describe, it, expect, vi, beforeEach } from "vitest";

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

vi.mock("@/lib/supabase/auth", () => ({ requireOwner: vi.fn(async () => ({ id: "owner" })) }));

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

vi.mock("@/lib/grade", () => ({
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

const SOLUTION_README = "How to complete this assignment:\n\ndef trip_math():\n    return 42  # full worked solution";

describe("gradeRepoAction - FIX 1 + FIX 2: a README used as instructions must never also be graded as the submission", () => {
  // THE HIGHEST-VALUE CASE, corrected to match the reported incident's real
  // shape. The reported student's repo held `assignments/module_02/.gitkeep`,
  // `assignments/module_02/README.md`, and a course-provided test harness at
  // `tests/test_module_02.py` - OUTSIDE the graded folder. `ingestRepo` is
  // mocked in this file, but pathPrefix scoping is real production behavior
  // (selectDigestFiles, github.digest.ts) proven directly and unmocked by
  // github.digest.test.ts's "includes a subfolder file at depth when scoped
  // to a prefix" test, which shows a sibling top-level folder (there,
  // "other/"; here, "tests/") never enters a prefix-scoped digest at all. So
  // the digest gradeRepoAction actually receives for a run scoped to
  // "assignments/module_02" never contains the test harness - it is simply
  // out of scope, not excluded by any grading logic.
  //
  // Separately, `.gitkeep` is never in the mocked digest below either,
  // because it is never in a REAL digest: `isTextCandidate` (github.digest.ts)
  // rejects any extensionless file that is not a well-known project name or
  // executable, and a 0-byte blob is dropped even earlier by ingestRepo's own
  // `size <= 0` guard. So `isScaffoldingFile`'s ".gitkeep" branch
  // (github-repos.ts) never actually fires in production - it is kept as
  // cheap defense-in-depth in case that ingest-side filtering ever loosens,
  // and is exercised directly (not through this realistic fixture) by the
  // dedicated backstop test below.
  //
  // With both of those out of the picture, the digest gradeRepoAction
  // actually sees holds only the README - which useReadmeInstructions then
  // picks as the instructions and excludeInstructionsFromDigest removes. What
  // is left to grade is empty, so noSubmission correctly fires. This is why
  // the reported student was NOT graded on the course's test harness: it was
  // never in scope to begin with.
  it("THE HIGHEST-VALUE CASE: a folder scoped to just a solution README (its course-provided test harness sits outside the folder) produces noSubmission, never a score", async () => {
    ingestRepo.mockResolvedValue(digestOf([file("assignments/module_02/README.md", SOLUTION_README)]));

    const result = await gradeRepoAction(
      "org/student-repo",
      /* assignmentInstructions */ "",
      /* rubric */ "",
      "gemini",
      undefined,
      "assignments/module_02",
      /* useReadmeInstructions */ true
    );

    expect("noSubmission" in result).toBe(true);
    if (!("noSubmission" in result)) throw new Error("expected noSubmission");
    expect(result.reason.toLowerCase()).toContain("nothing was submitted");
    // Never a score, and never the vector that produced the wrong grade in
    // the reported case.
    expect("run" in result).toBe(false);
    expect(gradeEntries).not.toHaveBeenCalled();
    expect(generateRubric).not.toHaveBeenCalled();
  });

  // Backstop only - NOT a realistic ingestRepo shape (see the comment above):
  // proves isScaffoldingFile's ".gitkeep" wiring still works if a future
  // change to ingest-side filtering ever let such an entry through, even
  // though nothing exercises this path today.
  it("backstop: a .gitkeep entry, if it were ever present in the digest, is still excluded as scaffolding (not a realistic ingest shape - see comment above)", async () => {
    ingestRepo.mockResolvedValue(
      digestOf([file("module_02/README.md", SOLUTION_README), file("module_02/.gitkeep", "placeholder")])
    );

    const result = await gradeRepoAction(
      "org/student-repo",
      "",
      "",
      "gemini",
      undefined,
      "module_02",
      /* useReadmeInstructions */ true
    );

    expect("noSubmission" in result).toBe(true);
    expect(gradeEntries).not.toHaveBeenCalled();
  });

  it("the same folder is graded correctly once a real file is added - the fix does not over-exclude", async () => {
    ingestRepo.mockResolvedValue(
      digestOf([
        file("module_02/README.md", SOLUTION_README),
        file("module_02/trip_math.py", "def trip_math():\n    return 7  # the student's own (wrong) attempt"),
      ])
    );

    const result = await gradeRepoAction("org/student-repo", "", "", "gemini", undefined, "module_02", true);

    expect("noSubmission" in result).toBe(false);
    expect("error" in result).toBe(false);
    expect(gradeEntries).toHaveBeenCalledTimes(1);
    // THE CORE OF FIX 1: the README (the instructions) must not be part of
    // what was sent to the grader as the submission.
    const [entries] = gradeEntries.mock.calls[0] as [Array<{ content: string; submittedFiles: Array<{ name: string }> }>];
    const entry = entries[0];
    expect(entry.content).not.toContain("full worked solution");
    expect(entry.submittedFiles.map((f) => f.name)).not.toContain("module_02/README.md");
    expect(entry.submittedFiles.map((f) => f.name)).toContain("module_02/trip_math.py");
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

    expect("noSubmission" in result).toBe(true);
    expect(gradeEntries).not.toHaveBeenCalled();
  });

  it("an entirely empty (or nonexistent) folder is also reported as noSubmission, not graded as a zero", async () => {
    ingestRepo.mockResolvedValue(digestOf([], { prefixMatchedNothing: true }));

    const result = await gradeRepoAction("org/student-repo", "Do the assignment.", "", "gemini", undefined, "module_09");

    expect("noSubmission" in result).toBe(true);
    expect(gradeEntries).not.toHaveBeenCalled();
  });

  it("the embedded (deterministic) provider is covered by the same rule - no score from an empty folder", async () => {
    ingestRepo.mockResolvedValue(digestOf([file("module_02/README.md", SOLUTION_README)]));

    const result = await gradeRepoAction(
      "org/student-repo",
      "",
      "",
      "embedded",
      undefined,
      "module_02",
      true
    );

    expect("noSubmission" in result).toBe(true);
    expect(gradeEntriesEmbedded).not.toHaveBeenCalled();
    expect(buildEmbeddedRubric).not.toHaveBeenCalled();
  });
});
