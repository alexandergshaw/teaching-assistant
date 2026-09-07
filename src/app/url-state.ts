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
// Since D25 (six top-level tabs merged into four) there is one more level in
// that nesting: three of the four tabs hold two former tabs each, and which
// half is showing is the "section" (coursesSection/toolsSection/
// librarySection). The chain is tab -> section -> view -> inner view.
//
// D26 FLATTENED THE NAVIGATION BUT NOT THIS FILE. The section is no longer
// something the user picks - one rail per merged tab now lists both families'
// views directly and the section is derived from whichever family the chosen
// item belongs to (components/tabs/tab-rails.ts). The URL contract is
// deliberately unchanged by that: every param below keeps its name and its
// values, and the parse/build chain still walks tab -> section -> view ->
// inner view, because the alternative - one new param with aliases for the
// old ones - would break every existing "?manualView=" link for a purely
// cosmetic gain.
//
// No window/history access happens in this file - it stays a pure string
// <-> state mapping so it can be unit tested directly. page.tsx owns the
// actual window.history.pushState/replaceState calls and the popstate
// listener.

import { isManualViewType, type ManualViewType, type BuildViewType } from "./components/manual/manual-rail";
import { LMS_VIEWS } from "./components/manual/manual-rail";
import type { ContentView } from "./components/content-tab/constants";
import { normalizeInstitution } from "@/lib/knowledge-base";
import {
  COURSES_SECTION_ORDER,
  DEFAULT_COURSES_SECTION,
  DEFAULT_DESTINATION,
  DEFAULT_LIBRARY_SECTION,
  DEFAULT_TOOLS_SECTION,
  LIBRARY_SECTION_ORDER,
  RETIRED_TAB_DESTINATIONS,
  TAB_ORDER,
  TASKS_VIEW_ORDER,
  TOOLS_SECTION_ORDER,
  WORKFLOWS_VIEW_ORDER,
  isRetiredTabValue,
  type ActiveTab,
  type CoursesSection,
  type LibrarySection,
  type TabDestination,
  type TasksView,
  type ToolsSection,
  type WorkflowsView,
} from "./components/tabs/tab-sections";

// Re-exported so every existing import site (page.tsx, useAppNavigation.ts,
// WorkflowsPanel.tsx) keeps resolving these types from this module, which is
// where the URL contract has always lived. The VALUES themselves - the
// ordered member lists - are owned by components/tabs/tab-sections.ts; this
// module owns validation and the query-string mapping, exactly as it already
// does for ManualViewType/ContentView.
// WorkflowsView and TasksView joined this list in D26: the flattened rails are
// built from their ORDERED member lists, so those lists had to move to the
// leaf module that owns every other ordered nav list (declaring them here and
// importing them back would be a cycle). Re-exported so every existing import
// site keeps resolving them from this module, and so the "workflowsView" and
// "tasksView" params they validate are untouched.
export type { ActiveTab, CoursesSection, ToolsSection, LibrarySection, TabDestination, WorkflowsView, TasksView };
// No canonical home elsewhere (unlike ManualViewType/ContentView/ActiveTab/
// WorkflowsView, which are owned by manual-rail.ts, content-tab/constants.ts
// and tabs/tab-sections.ts respectively) - this module is the single source of
// truth for it. DraftsView is a level BELOW the flattened rail (it lives
// inside the Drafts view, not beside it), so unlike its two siblings above it
// had no reason to move.
export type DraftsView = "grades" | "messages";

// Derived from TAB_ORDER rather than restating the four members, so a tab
// added to the strip is accepted by the URL and the localStorage restore
// automatically. A second hand-maintained list is precisely how a registered
// view ends up rejected by its own restore guard (see manual-rail.ts's
// isManualViewType comment for that story).
const ACTIVE_TAB_VALUES: ReadonlySet<string> = new Set<string>(TAB_ORDER);

export function isActiveTab(value: unknown): value is ActiveTab {
  return typeof value === "string" && ACTIVE_TAB_VALUES.has(value);
}

// Single source of truth for "where do we land, in full, given this stored or
// URL tab value" - reused for both the localStorage restore (legacy
// migrations included) and URL parsing, so an unknown or malformed tab falls
// back to the exact same default in both rather than through a second,
// possibly-drifting copy of this logic.
//
// It returns a whole TabDestination, not just a tab, because a retired value
// names a SECTION as well: "?tab=tasks" is Courses-with-Tasks-showing, and a
// caller that only learned "courses" from it would drop the user on the
// Courses section and lose exactly the screen the link asked for. That is the
// silent bounce D25b is about, one level deeper.
export function resolveTabDestination(value: string | null): TabDestination {
  // Legacy "grade-drafts"/"drafts" named the pre-merge Workflows tab, so they
  // land where "workflows" now lands: Tools, Workflows section.
  if (value === "grade-drafts" || value === "drafts") return { ...RETIRED_TAB_DESTINATIONS.workflows };
  // Legacy "ppt-design" named a Manual subtab that briefly lived at top
  // level; it has always resolved to the Manual tab and still does.
  if (value === "ppt-design") return { ...DEFAULT_DESTINATION };
  if (isRetiredTabValue(value)) return { ...RETIRED_TAB_DESTINATIONS[value] };
  return isActiveTab(value) ? { ...DEFAULT_DESTINATION, tab: value } : { ...DEFAULT_DESTINATION };
}

// The tab half of resolveTabDestination, kept as its own export because most
// call sites only need the tab. Anything restoring a whole location (the
// nav hook's initializers) must use resolveTabDestination instead, or a
// legacy value silently loses its section.
export function normalizeActiveTab(value: string | null): ActiveTab {
  return resolveTabDestination(value).tab;
}

// --- The merged tabs' section switches ------------------------------------
//
// Each of these validates one merged tab's section against the ordered list
// tab-sections.ts owns, the same derived-not-restated shape as isContentView
// below.

const COURSES_SECTION_VALUES: ReadonlySet<string> = new Set<string>(COURSES_SECTION_ORDER);
const TOOLS_SECTION_VALUES: ReadonlySet<string> = new Set<string>(TOOLS_SECTION_ORDER);
const LIBRARY_SECTION_VALUES: ReadonlySet<string> = new Set<string>(LIBRARY_SECTION_ORDER);

export function isCoursesSection(value: unknown): value is CoursesSection {
  return typeof value === "string" && COURSES_SECTION_VALUES.has(value);
}

export function isToolsSection(value: unknown): value is ToolsSection {
  return typeof value === "string" && TOOLS_SECTION_VALUES.has(value);
}

export function isLibrarySection(value: unknown): value is LibrarySection {
  return typeof value === "string" && LIBRARY_SECTION_VALUES.has(value);
}

export function normalizeCoursesSection(value: string | null): CoursesSection {
  return isCoursesSection(value) ? value : DEFAULT_COURSES_SECTION;
}

export function normalizeToolsSection(value: string | null): ToolsSection {
  return isToolsSection(value) ? value : DEFAULT_TOOLS_SECTION;
}

export function normalizeLibrarySection(value: string | null): LibrarySection {
  return isLibrarySection(value) ? value : DEFAULT_LIBRARY_SECTION;
}

// Derived from the same ordered list the Tools rail renders (D26), not
// restated: a Workflows sub-view added to that list is accepted by the URL
// automatically. Restating it is precisely how a registered view ends up
// rejected by its own restore guard - see manual-rail.ts's isManualViewType
// comment for the time this project actually paid for that.
const WORKFLOWS_VIEW_VALUES: ReadonlySet<string> = new Set<string>(WORKFLOWS_VIEW_ORDER);

export function isWorkflowsView(value: unknown): value is WorkflowsView {
  return typeof value === "string" && WORKFLOWS_VIEW_VALUES.has(value);
}

export function normalizeWorkflowsView(value: string | null): WorkflowsView {
  return isWorkflowsView(value) ? value : "workflows";
}

// Derived from the rail's own ordered list for the same reason as
// WORKFLOWS_VIEW_VALUES above.
const TASKS_VIEW_VALUES: ReadonlySet<string> = new Set<string>(TASKS_VIEW_ORDER);

export function isTasksView(value: unknown): value is TasksView {
  return typeof value === "string" && TASKS_VIEW_VALUES.has(value);
}

export function normalizeTasksView(value: string | null): TasksView {
  return isTasksView(value) ? value : "term";
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
const DEFAULT_TASKS_VIEW = normalizeTasksView(null);

const TAB_PARAM = "tab";
// The three merged tabs' section params were NEW at D25; every param below
// them is unchanged in name and meaning (D25c: "No view param is renamed" -
// renaming one would break the same class of URL D25b exists to protect, for
// no benefit, since the params are already unique across tabs). "Section"
// rather than "View" so a merged tab's family reads distinctly from the
// pre-existing sub-view params nested under it: "toolsSection=workflows&
// workflowsView=drafts" says which level is which at a glance.
//
// D26 left all eleven names alone. The section params are now WRITTEN as a
// consequence of picking a rail item rather than picked directly, which
// changes who sets them, not what they are called or what they accept.
const COURSES_SECTION_PARAM = "coursesSection";
const TOOLS_SECTION_PARAM = "toolsSection";
const LIBRARY_SECTION_PARAM = "librarySection";
const MANUAL_VIEW_PARAM = "manualView";
const WORKFLOWS_VIEW_PARAM = "workflowsView";
const BUILD_VIEW_PARAM = "buildView";
const CONTENT_VIEW_PARAM = "contentView";
const DRAFTS_VIEW_PARAM = "draftsView";
const TASKS_VIEW_PARAM = "tasksView";
const KB_INSTITUTION_PARAM = "kbInstitution";
const KB_PAGE_PARAM = "kbPage";

export interface UrlNavState {
  tab: ActiveTab;
  // Which half of each merged tab is showing. Present for every tab, not
  // only the active one, for the same reason every sub-view field already is:
  // the caller decides which one is "in effect", and a section the user set
  // up on another tab must survive a trip through a different tab's URL.
  coursesSection: CoursesSection;
  toolsSection: ToolsSection;
  librarySection: LibrarySection;
  manualView: ManualViewType;
  workflowsView: WorkflowsView;
  buildView: BuildViewType;
  contentView: ContentView;
  draftsView: DraftsView;
  tasksView: TasksView;
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
  // The tab value resolves to a whole destination first, because a RETIRED
  // value carries a section with it ("?tab=tasks" means Courses AND its Tasks
  // section). An explicit, VALID section param still wins over that implied
  // one - an old link never carries a section param, so the two can only
  // disagree on a hand-edited URL, and "the param you actually wrote wins" is
  // the rule that is easiest to reason about. An INVALID section param falls
  // back to the destination rather than to the tab's plain default, so
  // "?tab=tasks&coursesSection=garbage" still lands on Tasks.
  const destination = resolveTabDestination(params.get(TAB_PARAM));
  const rawCoursesSection = params.get(COURSES_SECTION_PARAM);
  const rawToolsSection = params.get(TOOLS_SECTION_PARAM);
  const rawLibrarySection = params.get(LIBRARY_SECTION_PARAM);
  return {
    tab: destination.tab,
    coursesSection: isCoursesSection(rawCoursesSection) ? rawCoursesSection : destination.coursesSection,
    toolsSection: isToolsSection(rawToolsSection) ? rawToolsSection : destination.toolsSection,
    librarySection: isLibrarySection(rawLibrarySection) ? rawLibrarySection : destination.librarySection,
    manualView: normalizeManualView(params.get(MANUAL_VIEW_PARAM)),
    workflowsView: normalizeWorkflowsView(params.get(WORKFLOWS_VIEW_PARAM)),
    buildView: normalizeBuildView(params.get(BUILD_VIEW_PARAM)),
    contentView: normalizeContentView(params.get(CONTENT_VIEW_PARAM)),
    draftsView: normalizeDraftsView(params.get(DRAFTS_VIEW_PARAM)),
    tasksView: normalizeTasksView(params.get(TASKS_VIEW_PARAM)),
    kbInstitution: normalizeKbInstitution(params.get(KB_INSTITUTION_PARAM)),
    kbPageId: normalizeKbPageId(params.get(KB_PAGE_PARAM)),
  };
}

// Builds the canonical query string for a full tab/section/sub-view/
// sub-sub-view combination. Only params that both (a) belong to the given
// branch and (b) differ from that field's default are included - so switching
// to Courses/Library never leaks a stale manualView/workflowsView/etc. from
// whatever tab was active before, and landing on the default section or
// sub-view of a tab (e.g. Tools > Manual > Build Courses > Pre Built) never
// carries a redundant param. Omitting a default is safe because
// parseUrlState's normalizeX fallback reconstructs that exact same default
// when the param is absent.
//
// This is also the function that RETIRES a legacy tab value: nothing here can
// emit "tab=tasks", "tab=workflows" or "tab=knowledge", so the first sync
// after an old link is opened rewrites the address bar to the canonical
// shape (D25b - an alias is a redirect, not a synonym).
export function buildUrlSearch(state: UrlNavState): string {
  const params = new URLSearchParams();
  params.set(TAB_PARAM, state.tab);

  if (state.tab === "courses") {
    if (state.coursesSection !== DEFAULT_COURSES_SECTION) {
      params.set(COURSES_SECTION_PARAM, state.coursesSection);
    }
    if (state.coursesSection === "tasks" && state.tasksView !== DEFAULT_TASKS_VIEW) {
      params.set(TASKS_VIEW_PARAM, state.tasksView);
    }
  }

  if (state.tab === "manual") {
    if (state.toolsSection !== DEFAULT_TOOLS_SECTION) {
      params.set(TOOLS_SECTION_PARAM, state.toolsSection);
    }
    if (state.toolsSection === "manual") {
      if (state.manualView !== DEFAULT_MANUAL_VIEW) params.set(MANUAL_VIEW_PARAM, state.manualView);
      if (state.manualView === "course-planning" && state.buildView !== DEFAULT_BUILD_VIEW) {
        params.set(BUILD_VIEW_PARAM, state.buildView);
      }
      if (state.manualView === "content" && state.contentView !== DEFAULT_CONTENT_VIEW) {
        params.set(CONTENT_VIEW_PARAM, state.contentView);
      }
    }
    if (state.toolsSection === "workflows") {
      if (state.workflowsView !== DEFAULT_WORKFLOWS_VIEW) params.set(WORKFLOWS_VIEW_PARAM, state.workflowsView);
      if (state.workflowsView === "drafts" && state.draftsView !== DEFAULT_DRAFTS_VIEW) {
        params.set(DRAFTS_VIEW_PARAM, state.draftsView);
      }
    }
  }

  if (state.tab === "files") {
    if (state.librarySection !== DEFAULT_LIBRARY_SECTION) {
      params.set(LIBRARY_SECTION_PARAM, state.librarySection);
    }
    // AC2: kbPageId is meaningless (and ambiguous - the same id can exist
    // under a different institution) without an institution alongside it, so
    // it is gated on kbInstitution being present the same way e.g.
    // contentView is gated on manualView === "content" above, rather than
    // being able to appear on its own.
    if (state.librarySection === "knowledge" && state.kbInstitution) {
      params.set(KB_INSTITUTION_PARAM, state.kbInstitution);
      if (state.kbPageId) params.set(KB_PAGE_PARAM, state.kbPageId);
    }
  }

  return `?${params.toString()}`;
}
