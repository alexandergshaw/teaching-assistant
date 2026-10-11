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

export interface LmsFieldIndication {
  readonly disabled: boolean;
  readonly error: boolean;
  readonly helperText: string;
}

export interface LmsFieldIndicationInput {
  readonly globallyDisabled: boolean;
  /** Institution chosen (Course) / course chosen (Assignment); always true for Institution. */
  readonly parentSelected: boolean;
  readonly loading: boolean;
  readonly error: string | null;
  readonly optionCount: number;
  readonly promptBeforeParent: string;
  readonly loadingText: string;
  readonly emptyOkText: string;
}

/** PURE. One field's disabled/helper/error state. Every branch except the last
 * returns disabled, and the last is reached only when optionCount is non-zero,
 * so an openable-but-empty select is unrepresentable. First match wins. */
export function lmsFieldIndication(i: LmsFieldIndicationInput): LmsFieldIndication {
  if (i.globallyDisabled) return { disabled: true, error: false, helperText: "" };
  if (!i.parentSelected) return { disabled: true, error: false, helperText: i.promptBeforeParent };
  if (i.loading) return { disabled: true, error: false, helperText: i.loadingText };
  if (i.error) return { disabled: true, error: true, helperText: i.error };
  if (i.optionCount === 0) return { disabled: true, error: false, helperText: i.emptyOkText };
  return { disabled: false, error: false, helperText: "" };
}

export const LMS_INSTITUTION_COPY = {
  promptBeforeParent: "",
  loadingText: "Loading institutions...",
  emptyOkText: "No connected institutions",
} as const;

export const LMS_COURSE_COPY = {
  promptBeforeParent: "Select an institution first",
  loadingText: "Loading courses...",
  emptyOkText: "No active courses for this institution",
} as const;

export const LMS_ASSIGNMENT_COPY = {
  promptBeforeParent: "Select a course first",
  loadingText: "Loading assignments...",
  emptyOkText: "No assignments for this course",
} as const;

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
