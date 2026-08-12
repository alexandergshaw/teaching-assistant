"use client";

// localStorage persistence for the controls added to GithubGradingPanel.tsx
// by the "common grading folder + pull from an LMS assignment" feature (AC
// C1, docs/github-grading-folder-and-assignment-acceptance-criteria.md).
// Mirrors repoGradesUiState.ts's module shape: `ta-`-prefixed keys, a
// load.../persist... pair, a typeof window guard so this module is safe to
// import from anywhere, and a try/catch around every localStorage touch so a
// quota error or private-browsing restriction loses persistence for one
// change rather than crashing the tab.
//
// Every field here is a plain string (or a small closed enum encoded as a
// string), matching repoGradesUiState.ts's OWN top-level RepoGradesUiState
// shape (courseId/orgPrefix/instructions/rubric are all read with a bare
// `?? ""`, no JSON) rather than its ASSIGNMENT_MAP_KEY sibling (a genuinely
// structured per-course map, which is why THAT key alone is JSON-encoded).
// Nothing persisted here is structured the way that map is, so nothing here
// needs JSON.parse either - each field's own "was this a valid value"
// check (isSource below) is what stands in for that map's try/catch, so a
// stray or hand-edited localStorage value can never throw during load, only
// fall back to its default.
//
// Persisted at the explicit mutator that computes a new value, never via a
// blanket `useEffect(() => persist(x), [x])` - see repo-grades/index.tsx:
// 115-147 for the shipped bug that shape produces: `x` starts at its
// useState default, so such an effect fires on the very first commit with
// that default and overwrites good storage before an async (or, here,
// synchronous-but-later-in-the-function) restore ever reads it back.
// GithubGradingPanel.tsx calls persistGithubGradingUiState right next to
// every setState call that changes one of these fields, exactly mirroring
// repoGradesUiState.ts's own callers (RepoGradesTab's toggleSelected,
// handleAssignmentChange, etc.).
//
// GithubGradingPanel.tsx already persists its repo queue separately under
// its own local QUEUE_KEY constant - this module covers only the controls
// this feature adds, not the queue.

const FOLDER_KEY = "ta-github-grading-folder";
const COURSE_KEY = "ta-github-grading-course";
const SOURCE_KEY = "ta-github-grading-source";
const LIVE_ASSIGNMENT_KEY = "ta-github-grading-live-assignment";
const EXPORT_ASSIGNMENT_KEY = "ta-github-grading-export-assignment";
const EXPORT_RUBRIC_KEY = "ta-github-grading-export-rubric";

/** Which of a course's two Course Content sources (AC B1) the LMS-pull
 * controls are currently reading from. Mirrors the "live" | "export"
 * vocabulary content-tab/content-selection.ts's ContentSelection already
 * uses, rather than inventing a second one. */
export type GithubGradingPullSource = "live" | "export";

export interface GithubGradingUiState {
  /** The common folder scoping the whole queue's grading run (AC A2). Blank
   * means "whole repo" - matches normalizeGradingFolder's own convention
   * (src/lib/github-grading-folder.ts), so this value can be handed to
   * gradeReposAction/generateRubricFromRepoAction unchanged. */
  gradingFolder: string;
  /** The course-hub row id (Course.id, src/lib/supabase/courses.ts) chosen
   * as the source for pulling instructions/rubric (AC B1). Deliberately a
   * course-hub id, not a Canvas course id or URL: it is the one identifier
   * that resolves BOTH sources (Course.canvasUrl + Course.institution for
   * live, Course.id for readExportCourseContentById for export). */
  courseId: string;
  /** Which source the picker is currently showing (AC B1). */
  source: GithubGradingPullSource;
  /** The selected live Canvas assignment's id (CanvasAssignmentBrief.id, AC B2). */
  liveAssignmentId: string;
  /** The selected export assignment's key (ExportAssignmentOption.key, AC B4). */
  exportAssignmentKey: string;
  /** The selected export rubric's title (CartridgeRubric.title, AC B5) - a
   * course-level pick, deliberately independent of exportAssignmentKey
   * above, since a cartridge carries no rubric-to-assignment association at
   * all (see ExportCourseContent.rubrics's own doc comment). */
  exportRubricTitle: string;
}

function defaultGithubGradingUiState(): GithubGradingUiState {
  return {
    gradingFolder: "",
    courseId: "",
    source: "live",
    liveAssignmentId: "",
    exportAssignmentKey: "",
    exportRubricTitle: "",
  };
}

function isPullSource(value: string | null): value is GithubGradingPullSource {
  return value === "live" || value === "export";
}

/** Restores every persisted control, falling back to defaultGithubGradingUiState()
 * (whole object, on the server) or per-field defaults (in the browser, when
 * a given key is absent or - for `source` - holds something other than the
 * two valid values) rather than ever throwing. */
export function loadGithubGradingUiState(): GithubGradingUiState {
  if (typeof window === "undefined") return defaultGithubGradingUiState();
  try {
    const storedSource = localStorage.getItem(SOURCE_KEY);
    return {
      gradingFolder: localStorage.getItem(FOLDER_KEY) ?? "",
      courseId: localStorage.getItem(COURSE_KEY) ?? "",
      source: isPullSource(storedSource) ? storedSource : "live",
      liveAssignmentId: localStorage.getItem(LIVE_ASSIGNMENT_KEY) ?? "",
      exportAssignmentKey: localStorage.getItem(EXPORT_ASSIGNMENT_KEY) ?? "",
      exportRubricTitle: localStorage.getItem(EXPORT_RUBRIC_KEY) ?? "",
    };
  } catch {
    // A localStorage read can throw in some private-browsing modes - treat
    // exactly like "nothing was ever saved" rather than crashing the tab.
    return defaultGithubGradingUiState();
  }
}

export function persistGithubGradingUiState(state: GithubGradingUiState): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(FOLDER_KEY, state.gradingFolder);
    localStorage.setItem(COURSE_KEY, state.courseId);
    localStorage.setItem(SOURCE_KEY, state.source);
    localStorage.setItem(LIVE_ASSIGNMENT_KEY, state.liveAssignmentId);
    localStorage.setItem(EXPORT_ASSIGNMENT_KEY, state.exportAssignmentKey);
    localStorage.setItem(EXPORT_RUBRIC_KEY, state.exportRubricTitle);
  } catch {
    // best-effort persistence only, matching repoGradesUiState.ts's
    // persistRepoGradesUiState.
  }
}
