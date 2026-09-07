// The four top-level tabs, the section switch inside each merged one, and the
// three tab values that were retired when six tabs became four (D24/D25 of
// docs/course-student-intelligence-acceptance-criteria.md).
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

export type CoursesSection = "courses" | "tasks";
export type ToolsSection = "manual" | "workflows";
export type LibrarySection = "files" | "knowledge";

export const COURSES_SECTION_ORDER: readonly CoursesSection[] = ["courses", "tasks"];
export const TOOLS_SECTION_ORDER: readonly ToolsSection[] = ["manual", "workflows"];
export const LIBRARY_SECTION_ORDER: readonly LibrarySection[] = ["files", "knowledge"];

export const COURSES_SECTION_LABELS: Record<CoursesSection, string> = {
  courses: "Courses",
  tasks: "Tasks",
};
export const TOOLS_SECTION_LABELS: Record<ToolsSection, string> = {
  manual: "Manual",
  workflows: "Workflows",
};
export const LIBRARY_SECTION_LABELS: Record<LibrarySection, string> = {
  files: "Files",
  knowledge: "Knowledge",
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
