import type { CodeRunResult } from "./code-runner";

/** A successful process exit does not verify behavior that needs stdin. */
export function codeRunDisplay(run: CodeRunResult | null | undefined): { label: string; detail: string } | null {
  if (!run) return null;
  if (run.error) return { label: "Code: runner error", detail: "Runner error" };
  if (run.neededStdin) return { label: "Code: no input available (not scored)", detail: "no input available (not scored)" };
  if (run.ran && run.stdinReadSuspected) return { label: "Code: exited cleanly; input-driven behavior not verified", detail: "yes; input-driven behavior was not verified because no input was supplied" };
  return run.ran ? { label: "Code: ran cleanly", detail: "yes" } : { label: "Code: errors", detail: "no" };
}
