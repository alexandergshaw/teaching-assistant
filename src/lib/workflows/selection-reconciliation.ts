// Pure decision logic for WorkflowsTab's selection-reconciliation effect.
//
// The selected workflow id can legitimately be ahead of the `workflows` list
// for a while: a deep link (Automations/Drafts/Files -> ta-workflows-selected)
// targets a custom workflow def that lives in Supabase and arrives async, so
// it is briefly absent from `workflows` (which starts out preset-only). The
// component must NOT treat that absence as "this id doesn't exist" and fall
// back - it should wait, then reload the per-workflow state (values,
// disabled-steps overlay) once the id resolves. Only once the custom-def load
// has finished (successfully) and the id still does not resolve should it
// fall back to the first workflow.
//
// `loadedForId` is the id that the component's `values`/`disabledSteps` state
// currently reflects (tracked via a ref, updated by both ordinary selection
// clicks and this reconciliation); comparing against it avoids redundant
// reloads once everything is in sync.
export type SelectionReconciliationAction =
  | { type: "none" }
  | { type: "resolve"; id: string }
  | { type: "fallback"; id: string };

export function resolveSelectionReconciliation(
  selectedId: string,
  loadedForId: string | null,
  workflows: readonly { id: string }[],
  customLoaded: boolean,
  customLoadFailed: boolean
): SelectionReconciliationAction {
  const isResolved = workflows.some((w) => w.id === selectedId);

  if (isResolved) {
    if (selectedId === loadedForId) return { type: "none" };
    // The selected id now resolves to a workflow (e.g. the async custom-def
    // load just landed it) but the component's form state was loaded for a
    // different id (typically the mount-time fallback) - reload it.
    return { type: "resolve", id: selectedId };
  }

  // Unresolved: wait for the custom load to settle before judging the id
  // stale. A failed load must not strand the selection on a fallback either -
  // there is no way to know whether the id is really gone.
  if (!customLoaded || customLoadFailed) return { type: "none" };

  const fallbackId = workflows[0]?.id;
  if (!fallbackId) return { type: "none" };
  return { type: "fallback", id: fallbackId };
}
