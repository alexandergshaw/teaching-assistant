"use client";

import { useCallback, useEffect, useRef } from "react";
import { recordWholeRunSettled, type WholeRunSettledState } from "./gradingDiagnosticLog";

/** Session Diagnostic Log timing for the main tab's whole-run grade.
 *
 * The grade is a React form action (useActionState), not an awaited promise,
 * so it is timed from the dispatch to the moment `pending` clears. The
 * returned `markStart` is called from the single whole-run dispatch door
 * (GradingTab's submitWholeRun) immediately before the form action fires; the
 * effect records once on the settle edge. Setting a ref is not React state, so
 * this adds no render. The DECISION is the pure leaf in gradingDiagnosticLog.ts. */
export function useWholeRunDiagnostic(pending: boolean, state: WholeRunSettledState): () => void {
  const startRef = useRef<number | null>(null);
  const markStart = useCallback(() => {
    startRef.current = performance.now();
  }, []);
  useEffect(() => {
    if (pending || startRef.current === null) return;
    recordWholeRunSettled({
      startedAtMs: startRef.current,
      settledAtMs: performance.now(),
      state,
      at: new Date().toISOString(),
    });
    startRef.current = null;
  }, [pending, state]);
  return markStart;
}
