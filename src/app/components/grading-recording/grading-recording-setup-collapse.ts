// Wave 1 of the recording-grader UX overhaul
// (docs/grading-recording-ux-overhaul-scope.md, Move A): the one-time setup
// fieldsets (Capture settings, Deadline and tool, Grading rubric, Context)
// sit above the grading table, so after a capture the instructor had to scroll
// past all of them to reach the rows. This leaf decides whether the Setup
// region is collapsed, and owns its persisted open/closed override.
//
// Pure decision + a tiny storage pair, in a .ts leaf so vitest can reach it
// (no component is rendered by any test here).

// Bound const, scanned by grading-rows.test.ts's exact-set persisted-key canary.
const STORAGE_KEY_SETUP_OPEN = "ta-rec-grade-setup-open";

export interface SetupCollapseInput {
  capturing: boolean;
  totalCount: number;
  rubricPresent: boolean;
}

/**
 * True when the Setup region should be collapsed by default: a live capture
 * collapses it, and so do captured rows - EXCEPT rows with no rubric yet, where
 * the "Add rubric" control lives inside Setup and is the real next step, so
 * hiding it would strand the instructor.
 */
export function isSetupCollapsed({ capturing, totalCount, rubricPresent }: SetupCollapseInput): boolean {
  if (capturing) return true;
  return totalCount > 0 && rubricPresent;
}

/**
 * The open state the details element renders: the instructor's own saved
 * choice (`userOpen`, null when they have never toggled it) wins over the
 * automatic decision.
 */
export function resolveSetupOpen(input: SetupCollapseInput, userOpen: boolean | null): boolean {
  return userOpen ?? !isSetupCollapsed(input);
}

/** Reads the saved override; null when absent, unreadable, or not "1"/"0". */
export function loadSetupOpen(): boolean | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SETUP_OPEN);
    return raw === "1" ? true : raw === "0" ? false : null;
  } catch {
    return null;
  }
}

/** Best-effort write of the instructor's explicit open/closed choice. */
export function saveSetupOpen(open: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY_SETUP_OPEN, open ? "1" : "0");
  } catch {
    // Low-stakes control: losing persistence does not affect the session.
  }
}
