import type { InstitutionDirectoryState } from "@/lib/institution-directory";
import { institutionDirectoryDiagnosticReason, recordInstitutionDirectoryDiagnostic } from "@/lib/institution-directory-diagnostics";

export const DIRECTORY_LOAD_TIMEOUT_MS = 12_000;
type Result = { ok: true; state: InstitutionDirectoryState } | { ok: false; code: string };
export type DirectorySnapshot = { data: InstitutionDirectoryState | null; loading: boolean; error: string | null };
const initialSnapshot: DirectorySnapshot = { data: null, loading: false, error: null };

/** Browser-memory only. A generation retires both late successes and failures. */
export function createDirectoryLoader(request: () => Promise<Result>) {
  let snapshot = initialSnapshot;
  let generation = 0;
  let pending: Promise<void> | null = null;
  let retire: (() => void) | null = null;
  const listeners = new Set<() => void>();
  const publish = (next: DirectorySnapshot) => { snapshot = next; listeners.forEach((listener) => listener()); };
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    clear() {
      generation += 1;
      retire?.();
      retire = null;
      pending = null;
      publish(initialSnapshot);
    },
    load(force = false): Promise<void> {
      if (force && pending) {
        generation += 1;
        retire?.();
        pending = null;
      }
      if (pending) return pending;
      const id = ++generation;
      const started = performance.now();
      publish({ ...snapshot, loading: true, error: null });
      pending = new Promise<void>((resolve) => {
        let settled = false;
        const finish = (result: Result | null, timedOut = false) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (id !== generation) { resolve(); return; }
          pending = null;
          retire = null;
          const metrics = { durationMs: performance.now() - started };
          if (result?.ok) {
            publish({ data: result.state, loading: false, error: null });
            recordInstitutionDirectoryDiagnostic("list", "success", "directory", undefined, { ...metrics, institutionCount: result.state.records.length, columnCount: result.state.columns.length });
          } else {
            const code = result?.code;
            const data = code === "unauthenticated" ? null : snapshot.data;
            const error = code === "unauthenticated" ? "Sign in to view and edit your institutions."
              : timedOut ? "Loading institutions took too long. Try again."
                : data ? "Could not refresh institutions. Your last saved rows are still shown; try again." : "Could not load institutions. Try again.";
            publish({ data, loading: false, error });
            recordInstitutionDirectoryDiagnostic("list", "failure", "directory", timedOut ? "timeout" : code ? institutionDirectoryDiagnosticReason(code) : "unavailable", metrics);
          }
          resolve();
        };
        const timer = setTimeout(() => finish(null, true), DIRECTORY_LOAD_TIMEOUT_MS);
        retire = () => { settled = true; clearTimeout(timer); resolve(); };
        Promise.resolve().then(request).then((result) => finish(result), () => finish(null));
      });
      return pending;
    },
  };
}

type Loader = ReturnType<typeof createDirectoryLoader>;
let account: string | null = null;
let loader: Loader | null = null;
export function selectDirectoryAccount(nextAccount: string | null): void {
  if (nextAccount === account) return;
  loader?.clear();
  loader = null;
  account = nextAccount;
}
export function directoryLoaderForAccount(userId: string, request: () => Promise<Result>): Loader {
  selectDirectoryAccount(userId);
  loader ??= createDirectoryLoader(request);
  return loader;
}
