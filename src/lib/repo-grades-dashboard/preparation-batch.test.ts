import { describe, expect, it, vi } from "vitest";
import { collectPreparationEvidenceBatch } from "./preparation-batch";
import { captureRepoGradePreparationInput } from "./preparation-input";
import type { composeRepoGradePreparationEvidence } from "./preparation-evidence";

type Request = Parameters<typeof composeRepoGradePreparationEvidence>[0];
const targets = Array.from({ length: 101 }, (_, i) => ({
  owner: "School", repo: `student-${i}`, sourceRef: "main", sourceCommit: "a".repeat(40),
}));
const input: Request = {
  configuration: { accountId: "account", courseId: "course", folder: "Week1", configurationFingerprint: "b".repeat(64),
    provider: "embedded", model: "model", graderVersion: "v1", promptParserVersion: "v1", courseKind: "coding" },
  instructionPolicy: { kind: "readme" }, inventory: { status: "complete", targets },
};

function collector(instructions = "Instructions") {
  return vi.fn(async (request: Request) => {
    if (request.inventory.status !== "complete") throw new Error("unexpected incomplete inventory");
    return captureRepoGradePreparationInput({ ...request, readmeEvidence: request.inventory.targets.map((target) => ({
      target, source: { kind: "pinned-readme", path: "Week1/README.md", instructions },
    })) });
  });
}

describe("bounded preparation evidence batches", () => {
  it("collects all 101 targets without rereading an accepted prefix", async () => {
    const collect = collector();
    let result = await collectPreparationEvidenceBatch(input, null, collect);
    while (result.status === "continue") result = await collectPreparationEvidenceBatch(input, result.progress, collect);
    expect(result.status).toBe("ready");
    if (result.status === "ready") expect(result.evidence).toHaveLength(101);
    expect(collect).toHaveBeenCalledTimes(5);
    expect(collect.mock.calls.map(([request]) => request.inventory.status === "complete" && request.inventory.targets.length))
      .toEqual([25, 25, 25, 25, 1]);
  });

  it("rejects progress from a different basis or mismatched target pins", async () => {
    const collect = collector();
    const first = await collectPreparationEvidenceBatch(input, null, collect);
    if (first.status !== "continue") throw new Error("expected progress");
    const changed = { ...input, configuration: { ...input.configuration, accountId: "other" } };
    expect(await collectPreparationEvidenceBatch(changed, first.progress, collect)).toMatchObject({ status: "blocked" });
    const rows = first.progress.rows.map((row, i) => i ? row : { ...row, target: { ...row.target, sourceCommit: "c".repeat(40) } });
    expect(await collectPreparationEvidenceBatch(input, { ...first.progress, rows }, collect)).toMatchObject({ status: "blocked" });
  });

  it("refuses conflicting instructions before the cohort can become ready", async () => {
    const first = await collectPreparationEvidenceBatch(input, null, collector());
    if (first.status !== "continue") throw new Error("expected progress");
    expect(await collectPreparationEvidenceBatch(input, first.progress, collector("Different")))
      .toMatchObject({ status: "blocked", reason: "conflicting-instructions", example: { kind: "conflict" } });
  });

  it("does not label a fallback-versus-README conflict as two conflicting READMEs", async () => {
    const withFallback: Request = { ...input, instructionPolicy: { kind: "readme-with-configured-fallback", fallbackInstructions: "Fallback" } };
    const first = await collectPreparationEvidenceBatch(withFallback, null, async (request) => {
      if (request.inventory.status !== "complete") throw new Error("unexpected inventory");
      return captureRepoGradePreparationInput({ ...request, readmeEvidence: request.inventory.targets.map((target) => ({
        target, source: { kind: "configured-fallback", readmeStatus: "absent" },
      })) });
    });
    if (first.status !== "continue") throw new Error("expected progress");
    const result = await collectPreparationEvidenceBatch(withFallback, first.progress, collector("Different"));
    expect(result).toMatchObject({ status: "blocked", reason: "conflicting-instructions" });
    expect(result).not.toHaveProperty("example");
  });
});
