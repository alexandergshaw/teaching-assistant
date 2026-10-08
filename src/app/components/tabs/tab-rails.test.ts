import { describe, expect, it } from "vitest";
import {
  COURSES_RAIL_ITEMS,
  TOOLS_RAIL_ITEMS,
  coursesRailItemFor,
  coursesStateFromRailItem,
  manualRailItemId,
  tasksRailItemId,
  toolsRailItemFor,
  toolsStateFromRailItem,
} from "./tab-rails";
import {
  COURSES_SECTION_ORDER,
  TASKS_VIEW_LABELS,
  TASKS_VIEW_ORDER,
  TOOLS_SECTION_ORDER,
} from "./tab-sections";
import { MANUAL_VIEW_LABELS, MANUAL_VIEW_ORDER } from "../manual/manual-rail";
import { buildUrlSearch, parseUrlState, type UrlNavState } from "../../url-state";

/**
 * D26: the flattened rails. What this file pins, and why each part earns it:
 *
 * 1. COMPLETENESS. Every view of every family the merged tab absorbed has a
 *    chip. A view registered in MANUAL_VIEW_ORDER/
 *    TASKS_VIEW_ORDER but missing from the rail is unreachable by click while
 *    the type checks, the URL restores it and every other gate stays green -
 *    the exact "ships dead" failure this project has paid for repeatedly.
 *
 * 2. THE PARAM CONTRACT. Each chip writes the param that ALREADY owned its
 *    view. This is the constraint the whole design turns on: the rail is a
 *    presentation over manualView/tasksView, not a new
 *    addressing scheme, so no existing "?manualView=" link breaks. (W2: the
 *    Workflows family retired into the Automate container; its raw
 *    workflowsView param is aliased - see the oracle at the foot of the file.)
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

describe("the Tools rail is one flat list of the Manual views (D26; WORKFLOWS-COLLAPSE W2 dissolved the Workflows family)", () => {
  it("holds exactly the eight Manual views, in order", () => {
    expect(TOOLS_RAIL_ITEMS.map((item) => item.id)).toEqual([
      "manual:course-planning",
      "manual:content",
      "manual:version-control",
      "manual:recording",
      "manual:artifact-design",
      "manual:presentations",
      "manual:announcements",
      "manual:grading",
    ]);
    // WORKFLOWS-COLLAPSE: 11 (post-fold) -> 10 (W1, Drafts to Library) -> 8 (W2,
    // Workflows + Automations into the Automate container).
    expect(TOOLS_RAIL_ITEMS).toHaveLength(8);
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

  it("adds nothing the Manual family did not register", () => {
    expect(TOOLS_RAIL_ITEMS).toHaveLength(MANUAL_VIEW_ORDER.length);
    expect(new Set(TOOLS_RAIL_ITEMS.map((item) => item.id)).size).toBe(TOOLS_RAIL_ITEMS.length);
  });

  it("labels every chip with the label the Manual family gave that view", () => {
    for (const item of TOOLS_RAIL_ITEMS) {
      expect(item.label).toBe(MANUAL_VIEW_LABELS[item.manualView]);
      expect(item.label.length).toBeGreaterThan(0);
    }
  });

  it("relabels the artifact-design chip to Automate (the container; value unchanged)", () => {
    const chip = TOOLS_RAIL_ITEMS.find((item) => item.id === "manual:artifact-design");
    expect(chip?.label).toBe("Automate");
  });

  it("has no two chips sharing a label, so eight items in one row stay distinguishable", () => {
    const labels = TOOLS_RAIL_ITEMS.map((item) => item.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("is a single Tools section - the Workflows section is gone", () => {
    const sections = new Set(TOOLS_RAIL_ITEMS.map((item) => item.section));
    expect([...sections].sort()).toEqual([...TOOLS_SECTION_ORDER].sort());
    expect([...sections]).toEqual(["manual"]);
  });

  it("carries no Workflows-family chip: Drafts went to Library (W1), Workflows + Automations into Automate (W2)", () => {
    const ids: string[] = TOOLS_RAIL_ITEMS.map((item) => item.id);
    expect(ids).not.toContain("workflows:drafts");
    expect(ids).not.toContain("workflows:workflows");
    expect(ids).not.toContain("workflows:automations");
    expect(ids.filter((id) => id.startsWith("workflows:"))).toEqual([]);
  });
});

describe("picking a Tools chip writes the param that already owned that view", () => {
  it("routes every Manual chip to manualView + the Manual section", () => {
    for (const view of MANUAL_VIEW_ORDER) {
      const next = toolsStateFromRailItem(manualRailItemId(view), "manual", "recording");
      expect(next.manualView, `chip for "${view}" did not write manualView`).toBe(view);
      expect(next.toolsSection).toBe("manual");
    }
  });

  it("leaves everything untouched for an id the rail does not contain (including a retired workflows id)", () => {
    expect(toolsStateFromRailItem("manual:not-a-view", "manual", "recording")).toEqual({
      toolsSection: "manual",
      manualView: "recording",
    });
    expect(toolsStateFromRailItem("workflows:automations", "manual", "recording")).toEqual({
      toolsSection: "manual",
      manualView: "recording",
    });
  });

  it("round-trips: the chip a state resolves to writes that same state back", () => {
    for (const item of TOOLS_RAIL_ITEMS) {
      const written = toolsStateFromRailItem(item.id, "manual", "course-planning");
      expect(toolsRailItemFor(written.manualView)).toBe(item.id);
    }
  });
});

describe("the highlighted Tools chip is derived from the params, never stored", () => {
  it("reads the Manual family's chip for every Manual view", () => {
    for (const view of MANUAL_VIEW_ORDER) {
      expect(toolsRailItemFor(view)).toBe(manualRailItemId(view));
    }
    expect(toolsRailItemFor("grading")).toBe("manual:grading");
  });
});

describe("the Courses rail is one flat list: Courses, the two Tasks views, and One-Off Tasks (D26)", () => {
  it("holds exactly four chips, in that order", () => {
    expect(COURSES_RAIL_ITEMS.map((item) => item.id)).toEqual(["courses", "tasks:term", "tasks:recurring", "oneoff"]);
  });

  it("carries every registered Tasks view, derived from TASKS_VIEW_ORDER rather than restated", () => {
    const ids = COURSES_RAIL_ITEMS.map((item) => item.id);
    for (const view of TASKS_VIEW_ORDER) {
      expect(ids, `"${view}" is a registered Tasks view with no chip in the Courses rail`).toContain(
        tasksRailItemId(view)
      );
    }
    expect(COURSES_RAIL_ITEMS).toHaveLength(2 + TASKS_VIEW_ORDER.length);
  });

  it("keeps the wording the deleted TasksTab subnav used", () => {
    const byId = new Map(COURSES_RAIL_ITEMS.map((item) => [item.id, item.label]));
    expect(byId.get("courses")).toBe("Courses");
    expect(byId.get("tasks:term")).toBe(TASKS_VIEW_LABELS.term);
    expect(byId.get("tasks:recurring")).toBe(TASKS_VIEW_LABELS.recurring);
    expect(byId.get("oneoff")).toBe("One-Off Tasks");
  });

  it("splits every chip into exactly one of the Courses sections", () => {
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
  automateView: "templates",
  buildView: "prebuilt",
  contentView: "modules",
  gradingView: "run",
  presentationsView: "slide-deck",
  announcementsView: "post",
  tasksView: "term",
  kbInstitution: null,
  kbPageId: null,
};
describe("no view param was renamed or retired by the flattening (D26)", () => {
  // Frozen literals on purpose: derived from the module they are checking,
  // these would agree with a rename and prove nothing. The whole point is that
  // this list is written down somewhere the rename cannot reach.
  //
  // "draftsView" LEFT this list in GRAD-SUBTAB wave 3 (DECISION 19, E-full):
  // Drafted Grades moved out of Drafts into Tools > Grading's own inner nav,
  // and Drafts (now message-only) has nothing left below workflowsView to
  // address - this is a genuine retirement, the B6.2 accounting shape this
  // frozen list exists to catch, not a drift.
  //
  // "workflowsView" and "toolsSection" LEFT this list in WORKFLOWS-COLLAPSE W2
  // (retired by ALIAS, not deleted): the Workflows section dissolved into the
  // Automate container, so buildUrlSearch never emits either again, while
  // parseUrlState still READS both - a legacy workflowsView=workflows|automations
  // link lands on Automate > Workflows|Automations (asserted below and in
  // url-state.automate-collapse.test.ts). "automateView" is the new param.
  const EXPECTED_PARAM_NAMES = [
    "tab",
    "coursesSection",
    "librarySection",
    "manualView",
    "automateView",
    "buildView",
    "contentView",
    "gradingView",
    "announcementsView",
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
      { ...DEFAULT_STATE, tab: "manual", manualView: "grading", gradingView: "repos" },
      { ...DEFAULT_STATE, tab: "manual", manualView: "announcements", announcementsView: "walkthrough" },
      { ...DEFAULT_STATE, tab: "manual", manualView: "course-planning", buildView: "new" },
      { ...DEFAULT_STATE, tab: "manual", manualView: "artifact-design", automateView: "automations" },
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

  it("emits exactly the frozen param names (twelve after ANNOUNCEMENTS-TAB A-W1 added announcementsView; draftsView left in GRAD-SUBTAB wave 3)", () => {
    expect(emittedParamNames()).toEqual([...EXPECTED_PARAM_NAMES].sort());
  });

  it("still reads each view param back under its own name", () => {
    // The direction a rename would break first: an old link arriving with the
    // old name. Each of these names a view whose chip moved into a flattened
    // rail, so each is one the flattening had the opportunity to rename.
    expect(parseUrlState("?tab=manual&manualView=recording").manualView).toBe("recording");
    // workflowsView is retired by ALIAS: an old link still resolves, to its new home.
    const legacy = parseUrlState("?tab=manual&toolsSection=workflows&workflowsView=automations");
    expect(legacy.manualView).toBe("artifact-design");
    expect(legacy.automateView).toBe("automations");
    expect(parseUrlState("?tab=manual&manualView=artifact-design&automateView=workflows").automateView).toBe(
      "workflows"
    );
    expect(parseUrlState("?tab=courses&coursesSection=tasks&tasksView=recurring").tasksView).toBe("recurring");
    expect(parseUrlState("?tab=manual&manualView=content&contentView=quizzes").contentView).toBe("quizzes");
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
      manualView: "artifact-design",
      automateView: "automations",
    });
    expect(everything).not.toContain("manual:");
    expect(everything).not.toContain("workflows:automations");
    expect(everything).not.toContain("railItem");
    expect(everything).toBe("?tab=manual&manualView=artifact-design&automateView=automations");
  });
});
