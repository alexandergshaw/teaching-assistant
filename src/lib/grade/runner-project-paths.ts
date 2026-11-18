import { isSafeGenericExecutionComponent } from "./generic-execution-path";
import { basenameOf, type CodeRunCandidate, type CodeRunSelectionFile } from "../code-run-selection";

/** Restore paths only when each selected basename maps to one safe input. */
export function restoreRunnerProjectPaths(selected: readonly CodeRunSelectionFile[], originals: readonly CodeRunCandidate[]): CodeRunSelectionFile[] | null {
  const seen = new Set<string>();
  return selected.reduce<CodeRunSelectionFile[] | null>((out, file) => {
    if (!out) return null;
    const matches = originals.filter(item => basenameOf(item.name).toLowerCase() === file.name.toLowerCase());
    if (matches.length !== 1) return null;
    const path = matches[0].name.replace(/\\/g, "/");
    const components = path.split("/");
    if (path.length > 200 || components.some(part => !part || part.startsWith("-") || !isSafeGenericExecutionComponent(part)) || seen.has(path.toLowerCase())) return null;
    seen.add(path.toLowerCase()); out.push({ name: path, content: file.content }); return out;
  }, []);
}
