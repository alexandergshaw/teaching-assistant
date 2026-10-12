// LLM first-attempt timeout budget (G4 Wave 1). Plain leaf, no imports.
// Dark in Wave 1: the only caller is its own unit test; Wave 2 wires routes.

// G4 W1 oracle value (RULING 77; precedent class-trends-insight/route.ts).
export const TOTAL_BUDGET_MS = 50000;

// G4 W1 oracle value (RULING 77; precedent class-trends-insight/route.ts).
export const MODEL_WAIT_RESERVE_MS = 2000;

// G4 W1 oracle value (precedent routes class-trends-insight and course-intel/ask).
export const MODEL_WAIT_MIN_MS = 8000;

// G4 W1 oracle value (precedent routes class-trends-insight and course-intel/ask).
export const MODEL_WAIT_MAX_MS = 24000;

/**
 * Milliseconds the next model attempt may wait, or the sentinel 0 meaning
 * "do not start a call". `now` is a parameter so the helper is pure.
 *
 * Divergence from the single-call precedent routes: they floor to
 * MODEL_WAIT_MIN_MS when under budget. This path can make several calls
 * against one start time, so flooring would start a doomed 8s call that the
 * platform kills mid-flight with no worded error. Under MIN we return 0 and
 * the caller must branch on it before constructing the call.
 */
export function remainingModelBudgetMs(startedAtMs: number, now: number): number {
  const afterReserve = startedAtMs + TOTAL_BUDGET_MS - now - MODEL_WAIT_RESERVE_MS;
  if (afterReserve < MODEL_WAIT_MIN_MS) return 0;
  return Math.min(MODEL_WAIT_MAX_MS, afterReserve);
}
