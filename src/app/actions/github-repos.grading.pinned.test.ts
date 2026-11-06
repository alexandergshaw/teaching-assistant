import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gradeRepoAction } from "./github-repos";
import { generateRubric, gradeEntries } from "@/lib/grade";
import { createClient } from "@/lib/supabase/server";
import { getAppUser, type AppUserRow } from "@/lib/supabase/app-users";
import { discoverRepoGradeSources } from "@/lib/repo-grades-dashboard/discovery";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/app-users", async (original) => ({
  ...await original<typeof import("@/lib/supabase/app-users")>(),
  getAppUser: vi.fn(),
}));
vi.mock("@/lib/grade", async (original) => ({
  ...await original<typeof import("@/lib/grade")>(),
  generateRubric: vi.fn(),
  gradeEntries: vi.fn(),
}));

const commit = "a".repeat(40);
const tree = "b".repeat(40);
const readme = { path: "lab/README.md", type: "blob", size: 12, mode: "100644" };
const solution = { path: "lab/main.py", type: "blob", size: 12, mode: "100644" };
const otherFolder = { ...solution, path: "Lab/main.py" };
const unsupported = { ...solution, path: "lab/answer.pdf" };
const generated = { ...solution, path: "lab/package-lock.json" };
const root = "https://api.github.com/repos/org/student";
const account = { id: "owner", email: "owner@example.test" };
const ownerRow: AppUserRow = {
  ...account,
  displayName: null,
  status: "active",
  role: "owner",
  approvedAt: null,
  approvedBy: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  statusChangedAt: null,
  statusChangedBy: null,
  roleGrantedBy: null,
};
const getUser = vi.fn();

function fakeGitHub(options: { truncated?: boolean; failReadme?: boolean; files?: typeof readme[]; solutionText?: string } = {}) {
  let head = commit;
  const fetcher = vi.fn(async (url: string) => {
    switch (url) {
      case "https://api.github.com/orgs/org/repos?per_page=100&sort=full_name&page=1":
        return Response.json([{ name: "student", owner: { login: "org" }, full_name: "org/student", default_branch: "source" }]);
      case `${root}/commits/source`:
        return Response.json({ sha: head });
      case `${root}/git/commits/${commit}`:
        return Response.json({ sha: commit, tree: { sha: tree } });
      case `${root}/git/trees/${tree}?recursive=1`:
        return Response.json({ sha: tree, truncated: options.truncated ?? false, tree: options.files ?? [readme, solution, otherFolder] });
      case `${root}/contents/lab/README.md?ref=${commit}`:
        return new Response("Write a loop", { status: options.failReadme ? 503 : 200 });
      case `${root}/contents/lab/main.py?ref=${commit}`:
        return new Response(options.solutionText ?? "print('old')");
      default:
        throw new Error(`Unexpected GitHub URL ${url}`);
    }
  });
  const advance = () => { head = "c".repeat(40); };
  vi.stubGlobal("fetch", fetcher);
  return { fetcher, advance };
}

const gradePinned = (sha = commit) =>
  gradeRepoAction("org/student", "Fallback", "", "gemini", "merge-target", "lab", true, undefined, true, { sourceCommit: sha });

beforeEach(() => {
  vi.resetAllMocks();
  getUser.mockResolvedValue({ data: { user: account }, error: null });
  vi.mocked(createClient).mockResolvedValue({
    auth: {
      getUser,
      mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: "aal1", nextLevel: "aal1" }, error: null }) },
    },
  } as never);
  vi.mocked(getAppUser).mockResolvedValue(ownerRow);
  vi.stubEnv("GITHUB_TOKEN", "test-token");
  vi.stubEnv("GRADE_MAX_CHARS_PER_SUBMISSION", "20000");
  vi.mocked(generateRubric).mockResolvedValue("Loop rubric");
  vi.mocked(gradeEntries).mockResolvedValue({
    results: [{
      student: "org/student", totalScore: "8/10", overallComment: "A working loop.", strengths: "A working loop.",
      improvements: "", resubmitNotice: "", rubricAreas: [], feedback: "", mergedFileCount: 1, submittedFiles: [],
    }],
    rubricAreaNames: [], fullCreditChecklist: [], speedGraderUrl: null,
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("gradeRepoAction pinned source", () => {
  it("reads the captured Git tree and exact-case files, and derives instructions and rubric from those bytes", async () => {
    const { fetcher, advance } = fakeGitHub();
    const discovery = await discoverRepoGradeSources({ organization: "org" });
    expect(discovery).toMatchObject({ status: "scanned", repos: [{ status: "ready", sourceRef: "source", sourceCommit: commit }] });
    if (discovery.status !== "scanned" || discovery.repos[0]?.status !== "ready") throw new Error("Expected a ready source");
    advance();
    fetcher.mockClear();
    expect(await gradePinned(discovery.repos[0].sourceCommit)).toMatchObject({
      sourceCommit: commit, rubric: "Loop rubric", readmePath: readme.path, run: { results: [{ totalScore: "8/10" }] },
    });
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      `${root}/git/commits/${commit}`,
      `${root}/git/trees/${tree}?recursive=1`,
      `${root}/contents/lab/README.md?ref=${commit}`,
      `${root}/contents/lab/main.py?ref=${commit}`,
    ]);
    expect(generateRubric).toHaveBeenCalledWith(expect.stringMatching(/^Write a loop\n\n[\s\S]*print\('old'\)$/), "gemini");
    expect(gradeEntries).toHaveBeenCalledWith([expect.objectContaining({
      gradedRef: commit,
      gradedRepo: "org/student",
      content: expect.stringContaining("print('old')"),
      submittedFiles: [expect.objectContaining({ name: "lab/main.py" })],
    })], "Write a loop", "Loop rubric", "gemini", null, { applyNamingDeduction: true, autoRunCode: false });
  });

  it.each([
    [{ truncated: true, files: [] }, "tree-truncated"],
    [{ failReadme: true }, "file-fetch-failed"],
  ] as const)("refuses incomplete inputs before running a grader (%j)", async (options, reason) => {
    const { fetcher } = fakeGitHub("files" in options ? { ...options, files: [...options.files] } : options);
    expect(await gradePinned()).toMatchObject({ partial: true, sourceCommit: commit, reason });
    expect(generateRubric).not.toHaveBeenCalled();
    expect(gradeEntries).not.toHaveBeenCalled();
    if ("truncated" in options) expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("checks the grader's input limit before paid rubric generation", async () => {
    fakeGitHub();
    vi.stubEnv("GRADE_MAX_CHARS_PER_SUBMISSION", "20");
    expect(await gradePinned()).toMatchObject({ partial: true, reason: "grading-input-truncated" });
    expect(generateRubric).not.toHaveBeenCalled();
    expect(gradeEntries).not.toHaveBeenCalled();
  });

  it("returns no submission without a grade after reading the complete folder", async () => {
    fakeGitHub({ files: [readme, generated] });
    const result = await gradePinned();
    expect(result).toMatchObject({ noSubmission: true, sourceCommit: commit });
    expect(result).not.toHaveProperty("run");
    expect(gradeEntries).not.toHaveBeenCalled();
  });

  it("reports a potential submission the grader cannot read even alongside supported code", async () => {
    const { fetcher } = fakeGitHub({ files: [readme, solution, unsupported, generated] });
    expect(await gradePinned()).toMatchObject({ partial: true, reason: "unsupported-submission", sourceCommit: commit });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(generateRubric).not.toHaveBeenCalled();
    expect(gradeEntries).not.toHaveBeenCalled();
  });

  it("passes an empty student-authored source file to the grader", async () => {
    fakeGitHub({ files: [readme, { ...solution, size: 0 }, generated], solutionText: "" });
    const result = await gradePinned();
    expect(result).toHaveProperty("run.results.0.totalScore", "8/10");
    expect(result).not.toHaveProperty("noSubmission");
    expect(gradeEntries).toHaveBeenCalledWith([expect.objectContaining({
      submittedFiles: [expect.objectContaining({ name: solution.path, previewContent: "" })],
    })], "Write a loop", "Loop rubric", "gemini", null, expect.anything());
  });

  it.each([
    { session: "signed out", user: null, role: "owner", message: "Not authorized. Sign in with an approved account." },
    { session: "active instructor", user: account, role: "instructor", message: "This action is limited to the workspace owner." },
  ] as const)("denies a $session caller before accessing GitHub or grading", async ({ user, role, message }) => {
    const { fetcher } = fakeGitHub();
    getUser.mockResolvedValue({ data: { user }, error: null });
    vi.mocked(getAppUser).mockResolvedValue({ ...ownerRow, role });
    expect(await gradePinned()).toEqual({ error: message });
    expect(fetcher).not.toHaveBeenCalled();
    expect(generateRubric).not.toHaveBeenCalled();
    expect(gradeEntries).not.toHaveBeenCalled();
  });

  it("requires a full commit SHA before accessing GitHub", async () => {
    const { fetcher } = fakeGitHub();
    expect(await gradePinned("main")).toEqual({ error: "A full GitHub commit SHA is required." });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
