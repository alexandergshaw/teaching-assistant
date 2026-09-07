import { describe, expect, it } from "vitest";
import {
  COURSES_RAIL_ITEMS,
  TOOLS_RAIL_DRAFTS_ID,
  TOOLS_RAIL_ITEMS,
  coursesRailItemFor,
  coursesStateFromRailItem,
  manualRailItemId,
  tasksRailItemId,
  toolsRailItemFor,
  toolsStateFromRailItem,
  workflowsRailItemId,
} from "./tab-rails";
import {
  COURSES_SECTION_ORDER,
  TASKS_VIEW_LABELS,
  TASKS_VIEW_ORDER,
  TOOLS_SECTION_ORDER,
  WORKFLOWS_VIEW_LABELS,
  WORKFLOWS_VIEW_ORDER,
} from "./tab-sections";
import { MANUAL_VIEW_LABELS, MANUAL_VIEW_ORDER } from "../manual/manual-rail";
import { buildUrlSearch, parseUrlState, type UrlNavState } from "../../url-state";

/**
 * D26: the flattened rails. What this file pins, and why each part earns it:
 *
 * 1. COMPLETENESS. Every view of every family the merged tab absorbed has a
 *    chip. A view registered in MANUAL_VIEW_ORDER/WORKFLOWS_VIEW_ORDER/
 *    TASKS_VIEW_ORDER but missing from the rail is unreachable by click while
 *    the type checks, the URL restores it and every other gate stays green -
 *    the exact "ships dead" failure this project has paid for repeatedly.
 *
 * 2. THE PARAM CONTRACT. Each chip writes the param that ALREADY owned its
 *    view. This is the constraint the whole design turns on: the rail is a
 *    presentation over manualView/workflowsView/tasksView, not a new
 *    addressing scheme, so no existing "?manualView=" link breaks.
 *
 * 3. THE SECTION IS DERIVED. Picking a chip sets the section as a consequence
 *    of the family it belongs to, and picking one family's chip never disturbs
 *    the other family's remembered view.
 *
 * 4. ONE LEVEL. Ten Tools chips in one list, three Courses chips in one list,
 *    with nothing between the tab strip and them.
 *
 * What it cannot prove: that any of it RENDERS. vitest here is node-env and
 * collects only src/**\/*.test.ts, so no component is ever mounted. The render
 * side is covered as far as it can be by topLevelTabs.wiring.test.ts's
 * source-text canaries.
 */

describe("the Tools rail is one flat list of both families' views (D26)", () => {
  it("holds exactly the seven Manual views then the three Workflows views, in that order", () => {
    expect(TOOLS_RAIL_ITEMS.map((item) => item.id)).toEqual([
      "manual:course-planning",
      "manual:content",
      "manual:version-control",
      "manual:recording",
      "manual:ppt-design",
      "manual:artifact-design",
      "manual:repo-grades",
      "workflows:workflows",
      "workflows:automations",
      "workflows:drafts",
    ]);
    expect(TOOLS_RAIL_ITEMS).toHaveLength(10);
  });

  it("carries every registered Manual view, derived from MANUAL_VIEW_ORDER rather than restated", () => {
    // Loops the authoritative list on purpose: a Manual view added there is
    // covered by this assertion with no new case to write, and there is no way
    // for this test to pass while a real view has no chip.
    const ids = TOOLS_RAIL_ITEMS.map((item) => item.id);
    for (const view of MANUAL_VIEW_ORDER) {
      expect(ids, `"${view}" is a registered Manual view with no chip in the Tools rail`).toContain(
        manualRailItemId(view)
      );
    }
  });

  it("carries every registered Workflows view, derived from WORKFLOWS_VIEW_ORDER rather than restated", () => {
    const ids = TOOLS_RAIL_ITEMS.map((item) => item.id);
    for (const view of WORKFLOWS_VIEW_ORDER) {
      expect(ids, `"${view}" is a registered Workflows view with no chip in the Tools rail`).toContain(
        workflowsRailItemId(view)
      );
    }
  });

  it("adds nothing the two families did not register", () => {
    expect(TOOLS_RAIL_ITEMS).toHaveLength(MANUAL_VIEW_ORDER.length + WORKFLOWS_VIEW_ORDER.length);
    expect(new Set(TOOLS_RAIL_ITEMS.map((item) => item.id)).size).toBe(TOOLS_RAIL_ITEMS.length);
  });

  it("labels every chip with the label its own family already gave that view", () => {
    for (const item of TOOLS_RAIL_ITEMS) {
      const expected =
        item.section === "manual" ? MANUAL_VIEW_LABELS[item.manualView] : WORKFLOWS_VIEW_LABELS[item.workflowsView];
      expect(item.label).toBe(expected);
      expect(item.label.length).toBeGreaterThan(0);
    }
  });

  it("has no two chips sharing a label, so ten items in one row stay distinguishable", () => {
    // The collision question the flattening had to answer before merging two
    // families into one row. They are disjoint today; this says so out loud.
    const labels = TOOLS_RAIL_ITEMS.map((item) => item.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("has disjoint raw view values across the two families - the fact the prefixed ids stop mattering", () => {
    // Even though the ids are prefixed (so a future collision could not
    // misroute a click), a collision here would still make two chips
    // indistinguishable in any log or bug report that quotes the raw value.
    const manual = new Set<string>(MANUAL_VIEW_ORDER);
    for (const view of WORKFLOWS_VIEW_ORDER) {
      expect(manual.has(view), `"${view}" is both a Manual view and a Workflows view`).toBe(false);
    }
  });

  it("splits every chip into exactly one of the two Tools sections", () => {
    const sections = new Set(TOOLS_RAIL_ITEMS.map((item) => item.section));
    expect([...sections].sort()).toEqual([...TOOLS_SECTION_ORDER].sort());
  });

  it("names the Drafts chip through the rail's own builder, so the badge cannot be hung on a stale id", () => {
    expect(TOOLS_RAIL_DRAFTS_ID).toBe(workflowsRailItemId("drafts"));
    expect(TOOLS_RAIL_ITEMS.map((item) => item.id)).toContain(TOOLS_RAIL_DRAFTS_ID);
  });
});

describe("picking a Tools chip writes the param that already owned that view", () => {
  it("routes every Manual chip to manualView + the Manual section, leaving workflowsView alone", () => {
    for (const view of MANUAL_VIEW_ORDER) {
      const next = toolsStateFromRailItem(manualRailItemId(view), "workflows", "recording", "drafts");
      expect(next.manualView, `chip for "${view}" did not write manualView`).toBe(view);
      expect(next.toolsSection).toBe("manual");
      // The other family keeps whatever the user last had there.
      expect(next.workflowsView).toBe("drafts");
    }
  });

  it("routes every Workflows chip to workflowsView + the Workflows section, leaving manualView alone", () => {
    for (const view of WORKFLOWS_VIEW_ORDER) {
      const next = toolsStateFromRailItem(workflowsRailItemId(view), "manual", "recording", "workflows");
      expect(next.workflowsView, `chip for "${view}" did not write workflowsView`).toBe(view);
      expect(next.toolsSection).toBe("workflows");
      expect(next.manualView).toBe("recording");
    }
  });

  it("leaves everything untouched for an id the rail does not contain", () => {
    const next = toolsStateFromRailItem("manual:not-a-view", "workflows", "recording", "drafts");
    expect(next).toEqual({ toolsSection: "workflows", manualView: "recording", workflowsView: "drafts" });
  });

  it("round-trips: the chip a state resolves to writes that same state back", () => {
    for (const item of TOOLS_RAIL_ITEMS) {
      const written = toolsStateFromRailItem(item.id, "manual", "course-planning", "workflows");
      const highlighted = toolsRailItemFor(written.toolsSection, written.manualView, written.workflowsView);
      expect(highlighted).toBe(item.id);
    }
  });
});

describe("the highlighted Tools chip is derived from the params, never stored", () => {
  it("reads the Manual family's chip when the Manual section is showing", () => {
    for (const view of MANUAL_VIEW_ORDER) {
      expect(toolsRailItemFor("manual", view, "drafts")).toBe(manualRailItemId(view));
    }
  });

  it("reads the Workflows family's chip when the Workflows section is showing", () => {
    for (const view of WORKFLOWS_VIEW_ORDER) {
      expect(toolsRailItemFor("workflows", "recording", view)).toBe(workflowsRailItemId(view));
    }
  });

  it("ignores the other family's view entirely - the section is what picks the family", () => {
    // Both families always have a remembered view; only the section says which
    // one is on screen. This is the reason the section value survived D26 even
    // though the control that set it did not.
    expect(toolsRailItemFor("manual", "repo-grades", "automations")).toBe("manual:repo-grades");
    expect(toolsRailItemFor("workflows", "repo-grades", "automations")).toBe("workflows:automations");
  });
});

describe("the Courses rail is one flat list: Courses plus the two Tasks views (D26)", () => {
  it("holds exactly three chips, in that order", () => {
    expect(COURSES_RAIL_ITEMS.map((item) => item.id)).toEqual(["courses", "tasks:term", "tasks:recurring"]);
  });

  it("carries every registered Tasks view, derived from TASKS_VIEW_ORDER rather than restated", () => {
    const ids = COURSES_RAIL_ITEMS.map((item) => item.id);
    for (const view of TASKS_VIEW_ORDER) {
      expect(ids, `"${view}" is a registered Tasks view with no chip in the Courses rail`).toContain(
        tasksRailItemId(view)
      );
    }
    expect(COURSES_RAIL_ITEMS).toHaveLength(1 + TASKS_VIEW_ORDER.length);
  });

  it("keeps the wording the deleted TasksTab subnav used", () => {
    const byId = new Map(COURSES_RAIL_ITEMS.map((item) => [item.id, item.label]));
    expect(byId.get("courses")).toBe("Courses");
    expect(byId.get("tasks:term")).toBe(TASKS_VIEW_LABELS.term);
    expect(byId.get("tasks:recurring")).toBe(TASKS_VIEW_LABELS.recurring);
  });

  it("splits every chip into exactly one of the two Courses sections", () => {
    const sections = new Set(COURSES_RAIL_ITEMS.map((item) => item.section));
    expect([...sections].sort()).toEqual([...COURSES_SECTION_ORDER].sort());
  });

  it("has no two chips sharing a label", () => {
    const labels = COURSES_RAIL_ITEMS.map((item) => item.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe("picking a Courses chip writes the param that already owned that view", () => {
  it("routes each Tasks chip to tasksView + the Tasks section", () => {
    for (const view of TASKS_VIEW_ORDER) {
      const next = coursesStateFromRailItem(tasksRailItemId(view), "courses", view === "term" ? "recurring" : "term");
      expect(next.tasksView, `chip for "${view}" did not write tasksView`).toBe(view);
      expect(next.coursesSection).toBe("tasks");
    }
  });

  it("routes the Courses chip to the Courses section, leaving the remembered Tasks view alone", () => {
    const next = coursesStateFromRailItem("courses", "tasks", "recurring");
    expect(next.coursesSection).toBe("courses");
    expect(next.tasksView).toBe("recurring");
  });

  it("leaves everything untouched for an id the rail does not contain", () => {
    expect(coursesStateFromRailItem("tasks:not-a-view", "tasks", "recurring")).toEqual({
      coursesSection: "tasks",
      tasksView: "recurring",
    });
  });

  it("round-trips: the chip a state resolves to writes that same state back", () => {
    for (const item of COURSES_RAIL_ITEMS) {
      const written = coursesStateFromRailItem(item.id, "courses", "term");
      expect(coursesRailItemFor(written.coursesSection, written.tasksView)).toBe(item.id);
    }
  });

  it("highlights the Courses chip regardless of the remembered Tasks view", () => {
    expect(coursesRailItemFor("courses", "recurring")).toBe("courses");
    expect(coursesRailItemFor("tasks", "recurring")).toBe("tasks:recurring");
  });
});

// The rails deleted the intermediate nav level; the URL contract was
// deliberately left alone. This block is the frozen oracle for that promise,
// because the tempting alternative - one new param with aliases for the old
// ones - would type-check, round-trip, and break every existing "?manualView="
// link in the wild with nothing to reveal it.
//
// It lives here rather than in url-state.test.ts for two reasons: that file was
// three lines under this repo's 1000-line ceiling, and the property is really
// about the RAILS - "flattening the navigation changed no address" is a claim
// about this module, checked through the URL module it must not have disturbed.
//
// DEFAULT_STATE below is a deliberate duplicate of url-state.test.ts's own
// fixture, not an import: importing across *.test.ts files re-runs the other
// file's describe blocks.
const DEFAULT_STATE: UrlNavState = {
  tab: "manual",
  coursesSection: "courses",
  toolsSection: "manual",
  librarySection: "files",
  manualView: "course-planning",
  workflowsView: "workflows",
  buildView: "prebuilt",
  contentView: "modules",
  draftsView: "grades",
  tasksView: "term",
  kbInstitution: null,
  kbPageId: null,
};
describe("no view param was renamed or retired by the flattening (D26)", () => {
  // Frozen literals on purpose: derived from the module they are checking,
  // these would agree with a rename and prove nothing. The whole point is that
  // this list is written down somewhere the rename cannot reach.
  const EXPECTED_PARAM_NAMES = [
    "tab",
    "coursesSection",
    "toolsSection",
    "librarySection",
    "manualView",
    "workflowsView",
    "buildView",
    "contentView",
    "draftsView",
    "tasksView",
    "kbInstitution",
    "kbPage",
  ];

  /** Every param name buildUrlSearch can emit, gathered by driving it through
   *  one state per branch rather than by reading its source. */
  function emittedParamNames(): string[] {
    const states: UrlNavState[] = [
      { ...DEFAULT_STATE, tab: "courses" },
      { ...DEFAULT_STATE, tab: "courses", coursesSection: "tasks", tasksView: "recurring" },
      { ...DEFAULT_STATE, tab: "manual", manualView: "content", contentView: "pages" },
      { ...DEFAULT_STATE, tab: "manual", manualView: "course-planning", buildView: "new" },
      {
        ...DEFAULT_STATE,
        tab: "manual",
        toolsSection: "workflows",
        workflowsView: "drafts",
        draftsView: "messages",
      },
      { ...DEFAULT_STATE, tab: "files" },
      {
        ...DEFAULT_STATE,
        tab: "files",
        librarySection: "knowledge",
        kbInstitution: "ACME",
        kbPageId: "page-1",
      },
      { ...DEFAULT_STATE, tab: "course-intel" },
    ];
    const names = new Set<string>();
    for (const state of states) {
      for (const key of new URLSearchParams(buildUrlSearch(state)).keys()) names.add(key);
    }
    return [...names].sort();
  }

  it("emits exactly the twelve param names it emitted before the flattening", () => {
    expect(emittedParamNames()).toEqual([...EXPECTED_PARAM_NAMES].sort());
  });

  it("still reads each view param back under its own name", () => {
    // The direction a rename would break first: an old link arriving with the
    // old name. Each of these names a view whose chip moved into a flattened
    // rail, so each is one the flattening had the opportunity to rename.
    expect(parseUrlState("?tab=manual&manualView=recording").manualView).toBe("recording");
    expect(parseUrlState("?tab=manual&toolsSection=workflows&workflowsView=automations").workflowsView).toBe(
      "automations"
    );
    expect(parseUrlState("?tab=courses&coursesSection=tasks&tasksView=recurring").tasksView).toBe("recurring");
    expect(parseUrlState("?tab=manual&manualView=content&contentView=quizzes").contentView).toBe("quizzes");
    expect(
      parseUrlState("?tab=manual&toolsSection=workflows&workflowsView=drafts&draftsView=messages").draftsView
    ).toBe("messages");
    expect(parseUrlState("?tab=files&librarySection=knowledge&kbInstitution=acme&kbPage=p1").kbInstitution).toBe(
      "ACME"
    );
    expect(parseUrlState("?tab=files&librarySection=knowledge&kbInstitution=acme&kbPage=p1").kbPageId).toBe("p1");
  });

  it("has not invented a rail-item param - the rail is a presentation, not an address", () => {
    // A chip id ("manual:recording") must never reach the query string: that
    // would be the new addressing scheme this design exists to avoid, and it
    // would make the chip ids - an internal detail chosen for lookup safety -
    // into a public contract.
    const everything = buildUrlSearch({
      ...DEFAULT_STATE,
      tab: "manual",
      toolsSection: "workflows",
      workflowsView: "drafts",
      draftsView: "messages",
    });
    expect(everything).not.toContain("manual:");
    expect(everything).not.toContain("workflows:drafts");
    expect(everything).not.toContain("railItem");
    expect(everything).toBe("?tab=manual&toolsSection=workflows&workflowsView=drafts&draftsView=messages");
  });
});
