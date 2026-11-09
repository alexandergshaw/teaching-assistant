export type PipelineRoleSnapshot = { revision: number; selection: number };

/** A pending role download is valid only for the exact source and library choice. */
export function pipelineRoleDownloadCurrent(snapshot: PipelineRoleSnapshot | null, revision: number, selection: number, pending: boolean, choiceKind: string): boolean {
  return Boolean(snapshot && snapshot.revision === revision && snapshot.selection === selection && !pending && choiceKind === "library");
}
