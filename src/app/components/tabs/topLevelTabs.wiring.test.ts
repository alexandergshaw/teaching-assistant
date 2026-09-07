import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  RETIRED_TAB_DESTINATIONS,
  TAB_LABELS,
  TAB_ORDER,
  isRetiredTabValue,
  type ActiveTab,
} from "./tab-sections";
import { isActiveTab, resolveTabDestination } from "../../url-state";

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

function read(path: string): string {
  return readFileSync(path, "utf8");
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

  it("registers exactly the four tabs D25a names, with a label each", () => {
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

  it("gives each merged tab a section switch reached from its own branch", () => {
    const source = read(PAGE);
    // Course Intel absorbed nothing, so it has no section switch; the other
    // three each need one or half the tab is unreachable by click.
    const mergedTabs: ActiveTab[] = ["courses", "manual", "files"];
    for (const tab of mergedTabs) {
      expect(
        branchSlice(source, tab),
        `the "${tab}" branch renders no TabSectionSwitch, so the half of the tab that ` +
          "is not the default section cannot be reached by clicking anything."
      ).toContain("<TabSectionSwitch");
    }
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
