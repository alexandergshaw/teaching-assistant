// Pure helpers mapping the app's top-level tab (and the one sub-view each
// tab exposes in its own tab-bar) to and from the URL's query string, so the
// browser's Back/Forward buttons can move between them.
//
// Deliberately excluded from the URL (kept as localStorage-only, exactly as
// before this feature): buildView, contentView, and draftsView - these are
// second-level controls nested INSIDE a tab's sub-view (e.g. the Grading/
// Announcements/Inbox switch inside Manual > LMS, or the Grades/Messages
// switch inside Workflows > Drafts) that get toggled quickly while browsing.
// Giving every nesting level its own history entry would make Back tediously
// granular - exactly the "control that pushes an entry per toggle" trap
// called out in the acceptance criteria. KnowledgeTab's selected page is
// similarly excluded: it is state the component owns internally (its own
// "ta-kb-selected-page" persistence), never lifted up to this module's
// notion of "the app's tab state", and selecting a page in a page tree is a
// frequent list-item pick, not a tab-like navigation.
//
// No window/history access happens in this file - it stays a pure string
// <-> state mapping so it can be unit tested directly. page.tsx owns the
// actual window.history.pushState/replaceState calls and the popstate
// listener.

import { isManualViewType, type ManualViewType } from "./components/manual/manual-rail";

export type ActiveTab = "courses" | "manual" | "workflows" | "files" | "knowledge";
export type WorkflowsView = "workflows" | "automations" | "drafts";

const ACTIVE_TAB_VALUES: ReadonlySet<string> = new Set<ActiveTab>([
  "courses",
  "manual",
  "workflows",
  "files",
  "knowledge",
]);

export function isActiveTab(value: unknown): value is ActiveTab {
  return typeof value === "string" && ACTIVE_TAB_VALUES.has(value);
}

// Single source of truth for "what tab do we land on when the stored/URL
// value is missing or unrecognized" - reused for both the localStorage
// restore (unchanged legacy migrations included) and URL parsing, so an
// unknown or malformed tab in the URL falls back to the exact same default
// as today rather than a second, possibly-drifting copy of this list.
export function normalizeActiveTab(value: string | null): ActiveTab {
  // Migrate legacy "grade-drafts" or "drafts" to "workflows".
  if (value === "grade-drafts" || value === "drafts") return "workflows";
  // Migrate legacy "ppt-design" to "manual".
  if (value === "ppt-design") return "manual";
  return isActiveTab(value) ? value : "manual";
}

const WORKFLOWS_VIEW_VALUES: ReadonlySet<string> = new Set<WorkflowsView>([
  "workflows",
  "automations",
  "drafts",
]);

export function isWorkflowsView(value: unknown): value is WorkflowsView {
  return typeof value === "string" && WORKFLOWS_VIEW_VALUES.has(value);
}

export function normalizeWorkflowsView(value: string | null): WorkflowsView {
  return isWorkflowsView(value) ? value : "workflows";
}

// Reuses manual-rail's isManualViewType (the file's own single source of
// truth for valid Manual subtabs) rather than restating the member list.
export function normalizeManualView(value: string | null): ManualViewType {
  return isManualViewType(value) ? value : "course-planning";
}

const TAB_PARAM = "tab";
const MANUAL_VIEW_PARAM = "manualView";
const WORKFLOWS_VIEW_PARAM = "workflowsView";

export interface UrlNavState {
  tab: ActiveTab;
  manualView: ManualViewType;
  workflowsView: WorkflowsView;
}

// Parses every field independently of the others - including a sub-view
// param that does not belong to the parsed tab (e.g. "?tab=courses&
// manualView=content"). That combination is deliberately not collapsed to a
// default here: it is the caller's job (page.tsx) to decide which sub-view
// field is actually "in effect" for a given tab, so a manualView param only
// takes effect when tab is "manual", regardless of what parseUrlState
// returns for it.
export function parseUrlState(search: string): UrlNavState {
  const params = new URLSearchParams(search);
  return {
    tab: normalizeActiveTab(params.get(TAB_PARAM)),
    manualView: normalizeManualView(params.get(MANUAL_VIEW_PARAM)),
    workflowsView: normalizeWorkflowsView(params.get(WORKFLOWS_VIEW_PARAM)),
  };
}

// Builds the canonical query string for a tab/sub-view combination. Only the
// sub-view param that actually belongs to the given tab is included, so
// switching to Courses/Files/Knowledge never leaks a stale manualView or
// workflowsView from whatever tab was active before.
export function buildUrlSearch(state: UrlNavState): string {
  const params = new URLSearchParams();
  params.set(TAB_PARAM, state.tab);
  if (state.tab === "manual") params.set(MANUAL_VIEW_PARAM, state.manualView);
  if (state.tab === "workflows") params.set(WORKFLOWS_VIEW_PARAM, state.workflowsView);
  return `?${params.toString()}`;
}
