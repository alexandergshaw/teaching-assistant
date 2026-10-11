// Pure leaf for the chat composer's "From LMS" picker (LMS-SUBMISSIONS-ZIP-INTAKE).
// The cascade rules and the persisted selection live here, not in the hook or the
// composer .tsx, because no component is rendered by any test: logic left in a
// component cannot be tested at all.

export const LMS_PICKER_STORAGE_KEY = "ta-grading-chat-lms-picker";

export interface LmsPickerSelection {
  readonly institution: string;
  readonly courseId: string;
  readonly assignmentId: string;
}

export const EMPTY_LMS_PICKER_SELECTION: LmsPickerSelection = { institution: "", courseId: "", assignmentId: "" };

/** PURE. Choosing an institution clears the course and the assignment. */
export function selectLmsInstitution(sel: LmsPickerSelection, institution: string): LmsPickerSelection {
  if (institution === sel.institution) return sel;
  return { institution, courseId: "", assignmentId: "" };
}

/** PURE. Choosing a course clears the assignment. */
export function selectLmsCourse(sel: LmsPickerSelection, courseId: string): LmsPickerSelection {
  if (courseId === sel.courseId) return sel;
  return { ...sel, courseId, assignmentId: "" };
}

/** PURE. Choosing an assignment changes only the assignment. */
export function selectLmsAssignment(sel: LmsPickerSelection, assignmentId: string): LmsPickerSelection {
  return { ...sel, assignmentId };
}

/** PURE. The three-field AND. */
export function canSubmitLmsSelection(sel: LmsPickerSelection): boolean {
  return sel.institution !== "" && sel.courseId !== "" && sel.assignmentId !== "";
}

/** PURE. A persisted value that is not among the loaded options shows as empty,
 * so a dropdown never holds a value it has no option for. */
export function valueIfPresent(value: string, options: readonly string[]): string {
  return options.includes(value) ? value : "";
}

/** PURE. Parse a stored selection; anything malformed degrades to empty. */
export function parseLmsPickerSelection(raw: string | null): LmsPickerSelection {
  if (!raw) return EMPTY_LMS_PICKER_SELECTION;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return EMPTY_LMS_PICKER_SELECTION;
    const rec = parsed as Record<string, unknown>;
    const str = (v: unknown): string => (typeof v === "string" ? v : "");
    return { institution: str(rec.institution), courseId: str(rec.courseId), assignmentId: str(rec.assignmentId) };
  } catch {
    return EMPTY_LMS_PICKER_SELECTION;
  }
}

export function loadLmsPickerSelection(): LmsPickerSelection {
  if (typeof window === "undefined") return EMPTY_LMS_PICKER_SELECTION;
  try {
    return parseLmsPickerSelection(localStorage.getItem(LMS_PICKER_STORAGE_KEY));
  } catch {
    return EMPTY_LMS_PICKER_SELECTION;
  }
}

export function persistLmsPickerSelection(sel: LmsPickerSelection): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LMS_PICKER_STORAGE_KEY, JSON.stringify(sel));
  } catch {
    // ignore
  }
}
