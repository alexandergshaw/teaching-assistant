import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  RETIRED_TAB_DESTINATIONS,
  TAB_LABELS,
  TAB_ORDER,
  WORKFLOWS_VIEW_ORDER,
  isRetiredTabValue,
  type ActiveTab,
} from "./tab-sections";
import { TOOLS_RAIL_ITEMS, coursesRailItemFor, toolsRailItemFor } from "./tab-rails";
import { MANUAL_VIEW_ORDER } from "../manual/manual-rail";
import { isActiveTab, parseUrlState, resolveTabDestination } from "../../url-state";

/**
 * The reachability canary, and it exists because everything else missed.
 *
 * IT MOVED AND IT WIDENED. It used to live in
 * src/app/components/course-intel/ and assert facts about manual-rail.ts and
 * `manualView === "course-intel"`. Course Intel is a top-level tab now (D24a)
 * and six top-level tabs became four (D25), so every one of those facts is
 * false - and a canary describing a registration that no longer exists is
 * WORSE than no canary at all, because it reads as coverage while checking
 * nothing.
 *
 * WHAT IT COVERS NOW, and why each part earns its place:
 *
 * 1. Every tab in the runtime value set. `ActiveTab` is a union - tsc catches
 *    a missing render branch nowhere - while the set behind `isActiveTab` is a
 *    RUNTIME Set that `normalizeActiveTab` consults. Forget the set and the
 *    tab type-checks, the strip renders, and every URL or restored session
 *    bounces silently to another tab.
 *
 * 2. Every tab in the strip. page.tsx maps TAB_ORDER, so this asserts the map
 *    is really there rather than a hand-written list that can drop one.
 *
 * 3. Every tab with a render branch in page.tsx. When this feature's own
 *    implementer deleted a render branch as a sabotage check, ALL TESTS STILL
 *    PASSED. The strip highlights the right tab, the URL restores the right
 *    value, every gate is green, and the pane is blank. This project has
 *    shipped that exact failure three times.
 *
 * 4. Every RETIRED tab value still resolving to its new home. This is the only
 *    automated protection against the silent bounce D25b describes, since
 *    nothing else in the app ever reads an old URL. A normaliser that quietly
 *    returns the default for "?tab=knowledge" is indistinguishable from one
 *    that handles it until a user opens a year-old bookmark.
 *
 * 5. The recording surface still being a display toggle rather than a
 *    conditional render (D25d). Getting that one wrong unmounts an in-progress
 *    screen capture, which to the person losing it is not a rendering bug.
 *
 * 6. D26: each merged tab having exactly ONE navigation level, and each of the
 *    flattened rail's items having somewhere to land. The flattening deleted
 *    three controls that lived a level below the tab strip - the Manual rail's
 *    first row, the Workflows subnav, and TasksTab's own two-item switch - and
 *    a flattening that leaves any one of them behind has not flattened
 *    anything; it has added a tenth chip above a control that still exists.
 *    Nothing else in this repo can see a second nav row: no test renders one.
 *
 * A source-text assertion is a blunt instrument and it is the only instrument
 * available here: vitest in this repo is node-env and collects only
 * `src/**\/*.test.ts`, so no component is ever rendered and no test can
 * observe that a pane painted something. Reading the file that is supposed to
 * render it is the closest available proxy.
 *
 * WHAT THIS CANNOT PROVE, stated so nobody trusts it further than it goes:
 * that any component renders anything, that a branch is reachable at runtime,
 * or that the props are right. It proves the registration, the render site and
 * the redirect exist. That is the difference between "ships dead" and "ships
 * wrong", and only the first one has bitten this project.
 */

const PAGE = join(process.cwd(), "src", "app", "page.tsx");
const NAV_HOOK = join(process.cwd(), "src", "app", "components", "home", "useAppNavigation.ts");
// The three files that used to render the level D26 removed. Each is read to
// prove the row is really gone rather than merely duplicated by the new rail.
const MANUAL_RAIL = join(process.cwd(), "src", "app", "components", "manual", "ManualRail.tsx");
const WORKFLOWS_PANEL = join(process.cwd(), "src", "app", "components", "home", "WorkflowsPanel.tsx");
const TASKS_TAB = join(process.cwd(), "src", "app", "components", "TasksTab.tsx");

function read(path: string): string {
  return readFileSync(path, "utf8");
}

/**
 * Source with comments removed, for the D26 assertions that a deleted control
 * is really gone.
 *
 * Necessary, not tidiness: every one of those three files now carries a note
 * saying which prop it stopped taking and why, and a bare `not.toContain` sees
 * the prose and reports the row as still present. This repo has already learned
 * that lesson once in the CSS-class guards, whose own stripSourceComments
 * docstring records two failures that were both accurate prose - "a guard that
 * goes red on an accurate comment teaches people to delete comments".
 *
 * Same conservative rule as those guards: block comments anywhere (which covers
 * JSX `{/* ... *\/}` too), line comments only when `//` opens the line, so a
 * trailing comment after real code cannot hide a real reference.
 */
function readWithoutComments(path: string): string {
  return read(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

/** The JSX render-branch opener for one tab, as page.tsx spells it. */
function renderBranchGuard(tab: ActiveTab): string {
  return `{activeTab === "${tab}" &&`;
}

/**
 * The slice of page.tsx belonging to one tab's render branch: from its own
 * guard up to the next tab's guard (or the end of the file for the last one).
 *
 * Bounding the search matters. An unbounded indexOf from a tab's guard finds
 * markup that belongs to a LATER tab, so "the Library branch renders a section
 * switch" would be satisfied by the Courses branch's switch and pass while
 * half of Library is unreachable.
 */
function branchSlice(source: string, tab: ActiveTab): string {
  const start = source.indexOf(renderBranchGuard(tab));
  expect(start, `src/app/page.tsx has no render branch for "${tab}"`).toBeGreaterThan(-1);
  const nextStarts = TAB_ORDER.filter((other) => other !== tab)
    .map((other) => source.indexOf(renderBranchGuard(other)))
    .filter((index) => index > start);
  const end = nextStarts.length > 0 ? Math.min(...nextStarts) : source.length;
  return source.slice(start, end);
}

describe("the four top-level tabs are registered, in the strip, and rendered", () => {
  it("finds the page at all, so a moved file cannot make this vacuously pass", () => {
    // Every assertion below reads one file. If that read ever returns an empty
    // string - a moved page, a renamed directory - `indexOf` returns -1 and
    // the failures read as missing wiring rather than as a broken test. This
    // asserts the file is really there and really substantial, so the others
    // fail for the right reason.
    const source = read(PAGE);
    expect(source.length).toBeGreaterThan(1000);
    expect(source).toContain("activeTab");
  });

  it("registers exactly the four tabs, with a label each", () => {
    expect([...TAB_ORDER]).toEqual(["courses", "manual", "files", "course-intel"]);
    expect(TAB_LABELS.courses).toBe("Courses");
    expect(TAB_LABELS.manual).toBe("Tools");
    expect(TAB_LABELS.files).toBe("Library");
    expect(TAB_LABELS["course-intel"]).toBe("Course Intel");
  });

  it("has every tab in the runtime value set that normalizeActiveTab consults", () => {
    for (const tab of TAB_ORDER) {
      expect(
        isActiveTab(tab),
        `"${tab}" is in TAB_ORDER but not accepted by isActiveTab. The strip would ` +
          "render it and every URL naming it would bounce to the default tab."
      ).toBe(true);
      expect(resolveTabDestination(tab).tab).toBe(tab);
    }
  });

  it("builds the strip from TAB_ORDER, so a registered tab cannot be missing from it", () => {
    const source = read(PAGE);
    const tabsIndex = source.indexOf("<Tabs");
    expect(tabsIndex, "src/app/page.tsx has no <Tabs> strip").toBeGreaterThan(-1);
    const mapIndex = source.indexOf("TAB_ORDER.map(", tabsIndex);
    expect(
      mapIndex,
      "the tab strip is not derived from TAB_ORDER. A hand-written list of <Tab> " +
        "elements can silently omit a registered tab, which makes it unreachable " +
        "by click while every other gate stays green."
    ).toBeGreaterThan(tabsIndex);
    // The map has to be INSIDE the strip, not somewhere after it.
    const tabsCloseIndex = source.indexOf("</Tabs>", tabsIndex);
    expect(tabsCloseIndex).toBeGreaterThan(mapIndex);
  });

  it("renders a branch for every tab, guarded by that tab's own id", () => {
    const source = read(PAGE);
    // One-Off Tasks moved into the Courses rail; a stray top-level branch must not survive.
    expect(source).not.toContain('{activeTab === "one-off-tasks"');
    for (const tab of TAB_ORDER) {
      // The JSX branch form specifically - `activeTab === "files"` on its own
      // also appears inside effects (the files-inbox mark-seen one, the
      // drafts refresh one), and matching those would let this pass while the
      // pane renders nothing. Found the hard way: an earlier draft of this
      // test went green against a page with a section switch deleted.
      const guard = renderBranchGuard(tab);
      expect(
        source.indexOf(guard),
        `src/app/page.tsx has no '${guard}' branch. The strip can highlight the tab ` +
          "and the URL can restore it while the pane stays blank, and every other " +
          "test in this repo will still pass."
      ).toBeGreaterThan(-1);
    }
  });

  it("renders CourseIntelTab inside the course-intel branch, not merely importing it", () => {
    const source = read(PAGE);
    // The default export's local name is not pinned - only that SOMETHING is
    // imported from this directory. Pinning the identifier would make an
    // ordinary rename a red test for no safety gain.
    expect(source).toMatch(/import\s+\w+\s+from\s+["']\.\/components\/course-intel["']/);
    expect(
      branchSlice(source, "course-intel"),
      "the component is not rendered inside its own guard branch"
    ).toContain("CourseIntelTab");
  });

  it("gives each merged tab exactly one navigation rail, reached from its own branch (D26)", () => {
    const source = read(PAGE);
    // Course Intel absorbed nothing, so it has no rail; the other three each
    // need one or part of the tab is unreachable by click. EXACTLY one, not at
    // least one: a second <TabRail inside a branch is the middle level back
    // again under a new component name.
    const mergedTabs: ActiveTab[] = ["courses", "manual", "files"];
    for (const tab of mergedTabs) {
      const slice = branchSlice(source, tab);
      const rails = slice.split("<TabRail").length - 1;
      expect(
        rails,
        `the "${tab}" branch renders ${rails} TabRail elements. One is the flattened ` +
          "rail; zero leaves part of the tab unreachable by click, and two is the " +
          "intermediate nav level D26 removed, rebuilt under a new name."
      ).toBe(1);
    }
  });

  it("has retired TabSectionSwitch entirely - a section is no longer something anyone picks", () => {
    const source = read(PAGE);
    expect(
      source,
      "page.tsx still renders a TabSectionSwitch. D26 replaced the section switch with " +
        "a rail over the individual views; a switch left anywhere means that tab still " +
        "has two levels."
    ).not.toContain("TabSectionSwitch");
  });

  it("renders both halves of every merged tab, each behind its own section id", () => {
    // The section switch existing is not the same as the section rendering:
    // a switch whose second option lands on an empty pane is the blank-pane
    // failure again, one level down from the tab.
    const source = read(PAGE);
    const halves: [ActiveTab, string, string][] = [
      ["courses", 'coursesSection === "courses"', 'coursesSection === "tasks"'],
      ["manual", 'toolsSection === "manual"', 'toolsSection === "workflows"'],
      ["files", 'librarySection === "files"', 'librarySection === "knowledge"'],
    ];
    for (const [tab, first, second] of halves) {
      const slice = branchSlice(source, tab);
      expect(slice, `the "${tab}" branch never checks ${first}`).toContain(first);
      expect(slice, `the "${tab}" branch never checks ${second}`).toContain(second);
    }
  });

  it("renders OneOffTasksTab inside the Courses branch behind coursesSection === \"oneoff\"", () => {
    // Reachability canary for the moved pane: without this the rail chip can
    // highlight while the pane stays blank and every other gate stays green.
    const slice = branchSlice(read(PAGE), "courses");
    const guardIndex = slice.indexOf('coursesSection === "oneoff"');
    expect(guardIndex, "the courses branch never checks coursesSection === \"oneoff\"").toBeGreaterThan(-1);
    expect(slice.indexOf("<OneOffTasksTab", guardIndex)).toBeGreaterThan(guardIndex);
  });
});

// D26. The flattening itself: one level, and every chip in it landing
// somewhere. Source-text again, for the reason the header gives - nothing
// renders here, so a second nav row is invisible to every other gate.
describe("the merged tabs are one navigation level deep", () => {
  it("no longer lets page.tsx hand any of the three deleted controls a change handler", () => {
    // The most direct evidence a row is gone: the prop that made it a CONTROL
    // rather than a display is no longer passed. Each of these was the single
    // wire between page.tsx and one deleted row.
    const source = readWithoutComments(PAGE);
    for (const prop of ["onManualViewClick", "onWorkflowsViewChange", "onViewChange"]) {
      expect(
        source,
        `page.tsx still passes ${prop}, which only the nav row D26 deleted ever consumed. ` +
          "That row is still rendering, one level below the flattened rail."
      ).not.toContain(prop);
    }
  });

  it("has taken the seven-item first row out of ManualRail, leaving only the inner destinations", () => {
    const source = readWithoutComments(MANUAL_RAIL);
    expect(source.length, "ManualRail.tsx could not be read").toBeGreaterThan(200);
    expect(
      source,
      "ManualRail.tsx still maps MANUAL_VIEW_ORDER, so the Tools tab renders the seven " +
        "Manual chips twice: once in the flattened rail and once in the row below it."
    ).not.toContain("MANUAL_VIEW_ORDER");
    // Exactly one tablist left - the inner destinations row, which is the
    // level BELOW a rail item and was never in scope to remove.
    expect(source.split('role="tablist"').length - 1).toBe(1);
  });

  // I2 (docs/tools-grading-subtab-architecture.md section 6.1): the inner
  // nav's accessible name must be FED FROM getInnerNavAriaLabel, not a
  // hand-written literal or ternary - that is exactly what let a third inner
  // nav (Grading) go out announced as "LMS views" with every other gate
  // green. This is a source-text claim, not a render claim: it proves the
  // attribute is wired to the function, not what assistive technology
  // actually announces (see the owner walk, OW-A1).
  it("feeds ManualRail's inner-nav aria-label from getInnerNavAriaLabel, never a hand-written literal", () => {
    const source = readWithoutComments(MANUAL_RAIL);
    expect(
      source,
      "ManualRail.tsx's aria-label is not fed from getInnerNavAriaLabel(...) - a hand-written " +
        "literal or ternary here is exactly how a new inner nav goes out announced under the " +
        "wrong name with every other gate green."
    ).toContain("aria-label={getInnerNavAriaLabel(");
    expect(
      source,
      'ManualRail.tsx still hard-codes "LMS views" - the label must come from getInnerNavAriaLabel'
    ).not.toContain("LMS views");
  });

  it("has taken the Workflows/Automations/Drafts subnav out of WorkflowsPanel, and (GRAD-SUBTAB wave 3) the Grades/Messages subnav that used to sit inside Drafts too", () => {
    const source = readWithoutComments(WORKFLOWS_PANEL);
    expect(source.length, "WorkflowsPanel.tsx could not be read").toBeGreaterThan(200);
    expect(
      source,
      "WorkflowsPanel.tsx still takes onWorkflowsViewChange, so its own three-chip subnav " +
        "is still rendering below the flattened rail that already contains those three."
    ).not.toContain("onWorkflowsViewChange");
    // GRAD-SUBTAB wave 3 (DECISION 19, E-full): the Grades/Messages tablist
    // that used to sit inside Drafts is gone too - Drafted Grades moved to
    // Tools > Grading, and Drafts now renders MessageDraftsTab directly with
    // no subnav left. Zero tablists, not one.
    expect(source.split('role="tablist"').length - 1).toBe(0);
  });

  it("has taken the Term/Daily-Weekly tablist out of TasksTab entirely", () => {
    const source = readWithoutComments(TASKS_TAB);
    expect(source.length, "TasksTab.tsx could not be read").toBeGreaterThan(1000);
    expect(
      source,
      "TasksTab.tsx still renders a tablist. Its two views are chips in the Courses rail " +
        "now; leaving the old switch in place makes Courses two levels deep again."
    ).not.toContain('role="tablist"');
    expect(source).not.toContain("onViewChange");
  });

  it("gives every Manual chip in the Tools rail its own render branch in page.tsx", () => {
    // The blank-pane failure, one level down from the tab: a chip that
    // highlights, restores from the URL, and paints nothing.
    const slice = branchSlice(read(PAGE), "manual");
    for (const view of MANUAL_VIEW_ORDER) {
      expect(
        slice,
        `the Tools branch has no 'manualView === "${view}"' render branch, so that rail ` +
          "chip leads to an empty pane while every other gate stays green."
      ).toContain(`manualView === "${view}"`);
    }
  });

  it("gives every Workflows chip in the Tools rail its own render branch in WorkflowsPanel", () => {
    const source = read(WORKFLOWS_PANEL);
    for (const view of WORKFLOWS_VIEW_ORDER) {
      expect(
        source,
        `WorkflowsPanel.tsx has no 'workflowsView === "${view}"' render branch, so that ` +
          "rail chip leads to an empty pane."
      ).toContain(`workflowsView === "${view}"`);
    }
  });

  it("passes the rail the derived chip rather than a section the user picked", () => {
    // The whole design in one line each: the VALUE handed to the rail is
    // computed from the params that already existed, so a chip cannot be
    // stored anywhere or drift from them.
    const source = read(PAGE);
    expect(branchSlice(source, "courses")).toContain("coursesRailItemFor(coursesSection, tasksView)");
    expect(branchSlice(source, "manual")).toContain(
      "toolsRailItemFor(toolsSection, manualView, workflowsView)"
    );
  });

  it("builds each rail from the registries rather than a hand-written list of chips", () => {
    const source = read(PAGE);
    expect(source).toContain("COURSES_RAIL_ITEMS.map(");
    expect(source).toContain("TOOLS_RAIL_ITEMS.map(");
    // Ten chips is a lot; a hand-written list is how one of them goes
    // missing. Eight Manual + two Workflows (PPT-DESIGN-INTO-PRESENTATIONS
    // re-parented "ppt-design" under Presentations, so it left MANUAL_VIEW_ORDER;
    // WORKFLOWS-COLLAPSE W1 moved Drafts to Library, 11 -> 10).
    expect(TOOLS_RAIL_ITEMS).toHaveLength(10);
  });
});

// D25b. This block is the whole reason the change is risky, and it is the only
// automated thing standing between a returning user and the wrong screen.
describe("every retired tab value still resolves to its new home", () => {
  it("redirects each of the three, tab AND section", () => {
    expect(resolveTabDestination("tasks").tab).toBe("courses");
    expect(resolveTabDestination("tasks").coursesSection).toBe("tasks");

    expect(resolveTabDestination("workflows").tab).toBe("manual");
    expect(resolveTabDestination("workflows").toolsSection).toBe("workflows");

    expect(resolveTabDestination("knowledge").tab).toBe("files");
    expect(resolveTabDestination("knowledge").librarySection).toBe("knowledge");
  });

  // D26 raised the bar on this: resolving to the right TAB is no longer
  // enough, because the tab now opens on a specific rail item. A legacy link
  // that lands on Tools with the Manual chip selected has lost exactly as much
  // as one that landed on the wrong tab before - the user asked for Workflows.
  it("lands the retired one-off-tasks link on the One-Off Tasks chip", () => {
    const oneOff = parseUrlState("?tab=one-off-tasks");
    expect(oneOff.tab).toBe("courses");
    expect(coursesRailItemFor(oneOff.coursesSection, oneOff.tasksView)).toBe("oneoff");
  });

  it("lands each retired link on the right CHIP, not merely the right tab", () => {
    const tasks = parseUrlState("?tab=tasks");
    expect(tasks.tab).toBe("courses");
    expect(coursesRailItemFor(tasks.coursesSection, tasks.tasksView)).toBe("tasks:term");

    const workflows = parseUrlState("?tab=workflows");
    expect(workflows.tab).toBe("manual");
    expect(toolsRailItemFor(workflows.toolsSection, workflows.manualView, workflows.workflowsView)).toBe(
      "workflows:workflows"
    );

    const knowledge = parseUrlState("?tab=knowledge");
    expect(knowledge.tab).toBe("files");
    // Library's rail items ARE its sections - it was already flat, so the chip
    // and the section are the same value.
    expect(knowledge.librarySection).toBe("knowledge");
  });

  it("carries a legacy DEEP link all the way to its chip, sub-view and all", () => {
    // The case a "right tab, wrong chip" bug hides behind: these URLs name a
    // sub-view too, and the flattened rail is where that sub-view is now
    // chosen. If the chip were derived from anything other than the params the
    // link carries, these would silently fall back to the family default.
    const recurring = parseUrlState("?tab=tasks&tasksView=recurring");
    expect(coursesRailItemFor(recurring.coursesSection, recurring.tasksView)).toBe("tasks:recurring");

    // WORKFLOWS-COLLAPSE W1: the Drafts deep link now lands on Library > Drafts.
    const drafts = parseUrlState("?tab=workflows&workflowsView=drafts");
    expect(drafts.tab).toBe("files");
    expect(drafts.librarySection).toBe("drafts");

    const automations = parseUrlState("?tab=workflows&workflowsView=automations");
    expect(toolsRailItemFor(automations.toolsSection, automations.manualView, automations.workflowsView)).toBe(
      "workflows:automations"
    );

    // And the Manual family through the param this whole design exists to
    // protect: an old "?manualView=" link still names its own chip.
    const recording = parseUrlState("?tab=manual&manualView=recording");
    expect(toolsRailItemFor(recording.toolsSection, recording.manualView, recording.workflowsView)).toBe(
      "manual:recording"
    );
  });

  it("never lets a retired value fall through to the unrecognised-value default", () => {
    const bounced = resolveTabDestination("a-value-that-was-never-a-tab");
    for (const legacy of Object.keys(RETIRED_TAB_DESTINATIONS)) {
      expect(isRetiredTabValue(legacy)).toBe(true);
      expect(
        resolveTabDestination(legacy),
        `"${legacy}" resolves to the same place an unrecognised value does, which is ` +
          "exactly what a DROPPED alias looks like. Every bookmark carrying it lands " +
          "on the wrong tab with no error."
      ).not.toEqual(bounced);
    }
  });

  it("keeps the retired values out of the tab set, so they can only arrive as aliases", () => {
    for (const legacy of Object.keys(RETIRED_TAB_DESTINATIONS)) {
      expect(isActiveTab(legacy)).toBe(false);
      expect(TAB_ORDER).not.toContain(legacy);
    }
  });

  it("rewrites the address bar on the first sync, so an old link converges instead of staying legacy", () => {
    // An alias is a redirect, not a synonym. The rewrite happens in
    // useAppNavigation's first URL-sync run: it must compare the canonical
    // target against what is actually in the address bar, because a legacy URL
    // DOES name a tab - a first-sync guard that only asked "did the URL have a
    // tab param" would skip the write and leave "?tab=knowledge" in place
    // forever, including in whatever the user re-bookmarks from it.
    const source = read(NAV_HOOK);
    const firstSyncIndex = source.indexOf("isFirstUrlSyncRef.current");
    expect(firstSyncIndex).toBeGreaterThan(-1);
    const block = source.slice(firstSyncIndex, firstSyncIndex + 600);
    expect(
      block,
      "the first URL sync no longer compares its target against window.location.search, " +
        "so a legacy tab value is never rewritten to its canonical form"
    ).toMatch(/target !== window\.location\.search/);
    expect(block).toContain("replaceState");
  });
});

// D25d. The one branch that must NOT become a conditional render.
describe("the recording surface stays mounted while hidden", () => {
  it("is a display toggle on an always-rendered element, never a conditional render", () => {
    const source = read(PAGE);
    const renderIndex = source.indexOf("<RecordingTab");
    expect(renderIndex, "src/app/page.tsx no longer renders RecordingTab at all").toBeGreaterThan(-1);

    // Exactly one render site - a second one would mean somebody added a
    // conditional copy alongside the hidden one.
    expect(source.indexOf("<RecordingTab", renderIndex + 1)).toBe(-1);

    // Structural, not keyword-spotting: the element IMMEDIATELY wrapping
    // RecordingTab must carry a style that sets `display`, with nothing but
    // that element's own closing bracket between the two. A conditional
    // render (`{guard && <RecordingTab ... />}`) cannot satisfy this, and
    // neither can a comment that merely talks about display toggles.
    expect(
      source,
      "RecordingTab is no longer wrapped in an element whose style sets `display`. " +
        "If it became a conditional render, navigating away from it destroys an " +
        "in-progress screen capture - a lost recording, not a blank pane."
    ).toMatch(/style=\{\{[\s\S]{0,300}?display:[\s\S]{0,300}?"none"[\s\S]{0,80}?\}\}\s*>\s*<RecordingTab/);

    // The guard names the Tools tab, its Manual section and the recording
    // view - so the merge widened it rather than losing a term.
    const wrapper = source.slice(Math.max(0, renderIndex - 500), renderIndex);
    expect(wrapper).toContain('activeTab === "manual"');
    expect(wrapper).toContain('toolsSection === "manual"');
    expect(wrapper).toContain('manualView === "recording"');
  });
});

// GRAD-SUBTAB wave 2 (docs/tools-grading-subtab-wave2-architecture.md
// section 2.2, instrument I-W2). The two Recording grading surfaces
// (grading-via-recording, snapshot grading) re-parented into Tools > Grading
// as always-mounted, display-toggled top-level siblings of RecordingTab -
// modelled directly on "the recording surface stays mounted while hidden"
// above. Each panel holds live capture (a MediaStream, or a
// RECORDING_LAUNCH_EVENT listener) that a conditional mount destroys on
// every navigation; a display toggle on an always-rendered element is the
// only shape that preserves it. Proven red (named mutation): moving either
// panel's div into the `manualView === "grading" &&` ternary instead of
// being a top-level sibling makes the corresponding assertion below fail,
// because a conditional render (`{guard && <Panel />}`) cannot satisfy the
// immediate-wrapper display-toggle regex.
describe("the two moved grading-capture panels stay mounted while hidden (I-W2)", () => {
  function assertAlwaysMounted(componentTag: string, guardTerms: string[]) {
    const source = read(PAGE);
    const renderIndex = source.indexOf(`<${componentTag}`);
    expect(renderIndex, `src/app/page.tsx does not render ${componentTag} at all`).toBeGreaterThan(-1);

    // Exactly one render site - a second one would mean a stray conditional
    // copy exists alongside the always-mounted one.
    expect(source.indexOf(`<${componentTag}`, renderIndex + 1)).toBe(-1);

    // Structural, not keyword-spotting: the element IMMEDIATELY wrapping the
    // panel must carry a style that sets `display`, with nothing but that
    // element's own closing bracket between the two. A conditional render
    // cannot satisfy this, and neither can a comment that merely talks about
    // display toggles.
    expect(
      source,
      `${componentTag} is not wrapped in an element whose style sets \`display\`. If it became ` +
        "a conditional render, navigating away from it destroys a live capture - a lost " +
        "capture, not a blank pane."
    ).toMatch(
      new RegExp(`style=\\{\\{[\\s\\S]{0,300}?display:[\\s\\S]{0,300}?"none"[\\s\\S]{0,120}?\\}\\}\\s*>\\s*<${componentTag}`)
    );

    const wrapper = source.slice(Math.max(0, renderIndex - 500), renderIndex);
    for (const term of guardTerms) {
      expect(wrapper, `expected ${componentTag}'s wrapper guard to include "${term}"`).toContain(term);
    }
  }

  it("GradingRecordingPanel is a display toggle on an always-rendered element, never a conditional render", () => {
    assertAlwaysMounted("GradingRecordingPanel", [
      'activeTab === "manual"',
      'toolsSection === "manual"',
      'manualView === "grading"',
      'gradingView === "recording"',
    ]);
  });

  it("SnapshotGradingPanel is a display toggle on an always-rendered element, never a conditional render", () => {
    assertAlwaysMounted("SnapshotGradingPanel", [
      'activeTab === "manual"',
      'toolsSection === "manual"',
      'manualView === "grading"',
      'gradingView === "snapshots"',
    ]);
  });

  // GRADING-CHAT wave 1 (docs/grading-chat-architecture.md section 7,
  // instrument I-chat-mount): the chat surface holds an in-flight continuous
  // run (pending /api/grade-run-item requests plus accumulated rows) that a
  // conditional mount would drop on every navigation - the same reasoning as
  // the two panels above, modelled on the identical helper.
  it("GradingChatPanel is a display toggle on an always-rendered element, never a conditional render", () => {
    assertAlwaysMounted("GradingChatPanel", [
      'activeTab === "manual"',
      'toolsSection === "manual"',
      'manualView === "grading"',
      'gradingView === "chat"',
    ]);
  });

  // ANNOUNCEMENTS-TAB wave A-W2 (T4, REQ-2): the announcement-from-a-walkthrough
  // capture panel moved out of RecordingTab to an always-mounted sibling that the
  // Announcements "walkthrough" chip only REVEALS. Same helper, same proof.
  it("WalkthroughAnnouncementPanel is a display toggle on an always-rendered element, never a conditional render", () => {
    assertAlwaysMounted("WalkthroughAnnouncementPanel", [
      'activeTab === "manual"',
      'toolsSection === "manual"',
      'manualView === "announcements"',
      'announcementsView === "walkthrough"',
    ]);
  });
});

// ANNOUNCEMENTS-TAB wave A-W2 (REQ-5): without this guard,
// announcementsView === "walkthrough" would render AnnouncementsSubTab (the
// composer) AND the always-mounted capture panel for the same chip. Proven red
// (named mutation): dropping `&& announcementsView === "post"` from the branch.
describe('the manualView === "announcements" branch renders AnnouncementsSubTab ONLY for announcementsView "post" (REQ-5)', () => {
  it("the announcements TabShell branch is scoped to the post inner view", () => {
    const source = read(PAGE);
    const renderIndex = source.indexOf("<AnnouncementsSubTab");
    expect(renderIndex, "src/app/page.tsx does not render AnnouncementsSubTab at all").toBeGreaterThan(-1);
    expect(source.indexOf("<AnnouncementsSubTab", renderIndex + 1)).toBe(-1);
    const wrapper = source.slice(Math.max(0, renderIndex - 120), renderIndex);
    expect(
      wrapper,
      "the AnnouncementsSubTab branch does not restrict announcementsView to post - the composer would " +
        "paint alongside the always-mounted walkthrough capture panel"
    ).toMatch(/manualView === "announcements" && announcementsView === "post"/);
    expect(wrapper).not.toContain('announcementsView === "walkthrough"');
  });
});

// ANNOUNCEMENTS-TAB wave A-W2 (REQ-1, REQ-6): single mount site per moved panel,
// and record-announcement stays in Recording. Counted over every production .tsx.
describe("moved announcement surfaces have exactly one mount site (REQ-1, REQ-6)", () => {
  function productionTsx(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(join(process.cwd(), dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) out.push(...productionTsx(rel));
      else if (entry.name.endsWith(".tsx")) out.push(rel);
    }
    return out;
  }
  function mountSites(tag: string): string[] {
    const re = new RegExp(`<${tag}[\\s/>]`);
    return productionTsx("src").filter((rel) => re.test(read(rel)));
  }

  it("AnnouncementsPanel is mounted only by AnnouncementsSubTab, not CanvasTab", () => {
    expect(mountSites("AnnouncementsPanel")).toEqual(["src/app/components/announcements/AnnouncementsSubTab.tsx"]);
  });

  it("BulkCourseMessagePanel is mounted only by AnnouncementsSubTab, not CanvasTab", () => {
    expect(mountSites("BulkCourseMessagePanel")).toEqual(["src/app/components/announcements/AnnouncementsSubTab.tsx"]);
  });

  it("TakeAnnouncementPanel (record-announcement) stays mounted only by RecordingTab", () => {
    expect(mountSites("TakeAnnouncementPanel")).toEqual(["src/app/components/RecordingTab.tsx"]);
  });

  it("the Recording cross-link navigates to manualView announcements via page.tsx's listener", () => {
    const page = read(PAGE);
    const start = page.indexOf("window.addEventListener(ANNOUNCEMENTS_NAV_EVENT");
    expect(start, "page.tsx does not listen for ANNOUNCEMENTS_NAV_EVENT").toBeGreaterThan(-1);
    const handler = page.slice(Math.max(0, start - 400), start);
    expect(handler).toContain('setManualView("announcements")');
    expect(read("src/app/components/RecordingTab.tsx")).toContain("openAnnouncementsTab");
  });
});

// GRAD-SUBTAB wave 2 check residual R-1: without this guard,
// gradingView === "recording" (or "snapshots") would render BOTH GradingTab
// (the manualView === "grading" ternary's else arm) AND the new
// always-mounted panel for the same chip - two surfaces answering one click.
// Proven red (named mutation): dropping the `(gradingView === "run" ||
// gradingView === "repos")` clause from the branch guard makes this
// assertion fail.
describe('the manualView === "grading" branch renders GradingTab/RepoGradesTab ONLY for gradingView run/repos (R-1)', () => {
  it("the grading render branch is scoped to gradingView run/repos, excluding the two moved capture views", () => {
    const source = read(PAGE);
    const start = source.indexOf('manualView === "grading" &&');
    expect(start, 'expected to find the manualView === "grading" render branch in page.tsx').toBeGreaterThan(-1);
    const end = source.indexOf("</TabShell>", start);
    expect(end).toBeGreaterThan(start);
    const branch = source.slice(start, end);
    expect(
      branch,
      "the grading branch guard does not restrict gradingView to run/repos - without this, " +
        "gradingView === \"recording\"/\"snapshots\" would render GradingTab AND the new " +
        "always-mounted capture panel at the same time"
    ).toMatch(/gradingView === "run"[\s\S]{0,80}gradingView === "repos"/);
  });
});

// GRAD-SUBTAB wave 3 (docs/tools-grading-subtab-wave3-architecture.md
// section 4.6, instruments I-drafts-mount and I-no-mirror). Drafted Grades
// moved from Workflows > Drafts into Tools > Grading's own inner nav
// (DECISION 18/19 - moved, not mirrored). Two source-text checks, deliberately
// NOT modelled on the I-W2 assertAlwaysMounted helper above (RESIDUAL R-4):
// DraftedGradesTab is a plain CONDITIONAL mount - it holds no live capture
// resource, only onOpenWorkflow and app-root contexts - so demanding a
// display-toggle wrapper here would be wrong, unlike the two capture panels
// I-W2 guards.
describe("Drafted Grades is reachable at its new home and dead at its old one (I-drafts-mount, I-no-mirror)", () => {
  it("I-drafts-mount: page.tsx mounts DraftedGradesTab as a plain conditional for manualView===grading && gradingView===drafts", () => {
    const source = read(PAGE);
    const renderIndex = source.indexOf("<DraftedGradesTab");
    expect(renderIndex, "src/app/page.tsx does not render DraftedGradesTab at all").toBeGreaterThan(-1);
    // Exactly one render site.
    expect(source.indexOf("<DraftedGradesTab", renderIndex + 1)).toBe(-1);
    const wrapper = source.slice(Math.max(0, renderIndex - 200), renderIndex);
    expect(
      wrapper,
      "DraftedGradesTab's guard must include both manualView === \"grading\" and gradingView === \"drafts\" - " +
        "without this, the Drafted Grades chip leads to a blank pane"
    ).toMatch(/manualView === "grading"[\s\S]{0,80}gradingView === "drafts"/);
    // A plain conditional, never an always-mounted display toggle: no
    // `display` style sits immediately above this render site the way I-W2's
    // assertAlwaysMounted requires for the two capture panels.
    expect(
      wrapper,
      "DraftedGradesTab must be a plain conditional mount, not an always-mounted display toggle - it holds " +
        "no live capture resource, unlike GradingRecordingPanel/SnapshotGradingPanel"
    ).not.toMatch(/display:\s*[\s\S]{0,40}?"none"/);
  });

  it("I-no-mirror: WorkflowsPanel no longer imports or renders DraftedGradesTab, and has no draftsView === 'grades' render", () => {
    const source = read(WORKFLOWS_PANEL);
    expect(
      source,
      "WorkflowsPanel.tsx still imports DraftedGradesTab - DECISION 18 says surfaces MOVE into " +
        "the new home, they are not mirrored from it"
    ).not.toContain("DraftedGradesTab");
    expect(source).not.toContain('draftsView === "grades"');
  });
});

// WORKFLOWS-COLLAPSE W1 (docs/workflows-collapse-ia-scope.md): the message
// drafts surface moved from Tools > Workflows > Drafts to Library > Drafts.
// Source-text pins only - no component renders under vitest, so the badge
// APPEARING and the pane painting are owner-walk (OW-1).
describe("Drafts lives in Library, and is gone from Tools (AC-W1-1, AC-W1-3, AC-W1-4, AC-W1-7)", () => {
  it("AC-W1-1: the Library branch renders MessageDraftsTab behind librarySection === drafts, exactly once in page.tsx", () => {
    const source = read(PAGE);
    expect(branchSlice(source, "files")).toMatch(/librarySection === "drafts" && <MessageDraftsTab/);
    expect(source.split("<MessageDraftsTab").length - 1).toBe(1);
  });

  it("AC-W1-3: WorkflowsPanel no longer imports or renders MessageDraftsTab, and the Tools branch has no workflowsView === drafts render", () => {
    expect(readWithoutComments(WORKFLOWS_PANEL)).not.toContain("MessageDraftsTab");
    expect(branchSlice(read(PAGE), "manual")).not.toContain('workflowsView === "drafts"');
  });

  it("AC-W1-4: the message-drafts count rides the Library tab and its Drafts chip, and the Tools tab carries only the grades count", () => {
    const source = read(PAGE);
    expect(source).toContain('tab === "manual" ? draftsGradesCount : tab === "files" ? filesInbox + draftsMessagesCount : 0');
    expect(source).toContain('id === "drafts" ? draftsMessagesCount');
    const toolsOptions = source.slice(source.indexOf("const toolsRailOptions"), source.indexOf("const libraryRailOptions"));
    expect(toolsOptions).not.toContain("draftsMessagesCount");
    expect(toolsOptions).toContain("draftsGradesCount");
  });

  it("AC-W1-7: the Saved-to-drafts event lands on Library > Drafts, never Tools > Workflows", () => {
    const source = read(PAGE);
    const start = source.indexOf("window.addEventListener(MESSAGE_DRAFTS_NAV_EVENT");
    const handler = source.slice(Math.max(0, start - 300), start);
    expect(handler).toContain('setLibrarySection("drafts")');
    expect(handler).toContain('setActiveTab("files")');
    expect(handler).not.toContain('setToolsSection("workflows")');
  });
});
