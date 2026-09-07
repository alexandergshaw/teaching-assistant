// The four top-level tabs, the families of views inside each merged one, and
// the three tab values that were retired when six tabs became four (D24/D25 of
// docs/course-student-intelligence-acceptance-criteria.md).
//
// D26 FLATTENED THE MERGED TABS. There is no longer a control that picks a
// SECTION: each merged tab shows ONE rail whose items are the individual views
// of both families it absorbed, and the section is whatever family the chosen
// item belongs to. The section VALUES below all survive unchanged because they
// are still what the URL and localStorage carry - see tab-rails.ts, which
// builds the flattened rails from the ordered lists here, and note that no
// view param was renamed or retired in the process.
//
// THIS MODULE IS A LEAF ON PURPOSE. It imports nothing. url-state.ts imports
// it (the same way it already imports manual-rail.ts's LMS_VIEWS) and derives
// every runtime Set, type guard and normalizer FROM the ordered lists here, so
// there is exactly one hand-maintained list per concept. Back-importing
// anything from url-state.ts into this file would make a cycle, and a cycle
// between a constants module and its consumer silently yields `undefined` at
// module-init time rather than failing loudly - the exact failure this
// project has already paid for once.
//
// WHY THE TAB VALUES DO NOT MATCH THE TAB LABELS. "manual" is the Tools tab
// and "files" is the Library tab. The label changed; the URL value did not,
// because renaming a live tab value breaks every bookmark carrying it - the
// same class of silent bounce D25b exists to prevent. Exactly three values
// were retired (see RETIRED_TAB_DESTINATIONS below) and those three are
// aliased rather than removed. Renaming "manual" or "files" too would have
// meant five broken URL shapes instead of three redirects, for a cosmetic
// gain nobody can see in the address bar anyway.

export type ActiveTab = "courses" | "manual" | "files" | "course-intel";

// Display order of the top-level strip. page.tsx maps this array directly
// rather than hand-writing one <Tab> per member, so "registered but missing
// from the strip" is not a state this app can be in.
export const TAB_ORDER: readonly ActiveTab[] = ["courses", "manual", "files", "course-intel"];

export const TAB_LABELS: Record<ActiveTab, string> = {
  courses: "Courses",
  manual: "Tools",
  files: "Library",
  "course-intel": "Course Intel",
};

// The tab the app lands on when nothing valid is stored or requested.
// Unchanged from before the merge: "manual" (now labelled Tools).
export const DEFAULT_TAB: ActiveTab = "manual";

// --- Sections inside each merged tab -------------------------------------
//
// Each merged tab holds the two former tabs it absorbed. The section id is
// the FORMER TAB'S OWN VALUE, deliberately: it keeps the mapping from a
// retired URL value to its new home a one-liner, and it means a reader who
// finds "?tab=manual&toolsSection=workflows" in a log can tell exactly which
// pre-merge screen it names.
//
// SINCE D26 THE SECTION IS DERIVED, NOT PICKED. Nothing in the UI asks the
// user which section they want any more; picking a rail item picks the view,
// and the section follows from which family that view belongs to (tab-rails.ts
// owns that mapping). The section stays a first-class piece of state anyway,
// because it is the only thing that says WHICH FAMILY is showing when both
// families have a remembered view - drop it and "?tab=manual" with both a
// stored manualView and a stored workflowsView becomes ambiguous.

export type CoursesSection = "courses" | "tasks";
export type ToolsSection = "manual" | "workflows";
export type LibrarySection = "files" | "knowledge";

export const COURSES_SECTION_ORDER: readonly CoursesSection[] = ["courses", "tasks"];
export const TOOLS_SECTION_ORDER: readonly ToolsSection[] = ["manual", "workflows"];
export const LIBRARY_SECTION_ORDER: readonly LibrarySection[] = ["files", "knowledge"];

// Only the sections that are still their own rail ITEM carry a label.
//
// "Courses" is one, because the Courses half of that tab has no sub-views of
// its own to spend rail slots on - the section IS the destination. Library's
// two are the same case, which is why that tab was already flat and D26 left
// it alone (see tab-rails.ts).
//
// The Tools sections deliberately have NO labels: "Manual" and "Workflows"
// were the names of the switch that D26 deleted, and both of that switch's
// halves are now represented in the rail by their own views instead. Keeping
// a label map for a control nobody renders is how this repo ends up with a
// registration describing a screen that no longer exists.
export const COURSES_SECTION_LABELS: Record<CoursesSection, string> = {
  courses: "Courses",
  tasks: "Tasks",
};
export const LIBRARY_SECTION_LABELS: Record<LibrarySection, string> = {
  files: "Files",
  knowledge: "Knowledge",
};

// --- The view families that the flattened rails are built from ------------
//
// These two unions used to be declared in url-state.ts. They live here now for
// the same reason ActiveTab does: tab-rails.ts needs the ORDERED lists (not
// just the types) to build a rail out of them, and url-state.ts already
// imports this module, so declaring them there and importing them back would
// be the constants-module cycle this file's header warns about. url-state.ts
// re-exports both types, so every existing import site is unchanged - and so
// are the "workflowsView" and "tasksView" URL params they validate.

export type WorkflowsView = "workflows" | "automations" | "drafts";
export type TasksView = "term" | "recurring";

// Rail order for the Workflows family, unchanged from the order the deleted
// Workflows subnav rendered them in.
export const WORKFLOWS_VIEW_ORDER: readonly WorkflowsView[] = ["workflows", "automations", "drafts"];
export const WORKFLOWS_VIEW_LABELS: Record<WorkflowsView, string> = {
  workflows: "Workflows",
  automations: "Automations",
  drafts: "Drafts",
};

// Rail order and labels for the Tasks family, unchanged from the order and
// wording the deleted TasksTab subnav rendered them in.
export const TASKS_VIEW_ORDER: readonly TasksView[] = ["term", "recurring"];
export const TASKS_VIEW_LABELS: Record<TasksView, string> = {
  term: "Term Setup",
  recurring: "Daily / Weekly",
};

// Each merged tab's default section is the half whose tab value survived, so
// a bare "?tab=courses" / "?tab=manual" / "?tab=files" lands exactly where it
// landed before the merge and carries no extra param.
export const DEFAULT_COURSES_SECTION: CoursesSection = "courses";
export const DEFAULT_TOOLS_SECTION: ToolsSection = "manual";
export const DEFAULT_LIBRARY_SECTION: LibrarySection = "files";

/** A complete "where does this tab value land" answer: the tab plus every
 *  merged tab's section, so a caller never has to know which section a given
 *  legacy value happened to touch. */
export interface TabDestination {
  tab: ActiveTab;
  coursesSection: CoursesSection;
  toolsSection: ToolsSection;
  librarySection: LibrarySection;
}

export const DEFAULT_DESTINATION: TabDestination = {
  tab: DEFAULT_TAB,
  coursesSection: DEFAULT_COURSES_SECTION,
  toolsSection: DEFAULT_TOOLS_SECTION,
  librarySection: DEFAULT_LIBRARY_SECTION,
};

// --- The retired values, and why they are aliased rather than deleted -----
//
// D25b: normalizeActiveTab consults a runtime Set and falls back to a default
// for anything it does not recognise. The moment "tasks", "workflows" and
// "knowledge" leave that Set, every existing bookmark, shared link and
// restored localStorage session carrying one lands on the WRONG TAB WITH NO
// ERROR. Nothing in the UI reveals it; the user simply finds themselves
// somewhere else.
//
// So the three are aliased, and an alias is a REDIRECT, not a synonym: the
// canonical value is written back (useAppNavigation.ts's first URL sync) so
// an old link converges on the new shape the first time it is opened instead
// of staying legacy forever.
export type RetiredTabValue = "tasks" | "workflows" | "knowledge";

export const RETIRED_TAB_DESTINATIONS: Record<RetiredTabValue, TabDestination> = {
  // "?tab=tasks" -> Courses, showing its Tasks section.
  tasks: {
    tab: "courses",
    coursesSection: "tasks",
    toolsSection: DEFAULT_TOOLS_SECTION,
    librarySection: DEFAULT_LIBRARY_SECTION,
  },
  // "?tab=workflows" -> Tools, showing its Workflows section.
  workflows: {
    tab: "manual",
    coursesSection: DEFAULT_COURSES_SECTION,
    toolsSection: "workflows",
    librarySection: DEFAULT_LIBRARY_SECTION,
  },
  // "?tab=knowledge" -> Library, showing its Knowledge section.
  knowledge: {
    tab: "files",
    coursesSection: DEFAULT_COURSES_SECTION,
    toolsSection: DEFAULT_TOOLS_SECTION,
    librarySection: "knowledge",
  },
};

const RETIRED_TAB_VALUE_SET: ReadonlySet<string> = new Set(Object.keys(RETIRED_TAB_DESTINATIONS));

export function isRetiredTabValue(value: unknown): value is RetiredTabValue {
  return typeof value === "string" && RETIRED_TAB_VALUE_SET.has(value);
}
