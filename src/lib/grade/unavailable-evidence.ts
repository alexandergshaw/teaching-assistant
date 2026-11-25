import type { CodeRunResult } from "../code-runner";
import type { SubmissionFileInventory } from "./submission-file-inventory";
import { hasSupportedNotebookHeader } from "./notebook-header";

/** A missing runtime dependency or filesystem path in our sandbox does not establish a defect. */
export function runtimeDependencyUnavailable(run: CodeRunResult | null): boolean {
  if (!run || run.ran || run.error) return false;
  const output = `${run.stderr}\n${run.compileOutput ?? ""}`;
  return /(?:ModuleNotFoundError|ImportError):[^\n]*(?:no module named|cannot import name)|(?:error while loading shared libraries|cannot open shared object file)|Cannot find module\s+['"]/i.test(output)
    || (run.language.toLowerCase() === "python" && /(?:^|\n)\s*(?:FileNotFoundError|NotADirectoryError):|(?:^|\n)\s*OSError:\s*Cannot save file into a non-existent directory\b/i.test(output));
}

/** A listed notebook is not absent merely because its bytes could not be read. */
export function hasUnreviewedNotebook(inventories: readonly SubmissionFileInventory[] | undefined, retainedUploads?: SubmissionFileInventory): boolean {
  return !!inventories?.some((inventory) => (inventory !== retainedUploads && !inventory.enumerationComplete)
    || inventory.files.some((file) => /\.ipynb$/i.test(file.path) && file.content !== "read"));
}

/** Hold numeric grades when feedback cites evaluator access or runtime limits. */
export function reportsUnavailableEvidence(text: string): boolean {
  return /(?:\b(?:environment|sandbox|grading platform|evaluation platform|runtime)\b[^\n!?]{0,100}\b(?:missing|lacks?|unavailable|install|dependencies|packages|could not|cannot|unable)|\b(?:missing|unavailable|not installed|not available)\b[^\n!?]{0,100}\b(?:environment|sandbox|runtime|numpy|pandas|matplotlib)|\b(?:could not|cannot|unable to|was not able to|couldn't)\b[^\n!?]{0,80}\b(?:access|open|view|inspect|evaluate|verify|read)\b[^\n!?]{0,60}\b(?:notebook|file|repository|data|visuali[sz]ation)|\b(?:lack of|limited|no)\s+(?:evaluator\s+)?(?:visibility|access)\b[^\n!?]{0,80}\b(?:notebook|file|repository|data)|\b(?:notebook|\.ipynb\b|repository|data|file)\b[^\n!?]{0,100}\b(?:not available|not fully visible|unavailable|not accessible)\b[^\n!?]{0,100}\b(?:inspect|inspection|review|evaluation|assess|visibility|scope)|\bModuleNotFoundError\b)/i.test(text);
}

/** Text extraction does not establish what visual notebook outputs display. */
export function notebookNeedsVisualReview(text: string): boolean {
  try {
    const notebook: unknown = JSON.parse(text);
    if (!hasSupportedNotebookHeader(notebook)) return true;
    return (notebook as { cells: unknown[] }).cells.some((cell) => {
      if (!cell || typeof cell !== "object") return true;
      const record = cell as { outputs?: unknown; attachments?: unknown; source?: unknown; cell_type?: unknown };
      if (!["code", "markdown", "raw"].includes(record.cell_type as string)) return true;
      if (typeof record.source !== "string" && !(Array.isArray(record.source) && record.source.every((part: unknown) => typeof part === "string"))) return true;
      if (record.cell_type === "code" && !Array.isArray(record.outputs)) return true;
      if (record.cell_type !== "code" && record.outputs !== undefined) return true;
      if (record.attachments && (typeof record.attachments !== "object" || Object.keys(record.attachments).length)) return true;
      const source = Array.isArray(record.source) ? record.source.join("") : typeof record.source === "string" ? record.source : "";
      if (record.cell_type !== "code" && /!\[|<\s*\/?[a-z]/i.test(source)) return true;
      const outputs = record.outputs;
      if (outputs === undefined) return false;
      if (!Array.isArray(outputs)) return true;
      return outputs.some((output) => {
        if (!output || typeof output !== "object") return true;
        const record = output as { data?: unknown; output_type?: unknown; text?: unknown; ename?: unknown; evalue?: unknown; traceback?: unknown };
        const data = record.data;
        if (record.output_type === "stream") return !(typeof record.text === "string" || (Array.isArray(record.text) && record.text.every((part: unknown) => typeof part === "string")));
        if (record.output_type === "error") return !(typeof record.ename === "string" && typeof record.evalue === "string" && Array.isArray(record.traceback) && record.traceback.every((part: unknown) => typeof part === "string"));
        if (record.output_type !== "display_data" && record.output_type !== "execute_result") return true;
        if ((record.output_type === "display_data" || record.output_type === "execute_result") && (data === undefined || data === null)) return true;
        return data !== undefined && (data === null || typeof data !== "object" || Array.isArray(data) || Object.keys(data).some((key) => key !== "text/plain"));
      });
    });
  } catch { return true; }
}
