import { describe, expect, it } from "vitest";
import { captureRepoGradePreparationInput, type RepoGradePreparationInput } from "./preparation-input";

type Configuration = RepoGradePreparationInput["configuration"];
type ReadmeEvidence = RepoGradePreparationInput["readmeEvidence"][number];

const configuration: Configuration = {
  accountId: "owner-account",
  courseId: "course-a",
  folder: "assignments/Week 1",
  configurationFingerprint: "a".repeat(64),
  provider: "gemini",
  model: "model-v1",
  graderVersion: "grader-v1",
  promptParserVersion: "rubric-prompt-parser-v1",
  courseKind: "coding",
};
const first = { owner: "Org", repo: "submission-a", sourceRef: "main", sourceCommit: "1".repeat(40) };
const second = { owner: "Org", repo: "submission-b", sourceRef: "feature/submit", sourceCommit: "2".repeat(40) };
const exactInstructions = "  Explain caf\u00e9.\r\n";
const path = `${configuration.folder}/README.md`;

function readme(target: ReadmeEvidence["target"], instructions = exactInstructions, file = path): ReadmeEvidence {
  return { target, source: { kind: "pinned-readme", path: file, instructions } };
}

function input(overrides: Partial<RepoGradePreparationInput> = {}): RepoGradePreparationInput {
  return {
    configuration,
    instructionPolicy: { kind: "readme" },
    inventory: { status: "complete", targets: [second, first] },
    readmeEvidence: [readme(first), readme(second)],
    ...overrides,
  };
}

function saved(instructions = exactInstructions, config = configuration): RepoGradePreparationInput {
  return input({ configuration: config, instructionPolicy: { kind: "saved", instructions }, readmeEvidence: [] });
}

function ready(raw: RepoGradePreparationInput) {
  const captured = captureRepoGradePreparationInput(raw);
  expect(captured.status).toBe("ready");
  if (captured.status !== "ready") throw new Error(captured.reason);
  return captured;
}

describe("repo grade preparation input", () => {
  it("is independent of inventory and evidence order and retains exact target evidence", () => {
    const left = ready(input({ readmeEvidence: [readme(first), readme(second, exactInstructions, `${configuration.folder}/readme.txt`)] }));
    const right = ready(input({
      inventory: { status: "complete", targets: [first, second] },
      readmeEvidence: [readme(second, exactInstructions, `${configuration.folder}/readme.txt`), readme(first)],
    }));

    expect(left).toEqual(right);
    expect(left.keyVersion).toBe("repo-grade-preparation-v1");
    expect(left.key).toMatch(/^[0-9a-f]{64}$/);
    expect(left.instructions).toBe(exactInstructions);
    expect(left.instructionDigest).toBe("5e19e944259ce0c076186f6e637f1773281e89643847b946db245840ce3d9b18");
    expect(left.evidence).toEqual([
      { target: first, source: { kind: "pinned-readme", path } },
      { target: second, source: { kind: "pinned-readme", path: `${configuration.folder}/readme.txt` } },
    ]);
  });

  it("reuses the key after code-only changes but records each new commit separately", () => {
    const original = ready(input());
    const changed = { ...first, sourceCommit: "3".repeat(40) };
    const next = ready(input({
      inventory: { status: "complete", targets: [second, changed] },
      readmeEvidence: [readme(changed), readme(second)],
    }));

    expect(next.key).toBe(original.key);
    expect(next.evidence[0].target.sourceCommit).toBe(changed.sourceCommit);
    expect(original.evidence[0].target.sourceCommit).toBe(first.sourceCommit);
  });

  it.each([
    exactInstructions.trim(),
    exactInstructions.replace("\r\n", "\n"),
    exactInstructions.normalize("NFD"),
    exactInstructions.toUpperCase(),
  ])("hashes exact instruction bytes for %j", (instructions) => {
    const original = ready(input());
    const changed = ready(input({ readmeEvidence: [readme(first, instructions), readme(second, instructions)] }));
    expect(changed.instructionDigest).not.toBe(original.instructionDigest);
    expect(changed.key).not.toBe(original.key);
  });

  it.each<Partial<Configuration>>([
    { accountId: "other-owner" },
    { courseId: "other-course" },
    { folder: "assignments/week 1" },
    { configurationFingerprint: "b".repeat(64) },
    { provider: "embedded" },
    { model: "model-v2" },
    { graderVersion: "grader-v2" },
    { promptParserVersion: "rubric-prompt-parser-v2" },
    { courseKind: "applied" },
  ])("isolates changes to %j", (change) => {
    expect(ready(saved(exactInstructions, { ...configuration, ...change })).key).not.toBe(ready(saved()).key);
  });

  it("keeps values containing a separator from aliasing and distinguishes instruction policies", () => {
    const firstKey = ready(saved(exactInstructions, { ...configuration, accountId: "a|b", courseId: "c" })).key;
    const secondKey = ready(saved(exactInstructions, { ...configuration, accountId: "a", courseId: "b|c" })).key;
    expect(firstKey).not.toBe(secondKey);
    expect(ready(saved()).key).not.toBe(ready(input()).key);
    expect(ready(saved()).instructionDigest).toBe(ready(input()).instructionDigest);
  });

  it("requires explicit exact saved instructions and excludes README evidence in saved mode", () => {
    expect(ready(saved()).evidence[0]).toEqual({ target: first, source: { kind: "saved" } });
    expect(captureRepoGradePreparationInput(saved(" \r\n"))).toEqual({ status: "blocked", reason: "missing-instructions" });
    expect(captureRepoGradePreparationInput(input({ instructionPolicy: { kind: "saved", instructions: exactInstructions } })))
      .toEqual({ status: "blocked", reason: "invalid-instruction-evidence" });
  });

  it("allows only configured fallback after conclusive absence or blank evidence", () => {
    const absent: ReadmeEvidence = { target: first, source: { kind: "configured-fallback", readmeStatus: "absent" } };
    const blank: ReadmeEvidence = { target: second, source: { kind: "configured-fallback", readmeStatus: "blank", path } };
    const policy: RepoGradePreparationInput["instructionPolicy"] = {
      kind: "readme-with-configured-fallback", fallbackInstructions: exactInstructions,
    };

    expect(ready(input({ instructionPolicy: policy, readmeEvidence: [absent, blank] })).evidence).toEqual([absent, blank]);
    const mixed = ready(input({ instructionPolicy: policy, readmeEvidence: [absent, readme(second)] }));
    expect(mixed.instructions).toBe(exactInstructions);
    expect(mixed.key).not.toBe(ready(input()).key);
    expect(captureRepoGradePreparationInput(input({ readmeEvidence: [absent, readme(second)] })))
      .toEqual({ status: "blocked", reason: "invalid-instruction-evidence" });
    expect(captureRepoGradePreparationInput(input({ instructionPolicy: policy, readmeEvidence: [absent, readme(second, "Different")] })))
      .toEqual({ status: "blocked", reason: "conflicting-instructions" });
    expect(captureRepoGradePreparationInput({
      ...input({ instructionPolicy: policy }),
      readmeEvidence: [absent, { target: second, source: { kind: "configured-fallback", readmeStatus: "truncated" } }],
    })).toEqual({ status: "blocked", reason: "invalid-instruction-evidence" });
  });

  it("blocks contradictory README text with a fixed reason in either order", () => {
    const evidence = [readme(first, "Private instructions A"), readme(second, "Private instructions B")];
    for (const readmeEvidence of [evidence, evidence.toReversed()]) {
      expect(captureRepoGradePreparationInput(input({ readmeEvidence })))
        .toEqual({ status: "blocked", reason: "conflicting-instructions" });
    }
  });

  it("blocks incomplete, empty, duplicated, and over-limit inventories", () => {
    expect(captureRepoGradePreparationInput(input({ inventory: { status: "incomplete" } })))
      .toEqual({ status: "blocked", reason: "incomplete-inventory" });
    expect(captureRepoGradePreparationInput(input({ inventory: { status: "complete", targets: [] } })))
      .toEqual({ status: "blocked", reason: "invalid-inventory" });
    expect(captureRepoGradePreparationInput(input({
      inventory: { status: "complete", targets: [first, { ...first, repo: first.repo.toUpperCase(), sourceRef: "alternate" }] },
    }))).toEqual({ status: "blocked", reason: "duplicate-target" });
    expect(captureRepoGradePreparationInput(input({
      inventory: { status: "complete", targets: Array.from({ length: 4_001 }, () => first) },
    }))).toEqual({ status: "blocked", reason: "invalid-inventory" });
  });

  it("blocks missing or duplicated evidence against the independently captured inventory", () => {
    expect(captureRepoGradePreparationInput(input({ readmeEvidence: [readme(first)] })))
      .toEqual({ status: "blocked", reason: "missing-instruction-evidence" });
    expect(captureRepoGradePreparationInput(input({ readmeEvidence: [readme(first), readme(first), readme(second)] })))
      .toEqual({ status: "blocked", reason: "duplicate-instruction-evidence" });
  });

  it.each([
    { owner: "OtherOrg" },
    { repo: "other-submission" },
    { repo: first.repo.toUpperCase() },
    { sourceRef: "alternate" },
    { sourceCommit: "3".repeat(40) },
  ])("blocks evidence from another pin %j", (different) => {
    expect(captureRepoGradePreparationInput(input({ readmeEvidence: [readme({ ...first, ...different }), readme(second)] })))
      .toEqual({ status: "blocked", reason: "invalid-instruction-evidence" });
  });

  it.each([
    { owner: ".." }, { repo: "x".repeat(101) }, { sourceRef: " main" },
    { sourceRef: "x".repeat(1_025) }, { sourceRef: "feat/../main" }, { sourceCommit: "1234567" },
  ])("rejects invalid inventory pins %j", (badPin) => {
    expect(captureRepoGradePreparationInput(input({ inventory: { status: "complete", targets: [{ ...first, ...badPin }] } })))
      .toEqual({ status: "blocked", reason: "invalid-inventory" });
  });

  it.each(["README.md", "assignments/week 1/README.md", `${configuration.folder}/../README.md`, `${configuration.folder}/source.ts`])(
    "rejects README evidence at %s", (file) => {
      expect(captureRepoGradePreparationInput(input({ readmeEvidence: [readme(first, exactInstructions, file), readme(second)] })))
        .toEqual({ status: "blocked", reason: "invalid-instruction-evidence" });
    },
  );

  it("rejects malformed text, and measures the limit in UTF-8 bytes", () => {
    for (const instructions of ["\ud800", "\u0000", "\u00e9".repeat(64_001)]) {
      expect(captureRepoGradePreparationInput(saved(instructions))).toEqual({ status: "blocked", reason: "missing-instructions" });
      expect(captureRepoGradePreparationInput(input({ readmeEvidence: [readme(first, instructions), readme(second)] })))
        .toEqual({ status: "blocked", reason: "invalid-instruction-evidence" });
    }
    expect(ready(saved("\u00e9".repeat(64_000))).instructionDigest).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects invalid key inputs", () => {
    for (const change of [
      { accountId: "" }, { courseId: "x".repeat(257) }, { configurationFingerprint: "invalid" },
      { promptParserVersion: " " }, { model: "\udfff" }, { folder: "x".repeat(4_097) }, { courseKind: "unknown" },
    ]) {
      expect(captureRepoGradePreparationInput({ ...saved(), configuration: { ...configuration, ...change } }))
        .toEqual({ status: "blocked", reason: "invalid-configuration" });
    }
  });
});
