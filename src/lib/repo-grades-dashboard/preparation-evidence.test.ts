import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { composeRepoGradePreparationEvidence } from "./preparation-evidence";
import * as pinnedReader from "./preparation-readme";
import { PreparationGithubThrottle } from "./preparation-github-throttle";

type Request = Parameters<typeof composeRepoGradePreparationEvidence>[0];
type Target = Extract<Request["inventory"], { status: "complete" }>["targets"][number];

const first = { owner: "School", repo: "submission-a", sourceRef: "submitted/week", sourceCommit: "1".repeat(40) };
const second = { owner: "School", repo: "submission-b", sourceRef: "class/main", sourceCommit: "2".repeat(40) };
const folder = "Week 1";
const path = `${folder}/README.md`;
const exactInstructions = "\ufeff Explain caf\u00e9.\r\n";
const fallback = { kind: "readme-with-configured-fallback", fallbackInstructions: exactInstructions } as const;

function request(overrides: Partial<Request> = {}): Request {
  return {
    configuration: {
      accountId: "account-private", courseId: "course-private", folder, configurationFingerprint: "a".repeat(64),
      provider: "embedded", model: "model-v1", graderVersion: "grader-v1", promptParserVersion: "parser-v1", courseKind: "coding",
    },
    instructionPolicy: { kind: "readme" },
    inventory: { status: "complete", targets: [first, second] },
    ...overrides,
  };
}

it("propagates a confirmed pre-dispatch README throttle instead of losing it as unavailable evidence", async () => {
  const fixture = githubFixture(first, exactInstructions);
  mockFetch([fixture], (url) => url === fixture.urls.commit
    ? new Response(null, { status: 403, headers: { "x-ratelimit-remaining": "0" } }) : undefined);
  await expect(composeRepoGradePreparationEvidence(request({ inventory: { status: "complete", targets: [first] } })))
    .rejects.toBeInstanceOf(PreparationGithubThrottle);
});

function objectSha(type: "blob" | "tree", bytes: Buffer): string {
  return createHash("sha1").update(`${type} ${bytes.length}\0`).update(bytes).digest("hex");
}

function treeSha(mode: string, name: string, sha: string): string {
  return objectSha("tree", Buffer.concat([Buffer.from(`${mode} ${name}\0`), Buffer.from(sha, "hex")]));
}

function githubFixture(target: Target, text: string | undefined, fileName = "README.md") {
  const bytes = Buffer.from(text ?? "");
  const blobSha = objectSha("blob", bytes);
  const folderSha = treeSha("100644", fileName, blobSha);
  const rootSha = text === undefined ? objectSha("tree", Buffer.alloc(0)) : treeSha("40000", folder, folderSha);
  const tree = {
    sha: rootSha,
    truncated: false,
    tree: text === undefined ? [] : [
      { path: folder, mode: "040000", type: "tree", sha: folderSha },
      { path: `${folder}/${fileName}`, mode: "100644", type: "blob", size: bytes.length, sha: blobSha },
    ],
  };
  const base = `https://api.github.com/repos/${target.owner}/${target.repo}/git`;
  const urls = {
    commit: `${base}/commits/${target.sourceCommit}`, tree: `${base}/trees/${rootSha}?recursive=1`, blob: `${base}/blobs/${blobSha}`,
  };
  const responses = {
    [urls.commit]: () => Response.json({ sha: target.sourceCommit, tree: { sha: rootSha }, private: "raw-github-metadata" }),
    [urls.tree]: () => Response.json(tree),
    ...(text === undefined ? {} : { [urls.blob]: () => new Response(new Uint8Array(bytes)) }),
  };
  return { urls, tree, responses };
}

function mockFetch(
  fixtures: ReturnType<typeof githubFixture>[] = [],
  intercept?: (url: string, init: RequestInit) => Response | Promise<Response> | undefined,
) {
  const responses = Object.assign({}, ...fixtures.map(({ responses }) => responses)) as Record<string, () => Response>;
  const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    const override = intercept?.(url, init);
    if (override) return override;
    if (responses[url]) return responses[url]();
    throw new Error("private-token private-student-body private-request-url");
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function cohort(size: number): Request["inventory"] {
  return {
    status: "complete",
    targets: Array.from({ length: size }, (_, index) => ({ ...first, repo: `submission-${index}` })),
  };
}

let testCredential = 0;
beforeEach(() => vi.stubEnv("GITHUB_TOKEN", `private-token-${testCredential++}`));
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("composeRepoGradePreparationEvidence", () => {
  it("uses both pinned commits and captures exact text and target evidence independently of inventory order", async () => {
    const a = githubFixture(first, exactInstructions);
    const b = githubFixture(second, exactInstructions, "readme.txt");
    const fetchMock = mockFetch([a, b]);
    const original = await composeRepoGradePreparationEvidence(request());
    expect(original).toEqual({
      status: "ready", keyVersion: "repo-grade-preparation-v1", key: expect.stringMatching(/^[0-9a-f]{64}$/),
      instructionDigest: createHash("sha256").update(exactInstructions).digest("hex"),
      instructions: exactInstructions,
      evidence: [
        { target: first, source: { kind: "pinned-readme", path } },
        { target: second, source: { kind: "pinned-readme", path: `${folder}/readme.txt` } },
      ],
    });
    expect(fetchMock.mock.calls.map(([url]) => url).sort()).toEqual([
      ...Object.values(a.urls), b.urls.commit, b.urls.tree,
    ].sort());
    expect(JSON.stringify(original)).not.toMatch(/private-token|raw-github-metadata|account-private|course-private|api\.github\.com/);

    fetchMock.mockClear();
    const reversed = await composeRepoGradePreparationEvidence(request({ inventory: { status: "complete", targets: [second, first] } }));
    expect(reversed).toEqual(original);
    expect(fetchMock.mock.calls.map(([url]) => url).sort()).toEqual([a.urls.commit, b.urls.commit].sort());
  });

  it("uses only the configured exact fallback for conclusive absent and blank reads", async () => {
    const fetchMock = mockFetch([githubFixture(first, undefined), githubFixture(second, " \t\r\n")]);
    const input = request({ instructionPolicy: fallback });
    await expect(composeRepoGradePreparationEvidence(input)).resolves.toMatchObject({
      status: "ready", instructions: exactInstructions,
      evidence: [
        { target: first, source: { kind: "configured-fallback", readmeStatus: "absent" } },
        { target: second, source: { kind: "configured-fallback", readmeStatus: "blank", path } },
      ],
    });
    expect(fetchMock).toHaveBeenCalledTimes(5);
    fetchMock.mockClear();
    await expect(composeRepoGradePreparationEvidence(request({
      instructionPolicy: { ...fallback, fallbackInstructions: "Updated fallback" },
    }))).resolves.toMatchObject({ status: "ready", instructions: "Updated fallback" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("checks the full current cohort for conflicts when only one pinned commit changes", async () => {
    const updated = { ...second, sourceCommit: "3".repeat(40) };
    const a = githubFixture(first, exactInstructions);
    const b = githubFixture(second, exactInstructions);
    const next = githubFixture(updated, "Different instructions");
    const fetchMock = mockFetch([a, b, next]);
    await expect(composeRepoGradePreparationEvidence(request())).resolves.toMatchObject({ status: "ready" });

    fetchMock.mockClear();
    await expect(composeRepoGradePreparationEvidence(request({
      inventory: { status: "complete", targets: [first, updated] },
    }))).resolves.toEqual({ status: "blocked", reason: "conflicting-instructions" });
    expect(fetchMock.mock.calls.map(([url]) => url).sort()).toEqual([a.urls.commit, ...Object.values(next.urls)].sort());
  });

  it.each([undefined, " \t\r\n"])("blocks a cohort with a missing or blank README without a configured fallback (%j)", async (text) => {
    mockFetch([githubFixture(first, text), githubFixture(second, exactInstructions)]);
    await expect(composeRepoGradePreparationEvidence(request())).resolves.toEqual({
      status: "blocked", reason: "missing-instruction-evidence",
    });
  });

  it.each(["invalid-commit", "truncated-tree", "wrong-blob", "404", "transport-error"])(
    "blocks %s even with configured fallback, exposing only a bounded reason",
    async (fault) => {
      const a = githubFixture(first, exactInstructions);
      const b = githubFixture(second, exactInstructions);
      mockFetch([a, b], (url) => {
        if (fault === "invalid-commit" && url === a.urls.commit) return Response.json({ sha: second.sourceCommit });
        if (fault === "truncated-tree" && url === a.urls.tree) return Response.json({ ...a.tree, truncated: true });
        if (fault === "wrong-blob" && url === a.urls.blob) return new Response("private-student-body");
        if (fault === "404" && url === a.urls.tree) return new Response("private-student-body", { status: 404 });
        if (fault === "transport-error" && url === a.urls.commit) throw new Error("private-student-body");
      });
      await expect(composeRepoGradePreparationEvidence(request({ instructionPolicy: fallback }))).resolves.toEqual({
        status: "blocked", reason: "readme-read-failed",
      });
    },
  );

  it("blocks exact-byte conflicts in either order and against fallback text", async () => {
    for (const text of [exactInstructions.replace("\r\n", "\n"), undefined]) {
      mockFetch([githubFixture(first, text), githubFixture(second, text === undefined ? "Different instructions" : exactInstructions)]);
      const instructionPolicy = text === undefined ? fallback : { kind: "readme" } as const;
      for (const targets of [[first, second], [second, first]]) {
        await expect(composeRepoGradePreparationEvidence(request({ instructionPolicy, inventory: { status: "complete", targets } })))
          .resolves.toEqual({ status: "blocked", reason: "conflicting-instructions" });
      }
    }
  });

  it("preflights the entire inventory and configured policy before reading any README", async () => {
    const fetchMock = mockFetch();
    const cases: [Partial<Request>, string][] = [
      [{ inventory: { status: "incomplete" } }, "incomplete-inventory"],
      [{ inventory: { status: "complete", targets: [] } }, "invalid-inventory"],
      [{ inventory: { status: "complete", targets: [first, { ...second, sourceCommit: "invalid" }] } }, "invalid-inventory"],
      [{ inventory: { status: "complete", targets: [first, { ...first, owner: "school" }] } }, "duplicate-target"],
      [{ inventory: cohort(101) }, "readme-target-budget-exceeded"],
      [{ instructionPolicy: { ...fallback, fallbackInstructions: " " } }, "missing-instructions"],
    ];
    for (const [overrides, reason] of cases) {
      await expect(composeRepoGradePreparationEvidence(request(overrides))).resolves.toEqual({ status: "blocked", reason });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses saved instructions without GitHub and still requires a complete inventory", async () => {
    const fetchMock = mockFetch();
    const instructionPolicy = { kind: "saved", instructions: exactInstructions } as const;
    await expect(composeRepoGradePreparationEvidence(request({ instructionPolicy }))).resolves.toMatchObject({
      status: "ready", instructions: exactInstructions,
      evidence: [{ target: first, source: { kind: "saved" } }, { target: second, source: { kind: "saved" } }],
    });
    await expect(composeRepoGradePreparationEvidence(request({ instructionPolicy, inventory: { status: "incomplete" } })))
      .resolves.toEqual({ status: "blocked", reason: "incomplete-inventory" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires the internal inventory shape and reads its own evidence", async () => {
    const fetchMock = mockFetch();
    const discoveryPayload = { status: "scanned", enumerationComplete: true, repos: [first] };
    await expect(composeRepoGradePreparationEvidence({ ...request(), inventory: discoveryPayload } as unknown as Request))
      .resolves.toEqual({ status: "blocked", reason: "invalid-inventory" });
    const injected = { ...request(), readmeEvidence: [{ target: first, source: { kind: "pinned-readme", path, instructions: "forged" } }] };
    await expect(composeRepoGradePreparationEvidence(injected))
      .resolves.toEqual({ status: "blocked", reason: "invalid-instruction-evidence" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("blocks read evidence bound to a different ref or commit", async () => {
    const reader = vi.spyOn(pinnedReader, "readPinnedRepoGradeReadme");
    for (const changes of [{ sourceRef: second.sourceRef }, { sourceCommit: second.sourceCommit }]) {
      reader.mockResolvedValueOnce({ status: "absent", target: { ...first, ...changes } });
      const input = request({ instructionPolicy: fallback, inventory: { status: "complete", targets: [first] } });
      await expect(composeRepoGradePreparationEvidence(input))
        .resolves.toEqual({ status: "blocked", reason: "invalid-instruction-evidence" });
    }
  });

  it("fills only the bounded worker slots, aborts peers, and drops queued reads at the first failure", async () => {
    const reads: { signal?: AbortSignal; finish: (evidence: pinnedReader.PinnedReadmeEvidence) => void; target: Target }[] = [];
    vi.spyOn(pinnedReader, "readPinnedRepoGradeReadme").mockImplementation(
      (target, _folder, signal) => new Promise((finish) => reads.push({ target, signal, finish })),
    );
    const pending = composeRepoGradePreparationEvidence(request({ inventory: cohort(8) }));
    expect(reads).toHaveLength(5);
    reads[0].finish({ status: "present", target: reads[0].target, path, blobSha: "a".repeat(40), text: exactInstructions });
    await vi.waitFor(() => expect(reads).toHaveLength(6));
    reads[1].finish({ status: "failure" });
    await expect(pending).resolves.toEqual({ status: "blocked", reason: "readme-read-failed" });
    expect(reads.every(({ signal }) => signal?.aborted)).toBe(true);
    for (const { target, finish } of reads) finish({ status: "absent", target });
    await Promise.resolve();
    expect(reads).toHaveLength(6);
  });

  it("enforces the cohort deadline even if a reader ignores abort", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    const reader = vi.spyOn(pinnedReader, "readPinnedRepoGradeReadme").mockImplementation(() => new Promise(() => {}));
    const pending = composeRepoGradePreparationEvidence(request({ inventory: cohort(8) }));
    const settled = vi.fn();
    void pending.then(settled);
    await vi.advanceTimersByTimeAsync(39_999);
    expect(settled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toEqual({ status: "blocked", reason: "readme-deadline-exceeded" });
    expect(reader).toHaveBeenCalledTimes(5);
    expect(reader.mock.calls.every(([, , signal]) => signal?.aborted)).toBe(true);
  });
});
