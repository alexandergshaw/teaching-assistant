/** A committed account transition invalidates every older export, including A -> B -> A. */
export function createDiagnosticExportAccountFence() {
  let account: string | null = null;
  let generation = 0;
  return {
    commit(next: string | null) { account = next; generation++; },
    snapshot() { return { account, generation }; },
    current(snapshot: { account: string | null; generation: number }) {
      return !!snapshot.account && snapshot.account === account && snapshot.generation === generation;
    },
  };
}
