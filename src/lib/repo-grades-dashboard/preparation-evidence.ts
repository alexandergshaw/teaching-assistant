import "server-only";

import { captureRepoGradePreparationInput, type RepoGradePreparationInput } from "./preparation-input";
import { readPinnedRepoGradeReadme, type PinnedReadmeEvidence } from "./preparation-readme";
import { PreparationGithubThrottle } from "./preparation-github-throttle";

// Each target may require a commit, tree, and blob request. Keep the full
// cohort within a separate request and time budget, with no retries.
const MAX_README_TARGETS = 100;
const README_CONCURRENCY = 5;
const README_DEADLINE_MS = 40_000;

type TrustedPreparationRequest = Omit<RepoGradePreparationInput, "readmeEvidence">;
type ReadmeRow = RepoGradePreparationInput["readmeEvidence"][number];
type Capture = ReturnType<typeof captureRepoGradePreparationInput>;
type Blocked = Extract<Capture, { status: "blocked" }> | Readonly<{
  status: "blocked";
  reason: "readme-read-failed" | "readme-target-budget-exceeded" | "readme-deadline-exceeded";
}>;
export type RepoGradePreparationEvidenceFailure = Blocked["reason"];

function boundEvidence(
  expected: ReadmeRow["target"], read: PinnedReadmeEvidence, fallbackConfigured: boolean,
): ReadmeRow | Blocked {
  if (read.status === "failure") return { status: "blocked", reason: "readme-read-failed" };
  const { target } = read;
  if (target.owner !== expected.owner || target.repo !== expected.repo
    || target.sourceRef !== expected.sourceRef || target.sourceCommit !== expected.sourceCommit) {
    return { status: "blocked", reason: "invalid-instruction-evidence" };
  }
  if (read.status === "present") {
    return { target, source: { kind: "pinned-readme", path: read.path, instructions: read.text } };
  }
  if (!fallbackConfigured) return { status: "blocked", reason: "missing-instruction-evidence" };
  if (read.status === "absent") {
    return { target, source: { kind: "configured-fallback", readmeStatus: "absent" } };
  }
  if (read.status === "blank") {
    return { target, source: { kind: "configured-fallback", readmeStatus: "blank", path: read.path } };
  }
  return { status: "blocked", reason: "invalid-instruction-evidence" };
}

/**
 * Internal only. The caller must establish course ownership, resolve its saved
 * configuration and instruction policy, and supply the complete cohort pinned
 * by authorized server-side discovery for that exact folder. Any unresolved
 * eligible source or incomplete enumeration must yield an incomplete inventory.
 * Shape checks cannot prove ownership or detect omitted targets in a claimed
 * complete inventory. Never forward browser-supplied inventory or policy here.
 * Keep ready captures, including instructions and target evidence, server-side.
 */
export async function composeRepoGradePreparationEvidence(input: TrustedPreparationRequest): Promise<Capture | Blocked> {
  if (Object.hasOwn(input, "readmeEvidence")) return { status: "blocked", reason: "invalid-instruction-evidence" };
  // Capture checks configuration, pins, duplicate targets, and policy before
  // checking for README evidence. Only the missing-evidence result permits reads.
  const preflight = captureRepoGradePreparationInput({ ...input, readmeEvidence: [] });
  if (preflight.status === "ready" || preflight.reason !== "missing-instruction-evidence"
    || input.inventory.status !== "complete") return preflight;
  if (input.inventory.targets.length > MAX_README_TARGETS) {
    return { status: "blocked", reason: "readme-target-budget-exceeded" };
  }

  const configuration = { ...input.configuration };
  const instructionPolicy = { ...input.instructionPolicy };
  const targets = input.inventory.targets.map((target) => ({ ...target }));
  const fallback = instructionPolicy.kind === "readme-with-configured-fallback"
    ? instructionPolicy.fallbackInstructions : undefined;
  const evidence: ReadmeRow[] = [];
  const controller = new AbortController();
  const blocked = Promise.withResolvers<Blocked>();
  const deadlineAt = performance.now() + README_DEADLINE_MS;
  let nextTarget = 0;
  let instructions: string | undefined;

  function stop(reason: Blocked["reason"]) {
    if (controller.signal.aborted) return;
    controller.abort();
    blocked.resolve({ status: "blocked", reason });
  }

  function active() {
    if (performance.now() >= deadlineAt) stop("readme-deadline-exceeded");
    return !controller.signal.aborted;
  }

  async function collect() {
    while (active() && nextTarget < targets.length) {
      const target = targets[nextTarget++];
      const read = await readPinnedRepoGradeReadme(target, configuration.folder, controller.signal, configuration.accountId);
      if (!active()) return;
      const row = boundEvidence(target, read, fallback !== undefined);
      if ("status" in row) return stop(row.reason);
      const exactInstructions = row.source.kind === "pinned-readme" ? row.source.instructions : fallback;
      instructions ??= exactInstructions;
      if (instructions !== exactInstructions) return stop("conflicting-instructions");
      evidence.push(row);
    }
  }

  const timer = setTimeout(() => stop("readme-deadline-exceeded"), README_DEADLINE_MS);
  try {
    const collected = Promise.all(Array.from({ length: Math.min(targets.length, README_CONCURRENCY) }, collect))
      .then<Capture | Blocked, Blocked>(() => {
        if (!active()) return blocked.promise;
        const captured = captureRepoGradePreparationInput({
          configuration, instructionPolicy, inventory: { status: "complete", targets }, readmeEvidence: evidence,
        } satisfies RepoGradePreparationInput);
        return active() ? captured : blocked.promise;
      }, (error: unknown) => {
        if (error instanceof PreparationGithubThrottle && !controller.signal.aborted) {
          controller.abort();
          throw error;
        }
        stop("readme-read-failed");
        return blocked.promise;
      });
    return await Promise.race([collected, blocked.promise]);
  } finally {
    clearTimeout(timer);
  }
}
