// Pure "reset" builder for RunInputPrompt.tsx's per-runInput state.
//
// DEFECT 4: RunInputPrompt.tsx used to hold this as eleven separate
// useState calls (text, choice, files, rows, checked, busy, error, details,
// search, sort, frozenOrder), all reset together, synchronously, inside a
// useEffect - which this repo's eslint rule forbids (setState reached
// synchronously from an effect). Collapsing them into ONE state object (this
// module's PromptState) turns that eleven-call reset into a single setState
// call, and makes the reset itself unit-testable without a DOM/React harness
// (vitest.config.ts runs tests under a plain "node" environment) - the
// component still performs the reset from inside an effect, using the
// async-IIFE-plus-cancelled-flag idiom (see WorkflowsTab.tsx's own
// `await Promise.resolve()` comment for why that satisfies the lint rule);
// it just calls this function once instead of eleven setters.
import type { TableRowDetail } from "@/lib/workflows/registry";
import type { CodeRunResult } from "@/lib/code-runner";

export interface RunInputDetailEntry {
  open: boolean;
  status: "loading" | "done" | "error";
  detail: TableRowDetail | null;
  error: string;
  run?: { status: "running" | "done"; result: CodeRunResult | null; error?: string };
}

export interface PromptState {
  text: string;
  choice: string;
  files: File[];
  rows: Array<Record<string, string>>;
  checked: boolean[];
  busy: boolean;
  error: string | null;
  details: Record<number, RunInputDetailEntry>;
  search: string;
  sort: { key: string; dir: "asc" | "desc" } | null;
  frozenOrder: number[] | null;
}

/**
 * The minimal shape buildInitialPromptState needs from a requireInput
 * prompt - deliberately narrower than RunInputPrompt.tsx's own RunInputData
 * so this module stays independent of that component file, the same way
 * run-input-table-stats.ts's TableInputShape stays independent of it.
 */
export interface PromptStateSource {
  kind: "text" | "choice" | "upload" | "table" | "workflow";
  initialValue?: string;
  rows?: Array<Record<string, string>>;
}

/**
 * The full reset state for a new (or absent) requireInput prompt. Mirrors
 * RunInputPrompt.tsx's original reset effect exactly: `text` seeds from
 * initialValue only for a "text" prompt (every other kind gets an empty
 * string, clearing out whatever a PREVIOUS prompt of a different kind may
 * have left behind), `rows`/`checked` seed from the prompt's own rows (every
 * row checked by default), everything else clears to its empty value.
 *
 * Called both for the initial useState value (with `null`, before any
 * prompt has arrived) and from the reset effect (with the fresh prompt) -
 * both call sites want the identical defaults, so there is exactly one
 * place this logic is written.
 */
export function buildInitialPromptState(runInput: PromptStateSource | null): PromptState {
  const rows = runInput?.rows ?? [];
  return {
    text: runInput?.kind === "text" ? runInput.initialValue ?? "" : "",
    choice: "",
    files: [],
    rows,
    checked: rows.map(() => true),
    busy: false,
    error: null,
    details: {},
    search: "",
    sort: null,
    frozenOrder: null,
  };
}
