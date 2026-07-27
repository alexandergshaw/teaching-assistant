import type { WorkflowDef } from "@/lib/workflows/types";

export interface WorkflowGroup {
  title: string;
  workflows: WorkflowDef[];
}

/**
 * Group workflows by category and recency, handling search flattening.
 * Returns an array of groups in order: Recent (if non-empty), Custom, then
 * preset categories (Grading, Course setup, Content & lectures, Communication & briefings).
 * When search query is non-empty, returns a flat filtered list (no groups).
 */
export function groupWorkflows(
  workflows: WorkflowDef[],
  recentIds: string[],
  searchQuery: string
): WorkflowGroup[] {
  // If searching, return flat filtered list
  if (searchQuery.trim()) {
    const filtered = workflows.filter(
      (w) =>
        w.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (w.description ?? "").toLowerCase().includes(searchQuery.toLowerCase())
    );
    return filtered.length > 0 ? [{ title: "", workflows: filtered }] : [];
  }

  const groups: WorkflowGroup[] = [];

  // Recent group: last 5 successfully-STARTED workflow ids
  // Skip ids that don't resolve, dedupe, cap at 5
  const recentWorkflows: WorkflowDef[] = [];
  const seenIds = new Set<string>();
  for (const id of recentIds) {
    if (seenIds.has(id)) continue;
    const w = workflows.find((wf) => wf.id === id);
    if (w) {
      recentWorkflows.push(w);
      seenIds.add(id);
      if (recentWorkflows.length >= 5) break;
    }
  }
  if (recentWorkflows.length > 0) {
    groups.push({ title: "Recent", workflows: recentWorkflows });
  }

  // Custom group: workflows without preset flag
  const custom = workflows.filter((w) => !w.preset);
  if (custom.length > 0) {
    groups.push({ title: "Custom", workflows: custom });
  }

  // Preset categories
  const categoryLabels: Record<string, string> = {
    grading: "Grading",
    "course-setup": "Course setup",
    content: "Content & lectures",
    communication: "Communication & briefings",
  };

  const categories = ["grading", "course-setup", "content", "communication"] as const;
  for (const category of categories) {
    const categoryWorkflows = workflows.filter(
      (w) => w.preset && w.category === category
    );
    if (categoryWorkflows.length > 0) {
      groups.push({
        title: categoryLabels[category],
        workflows: categoryWorkflows,
      });
    }
  }

  return groups;
}

// ---------------------------------------------------------------------------
// User-defined folders (Group E)
//
// Folders are a purely local organizing layer over the same workflow list: a
// map of workflow id -> folder name, plus an explicit folder order. They are
// deliberately NOT stored on the workflow itself, because preset workflows are
// code (not rows) and so cannot carry user state.

export interface FolderState {
  /** workflow id -> folder name. An id with no entry is unfiled. */
  assignments: Record<string, string>;
  /** Folder names in display order. Names not listed sort last, alphabetically. */
  order: string[];
}

export function emptyFolderState(): FolderState {
  return { assignments: {}, order: [] };
}

/**
 * Parse a persisted folder state. Anything malformed falls back to empty
 * rather than throwing, and non-string entries are dropped, so a corrupted
 * value degrades to "no folders" instead of breaking the workflow list.
 */
export function parseFolderState(raw: string | null | undefined): FolderState {
  if (!raw) return emptyFolderState();
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return emptyFolderState();
    const obj = parsed as { assignments?: unknown; order?: unknown };

    const assignments: Record<string, string> = {};
    if (obj.assignments && typeof obj.assignments === "object" && !Array.isArray(obj.assignments)) {
      for (const [id, folder] of Object.entries(obj.assignments as Record<string, unknown>)) {
        // A blank folder name would create an unnameable folder, so it is
        // treated as "unfiled" rather than stored.
        if (typeof folder === "string" && folder.trim()) assignments[id] = folder.trim();
      }
    }

    const seen = new Set<string>();
    const order: string[] = [];
    if (Array.isArray(obj.order)) {
      for (const name of obj.order) {
        if (typeof name === "string" && name.trim() && !seen.has(name.trim())) {
          seen.add(name.trim());
          order.push(name.trim());
        }
      }
    }

    return { assignments, order };
  } catch {
    return emptyFolderState();
  }
}

export function serializeFolderState(state: FolderState): string {
  return JSON.stringify(state);
}

/** Every folder name currently in use, in the user's order then the rest A-Z. */
export function folderNames(state: FolderState): string[] {
  const used = new Set(Object.values(state.assignments));
  const ordered = state.order.filter((name) => used.has(name));
  const rest = [...used].filter((name) => !ordered.includes(name)).sort((a, b) => a.localeCompare(b));
  return [...ordered, ...rest];
}

/** Move a folder one place earlier or later. A no-op at either edge. */
export function moveFolder(state: FolderState, name: string, direction: "up" | "down"): FolderState {
  const names = folderNames(state);
  const from = names.indexOf(name);
  if (from === -1) return state;
  const to = direction === "up" ? from - 1 : from + 1;
  if (to < 0 || to >= names.length) return state;
  const next = [...names];
  next.splice(from, 1);
  next.splice(to, 0, name);
  return { ...state, order: next };
}

/** File a workflow into a folder, or unfile it when `folder` is blank. */
export function assignFolder(state: FolderState, workflowId: string, folder: string): FolderState {
  const name = folder.trim();
  const assignments = { ...state.assignments };
  if (name) {
    assignments[workflowId] = name;
  } else {
    delete assignments[workflowId];
  }
  return { ...state, assignments };
}

/**
 * Group workflows with the user's folders applied.
 *
 * Folders come FIRST, in the user's order, because they are the organizing
 * choice the user made explicitly; the built-in Recent/Custom/category groups
 * follow for everything still unfiled. A filed workflow appears in its folder
 * ONLY - it is removed from the built-in groups, so the same workflow is never
 * listed twice. Search still flattens, exactly as it does without folders.
 */
export function groupWorkflowsWithFolders(
  workflows: WorkflowDef[],
  recentIds: string[],
  searchQuery: string,
  folders: FolderState
): WorkflowGroup[] {
  if (searchQuery.trim()) {
    return groupWorkflows(workflows, recentIds, searchQuery);
  }

  const filedIds = new Set(Object.keys(folders.assignments));
  const unfiled = workflows.filter((w) => !filedIds.has(w.id));

  const folderGroups: WorkflowGroup[] = [];
  for (const name of folderNames(folders)) {
    const inFolder = workflows.filter((w) => folders.assignments[w.id] === name);
    if (inFolder.length > 0) folderGroups.push({ title: name, workflows: inFolder });
  }

  return [...folderGroups, ...groupWorkflows(unfiled, recentIds, "")];
}
