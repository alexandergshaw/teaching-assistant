export type GradeSelection = { repo: string; folder: string };

export function gradeSelectionKey(repo: string, folder: string): string {
  return JSON.stringify([repo, folder]);
}

export function toggleGradeSelection(keys: ReadonlySet<string>, targets: readonly GradeSelection[]): Set<string> {
  const next = new Set(keys);
  const allSelected = targets.length > 0 && targets.every(({ repo, folder }) => next.has(gradeSelectionKey(repo, folder)));
  for (const { repo, folder } of targets) {
    const key = gradeSelectionKey(repo, folder);
    if (allSelected) next.delete(key); else next.add(key);
  }
  return next;
}

/** Group only identical repository sets, so a batch never includes an unselected cell. */
export function groupGradeSelection(targets: readonly GradeSelection[]): { folders: string[]; repos: string[] }[] {
  const byFolder = new Map<string, Set<string>>();
  for (const { repo, folder } of targets) {
    if (!folder) continue;
    const repos = byFolder.get(folder) ?? new Set<string>();
    repos.add(repo);
    byFolder.set(folder, repos);
  }
  const groups = new Map<string, { folders: string[]; repos: string[] }>();
  for (const [folder, values] of byFolder) {
    const repos = [...values].sort();
    const key = JSON.stringify(repos);
    const group = groups.get(key) ?? { folders: [], repos };
    group.folders.push(folder);
    groups.set(key, group);
  }
  return [...groups.values()];
}

export function gradeSelectionRectangle(targets: readonly GradeSelection[]): { folders: string[]; repos: string[] } | null {
  const folders = [...new Set(targets.map(({ folder }) => folder))];
  const repos = [...new Set(targets.map(({ repo }) => repo))];
  const keys = new Set(targets.map(({ repo, folder }) => gradeSelectionKey(repo, folder)));
  return folders.length && repos.length && keys.size === folders.length * repos.length ? { folders, repos } : null;
}
