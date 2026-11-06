import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authorizeAutomaticRepoGradeEvidence, createAutomaticRepoGradeEvidenceResolver } from "./automatic-evidence";
import type { composeRepoGradePreparationEvidence } from "./preparation-evidence";
import { PreparationGithubThrottle } from "./preparation-github-throttle";

const { readPinned } = vi.hoisted(() => ({ readPinned: vi.fn() }));
vi.mock("./preparation-readme", () => ({ readPinnedRepoGradeReadme: readPinned }));

type Input = Parameters<typeof composeRepoGradePreparationEvidence>[0];
const first = { owner: "Org", repo: "first", sourceRef: "main", sourceCommit: "1".repeat(40) };
const second = { owner: "Org", repo: "second", sourceRef: "submit", sourceCommit: "2".repeat(40) };
const instructions = "Implement the parser.";
const input: Input = {
  configuration: {
    accountId: "owner", courseId: "course", folder: "lab", configurationFingerprint: "f".repeat(64),
    provider: "gemini", model: "model", graderVersion: "grader", promptParserVersion: "parser", courseKind: "coding",
  },
  instructionPolicy: { kind: "readme-with-configured-fallback", fallbackInstructions: instructions },
  inventory: { status: "complete", targets: [first, second] },
};

function storage() {
  const data = new Map<string, unknown>();
  const store = {
    read: vi.fn(async (key: string) => data.get(key) ?? null),
    write: vi.fn(async (key: string, evidence: unknown) => { data.set(key, JSON.parse(JSON.stringify(evidence))); }),
  };
  return { data, store };
}

describe("run-scoped automatic grading evidence", () => {
  beforeEach(() => {
    readPinned.mockReset().mockImplementation(async (target) => target === undefined ? { status: "failure" }
      : target.repo === "first" ? { status: "present", path: "lab/README.md", text: instructions, target }
        : { status: "absent", target });
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it("validates and reuses complete evidence across worker instances without rereading GitHub", async () => {
    const { store } = storage();
    const original = await createAutomaticRepoGradeEvidenceResolver("snapshot", store, async () => true)(input);
    expect(original).toMatchObject({ status: "ready", evidence: [
      { target: first, source: { kind: "pinned-readme", path: "lab/README.md" } },
      { target: second, source: { kind: "configured-fallback", readmeStatus: "absent" } },
    ] });
    const restored = await createAutomaticRepoGradeEvidenceResolver("snapshot", store, async () => true)(input);
    expect(restored).toEqual(original);
    expect(readPinned).toHaveBeenCalledTimes(2);
    expect(store.write).toHaveBeenCalledTimes(1);
  });

  it("does not use old evidence after the pin set changes", async () => {
    const { store } = storage();
    const resolve = createAutomaticRepoGradeEvidenceResolver("snapshot", store, async () => true);
    await resolve(input);
    const next = { ...input, inventory: { status: "complete", targets: [first, { ...second, sourceCommit: "3".repeat(40) }] } } as const;
    await expect(resolve(next)).resolves.toMatchObject({ status: "ready", evidence: [
      { target: first }, { target: next.inventory.targets[1] },
    ] });
    expect(readPinned).toHaveBeenCalledTimes(4);
  });

  it("rejects an incomplete stored cohort without falling back to GitHub", async () => {
    const { data, store } = storage();
    const resolve = createAutomaticRepoGradeEvidenceResolver("snapshot", store, async () => true);
    await resolve(input);
    const [key] = store.write.mock.calls[0];
    data.set(key, { ...(data.get(key) as object), rows: [] });
    await expect(resolve(input)).resolves.toEqual({ status: "blocked", reason: "invalid-instruction-evidence" });
    expect(readPinned).toHaveBeenCalledTimes(2);
  });

  it("does not release stored instructions when the current target loses GitHub access", async () => {
    const { store } = storage();
    vi.stubEnv("GITHUB_TOKEN", "test-token");
    const fetch = vi.fn(async () => new Response("Not allowed", { status: 403 }));
    vi.stubGlobal("fetch", fetch);
    const resolve = createAutomaticRepoGradeEvidenceResolver("snapshot", store,
      () => authorizeAutomaticRepoGradeEvidence("Org/first", first.sourceCommit));
    await expect(resolve(input)).resolves.toMatchObject({ status: "ready" });
    expect(fetch).not.toHaveBeenCalled();
    await expect(resolve(input)).resolves.toEqual({ status: "blocked", reason: "readme-read-failed" });
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      `https://api.github.com/repos/Org/first/git/commits/${first.sourceCommit}`,
      expect.objectContaining({ cache: "no-store", redirect: "manual" }),
    );
    expect(readPinned).toHaveBeenCalledTimes(2);
  });

  it("propagates a confirmed throttle while reauthorizing cached evidence", async () => {
    const { store } = storage();
    vi.stubEnv("GITHUB_TOKEN", "test-token");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, {
      status: 403, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "2000000000" },
    })));
    const resolve = createAutomaticRepoGradeEvidenceResolver("snapshot", store,
      () => authorizeAutomaticRepoGradeEvidence("Org/first", first.sourceCommit));
    await expect(resolve(input)).resolves.toMatchObject({ status: "ready" });
    await expect(resolve(input)).rejects.toBeInstanceOf(PreparationGithubThrottle);
  });
});
