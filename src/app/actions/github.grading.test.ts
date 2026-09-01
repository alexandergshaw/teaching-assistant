// TDD for FIX 1 + FIX 2 (entry 370), ported from gradeRepoAction
// (github-repos.ts, see github-repos.grading.test.ts) to gradeReposAction
// (github.ts) - the bulk multi-repo path GithubGradingPanel.tsx (the "Grade
// from: GitHub Repo" surface) actually calls. Before FIX 2, an empty scoped
// folder produced a digest whose entire text was `# Repository: owner/repo`,
// handed straight to gradeEntries - and prompts.ts's "award full points when
// nothing violates a rubric area" sentence meant a student who submitted
// nothing could be awarded full marks (the same shape as entry 370's
// reported incident, all 66 grades in that run declared void).
//
// This function grades N repos in ONE call, so - unlike gradeRepoAction's
// union return - a no-submission repo cannot replace the whole result. It is
// reported in its own sibling array (`noSubmissionRepos`, mirroring the
// already-shipped `truncatedRepos`) alongside the repos that DID grade
// normally.
//
// FIX 1 (excludeInstructionsFromDigest) IS applied here, and this comment
// previously said the opposite - that instruction was wrong. The recorded
// worry was that a student file which merely "starts the same way" as the
// instructions could be dropped; excludeInstructionsFromDigest's own doc
// comment (github.digest.ts) shows that is false for an untruncated file:
// the match is EXACT trimmed equality, never a prefix, unless the file
// itself was truncated by ingest. So the only student file FIX 1 can ever
// remove on this path is one whose content is byte-identical to the
// instructor's typed assignmentInstructions - which is precisely entry 370's
// defect (this course ships a README, often a full worked solution, in
// every module_NN/ folder; a student who submits nothing yields a digest
// containing only that README), not a false positive. This function still
// has no readmePath (it never auto-picks a README the way gradeRepoAction's
// useReadmeInstructions does), so only excludeInstructionsFromDigest's
// instructionsText branch can ever fire here - instructionsPath is never
// passed.
//
// Same mocking approach as github-repos.grading.test.ts: a "use server"
// action with heavy runtime dependencies (requireOwner -> Supabase auth,
// ingestRepo -> live GitHub fetches, gradeEntries/generateRubric -> an LLM
// call) - every one of them is mocked so the test exercises gradeReposAction's
// own orchestration, not a real network/model call.
import { describe, it, expect, vi, beforeEach } from "vitest";

const ingestRepo = vi.fn();
const generateRubric = vi.fn();
const gradeEntries = vi.fn();
const buildEmbeddedRubric = vi.fn();
const gradeEntriesEmbedded = vi.fn();
const renderRubricText = vi.fn();
const attachCodeRuns = vi.fn();
const rememberRubric = vi.fn();

vi.mock("@/lib/supabase/auth", () => ({ requireOwner: vi.fn(async () => ({ id: "owner" })) }));

vi.mock("@/lib/github", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/github")>();
  return {
    ...actual,
    parseRepoRef: (ref: string) => {
      const m = ref.trim().match(/^([^/\s]+)\/([^/\s]+)$/);
      return m ? { owner: m[1], repo: m[2] } : null;
    },
    ingestRepo: (...args: unknown[]) => ingestRepo(...args),
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

const { gradeReposAction } = await import("./github");

function file(path: string, content: string, truncated = false) {
  return { path, content, truncated };
}

// A digest shape production actually emits: `skipped` always defaults to all
// zeros (no type-skips, no size-skips, no budget-skips, no fetch errors) -
// override it per-test to simulate a real type-skip. `files` never contains
// a `.gitkeep` entry in production (0-byte blobs are dropped by
// selectDigestFiles before the type filter even runs - github.digest.ts:226)
// and never contains a type-skipped file either (a `.docx`/`.pdf` is
// filtered out before `files` is built, counted only in `skipped.type`) -
// see SHOULD 1's fixtures below for how a type-skip actually shows up.
function digestOf(fullName: string, files: ReturnType<typeof file>[], overrides: Partial<Record<string, unknown>> = {}) {
  return {
    fullName,
    description: "",
    fileCount: files.length,
    text: `# Repository: ${fullName}` + files.map((f) => `\n\n--- FILE: ${f.path} ---\n${f.content}`).join(""),
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
  gradeEntries.mockResolvedValue({
    results: [{ student: "s", totalScore: "8/10", rubricAreas: [], overallComment: "", strengths: "", improvements: "", resubmitNotice: "", feedback: "", mergedFileCount: 1, submittedFiles: [] }],
    rubricAreaNames: [],
    fullCreditChecklist: [],
  });
  generateRubric.mockResolvedValue("Generated rubric text");
});

const SOLUTION_README =
  "How to complete this assignment:\n\ndef trip_math():\n    return 42  # full worked solution";

describe("gradeReposAction - FIX 1 + FIX 2 (entry 370): a folder holding only the assignment's own README must never be graded as the student's work", () => {
  // THE HIGHEST-VALUE CASE - mirrors github-repos.grading.test.ts's test of
  // the same name for gradeRepoAction. A folder scoped to a module that
  // ships only its own instructions README (this course's real layout: every
  // module_NN/ folder gets one) must produce noSubmission, never a score -
  // this is entry 370's actual defect on the bulk-grading path: without FIX
  // 1, the README (here a full worked solution) sails past FIX 2's old
  // .gitkeep-only guard as if it were the student's file and gets graded.
  it("THE HIGHEST-VALUE CASE: a folder scoped to just a solution README, matching the typed instructions exactly, is reported as no-submission and never reaches gradeEntries", async () => {
    ingestRepo.mockResolvedValue(digestOf("org/student-empty", [file("assignments/module_02/README.md", SOLUTION_README)]));

    const result = await gradeReposAction(
      [{ repoRef: "org/student-empty", label: "Empty Student" }],
      SOLUTION_README,
      "",
      "gemini",
      "assignments/module_02"
    );

    expect("error" in result).toBe(false);
    if ("error" in result) throw new Error("expected a run, got error: " + result.error);
    expect(result.noSubmissionRepos).toEqual(["Empty Student"]);
    expect(result.run.results).toEqual([]);
    expect(gradeEntries).not.toHaveBeenCalled();
    expect(generateRubric).not.toHaveBeenCalled();
  });

  it("a student's real file is NEVER excluded merely for starting the same way as the instructions - only exact (trimmed) equality matches", async () => {
    // Deliberately shares a long common prefix with the instructions but is
    // NOT identical - excludeInstructionsFromDigest's exact-match rule (for
    // an untruncated file) must let this through to gradeEntries.
    const studentReadme = `${SOLUTION_README}\n\nMy own additional notes about how I solved it.`;
    ingestRepo.mockResolvedValue(digestOf("org/student-real", [file("assignments/module_02/README.md", studentReadme)]));

    const result = await gradeReposAction(
      [{ repoRef: "org/student-real", label: "Real Student" }],
      SOLUTION_README,
      "",
      "gemini",
      "assignments/module_02"
    );

    expect("error" in result).toBe(false);
    if ("error" in result) throw new Error("expected a run, got error: " + result.error);
    expect(result.noSubmissionRepos ?? []).toEqual([]);
    expect(gradeEntries).toHaveBeenCalledTimes(1);
    const [entries] = gradeEntries.mock.calls[0] as [Array<{ content: string }>];
    expect(entries[0].content).toContain("My own additional notes");
  });

  it("an entirely empty (or nonexistent) folder is also reported as no submission, not graded as a zero", async () => {
    ingestRepo.mockResolvedValue(digestOf("org/student-missing", [], { prefixMatchedNothing: true }));

    const result = await gradeReposAction(
      [{ repoRef: "org/student-missing" }],
      "Do the assignment.",
      "",
      "gemini",
      "module_09"
    );

    expect("error" in result).toBe(false);
    if ("error" in result) throw new Error("expected a run, got error: " + result.error);
    expect(result.noSubmissionRepos).toEqual(["org/student-missing"]);
    expect(gradeEntries).not.toHaveBeenCalled();
  });

  it("the embedded (deterministic) provider is covered by the same rule - no LLM call is possible there anyway, but no score either", async () => {
    ingestRepo.mockResolvedValue(digestOf("org/student-empty", [file("assignments/module_02/README.md", SOLUTION_README)]));

    const result = await gradeReposAction(
      [{ repoRef: "org/student-empty" }],
      SOLUTION_README,
      "",
      "embedded",
      "assignments/module_02"
    );

    expect("error" in result).toBe(false);
    if ("error" in result) throw new Error("expected a run, got error: " + result.error);
    expect(result.noSubmissionRepos).toEqual(["org/student-empty"]);
    expect(gradeEntriesEmbedded).not.toHaveBeenCalled();
    expect(buildEmbeddedRubric).not.toHaveBeenCalled();
  });

  it("a mixed batch: one repo with nothing but its solution README and two with real work returns BOTH, correctly associated - never merged, never dropped", async () => {
    ingestRepo.mockImplementation(async (owner: string, repo: string) => {
      if (repo === "student-empty") return digestOf("org/student-empty", [file("assignments/module_02/README.md", SOLUTION_README)]);
      if (repo === "student-a") return digestOf("org/student-a", [file("assignments/module_02/main.py", "print('a')")]);
      if (repo === "student-b") return digestOf("org/student-b", [file("assignments/module_02/main.py", "print('b')")]);
      throw new Error(`unexpected repo ${repo}`);
    });
    gradeEntries.mockResolvedValue({
      results: [
        { student: "Student A", totalScore: "9/10", rubricAreas: [], overallComment: "", strengths: "", improvements: "", resubmitNotice: "", feedback: "", mergedFileCount: 1, submittedFiles: [] },
        { student: "Student B", totalScore: "7/10", rubricAreas: [], overallComment: "", strengths: "", improvements: "", resubmitNotice: "", feedback: "", mergedFileCount: 1, submittedFiles: [] },
      ],
      rubricAreaNames: [],
      fullCreditChecklist: [],
    });

    const result = await gradeReposAction(
      [
        { repoRef: "org/student-a", label: "Student A" },
        { repoRef: "org/student-empty", label: "Empty Student" },
        { repoRef: "org/student-b", label: "Student B" },
      ],
      SOLUTION_README,
      "some rubric",
      "gemini",
      "assignments/module_02"
    );

    expect("error" in result).toBe(false);
    if ("error" in result) throw new Error("expected a run, got error: " + result.error);
    // The empty repo is named in its own field, distinct from the graded rows.
    expect(result.noSubmissionRepos).toEqual(["Empty Student"]);
    // Only the two repos that actually had work reached gradeEntries.
    expect(gradeEntries).toHaveBeenCalledTimes(1);
    const [entries] = gradeEntries.mock.calls[0] as [Array<{ student: string }>];
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.student)).toEqual(["Student A", "Student B"]);
    // The graded rows come back untouched, unaffected by the skipped repo.
    expect(result.run.results.map((r) => r.student)).toEqual(["Student A", "Student B"]);
  });

  it("every queued repo empty: returns an empty run (no rubric-generation crash on entries[0]) rather than an error", async () => {
    ingestRepo.mockImplementation(async (owner: string, repo: string) =>
      digestOf(`org/${repo}`, [file("assignments/module_02/README.md", SOLUTION_README)])
    );

    const result = await gradeReposAction(
      [{ repoRef: "org/student-a" }, { repoRef: "org/student-b" }],
      SOLUTION_README,
      "",
      "gemini",
      "assignments/module_02"
    );

    expect("error" in result).toBe(false);
    if ("error" in result) throw new Error("expected a run, got error: " + result.error);
    expect(result.run.results).toEqual([]);
    expect(result.noSubmissionRepos).toEqual(["org/student-a", "org/student-b"]);
    expect(gradeEntries).not.toHaveBeenCalled();
    expect(generateRubric).not.toHaveBeenCalled();
  });

  it("the no-submission fact is never encoded into a score string - noSubmissionRepos holds the repo's own name only, never a GradeResult row", async () => {
    ingestRepo.mockResolvedValue(digestOf("org/student-empty", [file("assignments/module_02/README.md", SOLUTION_README)]));

    const result = await gradeReposAction(
      [{ repoRef: "org/student-empty" }],
      SOLUTION_README,
      "",
      "gemini",
      "assignments/module_02"
    );

    expect("error" in result).toBe(false);
    if ("error" in result) throw new Error("expected a run, got error: " + result.error);
    // No row at all for this repo - not a "0" row, not a row with a
    // no-submission marker string sitting in totalScore.
    expect(result.run.results).toEqual([]);
    // The array's actual content is checked, not just an element's type -
    // a `typeof ... === "string"` check alone would pass even if the wrong
    // repo (or an empty string) ended up in the array.
    expect(result.noSubmissionRepos).toEqual(["org/student-empty"]);
  });
});

describe("gradeReposAction - SHOULD 1: 'could not determine' must never be reported as 'no submission'", () => {
  // A repo whose only file was something this pipeline cannot read as text
  // (a `.docx`, a `.pdf`, a mistyped extension) never appears in
  // `digest.files` at all - selectDigestFiles filters it out before `files`
  // is built (github.digest.ts) - but IS counted in `digest.skipped.type`.
  // Reporting that repo as "no submission was found" (noSubmissionRepos)
  // would tell the instructor something false: the student DID submit
  // something, it just could not be read. This must land in a separate
  // array (`undeterminedRepos`) instead.
  it("a repo whose only file was type-skipped (e.g. Solution.docx) is reported as undetermined, not as no-submission", async () => {
    ingestRepo.mockResolvedValue(
      digestOf("org/student-docx", [], { skipped: { type: 1, size: 0, budget: 0, fetchError: 0 } })
    );

    const result = await gradeReposAction(
      [{ repoRef: "org/student-docx", label: "Docx Student" }],
      "Do the assignment.",
      "",
      "gemini",
      "assignments/module_02"
    );

    expect("error" in result).toBe(false);
    if ("error" in result) throw new Error("expected a run, got error: " + result.error);
    expect(result.undeterminedRepos).toEqual(["Docx Student"]);
    expect(result.noSubmissionRepos ?? []).toEqual([]);
    expect(gradeEntries).not.toHaveBeenCalled();
  });

  it("a genuinely empty folder (no type-skips at all) stays no-submission, not undetermined", async () => {
    ingestRepo.mockResolvedValue(digestOf("org/student-missing", [], { prefixMatchedNothing: true }));

    const result = await gradeReposAction(
      [{ repoRef: "org/student-missing" }],
      "Do the assignment.",
      "",
      "gemini",
      "module_09"
    );

    expect("error" in result).toBe(false);
    if ("error" in result) throw new Error("expected a run, got error: " + result.error);
    expect(result.noSubmissionRepos).toEqual(["org/student-missing"]);
    expect(result.undeterminedRepos ?? []).toEqual([]);
  });

  it("a mixed batch keeps no-submission and undetermined repos in their own separate arrays", async () => {
    ingestRepo.mockImplementation(async (owner: string, repo: string) => {
      if (repo === "student-docx") return digestOf("org/student-docx", [], { skipped: { type: 1, size: 0, budget: 0, fetchError: 0 } });
      if (repo === "student-missing") return digestOf("org/student-missing", [], { prefixMatchedNothing: true });
      throw new Error(`unexpected repo ${repo}`);
    });

    const result = await gradeReposAction(
      [
        { repoRef: "org/student-docx", label: "Docx Student" },
        { repoRef: "org/student-missing", label: "Missing Student" },
      ],
      "Do the assignment.",
      "",
      "gemini",
      "assignments/module_02"
    );

    expect("error" in result).toBe(false);
    if ("error" in result) throw new Error("expected a run, got error: " + result.error);
    expect(result.undeterminedRepos).toEqual(["Docx Student"]);
    expect(result.noSubmissionRepos).toEqual(["Missing Student"]);
  });
});
