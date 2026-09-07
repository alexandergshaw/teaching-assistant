import { describe, expect, it } from "vitest";
import * as tabSections from "./tab-sections";
import {
  COURSES_SECTION_LABELS,
  COURSES_SECTION_ORDER,
  DEFAULT_COURSES_SECTION,
  DEFAULT_DESTINATION,
  DEFAULT_LIBRARY_SECTION,
  DEFAULT_TAB,
  DEFAULT_TOOLS_SECTION,
  LIBRARY_SECTION_LABELS,
  LIBRARY_SECTION_ORDER,
  RETIRED_TAB_DESTINATIONS,
  TAB_LABELS,
  TAB_ORDER,
  TASKS_VIEW_LABELS,
  TASKS_VIEW_ORDER,
  TOOLS_SECTION_ORDER,
  WORKFLOWS_VIEW_LABELS,
  WORKFLOWS_VIEW_ORDER,
  isRetiredTabValue,
} from "./tab-sections";

// The registry itself: the ordered lists every other part of the navigation
// derives from. Nothing here reads the URL or renders anything - those live in
// url-state.test.ts and topLevelTabs.wiring.test.ts respectively. What this
// file pins is the shape the other two assume.

describe("the four top-level tabs (D25a)", () => {
  it("lists exactly four, in strip order", () => {
    expect([...TAB_ORDER]).toEqual(["courses", "manual", "files", "course-intel"]);
  });

  it("has a non-empty label for every tab, and no duplicates", () => {
    const labels = TAB_ORDER.map((tab) => TAB_LABELS[tab]);
    for (const label of labels) expect(label.length).toBeGreaterThan(0);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("keeps the app's landing tab inside the strip", () => {
    expect(TAB_ORDER).toContain(DEFAULT_TAB);
    expect(DEFAULT_DESTINATION.tab).toBe(DEFAULT_TAB);
  });
});

describe("each merged tab's sections", () => {
  it("holds the two former tabs it absorbed, in switch order", () => {
    expect([...COURSES_SECTION_ORDER]).toEqual(["courses", "tasks"]);
    expect([...TOOLS_SECTION_ORDER]).toEqual(["manual", "workflows"]);
    expect([...LIBRARY_SECTION_ORDER]).toEqual(["files", "knowledge"]);
  });

  it("labels every section that is still its own rail item", () => {
    for (const section of COURSES_SECTION_ORDER) expect(COURSES_SECTION_LABELS[section]).toBeTruthy();
    for (const section of LIBRARY_SECTION_ORDER) expect(LIBRARY_SECTION_LABELS[section]).toBeTruthy();
  });

  it("has no label map for the Tools sections, whose switch D26 deleted", () => {
    // "Manual" and "Workflows" were the two halves of a control the user no
    // longer sees: both families are represented in the flattened rail by
    // their own views instead. A label map left behind for a deleted control
    // is a registration describing a screen that does not exist, which this
    // repo has already been bitten by once (see topLevelTabs.wiring.test.ts's
    // own header on the canary that had to move).
    const registry = tabSections as Record<string, unknown>;
    expect(Object.keys(registry)).not.toContain("TOOLS_SECTION_LABELS");
    // The ORDER survives - it is what still validates the toolsSection param.
    expect([...TOOLS_SECTION_ORDER]).toEqual(["manual", "workflows"]);
  });

  it("defaults each merged tab to the half whose tab value survived the merge", () => {
    // This is what keeps a bare "?tab=courses"/"?tab=manual"/"?tab=files" -
    // and there are plenty of those in the wild - landing exactly where it
    // landed before the merge, carrying no new param.
    expect(DEFAULT_COURSES_SECTION).toBe("courses");
    expect(DEFAULT_TOOLS_SECTION).toBe("manual");
    expect(DEFAULT_LIBRARY_SECTION).toBe("files");
    expect(COURSES_SECTION_ORDER).toContain(DEFAULT_COURSES_SECTION);
    expect(TOOLS_SECTION_ORDER).toContain(DEFAULT_TOOLS_SECTION);
    expect(LIBRARY_SECTION_ORDER).toContain(DEFAULT_LIBRARY_SECTION);
  });

  it("gives the default destination every tab's default section", () => {
    expect(DEFAULT_DESTINATION).toEqual({
      tab: "manual",
      coursesSection: "courses",
      toolsSection: "manual",
      librarySection: "files",
    });
  });
});

// D26. These two ordered lists moved here from url-state.ts so the flattened
// rails could be BUILT from them rather than restating their members. Both the
// rail and url-state's own validator now derive from these, so anything wrong
// here is wrong in two places at once - which is exactly why they are pinned.
describe("the view families the flattened rails are built from", () => {
  it("lists the Workflows views in rail order, with a label each", () => {
    expect([...WORKFLOWS_VIEW_ORDER]).toEqual(["workflows", "automations", "drafts"]);
    for (const view of WORKFLOWS_VIEW_ORDER) expect(WORKFLOWS_VIEW_LABELS[view]).toBeTruthy();
    expect(WORKFLOWS_VIEW_LABELS.drafts).toBe("Drafts");
  });

  it("lists the Tasks views in rail order, keeping the wording the deleted subnav used", () => {
    expect([...TASKS_VIEW_ORDER]).toEqual(["term", "recurring"]);
    expect(TASKS_VIEW_LABELS.term).toBe("Term Setup");
    expect(TASKS_VIEW_LABELS.recurring).toBe("Daily / Weekly");
  });
});

describe("the retired tab values (D25b)", () => {
  it("names exactly the three that stopped being tabs", () => {
    expect(Object.keys(RETIRED_TAB_DESTINATIONS).sort()).toEqual(["knowledge", "tasks", "workflows"]);
    expect(isRetiredTabValue("tasks")).toBe(true);
    expect(isRetiredTabValue("workflows")).toBe(true);
    expect(isRetiredTabValue("knowledge")).toBe(true);
    expect(isRetiredTabValue("manual")).toBe(false);
    expect(isRetiredTabValue("")).toBe(false);
    expect(isRetiredTabValue(null)).toBe(false);
    expect(isRetiredTabValue(7)).toBe(false);
  });

  it("is disjoint from the live tab values, so an alias can never be ambiguous", () => {
    // If a value were both a retired alias and a live tab, "which wins" would
    // be a coin flip decided by the order of two ifs in a resolver.
    for (const legacy of Object.keys(RETIRED_TAB_DESTINATIONS)) {
      expect(TAB_ORDER).not.toContain(legacy);
    }
  });

  it("sends each retired value to a live tab, with the section it named", () => {
    expect(RETIRED_TAB_DESTINATIONS.tasks.tab).toBe("courses");
    expect(RETIRED_TAB_DESTINATIONS.tasks.coursesSection).toBe("tasks");
    expect(RETIRED_TAB_DESTINATIONS.workflows.tab).toBe("manual");
    expect(RETIRED_TAB_DESTINATIONS.workflows.toolsSection).toBe("workflows");
    expect(RETIRED_TAB_DESTINATIONS.knowledge.tab).toBe("files");
    expect(RETIRED_TAB_DESTINATIONS.knowledge.librarySection).toBe("knowledge");

    for (const destination of Object.values(RETIRED_TAB_DESTINATIONS)) {
      expect(TAB_ORDER).toContain(destination.tab);
    }
  });

  it("differs from the default destination in every case - a redirect, not a no-op", () => {
    // A retired value whose destination equalled the default would be
    // indistinguishable from having no alias at all, which is the exact
    // silent bounce this table exists to prevent.
    for (const destination of Object.values(RETIRED_TAB_DESTINATIONS)) {
      expect(destination).not.toEqual(DEFAULT_DESTINATION);
    }
  });
});
