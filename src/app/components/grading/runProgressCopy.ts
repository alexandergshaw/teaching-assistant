/**
 * A39 incremental-fill W5 (docs/a39-fill-waves.md, RES-P-4; docs/a39-
 * incremental-fill-architecture.md section 7.2): the two run-level copy
 * functions, split out of incrementalRunPlan.ts because that file would
 * otherwise land at about 365 lines against its -le 300 bound. Taken only
 * because the bound was actually exceeded - not speculatively - since the two
 * functions here share no input with incrementalRunPlan.ts's other four
 * (IncrementalPhase, GradeResult, GradingRun) beyond the phase type itself.
 * Both PURE and SYNCHRONOUS, same discipline as incrementalRunPlan.ts.
 */
import type { GradingRun } from "@/lib/grade/types";
import type { IncrementalPhase } from "./incrementalRunPlan";

/**
 * All run-level copy in one place (architecture 7.2). Total over the six
 * phases via an exhaustive switch with NO default branch, so a seventh phase
 * added later fails the type check here rather than silently returning null.
 */
export function describeRunProgress(phase: IncrementalPhase, done: number, total: number): string | null {
  switch (phase) {
    case "running":
      return `${done} of ${total} submissions graded.`;
    case "stopping":
      return `Stopping. ${done} of ${total} submissions graded; finishing the ones already in progress.`;
    case "stopped":
      return `Stopped. ${done} of ${total} submissions were graded; the rest were not started.`;
    case "complete":
    case "idle":
    case "refused":
      return null;
  }
}

/**
 * F12 (docs/a39-fill-waves.md W5): total over all six phases, via an
 * exhaustive switch with no default branch. `false` while a run is in
 * progress or just stopped (that state has its OWN sentence, architecture
 * 7.2 - this one must not also claim "nothing was found"); `true` only for
 * `idle`/`complete` with a non-null, zero-result run.
 */
export function shouldShowEmptyState(phase: IncrementalPhase, run: GradingRun | null): boolean {
  if (!run) return false;
  switch (phase) {
    case "idle":
    case "complete":
      return run.results.length === 0;
    case "running":
    case "stopping":
    case "stopped":
    case "refused":
      return false;
  }
}
