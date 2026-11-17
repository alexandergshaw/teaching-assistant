import type { CodeRunResult } from "../code-runner";
import type { SubmissionFileInventory } from "./submission-file-inventory";

/** A missing runtime dependency in our sandbox does not establish a defect. */
export function runtimeDependencyUnavailable(run: CodeRunResult | null): boolean {
  if (!run || run.ran || run.error) return false;
  return /(?:ModuleNotFoundError|ImportError):[^\n]*(?:no module named|cannot import name)|(?:error while loading shared libraries|cannot open shared object file)|Cannot find module\s+['"]/i.test(`${run.stderr}\n${run.compileOutput ?? ""}`);
}

/** A listed notebook is not absent merely because its bytes could not be read. */
export function hasUnreviewedNotebook(inventories: readonly SubmissionFileInventory[] | undefined): boolean {
  return !!inventories?.some((inventory) => !inventory.enumerationComplete || inventory.files.some((file) => /\.ipynb$/i.test(file.path) && file.content !== "read"));
}

/** Hold numeric grades when feedback cites evaluator access or runtime limits. */
export function reportsUnavailableEvidence(text: string): boolean {
  return /(?:\b(?:environment|sandbox|grading platform|evaluation platform|runtime)\b[^\n!?]{0,100}\b(?:missing|lacks?|unavailable|install|dependencies|packages|could not|cannot|unable)|\b(?:missing|unavailable|not installed|not available)\b[^\n!?]{0,100}\b(?:environment|sandbox|runtime|numpy|pandas|matplotlib)|\b(?:could not|cannot|unable to|was not able to|couldn't)\b[^\n!?]{0,80}\b(?:access|open|view|inspect|evaluate|verify|read)\b[^\n!?]{0,60}\b(?:notebook|file|repository|data|visuali[sz]ation)|\b(?:lack of|limited|no)\s+(?:evaluator\s+)?(?:visibility|access)\b[^\n!?]{0,80}\b(?:notebook|file|repository|data)|\b(?:notebook|\.ipynb\b|repository|data|file)\b[^\n!?]{0,100}\b(?:not available|not fully visible|unavailable|not accessible)\b[^\n!?]{0,100}\b(?:inspect|inspection|review|evaluation|assess|visibility|scope)|\bModuleNotFoundError\b)/i.test(text);
}

/** Text extraction does not establish what visual notebook outputs display. */
export function notebookNeedsVisualReview(text: string): boolean {
  try {
    const notebook: unknown = JSON.parse(text);
    if (!notebook || typeof notebook !== "object" || !Array.isArray((notebook as { cells?: unknown }).cells)) return true;
    return (notebook as { cells: unknown[] }).cells.some((cell) => {
      if (!cell || typeof cell !== "object") return true;
      const outputs = (cell as { outputs?: unknown }).outputs;
      if (outputs === undefined) return false;
      if (!Array.isArray(outputs)) return true;
      return outputs.some((output) => {
        if (!output || typeof output !== "object") return true;
        const data = (output as { data?: unknown }).data;
        return !!data && (typeof data !== "object" || Object.keys(data).some((key) => /^(?:image\/|text\/html$|application\/vnd\.)/i.test(key)));
      });
    });
  } catch { return true; }
}
