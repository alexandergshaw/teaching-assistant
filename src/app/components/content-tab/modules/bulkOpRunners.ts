// The two generic "run an op over the current selection, then report and
// refresh" helpers every simple bulk action in useBulkItemActions.ts
// delegates to - extracted out of that file (934 of this repo's 1000-line
// ceiling) to keep it under it, a STRUCTURAL split only, no behaviour change.
// This is a real, pre-existing boundary: `runBulkSummary`/`runPerItem` are
// generic execution-and-reporting plumbing (busy flag, note, reload), never
// themselves specific to any one bulk action, while every OTHER function in
// that file (bulkSetDue, bulkPublish, bulkDeleteContent, ...) is a specific
// action definition that calls one of these two. Neither function here
// depends on React - they close only over the three callbacks
// useBulkItemActions.ts already receives as its own hook parameters
// (setOpBusy/setNote/reload), so this is a plain factory, not a "use"-hook.
import type { CanvasModuleItem } from "@/lib/canvas-modules";

export interface BulkOpRunners {
  /** Run a bulk op that returns an {updated, failures} summary; report + refresh. */
  runBulkSummary: (
    fn: () => Promise<{ updated: number; failures: unknown[] } | { error: string }>,
    label: string
  ) => Promise<void>;
  /** Run a per-item op (publish, remove) over the current selection. */
  runPerItem: (
    items: Array<{ item: CanvasModuleItem; moduleId: number }>,
    fn: (item: CanvasModuleItem, moduleId: number) => Promise<{ ok: true } | { error: string }>,
    label: string
  ) => Promise<void>;
}

export function createBulkOpRunners(
  setOpBusy: (b: boolean) => void,
  setNote: (n: { kind: "success" | "error"; text: string } | null) => void,
  reload: () => void
): BulkOpRunners {
  const runBulkSummary = async (
    fn: () => Promise<{ updated: number; failures: unknown[] } | { error: string }>,
    label: string
  ) => {
    setOpBusy(true);
    setNote(null);
    const result = await fn();
    setOpBusy(false);
    if ("error" in result) {
      setNote({ kind: "error", text: result.error });
      return;
    }
    setNote({
      kind: result.failures.length ? "error" : "success",
      text: `${label}: ${result.updated} done${result.failures.length ? `, ${result.failures.length} failed` : ""}.`,
    });
    reload();
  };

  const runPerItem = async (
    items: Array<{ item: CanvasModuleItem; moduleId: number }>,
    fn: (item: CanvasModuleItem, moduleId: number) => Promise<{ ok: true } | { error: string }>,
    label: string
  ) => {
    setOpBusy(true);
    setNote(null);
    let updated = 0;
    let failed = 0;
    for (const { item, moduleId } of items) {
      const result = await fn(item, moduleId);
      if ("error" in result) failed += 1;
      else updated += 1;
    }
    setOpBusy(false);
    setNote({
      kind: failed ? "error" : "success",
      text: `${label}: ${updated} done${failed ? `, ${failed} failed` : ""}.`,
    });
    reload();
  };

  return { runBulkSummary, runPerItem };
}
