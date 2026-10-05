// Pure model for the One-Off Tasks tab: the task type, title validation,
// grouping by college and filtering. A plain .ts leaf (not a .tsx) so every
// rule here is testable under vitest, which renders no component.

export const TITLE_MAX = 200;
export const NOTES_MAX = 2000;

export interface OneOffTask {
  id: string;
  title: string;
  /** An institution acronym from the registry, or null = Unassigned. */
  college: string | null;
  done: boolean;
  notes: string;
  /** ISO yyyy-mm-dd or null. */
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export type NewTaskInput = {
  title: string;
  college: string | null;
  notes?: string;
  dueDate?: string | null;
};

export type TaskPatch = Partial<Omit<OneOffTask, "id" | "createdAt" | "updatedAt">>;

export type ValidateTaskTitleResult =
  | { ok: true; title: string }
  | { ok: false; reason: "blank" | "too-long" };

/** Trim, reject blank, reject over-cap. Titles keep their case. */
export function validateTaskTitle(raw: string): ValidateTaskTitleResult {
  const title = raw.trim();
  if (!title) return { ok: false, reason: "blank" };
  if (title.length > TITLE_MAX) return { ok: false, reason: "too-long" };
  return { ok: true, title };
}

export type ValidateNotesResult =
  | { ok: true; notes: string }
  | { ok: false; reason: "too-long" };

/** Empty or absent notes are valid and normalise to "". Whitespace is kept. */
export function validateNotes(raw: string | undefined): ValidateNotesResult {
  const notes = raw ?? "";
  if (notes.length > NOTES_MAX) return { ok: false, reason: "too-long" };
  return { ok: true, notes };
}

export interface CollegeGroup {
  college: string | null;
  tasks: OneOffTask[];
}

/**
 * Registered institutions first (registry order, always present even when
 * empty), then Unassigned (only when non-empty), then any college that is on a
 * task but no longer registered (first-appearance order, so it never vanishes).
 */
export function groupTasksByCollege(
  tasks: OneOffTask[],
  institutions: string[]
): CollegeGroup[] {
  const groups: CollegeGroup[] = institutions.map((college) => ({
    college,
    tasks: tasks.filter((t) => t.college === college),
  }));
  const unassigned = tasks.filter((t) => t.college === null);
  if (unassigned.length > 0) groups.push({ college: null, tasks: unassigned });
  const registered = new Set(institutions);
  const orphanOrder: string[] = [];
  for (const t of tasks) {
    if (t.college !== null && !registered.has(t.college) && !orphanOrder.includes(t.college)) {
      orphanOrder.push(t.college);
    }
  }
  for (const college of orphanOrder) {
    groups.push({ college, tasks: tasks.filter((t) => t.college === college) });
  }
  return groups;
}

export interface TaskFilter {
  /** undefined = all colleges; null = Unassigned only; a string = that college. */
  college?: string | null;
  /** undefined or "all" = both. */
  status?: "all" | "open" | "done";
}

export function filterTasks(tasks: OneOffTask[], filter: TaskFilter): OneOffTask[] {
  return tasks.filter((t) => {
    if (filter.college !== undefined && t.college !== filter.college) return false;
    if (filter.status === "open" && t.done) return false;
    if (filter.status === "done" && !t.done) return false;
    return true;
  });
}
