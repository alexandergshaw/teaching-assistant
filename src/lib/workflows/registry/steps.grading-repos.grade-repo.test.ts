import { describe, it, expect, vi, beforeEach } from "vitest";
import { emptyCourseProject } from "@/lib/course-project";

// Every named export steps.grading-repos.ts imports from "@/app/actions" must
// be present here (even the ones a given test never calls) or the import
// binds to undefined - see the same pattern in
// steps.course-setup.materials.test.ts.
vi.mock("@/app/actions", () => ({
  listCourseHubAction: vi.fn(),
  generateAssignmentRubricAction: vi.fn(),
  generateModelAnswerAction: vi.fn(),
  gradeRepoAction: vi.fn(),
  ingestRepoAction: vi.fn(),
  saveGradingDraftAction: vi.fn(),
  deleteGradingDraftAction: vi.fn(),
  findPendingGradingDraftForWorkflowAction: vi.fn(),
  generateFullCreditChecklistAction: vi.fn(),
  getInstitutionCountsAction: vi.fn(),
  getRepoTreeAction: vi.fn(),
  getFileTextAction: vi.fn(),
  listConfiguredInstitutionsAction: vi.fn(),
  listOrgReposAction: vi.fn(),
}));

import {
  gradeRepoAction,
  getRepoTreeAction,
  getFileTextAction,
  listCourseHubAction,
  listOrgReposAction,
  saveGradingDraftAction,
  deleteGradingDraftAction,
  findPendingGradingDraftForWorkflowAction,
} from "@/app/actions";
import {
  gradingRepoSteps,
  describeGradeRepoInputError,
  describeOrgRepoScanError,
  resolveReadmeInstructions,
} from "./steps.grading-repos";
import type { StepRunHelpers } from "@/lib/workflows/registry-helpers";
import type { GradingRun } from "@/lib/grade";
import type { Course } from "@/lib/supabase/courses";
import type { GradingDraft } from "@/lib/grading-drafts";

const mockGradeRepoAction = vi.mocked(gradeRepoAction);
const mockGetRepoTreeAction = vi.mocked(getRepoTreeAction);
const mockGetFileTextAction = vi.mocked(getFileTextAction);
const mockListCourseHubAction = vi.mocked(listCourseHubAction);
const mockListOrgReposAction = vi.mocked(listOrgReposAction);
const mockSaveGradingDraftAction = vi.mocked(saveGradingDraftAction);
const mockDeleteGradingDraftAction = vi.mocked(deleteGradingDraftAction);
const mockFindPendingGradingDraftForWorkflowAction = vi.mocked(findPendingGradingDraftForWorkflowAction);

const step = gradingRepoSteps.find((s) => s.type === "grade-repo")!;

function baseCourse(overrides: Partial<Course> = {}): Course {
  return {
    id: "course-1",
    name: "CS 101",
    courseCode: null,
    term: null,
    canvasUrl: null,
    repos: [],
    githubOrg: null,
    textbook: null,
    syllabusId: null,
    institution: null,
    integrations: [],
    roster: null,
    notes: null,
    topics: null,
    csvName: null,
    csvData: null,
    rubricName: null,
    rubricData: null,
    startDate: null,
    description: null,
    weeks: null,
    tests: null,
    lms: null,
    dayTime: null,
    modality: null,
    topicOutline: null,
    syllabusTemplateId: null,
    endDate: null,
    breaks: null,
    assignmentDueRule: null,
    email: null,
    emailClient: null,
    classLengthMinutes: null,
    courseProject: emptyCourseProject(),
    materialsFiles: [],
    castletopFiles: [],
    miscFiles: [],
    exportFiles: [],
    materialsZipName: null,
    materialsZipPath: null,
    materialsZipSize: null,
    customTiles: [],
    hiddenTiles: [],
    studentRepos: [],
    updatedAt: "2024-09-01T00:00:00Z",
    ...overrides,
  };
}

function fakeGithubRepo(fullName: string) {
  const [owner, name] = fullName.split("/");
  return {
    fullName,
    owner,
    name,
    description: "",
    private: false,
    defaultBranch: "main",
    updatedAt: "",
    htmlUrl: `https://github.com/${fullName}`,
    isTemplate: false,
    archived: false,
  };
}

function testHelpers(overrides: Partial<StepRunHelpers> = {}): StepRunHelpers {
  return {
    activeInstitution: null,
    provider: "gemini",
    author: "Test Author",
    saveBundle: null,
    saveCourseMaterialFile: null,
    saveCourseCastletopFile: null,
    saveCourseExportFile: null,
    loadCommonResources: null,
    getLibraryFile: null,
    getInstitutionFields: null,
    loadCourseExport: null,
    loadCourseMaterials: null,
    workflowId: "workflow-1",
    workflowName: "Test Workflow",
    workflowRunId: "run-1",
    ...overrides,
  };
}

function fakeGradeRun(): GradingRun {
  return {
    results: [
      {
        student: "octocat/hello-world",
        overallComment: "Nice work.",
        strengths: "Nice work.",
        improvements: "",
        resubmitNotice: "",
        rubricAreas: [{ area: "Correctness", score: "8/10", comment: "" }],
        totalScore: "8/10",
        feedback: "",
        mergedFileCount: 3,
        submittedFiles: [],
      },
    ],
    rubricAreaNames: ["Correctness"],
    fullCreditChecklist: [],
  };
}

function fakeGradeRunFor(student: string, totalScore: string): GradingRun {
  return {
    results: [
      {
        student,
        overallComment: "Nice work.",
        strengths: "Nice work.",
        improvements: "",
        resubmitNotice: "",
        rubricAreas: [{ area: "Correctness", score: totalScore, comment: "" }],
        totalScore,
        feedback: "",
        mergedFileCount: 3,
        submittedFiles: [],
      },
    ],
    rubricAreaNames: ["Correctness"],
    fullCreditChecklist: [],
  };
}

/** Builds a pending draft as findPendingGradingDraftForWorkflowAction would
 * return it, wrapping one GradingRunEntry with the given results - the shape
 * the AC3 re-run guard reads to decide skip vs. replace. */
function fakePendingDraft(id: string, results: GradingRun["results"]): GradingDraft {
  return {
    id,
    userId: "u1",
    status: "pending",
    summary: "prior summary",
    payload: {
      runs: [
        {
          courseName: "octocat/hello-world",
          assignmentName: "Grade a repository",
          canvasUrl: "",
          run: { results, rubricAreaNames: ["Correctness"], fullCreditChecklist: [], speedGraderUrl: null },
          pointsPossible: null,
        },
      ],
    },
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    workflowId: "workflow-1",
    workflowName: "Test Workflow",
    source: "repos",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default AC3 guard behavior for every test that doesn't care about draft
  // persistence: no pending draft exists yet, and the save succeeds - so
  // existing grading-behavior assertions (pre-dating the draft-save change)
  // do not have to be individually updated to stub these two calls.
  mockFindPendingGradingDraftForWorkflowAction.mockResolvedValue({ draft: null });
  mockSaveGradingDraftAction.mockResolvedValue({ id: "draft-new" });
  mockDeleteGradingDraftAction.mockResolvedValue({ ok: true });
});

// ---------------------------------------------------------------------------
// describeGradeRepoInputError - pure error-message helper (AC2)
// ---------------------------------------------------------------------------
describe("describeGradeRepoInputError", () => {
  it("names the empty Repository input with no branch/folder set", () => {
    const msg = describeGradeRepoInputError("repo", {});
    expect(msg).toBe("Grade a repository: the Repository input resolved to empty - check what is bound to it.");
  });

  it("names the empty Repository input and includes branch/folder context when set", () => {
    const msg = describeGradeRepoInputError("repo", { branch: "main", folder: "assignments/week-01" });
    expect(msg).toBe(
      'Grade a repository: the Repository input resolved to empty (branch "main", folder "assignments/week-01") - check what is bound to it.'
    );
  });

  it("names the empty Assignment instructions input with no branch/folder set", () => {
    const msg = describeGradeRepoInputError("instructions", { repo: "octocat/hello-world", triedReadmePaths: ["README.md"] });
    expect(msg).toBe(
      "Grade a repository (octocat/hello-world): the Assignment instructions input resolved to empty and no usable README was found (tried README.md) - provide instructions directly, or add a README.md."
    );
  });

  it("names the empty Assignment instructions input and includes branch/folder/tried paths when set", () => {
    const msg = describeGradeRepoInputError("instructions", {
      repo: "octocat/hello-world",
      branch: "main",
      folder: "assignments/week-01",
      triedReadmePaths: ["assignments/week-01/README.md", "README.md"],
    });
    expect(msg).toBe(
      'Grade a repository (octocat/hello-world, branch "main", folder "assignments/week-01"): the Assignment instructions input resolved to empty and no usable README was found (tried assignments/week-01/README.md, README.md) - provide instructions directly, or add a README.md.'
    );
  });

  it("falls back to a generic tried-paths phrase when none were supplied", () => {
    const msg = describeGradeRepoInputError("instructions", { repo: "octocat/hello-world" });
    expect(msg).toContain("no README paths");
  });
});

// ---------------------------------------------------------------------------
// describeOrgRepoScanError - pure error-message helper (AC1.2)
// ---------------------------------------------------------------------------
describe("describeOrgRepoScanError", () => {
  it("names the course tile for a blank/missing githubOrg", () => {
    const msg = describeOrgRepoScanError("blank-org", { tileName: "CS 101" });
    expect(msg).toBe(
      'Grade a repository: "CS 101" has no GitHub org configured - set one on the course tile, or provide Repository directly.'
    );
  });

  it("falls back to a generic tile phrase when no tile name is given", () => {
    const msg = describeOrgRepoScanError("blank-org", {});
    expect(msg).toBe(
      'Grade a repository: "the course tile" has no GitHub org configured - set one on the course tile, or provide Repository directly.'
    );
  });

  it("names the org for an org with no repositories", () => {
    const msg = describeOrgRepoScanError("empty-org", { org: "acme-university" });
    expect(msg).toBe('Grade a repository: the GitHub org "acme-university" has no repositories to grade.');
  });

  it("names the org and includes the failure detail for a GitHub API failure", () => {
    const msg = describeOrgRepoScanError("api-error", { org: "acme-university", detail: "GitHub rejected the token (401)." });
    expect(msg).toBe(
      'Grade a repository: could not list repositories in the GitHub org "acme-university": GitHub rejected the token (401).'
    );
  });

  it("still names the org for an API failure with no detail", () => {
    const msg = describeOrgRepoScanError("api-error", { org: "acme-university" });
    expect(msg).toBe('Grade a repository: could not list repositories in the GitHub org "acme-university".');
  });

  // Every message must be distinct from every other, and from the generic
  // "Repository input resolved to empty" - the instructor's original
  // complaint was that every failure collapsed into that one indistinguishable
  // sentence across a fanned-out run.
  it("produces three distinct messages, none of them the generic empty-input error", () => {
    const messages = [
      describeOrgRepoScanError("blank-org", { tileName: "CS 101" }),
      describeOrgRepoScanError("empty-org", { org: "acme-university" }),
      describeOrgRepoScanError("api-error", { org: "acme-university", detail: "boom" }),
    ];
    expect(new Set(messages).size).toBe(3);
    for (const m of messages) {
      expect(m).not.toContain("the Repository input resolved to empty");
    }
  });
});

// ---------------------------------------------------------------------------
// resolveReadmeInstructions - README fallback resolution order (AC1)
// ---------------------------------------------------------------------------
describe("resolveReadmeInstructions", () => {
  it("reads the folder's own README when the folder README exists", async () => {
    mockGetRepoTreeAction.mockResolvedValue({
      tree: [
        { path: "README.md", type: "blob", size: 10, sha: "root" },
        { path: "assignments/week-01/README.md", type: "blob", size: 10, sha: "folder" },
      ],
    });
    mockGetFileTextAction.mockResolvedValue({ content: "Folder instructions." });

    const res = await resolveReadmeInstructions("octocat/hello-world", undefined, "assignments/week-01");
    expect("error" in res).toBe(false);
    if (!("error" in res)) {
      expect(res.text).toBe("Folder instructions.");
      expect(res.path).toBe("assignments/week-01/README.md");
    }
    expect(mockGetFileTextAction).toHaveBeenCalledWith(
      "octocat/hello-world",
      "assignments/week-01/README.md",
      undefined
    );
    // Root README must not even be fetched once the folder README worked.
    expect(mockGetFileTextAction).toHaveBeenCalledTimes(1);
  });

  it("falls back to the repo root README when the folder README is missing", async () => {
    mockGetRepoTreeAction.mockResolvedValue({
      tree: [{ path: "README.md", type: "blob", size: 10, sha: "root" }],
    });
    mockGetFileTextAction.mockResolvedValue({ content: "Root instructions." });

    const res = await resolveReadmeInstructions("octocat/hello-world", "main", "assignments/week-01");
    expect("error" in res).toBe(false);
    if (!("error" in res)) {
      expect(res.text).toBe("Root instructions.");
      expect(res.path).toBe("README.md");
    }
    expect(mockGetFileTextAction).toHaveBeenCalledWith("octocat/hello-world", "README.md", "main");
  });

  it("uses the repo root README directly when no folder is given", async () => {
    mockGetRepoTreeAction.mockResolvedValue({
      tree: [{ path: "readme.md", type: "blob", size: 10, sha: "root" }],
    });
    mockGetFileTextAction.mockResolvedValue({ content: "Root instructions, lowercase filename." });

    const res = await resolveReadmeInstructions("octocat/hello-world", undefined, undefined);
    expect("error" in res).toBe(false);
    if (!("error" in res)) {
      expect(res.path).toBe("readme.md");
    }
  });

  it("reports both tried paths when neither the folder nor the root README exists", async () => {
    mockGetRepoTreeAction.mockResolvedValue({
      tree: [{ path: "src/index.ts", type: "blob", size: 10, sha: "x" }],
    });

    const res = await resolveReadmeInstructions("octocat/hello-world", undefined, "assignments/week-01");
    expect("error" in res).toBe(true);
    if ("error" in res) {
      expect(res.tried).toEqual(["assignments/week-01/README.md", "README.md"]);
    }
    expect(mockGetFileTextAction).not.toHaveBeenCalled();
  });

  it("reports the root-only tried path when no folder was given and no README exists", async () => {
    mockGetRepoTreeAction.mockResolvedValue({ tree: [] });
    const res = await resolveReadmeInstructions("octocat/hello-world", undefined, undefined);
    expect("error" in res).toBe(true);
    if ("error" in res) {
      expect(res.tried).toEqual(["README.md"]);
    }
  });

  it("treats a blank README file as unusable and continues the fallback chain", async () => {
    mockGetRepoTreeAction.mockResolvedValue({
      tree: [
        { path: "README.md", type: "blob", size: 0, sha: "root" },
        { path: "assignments/week-01/README.md", type: "blob", size: 0, sha: "folder" },
      ],
    });
    mockGetFileTextAction.mockResolvedValue({ content: "   " });

    const res = await resolveReadmeInstructions("octocat/hello-world", undefined, "assignments/week-01");
    expect("error" in res).toBe(true);
  });

  it("reports both tried paths when the repo tree itself cannot be read", async () => {
    mockGetRepoTreeAction.mockResolvedValue({ error: "Not found." });
    const res = await resolveReadmeInstructions("octocat/hello-world", undefined, "assignments/week-01");
    expect("error" in res).toBe(true);
    if ("error" in res) {
      expect(res.tried).toEqual(["assignments/week-01/README.md", "README.md"]);
    }
  });
});

// ---------------------------------------------------------------------------
// grade-repo step run() - integration of both ACs, and the no-behavior-change
// guarantee (AC4)
// ---------------------------------------------------------------------------
describe("grade-repo step run()", () => {
  it("throws the diagnosable repo error, and never calls gradeRepoAction, when Repository is blank", async () => {
    await expect(
      step.run({ repo: "", instructions: "Do the thing.", branch: "main" }, testHelpers(), vi.fn())
    ).rejects.toThrow(/Repository input resolved to empty/);
    expect(mockGradeRepoAction).not.toHaveBeenCalled();
    expect(mockGetRepoTreeAction).not.toHaveBeenCalled();
  });

  it("grades normally with no README lookup when both repo and instructions are supplied (unchanged behavior)", async () => {
    mockGradeRepoAction.mockResolvedValue({
      run: fakeGradeRun(),
      rubric: "rubric text",
      fullName: "octocat/hello-world",
    });

    const result = await step.run(
      { repo: "octocat/hello-world", instructions: "Do the thing.", branch: "main" },
      testHelpers(),
      vi.fn()
    );

    expect(mockGetRepoTreeAction).not.toHaveBeenCalled();
    expect(mockGetFileTextAction).not.toHaveBeenCalled();
    expect(mockGradeRepoAction).toHaveBeenCalledWith(
      "octocat/hello-world",
      "Do the thing.",
      "",
      "gemini",
      "main",
      undefined
    );
    const text = result.summary.kind === "text" ? result.summary.text : "";
    expect(text).not.toContain("Instructions read from");
    expect(text.split("\n")[0]).toBe("octocat/hello-world");
  });

  it("falls back to the repo README when instructions are blank, and names the path used in the summary", async () => {
    mockGetRepoTreeAction.mockResolvedValue({
      tree: [{ path: "README.md", type: "blob", size: 20, sha: "root" }],
    });
    mockGetFileTextAction.mockResolvedValue({ content: "Assignment: build a thing." });
    mockGradeRepoAction.mockResolvedValue({
      run: fakeGradeRun(),
      rubric: "rubric text",
      fullName: "octocat/hello-world",
    });

    const result = await step.run(
      { repo: "octocat/hello-world", instructions: "" },
      testHelpers(),
      vi.fn()
    );

    expect(mockGradeRepoAction).toHaveBeenCalledWith(
      "octocat/hello-world",
      "Assignment: build a thing.",
      "",
      "gemini",
      undefined,
      undefined
    );
    const text = result.summary.kind === "text" ? result.summary.text : "";
    expect(text).toContain("Instructions read from README.md.");
  });

  it("falls back to the folder README first when a folder is set", async () => {
    mockGetRepoTreeAction.mockResolvedValue({
      tree: [
        { path: "README.md", type: "blob", size: 20, sha: "root" },
        { path: "assignments/week-01/README.md", type: "blob", size: 20, sha: "folder" },
      ],
    });
    mockGetFileTextAction.mockResolvedValue({ content: "Folder-specific assignment." });
    mockGradeRepoAction.mockResolvedValue({
      run: fakeGradeRun(),
      rubric: "",
      fullName: "octocat/hello-world",
    });

    const result = await step.run(
      { repo: "octocat/hello-world", instructions: "", folder: "assignments/week-01" },
      testHelpers(),
      vi.fn()
    );

    expect(mockGradeRepoAction).toHaveBeenCalledWith(
      "octocat/hello-world",
      "Folder-specific assignment.",
      "",
      "gemini",
      undefined,
      "assignments/week-01"
    );
    const text = result.summary.kind === "text" ? result.summary.text : "";
    expect(text).toContain("Instructions read from assignments/week-01/README.md.");
  });

  it("throws the diagnosable instructions error naming the tried paths when no README exists", async () => {
    mockGetRepoTreeAction.mockResolvedValue({ tree: [] });

    await expect(
      step.run({ repo: "octocat/hello-world", instructions: "", branch: "main" }, testHelpers(), vi.fn())
    ).rejects.toThrow(
      'Grade a repository (octocat/hello-world, branch "main"): the Assignment instructions input resolved to empty and no usable README was found (tried README.md) - provide instructions directly, or add a README.md.'
    );
    expect(mockGradeRepoAction).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// grade-repo step run() - org enumeration (AC1): when Repository is blank and
// a Course tile is bound, every repo in the tile's GitHub org is graded.
// ---------------------------------------------------------------------------
describe("grade-repo step run() - org enumeration", () => {
  it("keeps the single-repo path unchanged when Repository is set even if a Course tile is also bound (AC1.4)", async () => {
    mockGradeRepoAction.mockResolvedValue({
      run: fakeGradeRun(),
      rubric: "",
      fullName: "octocat/hello-world",
    });

    await step.run(
      { repo: "octocat/hello-world", instructions: "Do the thing.", hubCourse: "course-1" },
      testHelpers(),
      vi.fn()
    );

    expect(mockGradeRepoAction).toHaveBeenCalledWith("octocat/hello-world", "Do the thing.", "", "gemini", undefined, undefined);
    expect(mockListCourseHubAction).not.toHaveBeenCalled();
    expect(mockListOrgReposAction).not.toHaveBeenCalled();
  });

  it("throws a distinct error naming the tile when the bound course tile is not found", async () => {
    mockListCourseHubAction.mockResolvedValue({ courses: [] });

    await expect(
      step.run({ repo: "", instructions: "", hubCourse: "missing-course" }, testHelpers(), vi.fn())
    ).rejects.toThrow(/course tile was not found/);
    expect(mockListOrgReposAction).not.toHaveBeenCalled();
  });

  it("throws describeOrgRepoScanError('blank-org') naming the tile when the bound tile has no githubOrg (AC1.2)", async () => {
    mockListCourseHubAction.mockResolvedValue({ courses: [baseCourse({ id: "course-1", name: "CS 101", githubOrg: null })] });

    await expect(
      step.run({ repo: "", instructions: "", hubCourse: "course-1" }, testHelpers(), vi.fn())
    ).rejects.toThrow('Grade a repository: "CS 101" has no GitHub org configured - set one on the course tile, or provide Repository directly.');
    expect(mockListOrgReposAction).not.toHaveBeenCalled();
  });

  it("throws describeOrgRepoScanError('api-error') naming the org when listing the org's repos fails (AC1.2)", async () => {
    mockListCourseHubAction.mockResolvedValue({
      courses: [baseCourse({ id: "course-1", name: "CS 101", githubOrg: "acme-university" })],
    });
    mockListOrgReposAction.mockResolvedValue({ error: "GitHub rejected the token (401)." });

    await expect(
      step.run({ repo: "", instructions: "", hubCourse: "course-1" }, testHelpers(), vi.fn())
    ).rejects.toThrow('Grade a repository: could not list repositories in the GitHub org "acme-university": GitHub rejected the token (401).');
  });

  it("throws describeOrgRepoScanError('empty-org') naming the org when it has zero repositories (AC1.2)", async () => {
    mockListCourseHubAction.mockResolvedValue({
      courses: [baseCourse({ id: "course-1", name: "CS 101", githubOrg: "acme-university" })],
    });
    mockListOrgReposAction.mockResolvedValue({ repos: [] });

    await expect(
      step.run({ repo: "", instructions: "", hubCourse: "course-1" }, testHelpers(), vi.fn())
    ).rejects.toThrow('Grade a repository: the GitHub org "acme-university" has no repositories to grade.');
  });

  it("grades every repo in the org, isolating one repo's failure from the rest (AC1.3)", async () => {
    mockListCourseHubAction.mockResolvedValue({
      courses: [baseCourse({ id: "course-1", name: "CS 101", githubOrg: "acme-university" })],
    });
    mockListOrgReposAction.mockResolvedValue({
      repos: [
        fakeGithubRepo("acme-university/alice-hw1"),
        fakeGithubRepo("acme-university/bob-hw1"),
        fakeGithubRepo("acme-university/carol-hw1"),
      ],
    });
    mockGradeRepoAction.mockImplementation(async (repo: string) => {
      if (repo === "acme-university/alice-hw1") {
        return { run: fakeGradeRun(), rubric: "", fullName: repo };
      }
      if (repo === "acme-university/bob-hw1") {
        return { error: "Repository is empty." };
      }
      throw new Error("network exploded");
    });

    const result = await step.run(
      { repo: "", instructions: "Do the thing.", hubCourse: "course-1" },
      testHelpers(),
      vi.fn()
    );

    // Isolation: alice's success does not stop bob's or carol's failures from
    // being recorded, and neither failure stops the loop.
    expect(mockGradeRepoAction).toHaveBeenCalledTimes(3);
    expect(result.summary.kind).toBe("list");
    if (result.summary.kind === "list") {
      expect(result.summary.label).toBe("Graded 1/3 repo(s) in acme-university.");
      expect(result.summary.items.some((i) => i.includes("acme-university/alice-hw1") && i.includes("graded"))).toBe(true);
      expect(result.summary.items.some((i) => i.includes("acme-university/bob-hw1") && i.includes("Repository is empty."))).toBe(true);
      expect(result.summary.items.some((i) => i.includes("acme-university/carol-hw1") && i.includes("network exploded"))).toBe(true);
    }
    expect(result.outputs.gradeSummary).toContain("acme-university/alice-hw1");
  });

  it("falls back to each repo's own README when instructions are blank (per-repo, org mode)", async () => {
    mockListCourseHubAction.mockResolvedValue({
      courses: [baseCourse({ id: "course-1", name: "CS 101", githubOrg: "acme-university" })],
    });
    mockListOrgReposAction.mockResolvedValue({
      repos: [fakeGithubRepo("acme-university/alice-hw1")],
    });
    mockGetRepoTreeAction.mockResolvedValue({
      tree: [{ path: "README.md", type: "blob", size: 20, sha: "root" }],
    });
    mockGetFileTextAction.mockResolvedValue({ content: "Assignment: build a thing." });
    mockGradeRepoAction.mockResolvedValue({ run: fakeGradeRun(), rubric: "", fullName: "acme-university/alice-hw1" });

    await step.run({ repo: "", instructions: "", hubCourse: "course-1" }, testHelpers(), vi.fn());

    expect(mockGetRepoTreeAction).toHaveBeenCalledWith("acme-university/alice-hw1", undefined);
    expect(mockGradeRepoAction).toHaveBeenCalledWith(
      "acme-university/alice-hw1",
      "Assignment: build a thing.",
      "",
      "gemini",
      undefined,
      undefined
    );
  });

  it("records a note (not a thrown error) for one repo with no usable README, and continues the batch", async () => {
    mockListCourseHubAction.mockResolvedValue({
      courses: [baseCourse({ id: "course-1", name: "CS 101", githubOrg: "acme-university" })],
    });
    mockListOrgReposAction.mockResolvedValue({
      repos: [fakeGithubRepo("acme-university/alice-hw1"), fakeGithubRepo("acme-university/bob-hw1")],
    });
    // Neither repo has a README - both should be noted, not thrown.
    mockGetRepoTreeAction.mockResolvedValue({ tree: [] });

    const result = await step.run({ repo: "", instructions: "", hubCourse: "course-1" }, testHelpers(), vi.fn());

    expect(mockGradeRepoAction).not.toHaveBeenCalled();
    expect(result.summary.kind).toBe("list");
    if (result.summary.kind === "list") {
      expect(result.summary.items).toHaveLength(2);
      expect(result.summary.items.every((i) => i.includes("no usable README was found"))).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// grade-repo step run() - draft persistence + re-run guard (AC1/AC2/AC3/AC4/
// AC5/AC6): the instructor's actual complaint was that grade-repo graded
// repos but never saved anything to Drafted Grades, unlike
// batch-grade-repos-to-draft. These tests cover the fix and its guard
// against flooding Drafted Grades on an unattended 15-minute schedule.
// ---------------------------------------------------------------------------
describe("grade-repo step run() - draft persistence (AC1/AC3/AC4/AC5/AC6)", () => {
  it("single-repo grading saves a draft with the GradingRunEntry/GradingDraftPayload shape and source 'repos' (AC1, AC6)", async () => {
    mockGradeRepoAction.mockResolvedValue({
      run: fakeGradeRun(),
      rubric: "",
      fullName: "octocat/hello-world",
    });

    const result = await step.run(
      { repo: "octocat/hello-world", instructions: "Do the thing." },
      testHelpers(),
      vi.fn()
    );

    expect(mockSaveGradingDraftAction).toHaveBeenCalledTimes(1);
    const [summary, payload, workflowId, workflowName, source] = mockSaveGradingDraftAction.mock.calls[0];
    expect(summary).toBe("octocat/hello-world - Grade a repository: graded 1 repo(s)");
    expect(source).toBe("repos");
    expect(workflowId).toBe("workflow-1");
    expect(workflowName).toBe("Test Workflow");
    expect(payload.runs).toHaveLength(1);
    expect(payload.runs[0]).toMatchObject({
      courseName: "octocat/hello-world",
      assignmentName: "Grade a repository",
      canvasUrl: "",
    });
    expect(payload.runs[0].run.results).toEqual(fakeGradeRun().results);
    expect(result.outputs.draftId).toBe("draft-new");
  });

  it("the org fan-out saves exactly ONE draft covering every repo it graded (AC2)", async () => {
    mockListCourseHubAction.mockResolvedValue({
      courses: [baseCourse({ id: "course-1", name: "CS 101", githubOrg: "acme-university" })],
    });
    mockListOrgReposAction.mockResolvedValue({
      repos: [fakeGithubRepo("acme-university/alice-hw1"), fakeGithubRepo("acme-university/bob-hw1")],
    });
    mockGradeRepoAction.mockImplementation(async (repo: string) => ({
      run: fakeGradeRunFor(repo, "9/10"),
      rubric: "",
      fullName: repo,
    }));

    const result = await step.run({ repo: "", instructions: "Do the thing.", hubCourse: "course-1" }, testHelpers(), vi.fn());

    expect(mockSaveGradingDraftAction).toHaveBeenCalledTimes(1);
    const [summary, payload, , , source] = mockSaveGradingDraftAction.mock.calls[0];
    expect(summary).toBe("CS 101 - Grade a repository: graded 2 repo(s)");
    expect(source).toBe("repos");
    expect(payload.runs).toHaveLength(1);
    expect(payload.runs[0].run.results.map((r) => r.student).sort()).toEqual([
      "acme-university/alice-hw1",
      "acme-university/bob-hw1",
    ]);
    expect(result.outputs.draftId).toBe("draft-new");
  });

  it("a re-run with identical results does not create a second draft (AC3: skip)", async () => {
    const prior = fakeGradeRun().results;
    mockFindPendingGradingDraftForWorkflowAction.mockResolvedValue({ draft: fakePendingDraft("draft-existing", prior) });
    mockGradeRepoAction.mockResolvedValue({
      run: fakeGradeRun(),
      rubric: "",
      fullName: "octocat/hello-world",
    });

    const result = await step.run(
      { repo: "octocat/hello-world", instructions: "Do the thing." },
      testHelpers(),
      vi.fn()
    );

    expect(mockSaveGradingDraftAction).not.toHaveBeenCalled();
    expect(mockDeleteGradingDraftAction).not.toHaveBeenCalled();
    expect(result.outputs.draftId).toBe("draft-existing");
  });

  it("a re-run with a CHANGED score replaces the stale pending draft rather than adding another (AC3: update)", async () => {
    // The previously-pending draft has the SAME student but a DIFFERENT
    // score - the student pushed new code and was re-graded differently.
    const staleResults = fakeGradeRun().results.map((r) => ({ ...r, totalScore: "5/10" }));
    mockFindPendingGradingDraftForWorkflowAction.mockResolvedValue({ draft: fakePendingDraft("draft-stale", staleResults) });
    mockGradeRepoAction.mockResolvedValue({
      run: fakeGradeRun(), // totalScore "8/10" - different from the stale draft's "5/10"
      rubric: "",
      fullName: "octocat/hello-world",
    });

    const result = await step.run(
      { repo: "octocat/hello-world", instructions: "Do the thing." },
      testHelpers(),
      vi.fn()
    );

    // The changed score is never silently dropped: the stale draft is
    // deleted and a fresh one is saved with the CURRENT (8/10) result -
    // never left stuck inside a draft nobody will look at again.
    expect(mockDeleteGradingDraftAction).toHaveBeenCalledWith("draft-stale");
    expect(mockSaveGradingDraftAction).toHaveBeenCalledTimes(1);
    const payload = mockSaveGradingDraftAction.mock.calls[0][1];
    expect(payload.runs[0].run.results[0].totalScore).toBe("8/10");
    expect(result.outputs.draftId).toBe("draft-new");
  });

  it("a failed draft save still returns the completed grading summary, with the failure surfaced (AC4)", async () => {
    mockSaveGradingDraftAction.mockResolvedValue({ error: "Supabase insert failed." });
    mockGradeRepoAction.mockResolvedValue({
      run: fakeGradeRun(),
      rubric: "",
      fullName: "octocat/hello-world",
    });

    const result = await step.run(
      { repo: "octocat/hello-world", instructions: "Do the thing." },
      testHelpers(),
      vi.fn()
    );

    // Never thrown - the expensive (LLM) grading result is still reported.
    expect(result.outputs.gradeSummary).toContain("octocat/hello-world");
    expect(result.outputs.gradeSummary).toContain("Total Score: 8/10");
    expect(result.outputs.draftId).toBe("");
    const text = result.summary.kind === "text" ? result.summary.text : "";
    expect(text).toContain("Total Score: 8/10");
    expect(text).toContain("Warning: could not save the grading draft: Supabase insert failed.");
  });

  it("a run that grades nothing writes no draft (AC5, org path)", async () => {
    mockListCourseHubAction.mockResolvedValue({
      courses: [baseCourse({ id: "course-1", name: "CS 101", githubOrg: "acme-university" })],
    });
    mockListOrgReposAction.mockResolvedValue({
      repos: [fakeGithubRepo("acme-university/alice-hw1")],
    });
    // No README anywhere - nothing gets graded.
    mockGetRepoTreeAction.mockResolvedValue({ tree: [] });

    const result = await step.run({ repo: "", instructions: "", hubCourse: "course-1" }, testHelpers(), vi.fn());

    expect(mockSaveGradingDraftAction).not.toHaveBeenCalled();
    expect(mockFindPendingGradingDraftForWorkflowAction).not.toHaveBeenCalled();
    expect(result.outputs.draftId).toBe("");
  });
});
