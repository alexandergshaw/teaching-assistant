import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requireAppOwner } from "@/lib/supabase/auth";
import { collectInlineVisualEvidence } from "@/lib/grade/inline-visuals";
import { repoGradeAdmissionMode } from "./admission-mode";
import { beginRepoGradeDispatch, claimRepoGrade, settleRepoGrade } from "./ledger";
import { captureRepoGradeProfile, resolveRepoGradeRubric } from "./profile";
import { runRepoGradeTarget } from "./runner";

vi.mock("@/lib/supabase/auth", () => ({ requireAppOwner: vi.fn() }));
vi.mock("@/lib/grade/inline-visuals", () => ({ collectInlineVisualEvidence: vi.fn() }));
vi.mock("./ledger", () => ({ beginRepoGradeDispatch: vi.fn(), claimRepoGrade: vi.fn(), settleRepoGrade: vi.fn() }));
vi.mock("./admission-mode", () => ({ repoGradeAdmissionMode: vi.fn() }));

const model = "gemini-test-version";
const sha = "a".repeat(40);
const treeSha = "b".repeat(40);
const target = { repo: "school/student", folder: "lab", sourceRef: "main", sha };
const root = "https://api.github.com/repos/school/student";
const modelUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=test-key`;
const files = {
  readme: { path: "lab/README.md", type: "blob", size: 30, mode: "100644" },
  submission: { path: "lab/main.py", type: "blob", size: 30, mode: "100644" },
  otherFolder: { path: "Lab/main.py", type: "blob", size: 30, mode: "100644" },
};
const plan = {
  accountId: "owner", courseId: "course",
  courseConfig: {
    github_org: "school", repos: [], rubric_name: null, rubric_data: null, repo_module_pairing: null, student_repos: [],
  },
  discovery: {
    status: "scanned" as const, enumerationComplete: true,
    repos: [{ status: "ready" as const, repo: target.repo, sourceRef: target.sourceRef, sourceCommit: sha, folders: [target.folder] }],
  },
  folderSources: new Map<string, string | null>(),
};
const claim = { mode: "automatic" as const, generation: 7, token: "server-owned-token" };
const grader = { provider: "gemini", model, graderVersion: "repo-grader-v1" };
const frozenRubric = "Correctness (100%):  Evaluate the printed value.";

function preparedRuntime(settings = {}, graderIdentity = grader, preparedReadme?: { path: string | null; instructions: string }) {
  const captured = captureRepoGradeProfile(
    { accountId: plan.accountId, courseId: plan.courseId, folder: target.folder }, settings, graderIdentity,
  );
  if (captured.status !== "ready") throw new Error("Invalid fixture");
  const receipt = resolveRepoGradeRubric(captured.profile, frozenRubric);
  return { loadPreparedProfile: vi.fn(async () => ({
    profile: captured.profile, receipt, cohortId: "8d74ee61-463c-4b3f-af5d-5fc9b55023c1", preparedReadme,
  })) };
}

function fetchRepo(options: {
  readme?: string;
  tree?: Array<(typeof files)[keyof typeof files]>;
  modelResponse?: () => Response;
  failTree?: boolean;
} = {}) {
  const fetcher = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async (url) => {
    switch (url) {
      case `${root}/git/commits/${sha}`:
        return options.failTree ? new Response(null, { status: 403 }) : Response.json({ sha, tree: { sha: treeSha } });
      case `${root}/git/trees/${treeSha}?recursive=1`:
        return Response.json({ sha: treeSha, truncated: false, tree: options.tree ?? Object.values(files) });
      case `${root}/contents/lab/README.md?ref=${sha}`:
        return new Response(options.readme ?? "Print the answer in a loop.");
      case `${root}/contents/lab/main.py?ref=${sha}`:
        return new Response("print('captured submission')");
      case modelUrl:
        return options.modelResponse?.() ?? Response.json({
          candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify({
            overallComment: "Keep the working loop.",
            rubricResults: [{ area: "Correctness", score: "8/10" }],
          }) }] } }],
        });
      default:
        throw new Error(`Unexpected request ${url}`);
    }
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("GITHUB_TOKEN", "test-token");
  vi.stubEnv("GEMINI_API_KEY", "test-key");
  vi.stubEnv("GEMINI_MODEL", model);
  vi.mocked(collectInlineVisualEvidence).mockResolvedValue({ parts: [], documents: [] });
  vi.mocked(repoGradeAdmissionMode).mockReturnValue("coordinated");
  vi.mocked(requireAppOwner).mockResolvedValue({ id: plan.accountId, email: "owner@example.test" });
  vi.mocked(claimRepoGrade).mockResolvedValue({ status: "claimed", claim });
  vi.mocked(beginRepoGradeDispatch).mockResolvedValue(60_000);
  vi.mocked(settleRepoGrade).mockResolvedValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("admitted pinned repository evaluator", () => {
  it("grades only the claimed SHA and exact folder using the restored rubric with code execution off", async () => {
    const fetcher = fetchRepo();
    await expect(runRepoGradeTarget(plan, target, preparedRuntime())).resolves.toEqual({ status: "succeeded" });

    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      `${root}/git/commits/${sha}`, `${root}/git/trees/${treeSha}?recursive=1`,
      `${root}/contents/lab/README.md?ref=${sha}`, `${root}/contents/lab/main.py?ref=${sha}`, modelUrl,
    ]);
    expect(vi.mocked(claimRepoGrade).mock.invocationCallOrder[0]).toBeLessThan(fetcher.mock.invocationCallOrder[0]);
    expect(vi.mocked(beginRepoGradeDispatch).mock.invocationCallOrder[0]).toBeLessThan(fetcher.mock.invocationCallOrder[4]);
    expect(fetcher.mock.calls.every(([, init]) => init.signal instanceof AbortSignal)).toBe(true);
    const modelRequest = fetcher.mock.calls.find(([url]) => url === modelUrl)?.[1];
    const prompt = JSON.parse(modelRequest?.body as string).contents[0].parts[0].text;
    expect(prompt).toContain(frozenRubric);
    expect(prompt).toContain("Print the answer in a loop.");
    expect(prompt).toContain("captured submission");
    expect(settleRepoGrade).toHaveBeenCalledExactlyOnceWith(claim, expect.objectContaining({
      outcome: "succeeded", inputsComplete: true, result: expect.objectContaining({ score: 80 }),
    }));
  });

  it("never starts model work if the dispatch marker response is lost", async () => {
    const fetcher = fetchRepo();
    vi.mocked(beginRepoGradeDispatch).mockRejectedValue(new Error("Lost marker response"));

    await expect(runRepoGradeTarget(plan, target, preparedRuntime())).resolves.toEqual({ status: "failed" });
    expect(fetcher.mock.calls.map(([url]) => url)).not.toContain(modelUrl);
    expect(settleRepoGrade).toHaveBeenCalledExactlyOnceWith(claim, { outcome: "failed" });
  });

  it("rejects an evaluator README that differs from the prepared cohort before model dispatch", async () => {
    const fetcher = fetchRepo({ readme: "Different instructions." });
    const runtime = preparedRuntime({}, grader, { path: files.readme.path, instructions: "Original instructions." });
    await expect(runRepoGradeTarget(plan, target, runtime)).resolves.toEqual({ status: "failed" });
    expect(fetcher.mock.calls.some(([url]) => url === modelUrl)).toBe(false);
    expect(beginRepoGradeDispatch).not.toHaveBeenCalled();
  });

  it.each([undefined, "  "])("fails safely without effective instructions when the pinned README is %s", async (readme) => {
    const fetcher = fetchRepo(readme === undefined ? { tree: [files.submission] } : { readme, tree: [files.readme] });
    await expect(runRepoGradeTarget(plan, target, preparedRuntime())).resolves.toEqual({ status: "failed" });
    expect(fetcher.mock.calls.some(([url]) => url === modelUrl)).toBe(false);
    expect(settleRepoGrade).toHaveBeenCalledExactlyOnceWith(claim, { outcome: "failed" });
  });

  it("keeps a confirmed no-submission separate when the pinned instructions are present", async () => {
    const fetcher = fetchRepo({ tree: [files.readme] });
    await expect(runRepoGradeTarget(plan, target, preparedRuntime())).resolves.toEqual({ status: "no-submission" });
    expect(fetcher.mock.calls.some(([url]) => url === modelUrl)).toBe(false);
    expect(settleRepoGrade).toHaveBeenCalledExactlyOnceWith(claim, { outcome: "no-submission", inputsComplete: true });
  });

  it("uses saved fallback instructions when the pinned folder has no README", async () => {
    const fetcher = fetchRepo({ tree: [files.submission] });
    const instructions = "Print the answer in a saved assignment.";
    await expect(runRepoGradeTarget(plan, target, preparedRuntime({ instructions }))).resolves.toEqual({ status: "succeeded" });
    expect(fetcher.mock.calls.find(([url]) => url === modelUrl)?.[1].body).toContain(instructions);
  });

  it("rejects profile settings changed outside the configuration fingerprint", async () => {
    const fetcher = fetchRepo();
    const runtime = preparedRuntime();
    const scope = await runtime.loadPreparedProfile();
    runtime.loadPreparedProfile.mockResolvedValue({ ...scope, profile: { ...scope.profile, instructions: "Different instructions" } });
    await expect(runRepoGradeTarget(plan, target, runtime)).resolves.toEqual({ status: "profile-unavailable" });
    expect(claimRepoGrade).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("checks the actual Gemini request model after asynchronous grading preparation", async () => {
    const fetcher = fetchRepo();
    vi.mocked(collectInlineVisualEvidence).mockImplementationOnce(async () => {
      vi.stubEnv("GEMINI_MODEL", "gemini-other-version");
      return { parts: [], documents: [] };
    });
    await expect(runRepoGradeTarget(plan, target, preparedRuntime())).resolves.toEqual({ status: "failed" });
    expect(fetcher.mock.calls.every(([url]) => url.startsWith(root))).toBe(true);
    expect(settleRepoGrade).toHaveBeenCalledExactlyOnceWith(claim, { outcome: "failed" });
  });

  it("fails safely when the execution deadline passes before model dispatch", async () => {
    const fetcher = fetchRepo();
    const start = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(start);
    vi.mocked(collectInlineVisualEvidence).mockImplementationOnce(async () => {
      clock.mockReturnValue(start + 60_000);
      return { parts: [], documents: [] };
    });
    await expect(runRepoGradeTarget(plan, target, preparedRuntime())).resolves.toEqual({ status: "failed" });
    expect(fetcher.mock.calls.every(([url]) => url.startsWith(root))).toBe(true);
    expect(settleRepoGrade).toHaveBeenCalledExactlyOnceWith(claim, { outcome: "failed" });
  });

  it("fails safely for a different grader version or before dispatch when GitHub rejects the pinned read", async () => {
    const fetcher = fetchRepo();
    await expect(runRepoGradeTarget(plan, target, preparedRuntime({}, { ...grader, graderVersion: "stale" })))
      .resolves.toEqual({ status: "failed" });
    expect(fetcher.mock.calls.every(([url]) => url.startsWith(root))).toBe(true);
    const rejectedFetcher = fetchRepo({ failTree: true });
    await expect(runRepoGradeTarget(plan, target, preparedRuntime())).resolves.toEqual({ status: "failed" });
    expect(rejectedFetcher).toHaveBeenCalledOnce();
    expect(settleRepoGrade).toHaveBeenLastCalledWith(claim, { outcome: "failed" });
  });

  it("fails closed for a code-execution opt-in until the sandbox has a coordinated policy", async () => {
    const fetcher = fetchRepo();
    await expect(runRepoGradeTarget(plan, target, preparedRuntime({ runCode: true }))).resolves.toEqual({ status: "failed" });
    expect(fetcher).not.toHaveBeenCalled();
    expect(settleRepoGrade).toHaveBeenCalledExactlyOnceWith(claim, { outcome: "failed" });
  });

  it("does not confuse an embedded profile identity with an LLM model", async () => {
    const fetcher = fetchRepo();
    const runtime = preparedRuntime({}, { ...grader, provider: "embedded" });
    await expect(runRepoGradeTarget(plan, target, runtime)).resolves.toEqual({ status: "failed" });
    expect(fetcher.mock.calls.every(([url]) => url.startsWith(root))).toBe(true);
    expect(settleRepoGrade).toHaveBeenCalledExactlyOnceWith(claim, { outcome: "failed" });
  });

  it.each([false, true])("grades with the real Embedded evaluator without a dispatch permit when settlement acknowledgement is lost=%s", async (lostAcknowledgement) => {
    vi.mocked(repoGradeAdmissionMode).mockReturnValue("embedded-only");
    const fetcher = fetchRepo();
    const runtime = preparedRuntime({
      rubric: "Source file (10 points): Submit a .py file.",
      instructions: "Submit a Python source file.",
      useReadmeInstructions: false,
      runCode: false,
    }, { provider: "embedded", model: "embedded-deterministic", graderVersion: grader.graderVersion });
    if (lostAcknowledgement) vi.mocked(settleRepoGrade).mockRejectedValueOnce(new Error("Lost response"));

    expect((await runRepoGradeTarget(plan, target, runtime)).status).toBe(lostAcknowledgement ? "unknown" : "succeeded");
    expect(beginRepoGradeDispatch).not.toHaveBeenCalled();
    expect(fetcher.mock.calls.length).toBeGreaterThan(0);
    expect(fetcher.mock.calls.every(([url]) => url.startsWith(root))).toBe(true);
    expect(settleRepoGrade).toHaveBeenCalledExactlyOnceWith(claim, expect.objectContaining({
      outcome: "succeeded", inputsComplete: true, result: expect.objectContaining({ score: 100 }),
    }));
  });

  it("rejects a Gemini profile even when an Embedded pilot caller supplies a prepared cohort", async () => {
    vi.mocked(repoGradeAdmissionMode).mockReturnValue("embedded-only");
    const fetcher = fetchRepo();
    await expect(runRepoGradeTarget(plan, target, preparedRuntime())).resolves.toEqual({ status: "embedded-profile-required" });
    expect(claimRepoGrade).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([429, 504])("dispatches a single model attempt for HTTP %i and settles by certainty", async (status) => {
    const fetcher = fetchRepo({ modelResponse: () => new Response(null, { status }) });
    const expected = status === 429 ? "failed" : "unknown";
    await expect(runRepoGradeTarget(plan, target, preparedRuntime())).resolves.toEqual({ status: expected });
    expect(fetcher.mock.calls.filter(([url]) => url === modelUrl)).toHaveLength(1);
    expect(settleRepoGrade).toHaveBeenCalledExactlyOnceWith(claim, { outcome: expected });
  });
});
