import { describe, it, expect } from "vitest";
import {
  isActiveTab,
  normalizeActiveTab,
  resolveTabDestination,
  isCoursesSection,
  isToolsSection,
  isLibrarySection,
  normalizeCoursesSection,
  normalizeToolsSection,
  normalizeLibrarySection,
  isWorkflowsView,
  normalizeWorkflowsView,
  normalizeManualView,
  isBuildView,
  normalizeBuildView,
  isContentView,
  normalizeContentView,
  isTasksView,
  normalizeTasksView,
  normalizeKbInstitution,
  normalizeKbPageId,
  parseUrlState,
  buildUrlSearch,
  resolveGradingPointer,
  type UrlNavState,
} from "./url-state";
import { RETIRED_TAB_DESTINATIONS, TAB_ORDER } from "./components/tabs/tab-sections";

// Baseline "everything at its default" state, spread with overrides below so
// each test only names the fields it cares about.
const DEFAULT_STATE: UrlNavState = {
  tab: "manual",
  coursesSection: "courses",
  toolsSection: "manual",
  librarySection: "files",
  manualView: "course-planning",
  workflowsView: "workflows",
  buildView: "prebuilt",
  contentView: "modules",
  gradingView: "run",
  tasksView: "term",
  kbInstitution: null,
  kbPageId: null,
};

describe("url-state", () => {
  describe("normalizeActiveTab", () => {
    it("accepts a valid tab", () => {
      expect(normalizeActiveTab("courses")).toBe("courses");
      expect(normalizeActiveTab("manual")).toBe("manual");
      expect(normalizeActiveTab("files")).toBe("files");
      expect(normalizeActiveTab("course-intel")).toBe("course-intel");
    });

    it("falls back to manual for an unknown tab", () => {
      expect(normalizeActiveTab("bogus")).toBe("manual");
      expect(normalizeActiveTab("")).toBe("manual");
    });

    it("falls back to manual for a missing tab", () => {
      expect(normalizeActiveTab(null)).toBe("manual");
    });

    it("migrates legacy grade-drafts/drafts values to the Tools tab", () => {
      expect(normalizeActiveTab("grade-drafts")).toBe("manual");
      expect(normalizeActiveTab("drafts")).toBe("manual");
    });

    it("migrates the legacy ppt-design value to manual", () => {
      expect(normalizeActiveTab("ppt-design")).toBe("manual");
    });
  });

  // D25b, and this block is the point of the whole change. Six top-level tabs
  // became four; "tasks", "workflows" and "knowledge" stopped being tab values
  // on the same day. normalizeActiveTab consults a runtime Set and falls back
  // to a default for anything it does not recognise, so if those three were
  // simply DELETED, every bookmark, shared link and restored localStorage
  // session carrying one would land on the Tools tab with no error at all -
  // no warning, nothing in the URL, just the wrong screen.
  //
  // A normaliser that quietly returns the default for a legacy value is
  // indistinguishable from one that handles it until someone opens an old
  // link. These assertions are the difference.
  describe("retired tab values still resolve to their new home (D25b)", () => {
    it("resolves ?tab=tasks to the Courses tab with its Tasks section", () => {
      expect(resolveTabDestination("tasks")).toEqual({
        tab: "courses",
        coursesSection: "tasks",
        toolsSection: "manual",
        librarySection: "files",
      });
    });

    it("resolves ?tab=workflows to the Tools tab with its Workflows section", () => {
      expect(resolveTabDestination("workflows")).toEqual({
        tab: "manual",
        coursesSection: "courses",
        toolsSection: "workflows",
        librarySection: "files",
      });
    });

    it("resolves ?tab=knowledge to the Library tab with its Knowledge section", () => {
      expect(resolveTabDestination("knowledge")).toEqual({
        tab: "files",
        coursesSection: "courses",
        toolsSection: "manual",
        librarySection: "knowledge",
      });
    });

    it("resolves every retired value the registry lists, and never to the bare default", () => {
      // Derived from RETIRED_TAB_DESTINATIONS rather than restating the three,
      // so a value retired in the future is covered here automatically.
      for (const [legacy, destination] of Object.entries(RETIRED_TAB_DESTINATIONS)) {
        expect(resolveTabDestination(legacy)).toEqual(destination);
        // The silent bounce, stated as an assertion: an unrecognised value
        // resolves to the default destination, so a retired value that
        // matched it would mean the alias had been dropped.
        expect(resolveTabDestination(legacy)).not.toEqual(resolveTabDestination("bogus"));
      }
    });

    it("no longer treats the retired values as tabs in their own right", () => {
      expect(isActiveTab("tasks")).toBe(false);
      expect(isActiveTab("workflows")).toBe(false);
      expect(isActiveTab("knowledge")).toBe(false);
    });

    it("carries the section through parseUrlState, not just the tab", () => {
      // Resolving only the tab would drop the user on Courses/Tools/Library's
      // OTHER half - the same wrong-screen failure one level down.
      expect(parseUrlState("?tab=tasks")).toEqual({
        ...DEFAULT_STATE,
        tab: "courses",
        coursesSection: "tasks",
      });
      expect(parseUrlState("?tab=workflows")).toEqual({
        ...DEFAULT_STATE,
        tab: "manual",
        toolsSection: "workflows",
      });
      expect(parseUrlState("?tab=knowledge")).toEqual({
        ...DEFAULT_STATE,
        tab: "files",
        librarySection: "knowledge",
      });
    });

    it("keeps a legacy deep link's sub-view working end to end", () => {
      expect(parseUrlState("?tab=tasks&tasksView=recurring")).toEqual({
        ...DEFAULT_STATE,
        tab: "courses",
        coursesSection: "tasks",
        tasksView: "recurring",
      });
      // draftsView is a retired param now (GRAD-SUBTAB wave 3, DECISION 19
      // E-full) - it is read only to detect the "grades" retired pointer
      // below; any other value (like "messages" here) is simply ignored.
      expect(parseUrlState("?tab=workflows&workflowsView=drafts&draftsView=messages")).toEqual({
        ...DEFAULT_STATE,
        tab: "manual",
        toolsSection: "workflows",
        workflowsView: "drafts",
      });
      expect(parseUrlState("?tab=knowledge&kbInstitution=MCC&kbPage=abc-123")).toEqual({
        ...DEFAULT_STATE,
        tab: "files",
        librarySection: "knowledge",
        kbInstitution: "MCC",
        kbPageId: "abc-123",
      });
    });

    it("writes the canonical value back - an alias is a redirect, not a synonym", () => {
      // buildUrlSearch is the only thing that ever writes the address bar, so
      // "the URL converges" reduces to "re-building a parsed legacy URL emits
      // the new shape". If this ever emitted the legacy value again, an old
      // link would stay legacy forever.
      expect(buildUrlSearch(parseUrlState("?tab=tasks"))).toBe("?tab=courses&coursesSection=tasks");
      expect(buildUrlSearch(parseUrlState("?tab=workflows"))).toBe("?tab=manual&toolsSection=workflows");
      expect(buildUrlSearch(parseUrlState("?tab=knowledge"))).toBe("?tab=files&librarySection=knowledge");

      expect(buildUrlSearch(parseUrlState("?tab=tasks&tasksView=recurring"))).toBe(
        "?tab=courses&coursesSection=tasks&tasksView=recurring"
      );
      expect(buildUrlSearch(parseUrlState("?tab=workflows&workflowsView=drafts&draftsView=messages"))).toBe(
        "?tab=manual&toolsSection=workflows&workflowsView=drafts"
      );
      expect(buildUrlSearch(parseUrlState("?tab=knowledge&kbInstitution=MCC&kbPage=abc-123"))).toBe(
        "?tab=files&librarySection=knowledge&kbInstitution=MCC&kbPage=abc-123"
      );
    });

    it("is idempotent: the canonical URL parses and rebuilds to itself", () => {
      for (const legacy of ["?tab=tasks", "?tab=workflows", "?tab=knowledge"]) {
        const canonical = buildUrlSearch(parseUrlState(legacy));
        expect(buildUrlSearch(parseUrlState(canonical))).toBe(canonical);
      }
    });

    it("a section param the user actually wrote still wins over the alias's implied one", () => {
      expect(parseUrlState("?tab=tasks&coursesSection=courses").coursesSection).toBe("courses");
      // ...but an INVALID one falls back to the alias's section, never to the
      // tab's plain default, so a garbled param cannot resurrect the bounce.
      expect(parseUrlState("?tab=tasks&coursesSection=garbage").coursesSection).toBe("tasks");
      expect(parseUrlState("?tab=workflows&toolsSection=garbage").toolsSection).toBe("workflows");
      expect(parseUrlState("?tab=knowledge&librarySection=garbage").librarySection).toBe("knowledge");
    });
  });

  describe("isActiveTab", () => {
    it("narrows only known tab strings", () => {
      expect(isActiveTab("courses")).toBe(true);
      expect(isActiveTab("course-intel")).toBe(true);
      expect(isActiveTab("nope")).toBe(false);
      expect(isActiveTab(null)).toBe(false);
      expect(isActiveTab(42)).toBe(false);
    });

    it("accepts every member of TAB_ORDER, derived rather than restated", () => {
      for (const tab of TAB_ORDER) {
        expect(isActiveTab(tab)).toBe(true);
        expect(normalizeActiveTab(tab)).toBe(tab);
      }
    });
  });

  describe("merged tab section switches", () => {
    it("accepts each section and rejects anything else", () => {
      expect(isCoursesSection("courses")).toBe(true);
      expect(isCoursesSection("tasks")).toBe(true);
      expect(isCoursesSection("nope")).toBe(false);
      expect(isToolsSection("manual")).toBe(true);
      expect(isToolsSection("workflows")).toBe(true);
      expect(isToolsSection("nope")).toBe(false);
      expect(isLibrarySection("files")).toBe(true);
      expect(isLibrarySection("knowledge")).toBe(true);
      expect(isLibrarySection("nope")).toBe(false);
    });

    it("falls back to the half whose tab value survived the merge", () => {
      expect(normalizeCoursesSection(null)).toBe("courses");
      expect(normalizeCoursesSection("bogus")).toBe("courses");
      expect(normalizeToolsSection(null)).toBe("manual");
      expect(normalizeToolsSection("bogus")).toBe("manual");
      expect(normalizeLibrarySection(null)).toBe("files");
      expect(normalizeLibrarySection("bogus")).toBe("files");
    });
  });

  describe("normalizeWorkflowsView / isWorkflowsView", () => {
    it("accepts valid sub-views", () => {
      expect(normalizeWorkflowsView("workflows")).toBe("workflows");
      expect(normalizeWorkflowsView("automations")).toBe("automations");
      expect(normalizeWorkflowsView("drafts")).toBe("drafts");
      expect(isWorkflowsView("automations")).toBe(true);
    });

    it("falls back to workflows for an unknown or missing value", () => {
      expect(normalizeWorkflowsView("bogus")).toBe("workflows");
      expect(normalizeWorkflowsView(null)).toBe("workflows");
      expect(isWorkflowsView("bogus")).toBe(false);
    });
  });

  describe("normalizeManualView", () => {
    it("accepts a valid Manual subtab", () => {
      expect(normalizeManualView("content")).toBe("content");
      expect(normalizeManualView("artifact-design")).toBe("artifact-design");
      expect(normalizeManualView("grading")).toBe("grading");
    });

    it("falls back to course-planning for an unknown or missing value", () => {
      expect(normalizeManualView("bogus")).toBe("course-planning");
      expect(normalizeManualView(null)).toBe("course-planning");
    });

    it("rejects 'course-intel' - it left the Manual rail to become a top-level tab (D24a)", () => {
      expect(normalizeManualView("course-intel")).toBe("course-planning");
    });
  });

  describe("normalizeBuildView / isBuildView", () => {
    it("accepts valid build views", () => {
      expect(normalizeBuildView("new")).toBe("new");
      expect(normalizeBuildView("prebuilt")).toBe("prebuilt");
      expect(isBuildView("new")).toBe(true);
    });

    it("falls back to prebuilt for an unknown or missing value", () => {
      expect(normalizeBuildView("bogus")).toBe("prebuilt");
      expect(normalizeBuildView(null)).toBe("prebuilt");
      expect(isBuildView("bogus")).toBe(false);
    });
  });

  describe("normalizeContentView / isContentView", () => {
    it("accepts every navigable LMS subview", () => {
      expect(normalizeContentView("modules")).toBe("modules");
      expect(normalizeContentView("pages")).toBe("pages");
      expect(normalizeContentView("files")).toBe("files");
      expect(normalizeContentView("announcements")).toBe("announcements");
      expect(normalizeContentView("inbox")).toBe("inbox");
    });

    it("falls back to modules for an unknown or missing value", () => {
      expect(normalizeContentView("bogus")).toBe("modules");
      expect(normalizeContentView(null)).toBe("modules");
      expect(isContentView("bogus")).toBe(false);
    });

    it("rejects version-control - it is a legacy migration target, not a navigable URL value", () => {
      expect(isContentView("version-control")).toBe(false);
      expect(normalizeContentView("version-control")).toBe("modules");
    });
  });

  describe("normalizeTasksView / isTasksView", () => {
    it("accepts valid sub-views", () => {
      expect(normalizeTasksView("term")).toBe("term");
      expect(normalizeTasksView("recurring")).toBe("recurring");
      expect(isTasksView("recurring")).toBe(true);
    });

    it("falls back to term for an unknown, empty, or missing value", () => {
      expect(normalizeTasksView("nope")).toBe("term");
      expect(normalizeTasksView("")).toBe("term");
      expect(normalizeTasksView(null)).toBe("term");
      expect(isTasksView("nope")).toBe(false);
      expect(isTasksView(42)).toBe(false);
    });
  });

  describe("normalizeKbInstitution", () => {
    it("accepts a valid institution code, upper-cased", () => {
      expect(normalizeKbInstitution("mcc")).toBe("MCC");
      expect(normalizeKbInstitution("MCC")).toBe("MCC");
      expect(normalizeKbInstitution("  mpcc  ")).toBe("MPCC");
    });

    it("falls back to null for an empty, blank, or missing value", () => {
      expect(normalizeKbInstitution("")).toBeNull();
      expect(normalizeKbInstitution("   ")).toBeNull();
      expect(normalizeKbInstitution(null)).toBeNull();
    });
  });

  describe("normalizeKbPageId", () => {
    it("accepts a page id as-is, trimmed", () => {
      expect(normalizeKbPageId("abc-123")).toBe("abc-123");
      expect(normalizeKbPageId("  abc-123  ")).toBe("abc-123");
    });

    it("falls back to null for an empty, blank, or missing value", () => {
      expect(normalizeKbPageId("")).toBeNull();
      expect(normalizeKbPageId("   ")).toBeNull();
      expect(normalizeKbPageId(null)).toBeNull();
    });
  });

  describe("parseUrlState", () => {
    it("parses a valid tab with no sub-view params", () => {
      expect(parseUrlState("?tab=courses")).toEqual({
        ...DEFAULT_STATE,
        tab: "courses",
      });
      expect(parseUrlState("?tab=course-intel")).toEqual({
        ...DEFAULT_STATE,
        tab: "course-intel",
      });
    });

    it("falls back safely for an unknown tab", () => {
      expect(parseUrlState("?tab=bogus")).toEqual(DEFAULT_STATE);
    });

    it("falls back safely for a missing tab", () => {
      expect(parseUrlState("")).toEqual(DEFAULT_STATE);
      expect(parseUrlState("?foo=bar")).toEqual(DEFAULT_STATE);
    });

    it("parses each merged tab's section param", () => {
      expect(parseUrlState("?tab=courses&coursesSection=tasks")).toEqual({
        ...DEFAULT_STATE,
        tab: "courses",
        coursesSection: "tasks",
      });
      expect(parseUrlState("?tab=manual&toolsSection=workflows")).toEqual({
        ...DEFAULT_STATE,
        tab: "manual",
        toolsSection: "workflows",
      });
      expect(parseUrlState("?tab=files&librarySection=knowledge")).toEqual({
        ...DEFAULT_STATE,
        tab: "files",
        librarySection: "knowledge",
      });
    });

    it("parses the manual sub-view alongside the Tools tab's Manual section", () => {
      expect(parseUrlState("?tab=manual&manualView=content")).toEqual({
        ...DEFAULT_STATE,
        tab: "manual",
        manualView: "content",
      });
    });

    it("parses the workflows sub-view alongside the Tools tab's Workflows section", () => {
      expect(parseUrlState("?tab=manual&toolsSection=workflows&workflowsView=drafts")).toEqual({
        ...DEFAULT_STATE,
        tab: "manual",
        toolsSection: "workflows",
        workflowsView: "drafts",
      });
    });

    it("parses the tasks sub-view alongside the Courses tab's Tasks section", () => {
      expect(parseUrlState("?tab=courses&coursesSection=tasks&tasksView=recurring")).toEqual({
        ...DEFAULT_STATE,
        tab: "courses",
        coursesSection: "tasks",
        tasksView: "recurring",
      });
    });

    it("falls back to term for an unrecognized tasksView value", () => {
      expect(parseUrlState("?tab=courses&coursesSection=tasks&tasksView=garbage")).toEqual({
        ...DEFAULT_STATE,
        tab: "courses",
        coursesSection: "tasks",
      });
      expect(parseUrlState("?tab=courses&coursesSection=tasks&tasksView=garbage").tasksView).toBe("term");
    });

    it("parses buildView nested under manual + course-planning", () => {
      expect(parseUrlState("?tab=manual&buildView=new")).toEqual({
        ...DEFAULT_STATE,
        tab: "manual",
        buildView: "new",
      });
    });

    it("parses contentView nested under manual + content", () => {
      expect(parseUrlState("?tab=manual&manualView=content&contentView=assignments")).toEqual({
        ...DEFAULT_STATE,
        tab: "manual",
        manualView: "content",
        contentView: "assignments",
      });
    });

    // draftsView is a retired param (GRAD-SUBTAB wave 3, DECISION 19 E-full):
    // it is no longer a UrlNavState field, and a value other than the
    // retired "grades" pointer (see "the retired 'drafts-view:grades'
    // pointer" describe block below) is simply ignored.
    it("ignores a draftsView param nested under workflows + drafts (retired)", () => {
      expect(parseUrlState("?tab=manual&toolsSection=workflows&workflowsView=drafts&draftsView=messages")).toEqual({
        ...DEFAULT_STATE,
        tab: "manual",
        toolsSection: "workflows",
        workflowsView: "drafts",
      });
    });

    it("falls back safely for unknown buildView/contentView values", () => {
      expect(parseUrlState("?tab=manual&manualView=content&buildView=bogus&contentView=bogus")).toEqual({
        ...DEFAULT_STATE,
        tab: "manual",
        manualView: "content",
      });
    });

    it("parses kbInstitution and kbPage alongside the Library tab's Knowledge section", () => {
      expect(parseUrlState("?tab=files&librarySection=knowledge&kbInstitution=MCC&kbPage=abc-123")).toEqual({
        ...DEFAULT_STATE,
        tab: "files",
        librarySection: "knowledge",
        kbInstitution: "MCC",
        kbPageId: "abc-123",
      });
    });

    it("falls back safely for an empty/missing kbInstitution or kbPage", () => {
      expect(parseUrlState("?tab=files&librarySection=knowledge")).toEqual({
        ...DEFAULT_STATE,
        tab: "files",
        librarySection: "knowledge",
      });
      expect(parseUrlState("?tab=files&librarySection=knowledge&kbInstitution=&kbPage=")).toEqual({
        ...DEFAULT_STATE,
        tab: "files",
        librarySection: "knowledge",
      });
    });

    it("still parses a valid sub-view even when it belongs to the wrong tab/parent", () => {
      // parseUrlState is a per-field parser; it is the caller's job to decide
      // which sub-view field actually applies to the parsed tab/parent. A
      // manualView param alongside tab=courses, or a buildView/contentView
      // param whose parent doesn't match, is still parsed as given here - not
      // collapsed to a default.
      expect(parseUrlState("?tab=courses&manualView=content")).toEqual({
        ...DEFAULT_STATE,
        tab: "courses",
        manualView: "content",
      });
      expect(parseUrlState("?tab=manual&workflowsView=drafts")).toEqual({
        ...DEFAULT_STATE,
        tab: "manual",
        workflowsView: "drafts",
      });
      // buildView present but manualView is "content", not "course-planning".
      expect(parseUrlState("?tab=manual&manualView=content&buildView=new")).toEqual({
        ...DEFAULT_STATE,
        tab: "manual",
        manualView: "content",
        buildView: "new",
      });
      // contentView present but manualView is "course-planning", not "content".
      expect(parseUrlState("?tab=manual&contentView=assignments")).toEqual({
        ...DEFAULT_STATE,
        tab: "manual",
        contentView: "assignments",
      });
      // A section param belonging to a different merged tab is parsed as
      // given too - it simply never reaches the query string on this tab.
      expect(parseUrlState("?tab=courses&librarySection=knowledge")).toEqual({
        ...DEFAULT_STATE,
        tab: "courses",
        librarySection: "knowledge",
      });
    });
  });

  describe("buildUrlSearch", () => {
    it("builds a bare tab URL for a tab at its default section", () => {
      expect(buildUrlSearch({ ...DEFAULT_STATE, tab: "courses" })).toBe("?tab=courses");
      expect(buildUrlSearch({ ...DEFAULT_STATE, tab: "files" })).toBe("?tab=files");
      expect(buildUrlSearch({ ...DEFAULT_STATE, tab: "course-intel" })).toBe("?tab=course-intel");
    });

    it("omits every sub-view param when the whole branch is at its default", () => {
      // tab=manual with toolsSection/manualView/buildView/contentView all at
      // their defaults should carry no extra params - the common case (AC4).
      expect(buildUrlSearch({ ...DEFAULT_STATE, tab: "manual" })).toBe("?tab=manual");
    });

    it("includes each section param only on its own tab, and only when non-default", () => {
      expect(buildUrlSearch({ ...DEFAULT_STATE, tab: "courses", coursesSection: "tasks" })).toBe(
        "?tab=courses&coursesSection=tasks"
      );
      expect(buildUrlSearch({ ...DEFAULT_STATE, tab: "manual", toolsSection: "workflows" })).toBe(
        "?tab=manual&toolsSection=workflows"
      );
      expect(buildUrlSearch({ ...DEFAULT_STATE, tab: "files", librarySection: "knowledge" })).toBe(
        "?tab=files&librarySection=knowledge"
      );
      // A section belonging to another merged tab never leaks.
      expect(
        buildUrlSearch({
          ...DEFAULT_STATE,
          tab: "course-intel",
          coursesSection: "tasks",
          toolsSection: "workflows",
          librarySection: "knowledge",
        })
      ).toBe("?tab=course-intel");
    });

    it("includes manualView only under Tools > Manual, and only when non-default", () => {
      expect(buildUrlSearch({ ...DEFAULT_STATE, tab: "manual", manualView: "content" })).toBe(
        "?tab=manual&manualView=content"
      );
      expect(
        buildUrlSearch({ ...DEFAULT_STATE, tab: "manual", manualView: "artifact-design", workflowsView: "drafts" })
      ).toBe("?tab=manual&manualView=artifact-design");
      // The Workflows section is showing, so the Manual half's params are not
      // in effect and must not be written.
      expect(
        buildUrlSearch({ ...DEFAULT_STATE, tab: "manual", toolsSection: "workflows", manualView: "content" })
      ).toBe("?tab=manual&toolsSection=workflows");
    });

    it("includes workflowsView only under Tools > Workflows, and only when non-default", () => {
      expect(
        buildUrlSearch({ ...DEFAULT_STATE, tab: "manual", toolsSection: "workflows", workflowsView: "automations" })
      ).toBe("?tab=manual&toolsSection=workflows&workflowsView=automations");
      // The Manual section is showing, so a leftover workflowsView is dropped.
      expect(buildUrlSearch({ ...DEFAULT_STATE, tab: "manual", workflowsView: "automations" })).toBe("?tab=manual");
    });

    it("builds a bare Courses URL when the Tasks section is not showing", () => {
      expect(buildUrlSearch({ ...DEFAULT_STATE, tab: "courses", tasksView: "recurring" })).toBe("?tab=courses");
    });

    it("includes tasksView only under Courses > Tasks, and only when non-default", () => {
      expect(
        buildUrlSearch({ ...DEFAULT_STATE, tab: "courses", coursesSection: "tasks", tasksView: "recurring" })
      ).toBe("?tab=courses&coursesSection=tasks&tasksView=recurring");
      expect(buildUrlSearch({ ...DEFAULT_STATE, tab: "courses", coursesSection: "tasks", tasksView: "term" })).toBe(
        "?tab=courses&coursesSection=tasks"
      );
    });

    it("never includes tasksView for any tab other than Courses, even when it is non-default", () => {
      expect(buildUrlSearch({ ...DEFAULT_STATE, tab: "manual", tasksView: "recurring" })).toBe("?tab=manual");
      expect(buildUrlSearch({ ...DEFAULT_STATE, tab: "files", tasksView: "recurring" })).toBe("?tab=files");
      expect(buildUrlSearch({ ...DEFAULT_STATE, tab: "course-intel", tasksView: "recurring" })).toBe(
        "?tab=course-intel"
      );
    });

    it("drops a sub-view value that belongs to a different tab", () => {
      // A manualView value left over from a previous tab must not leak into
      // a Courses/Library URL, and a workflowsView value must not leak into a
      // Tools > Manual URL.
      expect(
        buildUrlSearch({ ...DEFAULT_STATE, tab: "courses", manualView: "content", workflowsView: "drafts" })
      ).toBe("?tab=courses");
      expect(buildUrlSearch({ ...DEFAULT_STATE, tab: "manual", manualView: "content", workflowsView: "drafts" })).toBe(
        "?tab=manual&manualView=content"
      );
    });

    it("includes buildView only when manual + course-planning, and only when non-default", () => {
      expect(buildUrlSearch({ ...DEFAULT_STATE, tab: "manual", buildView: "new" })).toBe(
        "?tab=manual&buildView=new"
      );
      // manualView stays omitted (it's at its default) even though buildView
      // is present - the default-fallback on parse reconstructs
      // "course-planning" regardless.
      expect(buildUrlSearch({ ...DEFAULT_STATE, tab: "manual", manualView: "course-planning", buildView: "prebuilt" })).toBe(
        "?tab=manual"
      );
    });

    it("drops buildView when manualView is not course-planning", () => {
      expect(
        buildUrlSearch({ ...DEFAULT_STATE, tab: "manual", manualView: "content", buildView: "new" })
      ).toBe("?tab=manual&manualView=content");
    });

    it("includes contentView only when manual + content, and only when non-default", () => {
      expect(
        buildUrlSearch({ ...DEFAULT_STATE, tab: "manual", manualView: "content", contentView: "assignments" })
      ).toBe("?tab=manual&manualView=content&contentView=assignments");
      expect(
        buildUrlSearch({ ...DEFAULT_STATE, tab: "manual", manualView: "content", contentView: "modules" })
      ).toBe("?tab=manual&manualView=content");
    });

    it("drops contentView when manualView is not content", () => {
      expect(
        buildUrlSearch({ ...DEFAULT_STATE, tab: "manual", manualView: "course-planning", contentView: "assignments" })
      ).toBe("?tab=manual");
    });

    // draftsView is retired entirely (GRAD-SUBTAB wave 3, DECISION 19
    // E-full): UrlNavState has no such field any more, so buildUrlSearch has
    // nothing to emit for Drafts beyond workflowsView itself.
    it("emits only workflowsView under workflows + drafts, with nothing below it", () => {
      expect(
        buildUrlSearch({
          ...DEFAULT_STATE,
          tab: "manual",
          toolsSection: "workflows",
          workflowsView: "drafts",
        })
      ).toBe("?tab=manual&toolsSection=workflows&workflowsView=drafts");
    });

    it("omits kbInstitution/kbPage when the Knowledge section has no selection (AC3's common case)", () => {
      expect(buildUrlSearch({ ...DEFAULT_STATE, tab: "files", librarySection: "knowledge" })).toBe(
        "?tab=files&librarySection=knowledge"
      );
    });

    it("includes kbInstitution alone when a page is not (yet) selected", () => {
      expect(
        buildUrlSearch({ ...DEFAULT_STATE, tab: "files", librarySection: "knowledge", kbInstitution: "MCC" })
      ).toBe("?tab=files&librarySection=knowledge&kbInstitution=MCC");
    });

    it("includes kbInstitution and kbPage together when both are set", () => {
      expect(
        buildUrlSearch({
          ...DEFAULT_STATE,
          tab: "files",
          librarySection: "knowledge",
          kbInstitution: "MCC",
          kbPageId: "abc-123",
        })
      ).toBe("?tab=files&librarySection=knowledge&kbInstitution=MCC&kbPage=abc-123");
    });

    it("drops kbPage when kbInstitution is absent - a page id is ambiguous without it (AC2)", () => {
      expect(
        buildUrlSearch({ ...DEFAULT_STATE, tab: "files", librarySection: "knowledge", kbPageId: "abc-123" })
      ).toBe("?tab=files&librarySection=knowledge");
    });

    it("drops kbInstitution/kbPage when the Knowledge section is not showing", () => {
      expect(
        buildUrlSearch({ ...DEFAULT_STATE, tab: "manual", kbInstitution: "MCC", kbPageId: "abc-123" })
      ).toBe("?tab=manual");
      expect(
        buildUrlSearch({ ...DEFAULT_STATE, tab: "files", kbInstitution: "MCC", kbPageId: "abc-123" })
      ).toBe("?tab=files");
    });

    it("builds a representative deep combination for each branch", () => {
      expect(
        buildUrlSearch({
          ...DEFAULT_STATE,
          tab: "manual",
          manualView: "content",
          contentView: "assignments",
        })
      ).toBe("?tab=manual&manualView=content&contentView=assignments");

      expect(
        buildUrlSearch({
          ...DEFAULT_STATE,
          tab: "manual",
          toolsSection: "workflows",
          workflowsView: "drafts",
        })
      ).toBe("?tab=manual&toolsSection=workflows&workflowsView=drafts");

      expect(
        buildUrlSearch({
          ...DEFAULT_STATE,
          tab: "manual",
          manualView: "course-planning",
          buildView: "new",
        })
      ).toBe("?tab=manual&buildView=new");

      expect(
        buildUrlSearch({
          ...DEFAULT_STATE,
          tab: "files",
          librarySection: "knowledge",
          kbInstitution: "MCC",
          kbPageId: "abc-123",
        })
      ).toBe("?tab=files&librarySection=knowledge&kbInstitution=MCC&kbPage=abc-123");
    });
  });

  // No view param is renamed by the merge (D25c). Renaming one would break
  // exactly the class of URL the aliasing above exists to protect, for no
  // benefit - the params are already unique across tabs. Pinned behaviourally,
  // by the strings buildUrlSearch actually emits, rather than by reading the
  // source for a constant.
  describe("no pre-existing view param was renamed", () => {
    it("still emits manualView, buildView, contentView, workflowsView, tasksView, kbInstitution and kbPage", () => {
      expect(
        buildUrlSearch({ ...DEFAULT_STATE, tab: "manual", manualView: "content", contentView: "assignments" })
      ).toContain("manualView=");
      expect(
        buildUrlSearch({ ...DEFAULT_STATE, tab: "manual", manualView: "content", contentView: "assignments" })
      ).toContain("contentView=");
      expect(buildUrlSearch({ ...DEFAULT_STATE, tab: "manual", buildView: "new" })).toContain("buildView=");
      expect(
        buildUrlSearch({ ...DEFAULT_STATE, tab: "manual", manualView: "grading", gradingView: "repos" })
      ).toContain("gradingView=");

      const drafts = buildUrlSearch({
        ...DEFAULT_STATE,
        tab: "manual",
        toolsSection: "workflows",
        workflowsView: "drafts",
      });
      expect(drafts).toContain("workflowsView=");

      expect(
        buildUrlSearch({ ...DEFAULT_STATE, tab: "courses", coursesSection: "tasks", tasksView: "recurring" })
      ).toContain("tasksView=");

      const kb = buildUrlSearch({
        ...DEFAULT_STATE,
        tab: "files",
        librarySection: "knowledge",
        kbInstitution: "MCC",
        kbPageId: "abc-123",
      });
      expect(kb).toContain("kbInstitution=");
      expect(kb).toContain("kbPage=");
    });
  });

  describe("round trips", () => {
    it("preserves every top-level tab through buildUrlSearch -> parseUrlState", () => {
      for (const tab of TAB_ORDER) {
        const state: UrlNavState = { ...DEFAULT_STATE, tab };
        expect(parseUrlState(buildUrlSearch(state))).toEqual(state);
      }
    });

    it("preserves each merged tab's non-default section", () => {
      const tasks: UrlNavState = { ...DEFAULT_STATE, tab: "courses", coursesSection: "tasks" };
      expect(parseUrlState(buildUrlSearch(tasks))).toEqual(tasks);

      const workflows: UrlNavState = { ...DEFAULT_STATE, tab: "manual", toolsSection: "workflows" };
      expect(parseUrlState(buildUrlSearch(workflows))).toEqual(workflows);

      const knowledge: UrlNavState = { ...DEFAULT_STATE, tab: "files", librarySection: "knowledge" };
      expect(parseUrlState(buildUrlSearch(knowledge))).toEqual(knowledge);
    });

    it("preserves tab, section and tasksView for both Tasks sub-views", () => {
      const termState: UrlNavState = {
        ...DEFAULT_STATE,
        tab: "courses",
        coursesSection: "tasks",
        tasksView: "term",
      };
      expect(parseUrlState(buildUrlSearch(termState))).toEqual(termState);

      const recurringState: UrlNavState = {
        ...DEFAULT_STATE,
        tab: "courses",
        coursesSection: "tasks",
        tasksView: "recurring",
      };
      expect(parseUrlState(buildUrlSearch(recurringState))).toEqual(recurringState);
    });

    // I3 (docs/tools-grading-subtab-architecture.md section 6.2): the
    // directional round trip for gradingView. Necessary but not sufficient on
    // its own - it catches an absent emit branch and a param emitted at the
    // default or leaked onto a non-Grading branch, but not a THIRTEENTH param
    // emitted under some other name (that is I4's job, the frozen-oracle
    // extension in tab-rails.test.ts). Both are required.
    it("preserves a non-default gradingView through Grading, and drops it elsewhere (I3)", () => {
      const reposState: UrlNavState = { ...DEFAULT_STATE, tab: "manual", manualView: "grading", gradingView: "repos" };
      const url = buildUrlSearch(reposState);
      expect(url).toBe("?tab=manual&manualView=grading&gradingView=repos");
      expect(parseUrlState(url)).toEqual(reposState);

      // At the default, the param is omitted entirely.
      const runState: UrlNavState = { ...DEFAULT_STATE, tab: "manual", manualView: "grading", gradingView: "run" };
      expect(buildUrlSearch(runState)).toBe("?tab=manual&manualView=grading");
      expect(parseUrlState(buildUrlSearch(runState))).toEqual(runState);

      // A non-default gradingView must never leak onto a branch it does not
      // belong to - the manualView param is still written (it is non-default
      // in its own right), but no gradingView param appears alongside it.
      expect(buildUrlSearch({ ...DEFAULT_STATE, tab: "manual", manualView: "content", gradingView: "repos" })).toBe(
        "?tab=manual&manualView=content"
      );
    });
  });

  // GRAD-SUBTAB wave 1, M10 (docs/tools-grading-subtab-architecture.md
  // section 5.5): "repo-grades" is a RETIRED manualView pointer now - the
  // standalone Repo Grades subtab it named was absorbed into the Grading
  // sub-tab's inner navigation. An old "?manualView=repo-grades" link (or a
  // hand-typed one) must resolve to the Grading chip with its Repo Grades
  // inner item selected, and the canonical value must be written back - an
  // alias is a redirect, not a synonym (tab-sections.ts's own rule for every
  // other retired pointer).
  describe("the retired 'repo-grades' manualView pointer resolves to the Grading sub-tab (M10)", () => {
    it("resolves ?tab=manual&manualView=repo-grades to Grading with its Repo Grades inner item selected", () => {
      const parsed = parseUrlState("?tab=manual&manualView=repo-grades");
      expect(parsed.manualView).toBe("grading");
      expect(parsed.gradingView).toBe("repos");
    });

    it("writes the canonical value back - an alias is a redirect, not a synonym", () => {
      expect(buildUrlSearch(parseUrlState("?tab=manual&manualView=repo-grades"))).toBe(
        "?tab=manual&manualView=grading&gradingView=repos"
      );
    });

    it("is idempotent: the canonical URL parses and rebuilds to itself", () => {
      const canonical = buildUrlSearch(parseUrlState("?tab=manual&manualView=repo-grades"));
      expect(buildUrlSearch(parseUrlState(canonical))).toBe(canonical);
    });

    it("never leaks the retired manualView=repo-grades value into the query string for a non-manual tab", () => {
      expect(parseUrlState("?tab=courses&manualView=repo-grades").tab).toBe("courses");
      expect(buildUrlSearch({ ...DEFAULT_STATE, tab: "courses", manualView: "grading", gradingView: "repos" })).toBe(
        "?tab=courses"
      );
    });
  });

  // The other half of M10: the old LMS Grading destination
  // (?manualView=content&contentView=grading, the "content-view:grading"
  // pointer) also resolves to the Grading sub-tab rather than silently
  // falling back to Modules within LMS once "grading" leaves ContentView.
  describe("the retired 'content-view:grading' pointer resolves to the Grading sub-tab", () => {
    it("resolves ?tab=manual&manualView=content&contentView=grading to Grading with its Submissions inner item selected", () => {
      const parsed = parseUrlState("?tab=manual&manualView=content&contentView=grading");
      expect(parsed.manualView).toBe("grading");
      expect(parsed.gradingView).toBe("run");
      expect(parsed.contentView).toBe("modules");
    });

    it("writes the canonical value back", () => {
      expect(buildUrlSearch(parseUrlState("?tab=manual&manualView=content&contentView=grading"))).toBe(
        "?tab=manual&manualView=grading"
      );
    });
  });

  // GRAD-SUBTAB wave 3 (docs/tools-grading-subtab-wave3-architecture.md
  // section 3.3, instrument I-retired-drafts): Drafted Grades moved from
  // Workflows > Drafts into Tools > Grading's own inner nav. Unlike every
  // pointer above, this one's SOURCE sits in the WORKFLOWS family
  // (toolsSection="workflows") while its TARGET is in the MANUAL family -
  // so resolving it must also force toolsSection itself, not just
  // manualView/gradingView, or the redirect lands the user on Tools >
  // Workflows > Drafts (toolsSection never left "workflows") instead of
  // Tools > Grading > Drafted Grades.
  describe("the retired 'drafts-view:grades' pointer resolves to the Grading sub-tab, crossing toolsSection (I-retired-drafts)", () => {
    it("resolves the canonical legacy URL to manual/grading/drafts, forcing toolsSection to manual even though the URL says workflows", () => {
      const parsed = parseUrlState(
        "?tab=manual&toolsSection=workflows&workflowsView=drafts&draftsView=grades"
      );
      expect(parsed.toolsSection).toBe("manual");
      expect(parsed.manualView).toBe("grading");
      expect(parsed.gradingView).toBe("drafts");
    });

    it("resolves the legacy pre-D25 URL shape the same way", () => {
      const parsed = parseUrlState("?tab=workflows&workflowsView=drafts&draftsView=grades");
      expect(parsed.tab).toBe("manual");
      expect(parsed.toolsSection).toBe("manual");
      expect(parsed.manualView).toBe("grading");
      expect(parsed.gradingView).toBe("drafts");
    });

    it("writes the canonical value back - an alias is a redirect, not a synonym", () => {
      expect(
        buildUrlSearch(parseUrlState("?tab=manual&toolsSection=workflows&workflowsView=drafts&draftsView=grades"))
      ).toBe("?tab=manual&manualView=grading&gradingView=drafts");
    });

    it("is idempotent: the canonical URL parses and rebuilds to itself", () => {
      const canonical = buildUrlSearch(
        parseUrlState("?tab=manual&toolsSection=workflows&workflowsView=drafts&draftsView=grades")
      );
      expect(buildUrlSearch(parseUrlState(canonical))).toBe(canonical);
    });

    it("does not fire for draftsView=messages - only the exact 'grades' pointer redirects", () => {
      const parsed = parseUrlState("?tab=manual&toolsSection=workflows&workflowsView=drafts&draftsView=messages");
      expect(parsed.toolsSection).toBe("workflows");
      expect(parsed.manualView).toBe("course-planning");
    });

    it("resolveGradingPointer resolves the drafts-grades shape directly, and rejects a workflowsView/draftsView pair that is not it", () => {
      expect(resolveGradingPointer(null, null, "drafts", "grades")).toEqual({
        manualView: "grading",
        gradingView: "drafts",
      });
      expect(resolveGradingPointer(null, null, "drafts", "messages")).toBeUndefined();
      expect(resolveGradingPointer(null, null, "automations", "grades")).toBeUndefined();
      // The optional params default to undefined, so every pre-wave-3 2-arg
      // call site (RESIDUAL R-1) keeps compiling and behaving unchanged.
      expect(resolveGradingPointer("repo-grades", null)).toEqual({ manualView: "grading", gradingView: "repos" });
    });
  });
});
