import { createHash } from "node:crypto";
import JSZip from "jszip";
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
const target = { repo: "school/student", folder: "lab", sourceRef: "main", sha };
const root = "https://api.github.com/repos/school/student";
const commitUrl = `${root}/git/commits/${sha}`;
const zipballUrl = `${root}/zipball/${sha}`;
const downloadUrl = `https://codeload.github.com/school/student/legacy.zip/${sha}?token=test-temporary-url`;
const modelUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=test-key`;
let tokenId = 0;
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

function preparedRuntime(settings = {}, graderIdentity = grader, preparedReadme?: { path: string | null; instructions: string; template?: boolean }) {
  const captured = captureRepoGradeProfile(
    { accountId: plan.accountId, courseId: plan.courseId, folder: target.folder }, settings, graderIdentity,
  );
  if (captured.status !== "ready") throw new Error("Invalid fixture");
  const receipt = resolveRepoGradeRubric(captured.profile, frozenRubric);
  return { loadPreparedProfile: vi.fn(async () => ({
    profile: captured.profile, receipt, cohortId: "8d74ee61-463c-4b3f-af5d-5fc9b55023c1", preparedReadme,
  })) };
}

function gitTree(blobs: readonly { path: string; type: string; mode: string; size: number; sha: string }[]) {
  const directories: { path: string; type: "tree"; mode: "040000"; sha: string }[] = [];
  const parents = new Map<string, { name: string; mode: string; sha: string }[]>([["", []]]);
  for (const blob of blobs) {
    const parts = blob.path.split("/");
    const name = parts.pop()!;
    const parent = parts.join("/");
    for (let depth = 1; depth <= parts.length; depth += 1) {
      const path = parts.slice(0, depth).join("/");
      if (!parents.has(path)) parents.set(path, []);
    }
    parents.get(parent)!.push({ name, mode: blob.mode, sha: blob.sha });
  }
  let rootSha = "";
  // Descendants were inserted after their parents. Serialize each Git tree
  // bottom-up so its parent can embed the real directory object hash.
  for (const [path, children] of [...parents].reverse()) {
    const bytes = Buffer.concat(children.sort((left, right) => Buffer.compare(
      Buffer.from(left.mode === "40000" ? `${left.name}/` : left.name),
      Buffer.from(right.mode === "40000" ? `${right.name}/` : right.name),
    )).map(({ mode, name, sha }) => Buffer.concat([Buffer.from(`${mode} ${name}\0`), Buffer.from(sha, "hex")])));
    const sha = createHash("sha1").update(`tree ${bytes.byteLength}\0`).update(bytes).digest("hex");
    if (path) {
      directories.push({ path, type: "tree", mode: "040000", sha });
      const slash = path.lastIndexOf("/");
      parents.get(slash < 0 ? "" : path.slice(0, slash))!.push({ name: path.slice(slash + 1), mode: "40000", sha });
    } else {
      rootSha = sha;
    }
  }
  return { sha: rootSha, truncated: false, tree: [...directories, ...blobs] };
}

function fetchRepo(options: {
  readme?: string;
  tree?: Array<(typeof files)[keyof typeof files]>;
  modelResponse?: () => Response;
  failTree?: boolean;
  omitFromArchive?: string;
  oversizedArchive?: boolean;
  throttleAfterBlobs?: number;
  contentOverrides?: Record<string, string>;
} = {}) {
  const contents = (path: string) => options.contentOverrides?.[path] ?? (path === files.readme.path ? options.readme ?? "Print the answer in a loop."
    : path === files.submission.path ? "print('captured submission')"
      : path === files.otherFolder.path ? "WRONG_CASE_FOLDER" : `# submission helper ${path}`);
  const inventory = options.tree ?? [
    ...Object.values(files),
    ...Array.from({ length: 7 }, (_, i) => ({ ...files.submission, path: `lab/helpers/h${i}.py` })),
  ];
  const blobs = inventory.map((file) => {
    const text = contents(file.path);
    const size = Buffer.byteLength(text);
    return { ...file, size, sha: createHash("sha1").update(`blob ${size}\0`).update(text).digest("hex") };
  });
  const tree = gitTree(blobs);
  const treeUrl = `${root}/git/trees/${tree.sha}?recursive=1`;
  let blobReads = 0;
  const fetcher = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async (url) => {
    const blob = blobs.find(({ sha }) => url === `${root}/git/blobs/${sha}`);
    if (blob) {
      if (options.throttleAfterBlobs !== undefined && blobReads >= options.throttleAfterBlobs) {
        return new Response(null, { status: 429, headers: { "Retry-After": "60" } });
      }
      blobReads += 1;
      return new Response(contents(blob.path));
    }
    switch (url) {
      case commitUrl:
        return options.failTree ? new Response(null, { status: 403 }) : Response.json({ sha, tree: { sha: tree.sha } });
      case treeUrl:
        return Response.json(tree);
      case zipballUrl:
        return new Response(null, { status: 302, headers: { Location: downloadUrl } });
      case downloadUrl: {
        if (options.oversizedArchive) return new Response(null, { headers: { "Content-Length": String(12 * 1024 * 1024 + 1) } });
        const archive = new JSZip();
        for (const file of blobs) {
          if (file.path !== options.omitFromArchive) archive.file(`school-student-${sha.slice(0, 7)}/${file.path}`, contents(file.path));
        }
        return new Response(await archive.generateAsync({ type: "arraybuffer", compression: "DEFLATE", platform: "UNIX" }));
      }
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
  return Object.assign(fetcher, { treeUrl });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("GITHUB_TOKEN", `test-token-${tokenId += 1}`);
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
  it("grades verified extensionless and .text submission files together", async () => {
    const schema = { ...files.submission, path: "lab/schema" };
    const output = { ...files.submission, path: "lab/output.text" };
    const fetcher = fetchRepo({ tree: [files.readme, files.submission, schema, output] });
    await expect(runRepoGradeTarget(plan, target, preparedRuntime())).resolves.toEqual({ status: "succeeded" });
    const modelCall = fetcher.mock.calls.find(([url]) => url === modelUrl);
    expect(modelCall?.[1].body).toContain("# submission helper lab/schema");
    expect(modelCall?.[1].body).toContain("# submission helper lab/output.text");
  });

  it.each(["not\0text", "%PDF-1.7\nexample printable body", "value\x01binary", "%!PS-Adobe-3.0\n"]) (
    "does not dispatch a model for extensionless binary-like verified bytes (%j)", async (payload) => {
    const schema = { ...files.submission, path: "lab/schema" };
    const fetcher = fetchRepo({ tree: [files.readme, files.submission, schema], contentOverrides: { "lab/schema": payload } });
    expect((await runRepoGradeTarget(plan, target, preparedRuntime())).status).toBe("partial");
    expect(fetcher.mock.calls.some(([url]) => url === modelUrl)).toBe(false);
  });

  it("rejects an ASCII PDF extensionless blob after the oversized archive falls back to verified raw blobs", async () => {
    const schema = { ...files.submission, path: "lab/schema" };
    const output = { ...files.submission, path: "lab/output.text" };
    const fetcher = fetchRepo({ tree: [files.readme, files.submission, schema, output], oversizedArchive: true, contentOverrides: { "lab/schema": "%PDF-1.7\nprintable body" } });
    expect((await runRepoGradeTarget(plan, target, preparedRuntime())).status).toBe("partial");
    expect(fetcher.mock.calls.some(([url]) => url === modelUrl)).toBe(false);
    expect(fetcher.mock.calls.some(([url]) => url.includes("/git/blobs/"))).toBe(true);
  });
  it("grades only the claimed SHA and exact folder using the restored rubric with code execution off", async () => {
    const fetcher = fetchRepo();
    await expect(runRepoGradeTarget(plan, target, preparedRuntime())).resolves.toEqual({ status: "succeeded" });

    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      commitUrl, fetcher.treeUrl,
      zipballUrl, downloadUrl, modelUrl,
    ]);
    expect(vi.mocked(claimRepoGrade).mock.invocationCallOrder[0]).toBeLessThan(fetcher.mock.invocationCallOrder[0]);
    expect(vi.mocked(beginRepoGradeDispatch).mock.invocationCallOrder[0]).toBeLessThan(fetcher.mock.invocationCallOrder[4]);
    expect(fetcher.mock.calls.every(([, init]) => init.signal instanceof AbortSignal)).toBe(true);
    const modelRequest = fetcher.mock.calls.find(([url]) => url === modelUrl)?.[1];
    const prompt = JSON.parse(modelRequest?.body as string).contents[0].parts[0].text;
    expect(prompt).toContain(frozenRubric);
    expect(prompt).toContain("Print the answer in a loop.");
    expect(prompt).toContain("captured submission");
    expect(prompt).toContain("lab/helpers/h6.py");
    expect(prompt).not.toContain("WRONG_CASE_FOLDER");
    expect(new Headers(fetcher.mock.calls[2][1].headers).has("authorization")).toBe(true);
    expect(new Headers(fetcher.mock.calls[3][1].headers).has("authorization")).toBe(false);
    expect(settleRepoGrade).toHaveBeenCalledExactlyOnceWith(claim, expect.objectContaining({
      outcome: "succeeded", inputsComplete: true, result: expect.objectContaining({ score: 80 }),
    }));
  });

  it("never grades a partial archive or falls back to a Contents request when an expected file is omitted", async () => {
    const fetcher = fetchRepo({ omitFromArchive: "lab/helpers/h6.py" });
    expect((await runRepoGradeTarget(plan, target, preparedRuntime())).status).toBe("partial");
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      commitUrl, fetcher.treeUrl, zipballUrl, downloadUrl,
    ]);
    expect(beginRepoGradeDispatch).not.toHaveBeenCalled();
    expect(settleRepoGrade).toHaveBeenCalledExactlyOnceWith(claim, { outcome: "partial" });
  });

  it("uses a bounded verified blob fallback for a small folder in an oversized repository", async () => {
    const start = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(start);
    const blobRequests = Array.from({ length: 3 }, () => expect.stringMatching(/\/git\/blobs\/[a-f0-9]{40}$/));
    const fetcher = fetchRepo({ tree: [...Object.values(files), { ...files.submission, path: "lab/helper.py" }], oversizedArchive: true });
    expect((await runRepoGradeTarget(plan, target, preparedRuntime())).status).toBe("succeeded");
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      commitUrl, fetcher.treeUrl, zipballUrl, downloadUrl, ...blobRequests, modelUrl,
    ]);

    fetcher.mockClear();
    clock.mockReturnValue(start + 59_999);
    expect((await runRepoGradeTarget(plan, target, preparedRuntime())).status).toBe("succeeded");
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([commitUrl, ...blobRequests, modelUrl]);

    fetcher.mockClear();
    clock.mockReturnValue(start + 60_000);
    expect((await runRepoGradeTarget(plan, target, preparedRuntime())).status).toBe("succeeded");
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      commitUrl, zipballUrl, downloadUrl, ...blobRequests, modelUrl,
    ]);
  });

  it("grades a folder with more than four files in a large repository from exact pinned blobs", async () => {
    const fetcher = fetchRepo({ oversizedArchive: true });
    expect((await runRepoGradeTarget(plan, target, preparedRuntime())).status).toBe("succeeded");
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      commitUrl, fetcher.treeUrl, zipballUrl, downloadUrl,
      ...Array.from({ length: 9 }, () => expect.stringMatching(/\/git\/blobs\/[a-f0-9]{40}$/)), modelUrl,
    ]);
    expect(fetcher.mock.calls.at(-1)?.[1].body).toContain("lab/helpers/h6.py");
    expect(fetcher.mock.calls.at(-1)?.[1].body).not.toContain("WRONG_CASE_FOLDER");
  });

  it("does not request an archive or blobs when the folder exceeds the existing file-count limit", async () => {
    const fetcher = fetchRepo({
      oversizedArchive: true,
      tree: Array.from({ length: 201 }, (_, i) => ({ ...files.submission, path: `lab/file-${i}.py` })),
    });
    expect((await runRepoGradeTarget(plan, target, preparedRuntime())).status).toBe("partial");
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      commitUrl, fetcher.treeUrl,
    ]);
  });

  it("stops fallback at the first throttle and honors cooldown on the next evaluation", async () => {
    const fetcher = fetchRepo({ oversizedArchive: true, throttleAfterBlobs: 1 });
    expect((await runRepoGradeTarget(plan, target, preparedRuntime())).status).toBe("partial");
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      commitUrl, fetcher.treeUrl, zipballUrl, downloadUrl,
      expect.stringMatching(/\/git\/blobs\/[a-f0-9]{40}$/), expect.stringMatching(/\/git\/blobs\/[a-f0-9]{40}$/),
    ]);
    fetcher.mockClear();
    expect((await runRepoGradeTarget(plan, target, preparedRuntime())).status).toBe("partial");
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([commitUrl]);
    expect(beginRepoGradeDispatch).not.toHaveBeenCalled();
  });

  it("authorizes the pinned commit on each grade and reuses the verified archive for one hour", async () => {
    const start = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(start);
    const oneHour = 60 * 60_000;
    const fetcher = fetchRepo();
    await expect(runRepoGradeTarget(plan, target, preparedRuntime())).resolves.toEqual({ status: "succeeded" });

    fetcher.mockClear();
    clock.mockReturnValue(start + oneHour - 1);
    await expect(runRepoGradeTarget(plan, target, preparedRuntime())).resolves.toEqual({ status: "succeeded" });
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      commitUrl, fetcher.treeUrl, modelUrl,
    ]);

    const denied = fetchRepo({ failTree: true });
    await expect(runRepoGradeTarget(plan, target, preparedRuntime())).resolves.toEqual({ status: "failed" });
    expect(denied).toHaveBeenCalledExactlyOnceWith(commitUrl, expect.objectContaining({ cache: "no-store" }));
    expect(new Headers(denied.mock.calls[0][1].headers).has("authorization")).toBe(true);

    vi.stubGlobal("fetch", fetcher);
    fetcher.mockClear();
    clock.mockReturnValue(start + oneHour);
    await expect(runRepoGradeTarget(plan, target, preparedRuntime())).resolves.toEqual({ status: "succeeded" });
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      commitUrl, zipballUrl, downloadUrl, modelUrl,
    ]);
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

  it("uses template instructions without reading the student's README as grading input", async () => {
    const studentReadme = "Student-specific instructions must not be used.";
    const secondReadme = { ...files.readme, path: "lab/docs/readme.txt" };
    const variantReadme = { ...files.readme, path: "lab/assignment-README.md" };
    const htmlReadme = { ...files.readme, path: "lab/README.html" };
    const xmlReadme = { ...files.readme, path: "lab/README.xml" };
    const studentCode = { ...files.submission, path: "lab/readme_processor.py" };
    const fetcher = fetchRepo({ readme: studentReadme, tree: [files.readme, secondReadme, variantReadme, htmlReadme, xmlReadme, studentCode, files.submission] });
    const instructions = "Shared template assignment instructions.";
    const runtime = preparedRuntime({}, grader, { path: null, instructions, template: true });
    await expect(runRepoGradeTarget(plan, target, runtime)).resolves.toEqual({ status: "succeeded" });
    const modelCall = fetcher.mock.calls.find(([url]) => url === modelUrl);
    expect(modelCall?.[1].body).toContain(instructions);
    expect(modelCall?.[1].body).not.toContain("Student-specific instructions must not be used.");
    expect(modelCall?.[1].body).not.toContain("# submission helper lab/docs/readme.txt");
    expect(modelCall?.[1].body).not.toContain("# submission helper lab/assignment-README.md");
    expect(modelCall?.[1].body).not.toContain("# submission helper lab/README.html");
    expect(modelCall?.[1].body).not.toContain("# submission helper lab/README.xml");
    expect(modelCall?.[1].body).toContain("# submission helper lab/readme_processor.py");
    const studentReadmeSha = createHash("sha1").update(`blob ${Buffer.byteLength(studentReadme)}\0`).update(studentReadme).digest("hex");
    expect(fetcher.mock.calls.some(([url]) => url.endsWith(`/git/blobs/${studentReadmeSha}`))).toBe(false);
    const secondReadmeText = "# submission helper lab/docs/readme.txt";
    const secondReadmeSha = createHash("sha1").update(`blob ${Buffer.byteLength(secondReadmeText)}\0`).update(secondReadmeText).digest("hex");
    expect(fetcher.mock.calls.some(([url]) => url.endsWith(`/git/blobs/${secondReadmeSha}`))).toBe(false);
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
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      commitUrl, fetcher.treeUrl,
      expect.stringMatching(/\/git\/blobs\/[a-f0-9]{40}$/), modelUrl,
    ]);
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
    expect(fetcher.mock.calls.some(([url]) => url === modelUrl)).toBe(false);
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
    expect(fetcher.mock.calls.some(([url]) => url === modelUrl)).toBe(false);
    expect(settleRepoGrade).toHaveBeenCalledExactlyOnceWith(claim, { outcome: "failed" });
  });

  it("fails safely for a different grader version or before dispatch when GitHub rejects the pinned read", async () => {
    const fetcher = fetchRepo();
    await expect(runRepoGradeTarget(plan, target, preparedRuntime({}, { ...grader, graderVersion: "stale" })))
      .resolves.toEqual({ status: "failed" });
    expect(fetcher.mock.calls.some(([url]) => url === modelUrl)).toBe(false);
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
    expect(fetcher.mock.calls.some(([url]) => url === modelUrl)).toBe(false);
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
    expect(fetcher.mock.calls.some(([url]) => url === modelUrl)).toBe(false);
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
