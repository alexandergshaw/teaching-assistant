// Pure helpers mapping the app's full tab/sub-tab nesting to and from the
// URL's query string, so the browser's Back/Forward buttons can move between
// them.
//
// Every tab-like view in page.tsx gets a history entry, including the
// second-level controls nested INSIDE a tab's sub-view (buildView inside
// Manual > Build Courses, contentView inside Manual > LMS, draftsView inside
// Workflows > Drafts). An earlier version of this module deliberately left
// those out, reasoning that an entry per toggle would make Back tediously
// granular - the instructor overruled that explicitly: they would rather
// press Back/Forward repeatedly than have to remember which exact control
// gets them back to where they were. Full coverage is the intended design;
// do not narrow this scope again without asking.
//
// No window/history access happens in this file - it stays a pure string
// <-> state mapping so it can be unit tested directly. page.tsx owns the
// actual window.history.pushState/replaceState calls and the popstate
// listener.

import { isManualViewType, type ManualViewType, type BuildViewType } from "./components/manual/manual-rail";
import { LMS_VIEWS } from "./components/manual/manual-rail";
import type { ContentView } from "./components/content-tab/constants";
import { normalizeInstitution } from "@/lib/knowledge-base";

export type ActiveTab = "courses" | "manual" | "workflows" | "files" | "knowledge";
export type WorkflowsView = "workflows" | "automations" | "drafts";
// No canonical home elsewhere (unlike ManualViewType/ContentView, which are
// owned by manual-rail.ts and content-tab/constants.ts respectively) - this
// module is the single source of truth for it, the same as ActiveTab and
// WorkflowsView.
export type DraftsView = "grades" | "messages";

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

const BUILD_VIEW_VALUES: ReadonlySet<string> = new Set<BuildViewType>(["new", "prebuilt"]);

export function isBuildView(value: unknown): value is BuildViewType {
  return typeof value === "string" && BUILD_VIEW_VALUES.has(value);
}

export function normalizeBuildView(value: string | null): BuildViewType {
  return isBuildView(value) ? value : "prebuilt";
}

// LMS_VIEWS (manual-rail's own single source of truth for the six navigable
// LMS subviews) deliberately excludes "version-control" - that ContentView
// member is a legacy migration target (see page.tsx's manualView
// initializer), never a state a user navigates into directly, so it is not
// accepted as a URL value either.
const CONTENT_VIEW_VALUES: ReadonlySet<string> = new Set<ContentView>(LMS_VIEWS);

export function isContentView(value: unknown): value is ContentView {
  return typeof value === "string" && CONTENT_VIEW_VALUES.has(value);
}

export function normalizeContentView(value: string | null): ContentView {
  return isContentView(value) ? value : "modules";
}

const DRAFTS_VIEW_VALUES: ReadonlySet<string> = new Set<DraftsView>(["grades", "messages"]);

export function isDraftsView(value: unknown): value is DraftsView {
  return typeof value === "string" && DRAFTS_VIEW_VALUES.has(value);
}

export function normalizeDraftsView(value: string | null): DraftsView {
  return isDraftsView(value) ? value : "grades";
}

// Knowledge's selected institution and page have no fixed member list (they
// are dynamic, per-user data - registered institution acronyms and page
// UUIDs) unlike every other field above, so there is no isX/enum to validate
// against here. Normalizing just cleans up the raw param (trim, and
// uppercase for the institution to match the acronym convention used
// throughout src/lib/institutions.ts and knowledge-helpers.ts); whether a
// given value is actually valid - a registered institution, a page that
// exists and belongs to that institution - depends on runtime data
// (the registry, the fetched page list) that this pure module does not have,
// so that check is the caller's job (KnowledgeTab, via
// knowledge-helpers.ts's pickValidPageId/resolveActiveKbInstitution) exactly
// as it already is for the localStorage-persisted equivalents.
// The casing rule itself comes from normalizeInstitution, which its own
// module documents as "the single place that casing gets normalized" so a
// page saved through one code path is never invisible to another. Restating
// trim().toUpperCase() here would let the URL path drift out of sync with
// the storage path and reintroduce exactly that bug. knowledge-base.ts's
// only imports are type-only, so this pulls no server code into the client
// bundle.
export function normalizeKbInstitution(value: string | null): string | null {
  if (value === null) return null;
  const normalized = normalizeInstitution(value);
  return normalized.length > 0 ? normalized : null;
}

export function normalizeKbPageId(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

// Derived (not restated) from each normalize function's own fallback, so the
// "is this param at its default" check in buildUrlSearch can never drift
// from the value normalizeX(null) actually produces.
const DEFAULT_MANUAL_VIEW = normalizeManualView(null);
const DEFAULT_WORKFLOWS_VIEW = normalizeWorkflowsView(null);
const DEFAULT_BUILD_VIEW = normalizeBuildView(null);
const DEFAULT_CONTENT_VIEW = normalizeContentView(null);
const DEFAULT_DRAFTS_VIEW = normalizeDraftsView(null);

const TAB_PARAM = "tab";
const MANUAL_VIEW_PARAM = "manualView";
const WORKFLOWS_VIEW_PARAM = "workflowsView";
const BUILD_VIEW_PARAM = "buildView";
const CONTENT_VIEW_PARAM = "contentView";
const DRAFTS_VIEW_PARAM = "draftsView";
const KB_INSTITUTION_PARAM = "kbInstitution";
const KB_PAGE_PARAM = "kbPage";

export interface UrlNavState {
  tab: ActiveTab;
  manualView: ManualViewType;
  workflowsView: WorkflowsView;
  buildView: BuildViewType;
  contentView: ContentView;
  draftsView: DraftsView;
  // null means "no page/institution named in the URL" - there is no fixed
  // default to fall back to the way the other fields have one, since which
  // institution/page (if any) is selected is per-user data, not a fixed
  // enum member.
  kbInstitution: string | null;
  kbPageId: string | null;
}

// Parses every field independently of the others - including a sub-view
// param that does not belong to the parsed tab/parent view (e.g. "?tab=
// courses&manualView=content", or "?tab=manual&manualView=content&
// buildView=new"). Those combinations are deliberately not collapsed to a
// default here: it is the caller's job (page.tsx) to decide which sub-view
// field is actually "in effect" for a given tab/parent, walking the chain
// one level at a time (tab -> manualView/workflowsView -> buildView/
// contentView/draftsView), so a param only takes effect when every level
// above it in the chain also matches, regardless of what parseUrlState
// returns for it.
export function parseUrlState(search: string): UrlNavState {
  const params = new URLSearchParams(search);
  return {
    tab: normalizeActiveTab(params.get(TAB_PARAM)),
    manualView: normalizeManualView(params.get(MANUAL_VIEW_PARAM)),
    workflowsView: normalizeWorkflowsView(params.get(WORKFLOWS_VIEW_PARAM)),
    buildView: normalizeBuildView(params.get(BUILD_VIEW_PARAM)),
    contentView: normalizeContentView(params.get(CONTENT_VIEW_PARAM)),
    draftsView: normalizeDraftsView(params.get(DRAFTS_VIEW_PARAM)),
    kbInstitution: normalizeKbInstitution(params.get(KB_INSTITUTION_PARAM)),
    kbPageId: normalizeKbPageId(params.get(KB_PAGE_PARAM)),
  };
}

// Builds the canonical query string for a full tab/sub-view/sub-sub-view
// combination. Only params that both (a) belong to the given branch and (b)
// differ from that field's default are included - so switching to Courses/
// Files/Knowledge never leaks a stale manualView/workflowsView/etc. from
// whatever tab was active before, and landing on the default sub-view of a
// tab (e.g. Manual > Build Courses > Pre Built) never carries a redundant
// param. Omitting a default is safe because parseUrlState's normalizeX
// fallback reconstructs that exact same default when the param is absent.
export function buildUrlSearch(state: UrlNavState): string {
  const params = new URLSearchParams();
  params.set(TAB_PARAM, state.tab);

  if (state.tab === "manual") {
    if (state.manualView !== DEFAULT_MANUAL_VIEW) params.set(MANUAL_VIEW_PARAM, state.manualView);
    if (state.manualView === "course-planning" && state.buildView !== DEFAULT_BUILD_VIEW) {
      params.set(BUILD_VIEW_PARAM, state.buildView);
    }
    if (state.manualView === "content" && state.contentView !== DEFAULT_CONTENT_VIEW) {
      params.set(CONTENT_VIEW_PARAM, state.contentView);
    }
  }

  if (state.tab === "workflows") {
    if (state.workflowsView !== DEFAULT_WORKFLOWS_VIEW) params.set(WORKFLOWS_VIEW_PARAM, state.workflowsView);
    if (state.workflowsView === "drafts" && state.draftsView !== DEFAULT_DRAFTS_VIEW) {
      params.set(DRAFTS_VIEW_PARAM, state.draftsView);
    }
  }

  // AC2: kbPageId is meaningless (and ambiguous - the same id can exist under
  // a different institution) without an institution alongside it, so it is
  // gated on kbInstitution being present the same way e.g. contentView is
  // gated on manualView === "content" above, rather than being able to
  // appear on its own.
  if (state.tab === "knowledge" && state.kbInstitution) {
    params.set(KB_INSTITUTION_PARAM, state.kbInstitution);
    if (state.kbPageId) params.set(KB_PAGE_PARAM, state.kbPageId);
  }

  return `?${params.toString()}`;
}
