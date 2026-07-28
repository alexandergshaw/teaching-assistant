// Pure grouping helper for the Automations hub's "Recent runs" table: given
// the flat result of listRecordingFilesForRuns (one query covering many
// runs), sort each run's own files newest-first and group them under their
// run id. No I/O, no ambient state - callers pass in the array they already
// fetched.

import type { RecordingFile } from "./recording-files";

export interface RunArtifactSummary {
  id: string;
  name: string;
  createdAt: string;
}

/** Group recording_files rows by workflowRunId, newest artifact first within
 * each run. A file with no workflowRunId (never produced by a tracked run)
 * is dropped rather than grouped under a synthetic key. */
export function groupArtifactsByRun(files: RecordingFile[]): Map<string, RunArtifactSummary[]> {
  const byRun = new Map<string, RunArtifactSummary[]>();
  const sorted = [...files].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  for (const file of sorted) {
    if (!file.workflowRunId) continue;
    const list = byRun.get(file.workflowRunId) ?? [];
    list.push({ id: file.id, name: file.name, createdAt: file.createdAt });
    byRun.set(file.workflowRunId, list);
  }
  return byRun;
}
