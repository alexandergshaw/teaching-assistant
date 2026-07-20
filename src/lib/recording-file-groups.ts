// Group recording files by workflow run, with grouping logic abstracted for
// testing and UI reuse. Groups share a workflow_run_id and are ordered
// newest-first by the most recent file in each group.

import type { RecordingFile } from "./recording-files";

export interface FileGroup {
  key: string;
  workflowId: string | null;
  workflowName: string | null;
  newest: string;
  files: RecordingFile[];
}

export interface FileGrouping {
  groups: FileGroup[];
  ungrouped: RecordingFile[];
}

export function groupRecordingFiles(files: RecordingFile[]): FileGrouping {
  const grouped: Map<string, RecordingFile[]> = new Map();
  const ungrouped: RecordingFile[] = [];

  for (const file of files) {
    if (file.workflowRunId) {
      if (!grouped.has(file.workflowRunId)) {
        grouped.set(file.workflowRunId, []);
      }
      grouped.get(file.workflowRunId)!.push(file);
    } else {
      ungrouped.push(file);
    }
  }

  const groups: FileGroup[] = Array.from(grouped.entries()).map(([runId, groupFiles]) => {
    const newest = groupFiles.reduce((max, f) =>
      new Date(f.createdAt) > new Date(max.createdAt) ? f : max
    ).createdAt;

    return {
      key: runId,
      workflowId: groupFiles[0]?.workflowId ?? null,
      workflowName: groupFiles[0]?.workflowName ?? null,
      newest,
      files: groupFiles,
    };
  });

  groups.sort((a, b) => new Date(b.newest).getTime() - new Date(a.newest).getTime());

  return { groups, ungrouped };
}
