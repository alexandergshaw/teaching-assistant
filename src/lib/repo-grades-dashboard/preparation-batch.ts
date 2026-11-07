import "server-only";

import { createHash } from "node:crypto";
import { captureRepoGradePreparationInput, type RepoGradePreparationInput, type RepoGradeTargetEvidence } from "./preparation-input";
import { composeRepoGradePreparationEvidence, isSafeReadmeExampleRepo } from "./preparation-evidence";

type Request = Parameters<typeof composeRepoGradePreparationEvidence>[0];
export type RepoGradeEvidenceBatchProgress = Readonly<{ version: 1; basis: string; key: string; instructions: string; rows: readonly RepoGradeTargetEvidence[] }>;
type Progress = RepoGradeEvidenceBatchProgress;
type Result = Awaited<ReturnType<typeof composeRepoGradePreparationEvidence>> | Readonly<{ status: "continue"; progress: Progress }>;

const BATCH_SIZE = 25;
const MAX_PROGRESS_BYTES = 512 * 1024;
const invalid = { status: "blocked", reason: "invalid-instruction-evidence" } as const;

function rowsForCapture(rows: readonly RepoGradeTargetEvidence[], instructions: string): RepoGradePreparationInput["readmeEvidence"] {
  return rows.map(({ target, source }) => ({
    target,
    source: source.kind === "pinned-readme" ? { ...source, instructions } : source,
  })) as RepoGradePreparationInput["readmeEvidence"];
}

/** Collect one bounded prefix. The caller must persist progress under a live,
 * account-scoped run lease and requeue the target before invoking another batch.
 * This helper does not itself authorize persisted data or schedule continuation. */
export async function collectPreparationEvidenceBatch(
  input: Request, prior: Progress | null,
  collect: typeof composeRepoGradePreparationEvidence = composeRepoGradePreparationEvidence,
): Promise<Result> {
  if (Object.hasOwn(input, "readmeEvidence") || input.inventory.status !== "complete" || input.instructionPolicy.kind === "saved") return invalid;
  const preflight = captureRepoGradePreparationInput({ ...input, readmeEvidence: [] });
  if (preflight.status !== "blocked" || preflight.reason !== "missing-instruction-evidence") return preflight;
  const targets = input.inventory.targets;
  const basis = createHash("sha256").update(JSON.stringify(["repo-grade-evidence-batch-v1", input])).digest("hex");
  let rows: readonly RepoGradeTargetEvidence[] = [];
  let instructions: string | undefined;
  let previousKey: string | undefined;
  if (prior !== null) {
    if (prior.version !== 1 || prior.basis !== basis || !Array.isArray(prior.rows) || prior.rows.length === 0
      || prior.rows.length >= targets.length || typeof prior.instructions !== "string" || typeof prior.key !== "string"
      || Buffer.byteLength(JSON.stringify(prior), "utf8") > MAX_PROGRESS_BYTES) return invalid;
    const prefix = targets.slice(0, prior.rows.length);
    const checked = captureRepoGradePreparationInput({ ...input, inventory: { status: "complete", targets: prefix },
      readmeEvidence: rowsForCapture(prior.rows, prior.instructions) });
    if (checked.status !== "ready" || checked.key !== prior.key || checked.instructions !== prior.instructions) return invalid;
    rows = checked.evidence;
    instructions = checked.instructions;
    previousKey = checked.key;
  }
  const next = targets.slice(rows.length, rows.length + BATCH_SIZE);
  const captured = await collect({ ...input, inventory: { status: "complete", targets: next } });
  if (captured.status !== "ready") return captured;
  if (previousKey !== undefined && (captured.key !== previousKey || captured.instructions !== instructions)) {
    const first = rows[0]?.target;
    const other = captured.evidence[0]?.target;
    return first && other && rows[0]?.source.kind === "pinned-readme"
      && captured.evidence[0]?.source.kind === "pinned-readme" && isSafeReadmeExampleRepo(`${first.owner}/${first.repo}`)
      && isSafeReadmeExampleRepo(`${other.owner}/${other.repo}`) ? { status: "blocked", reason: "conflicting-instructions", example: {
      kind: "conflict", repo: `${other.owner}/${other.repo}`, comparedRepo: `${first.owner}/${first.repo}`,
    } } : { status: "blocked", reason: "conflicting-instructions" };
  }
  const combined = [...rows, ...captured.evidence];
  const complete = captureRepoGradePreparationInput({ ...input,
    inventory: { status: "complete", targets: targets.slice(0, combined.length) },
    readmeEvidence: rowsForCapture(combined, captured.instructions) });
  if (complete.status !== "ready") return complete;
  if (combined.length === targets.length) return complete;
  const progress: Progress = { version: 1, basis, key: complete.key, instructions: complete.instructions, rows: complete.evidence };
  if (Buffer.byteLength(JSON.stringify(progress), "utf8") > MAX_PROGRESS_BYTES) return invalid;
  return { status: "continue", progress };
}
