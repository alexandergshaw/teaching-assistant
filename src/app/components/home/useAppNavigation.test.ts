// D6r (docs/assignments-quizzes-tabs-acceptance-criteria.md): the contentView
// restore guard in useAppNavigation.ts's own useState initializer.
//
// vitest here is node-env (see AGENTS.md / this repo's own testing
// conventions) and collects only src/**/*.test.ts, so no component is ever
// rendered. useAppNavigation is a hook: its closures (including the
// contentView useState initializer this file cares about) can only run
// inside a real React render - calling the exported hook directly outside
// one throws "Invalid hook call" (no dispatcher). Reused idiom from this
// repo's own precedent for exactly this constraint (see
// CoursesTable.gate.test.ts's header comment and focusRing.wiring.test.ts's
// source-text fallback): read the guard's OWN SOURCE to pin the fact that it
// delegates to normalizeContentView rather than restating a literal list,
// and separately exercise normalizeContentView itself - the same function
// the guard calls - against LMS_VIEWS, so the accepted set can never drift
// out of sync with the rail's own list of navigable views again.
//
// THE BUG THIS GUARDS: before this fix, the contentView restore guard was a
// hand-restated `saved === "pages" || saved === "files" || ...` literal
// list, not derived from LMS_VIEWS and not routed through
// normalizeContentView (the very validator the URL-restore branch two lines
// above it already calls). A user whose last LMS view was Assignments would
// have been silently bounced to Modules on their next visit - no error, no
// warning, nothing in the URL to reveal why. This exact bug class already
// happened once in this file's history: manual-rail.ts's own
// isManualViewType/MANUAL_VIEW_ORDER comment documents "artifact-design"
// going missing from the sibling manualView restore guard the same way,
// after being added to ManualViewType but not to that hand-restated list.
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { LMS_VIEWS, MANUAL_VIEW_ORDER, getInnerDestinations } from "../manual/manual-rail";
import { normalizeContentView, isContentView, resolveGradingPointer } from "../../url-state";

const SOURCE_PATH = join(process.cwd(), "src/app/components/home/useAppNavigation.ts");
const source = readFileSync(SOURCE_PATH, "utf8");

describe("useAppNavigation's contentView restore guard delegates to normalizeContentView (D6r)", () => {
  it("the contentView useState initializer calls normalizeContentView(localStorage.getItem(VIEW_KEY)) - pinning the FACT that it delegates, not a restated literal list", () => {
    // Isolate the contentView initializer block specifically (between its own
    // useState call and the next one, setWorkflowsView's), so this cannot be
    // satisfied by some unrelated normalizeContentView call elsewhere in the
    // file (the URL branch two lines above it, for instance).
    const start = source.indexOf("const [contentView, setContentViewState] = useState<ContentView>(");
    expect(start, "expected to find the contentView useState initializer").toBeGreaterThan(-1);
    const end = source.indexOf("const [workflowsView", start);
    expect(end, "expected to find the next useState block after contentView's").toBeGreaterThan(start);
    const block = source.slice(start, end);

    expect(
      block,
      "expected the contentView restore guard to read localStorage.getItem(VIEW_KEY) once for the saved value"
    ).toMatch(/localStorage\.getItem\(VIEW_KEY\)/);
    expect(
      block,
      "expected the localStorage fallback to route through normalizeContentView, not a hand-restated literal list"
    ).toMatch(/normalizeContentView\(\s*localStorage\.getItem\(VIEW_KEY\)\s*\)/);

    // The specific bug class this guards against: a hand-restated `saved ===
    // "..."` chain, which is exactly what silently drops a newly added view.
    expect(block).not.toMatch(/saved === "pages"/);
  });
});

describe("normalizeContentView accepts every LMS_VIEWS member (D6r / E2) - derived from LMS_VIEWS, not restated literals", () => {
  it("accepts every view LMS_VIEWS currently lists, unchanged - the actual guarantee the restore guard now inherits", () => {
    // Deliberately loops over LMS_VIEWS instead of listing literals, so a
    // view added to LMS_VIEWS in the future is covered by this assertion
    // automatically - no new test case required, and no way for this test to
    // pass while a real view silently falls through to "modules".
    for (const view of LMS_VIEWS) {
      expect(normalizeContentView(view)).toBe(view);
      expect(isContentView(view)).toBe(true);
    }
  });

  it("includes 'assignments' and 'quizzes' (the regression case this chunk adds)", () => {
    expect(LMS_VIEWS).toContain("assignments");
    expect(LMS_VIEWS).toContain("quizzes");
    expect(normalizeContentView("assignments")).toBe("assignments");
    expect(normalizeContentView("quizzes")).toBe("quizzes");
  });

  it("still falls back to 'modules' for an unknown or missing saved value", () => {
    expect(normalizeContentView("not-a-real-view")).toBe("modules");
    expect(normalizeContentView(null)).toBe("modules");
  });

  it("still rejects 'version-control' - a legacy migration target, never a value a user restores directly into (see this file's own migration branch above the contentView initializer)", () => {
    expect(isContentView("version-control")).toBe(false);
    expect(normalizeContentView("version-control")).toBe("modules");
  });
});

// D25c: each merged tab's section switch is a persisted control, so it obeys
// the same standing rule every other control in this app does - it survives a
// reload, under a "ta-" key. Source-text again, and for the same reason as the
// block above: these live in useState initializers and localStorage effects
// inside a hook, and this suite cannot render one.
describe("the merged tabs' section switches persist under their own ta- keys", () => {
  const KEYS = [
    { constant: "COURSES_SECTION_KEY", value: "ta-courses-section" },
    { constant: "TOOLS_SECTION_KEY", value: "ta-tools-section" },
    { constant: "LIBRARY_SECTION_KEY", value: "ta-library-section" },
  ];

  it("declares one ta- key per merged tab", () => {
    for (const { constant, value } of KEYS) {
      expect(source, `expected a ${constant} constant`).toContain(`const ${constant} = "${value}"`);
    }
  });

  it("writes each key back whenever its section changes", () => {
    for (const { constant } of KEYS) {
      expect(
        source,
        `${constant} is declared but never written, so the section resets on every reload`
      ).toMatch(new RegExp(`localStorage\\.setItem\\(${constant},`));
    }
  });

  it("reads each key back on restore, through the shared guard rather than a restated literal list", () => {
    // The same derived-not-restated discipline the contentView guard above
    // documents: a hand-written `saved === "tasks" || ...` here is how a
    // section added later silently stops restoring.
    for (const { constant } of KEYS) {
      expect(source).toMatch(new RegExp(`localStorage\\.getItem\\(${constant}\\)`));
    }
    expect(source).toMatch(/isCoursesSection\(saved\)/);
    expect(source).toMatch(/isToolsSection\(saved\)/);
    expect(source).toMatch(/isLibrarySection\(saved\)/);
  });

  it("resolves the starting location through resolveTabDestination, so a stored retired tab value keeps its section", () => {
    // Every user who was here before the merge has "tasks", "workflows" or
    // "knowledge" sitting in ta-active-tab. Restoring only the tab from it
    // would drop them on the other half of the merged tab.
    expect(source).toContain("resolveTabDestination(source)");
    expect(source).toContain('localStorage.getItem("ta-active-tab")');
  });
});

// D26: the flattened rail's selected chip is the PAIR (section, view), so a
// reload only lands back on the same chip if BOTH halves persist. The block
// above already pins the section keys; this pins the view keys that the rail's
// chips now write directly, under the same standing "every control survives a
// reload" rule. Source-text for the same reason as every block above: these
// live in useState initializers and localStorage effects inside a hook, and
// this suite cannot render one.
describe("the view each rail chip writes persists under its own ta- key", () => {
  const KEYS = [
    { constant: "MANUAL_VIEW_KEY", value: "ta-manual-view" },
    { constant: "WORKFLOWS_VIEW_KEY", value: "ta-workflows-view" },
    { constant: "TASKS_VIEW_KEY", value: "ta-tasks-view" },
    { constant: "GRADING_VIEW_KEY", value: "ta-grading-view" },
  ];

  it("declares one ta- key per view family in the rails", () => {
    for (const { constant, value } of KEYS) {
      expect(source, `expected a ${constant} constant`).toContain(`const ${constant} = "${value}"`);
    }
  });

  it("writes each key back whenever its view changes", () => {
    for (const { constant } of KEYS) {
      expect(
        source,
        `${constant} is declared but never written, so picking that rail chip is forgotten ` +
          "on reload and the user lands on a different chip than the one they left on"
      ).toMatch(new RegExp(`localStorage\\.setItem\\(${constant},`));
    }
  });

  it("keeps the view params the rails write named exactly as they were", () => {
    // The constraint the whole flattening was built around. A rail chip writes
    // the param that ALREADY owned its view, so these three reads must still
    // name manualView/workflowsView/tasksView - not a new rail-item param.
    expect(source).toContain('urlParams.get("manualView")');
    expect(source).toContain('urlParams.get("workflowsView")');
    expect(source).toContain('urlParams.get("tasksView")');
  });
});

// I5 (docs/tools-grading-subtab-architecture.md section 6.3): Back/Forward
// must not silently lose an inner-nav selection. The popstate ladder is
// hand-written (RES-ARCH-3 declines making it derived, since that would
// change the restore path for buildView/contentView as a side effect of
// adding a third inner nav), so this pins - by source text, the only
// instrument available in an environment where no component is ever
// rendered - that every view with an inner nav has its own popstate branch,
// and that the URL-sync effect's dependency array actually lists the new
// state so a history entry is pushed at all.
describe("the popstate ladder restores every inner-nav view's own state (I5)", () => {
  const popStateStart = source.indexOf("const onPopState = () => {");
  const popStateEnd = source.indexOf('window.addEventListener("popstate"', popStateStart);
  const popStateSlice = source.slice(popStateStart, popStateEnd);

  it("finds the popstate handler", () => {
    expect(popStateStart).toBeGreaterThan(-1);
    expect(popStateEnd).toBeGreaterThan(popStateStart);
  });

  it("has its own 'parsed.manualView === \"<view>\"' branch for every Manual view with an inner nav", () => {
    // Derived from getInnerDestinations rather than a restated list, so a
    // future inner nav is covered automatically - the same discipline every
    // other derived guard in this file's siblings uses.
    for (const view of MANUAL_VIEW_ORDER) {
      if (getInnerDestinations(view) === null) continue;
      expect(
        popStateSlice,
        `"${view}" has an inner nav but no 'parsed.manualView === "${view}"' branch in the popstate ` +
          "handler, so pressing Back/Forward onto it silently loses the inner selection"
      ).toContain(`parsed.manualView === "${view}"`);
    }
  });

  it("reads parsed.gradingView inside the popstate handler, so the new branch actually restores it", () => {
    expect(popStateSlice).toContain("parsed.gradingView");
  });

  it("lists gradingView in the URL-sync effect's dependency array, so picking an inner Grading item pushes a history entry", () => {
    const syncEffectStart = source.indexOf("useEffect(() => {\n    const target = buildUrlSearch({");
    expect(syncEffectStart, "expected to find the URL-sync effect").toBeGreaterThan(-1);
    const depsStart = source.indexOf("}, [", syncEffectStart);
    const depsEnd = source.indexOf("]);", depsStart);
    const deps = source.slice(depsStart, depsEnd);
    expect(
      deps,
      "gradingView is missing from the URL-sync effect's dependency array - exhaustive-deps " +
        "would flag this, and until then, picking a Grading inner item never pushes a history entry"
    ).toContain("gradingView");
  });
});

// GRAD-SUBTAB wave 1 verify BLOCKER 1: parseUrlState (via RETIRED_GRADING_POINTERS)
// is what redirects an old "?manualView=content&contentView=grading" or
// "?manualView=repo-grades" bookmark to the new Grading sub-tab, but
// parseUrlState's only non-test caller is the popstate handler above - never
// the initial mount. A fresh/incognito load's manualView/gradingView state
// comes ONLY from the lazy useState initializers, which read the raw URL
// params through normalizeManualView/normalizeContentView directly and have
// no idea the alias table exists, so the redirect silently never fires on the
// one path that matters for a bookmark: the first load.
//
// This is deliberately NOT a test of parseUrlState or of
// RETIRED_GRADING_POINTERS/resolveGradingPointer in isolation - both already
// had passing coverage while this bug was live (url-state.test.ts exercises
// parseUrlState; RETIRED_GRADING_POINTERS is plain data). A test at that seam
// proves nothing about the initializers. Since no component is ever rendered
// in this suite (useAppNavigation is a hook - see this file's header comment)
// and the initializer closures cannot be invoked outside a real render, the
// available instrument is the same one every other initializer-internal guard
// in this file above uses: pin the initializer's OWN SOURCE TEXT to prove it
// actually calls the shared alias lookup before falling back to the plain
// normalizer, paired with a direct (genuinely behavioral, not source-text)
// call of resolveGradingPointer itself to pin what that lookup returns for
// exactly the bookmarked shapes in play. Together they prove both halves: the
// alias resolves to "grading"/"repos" as the pointer table intends, AND the
// initializer is wired to actually consult it - which is the half that was
// missing.
describe("GRAD-SUBTAB wave 1 fix: the initial-load path applies the retired grading pointer (verify BLOCKER 1)", () => {
  it("resolveGradingPointer resolves both bookmarked shapes to the Grading sub-tab (the behavioral half)", () => {
    // "?manualView=content&contentView=grading" - the old LMS Grading URL.
    expect(resolveGradingPointer("content", "grading")).toEqual({ manualView: "grading", gradingView: "run" });
    // "?manualView=repo-grades" - the old standalone Repo Grades subtab.
    expect(resolveGradingPointer("repo-grades", null)).toEqual({ manualView: "grading", gradingView: "repos" });
    // A manualView of "content" with any OTHER contentView, or any other
    // manualView entirely, is not a retired pointer and must not redirect.
    expect(resolveGradingPointer("content", "modules")).toBeUndefined();
    expect(resolveGradingPointer("course-planning", null)).toBeUndefined();
  });

  // GRAD-SUBTAB wave 3 (docs/tools-grading-subtab-wave3-architecture.md
  // section 3.3): the retired Drafts > Grades pointer, added alongside the
  // two above. Its shape is different - keyed on workflowsView/draftsView,
  // not manualView/contentView - so it gets its own case, plus the negative
  // that a workflowsView of "drafts" alone (without draftsView === "grades")
  // must not redirect.
  it("resolveGradingPointer also resolves the retired Drafts > Grades shape (workflowsView/draftsView args)", () => {
    expect(resolveGradingPointer(null, null, "drafts", "grades")).toEqual({
      manualView: "grading",
      gradingView: "drafts",
    });
    expect(resolveGradingPointer(null, null, "drafts", "messages")).toBeUndefined();
    expect(resolveGradingPointer(null, null, "automations", "grades")).toBeUndefined();
  });

  it("the manualView initializer's URL branch consults resolveGradingPointer before falling back to normalizeManualView (the wiring half)", () => {
    const start = source.indexOf("const [manualView, setManualView] = useState<ManualView>(");
    expect(start, "expected to find the manualView useState initializer").toBeGreaterThan(-1);
    const end = source.indexOf("const [buildView", start);
    expect(end, "expected to find the next useState block after manualView's").toBeGreaterThan(start);
    const block = source.slice(start, end);

    const urlBranchStart = block.indexOf(
      'if (urlHasTab && destination.tab === "manual" && toolsSection === "manual") {'
    );
    expect(urlBranchStart, "expected to find the manualView URL restore branch").toBeGreaterThan(-1);
    const urlBranchEnd = block.indexOf("const savedManual", urlBranchStart);
    expect(urlBranchEnd, "expected to find the next statement after the URL branch").toBeGreaterThan(urlBranchStart);
    const urlBranch = block.slice(urlBranchStart, urlBranchEnd);

    expect(
      urlBranch,
      "BLOCKER 1: the manualView initializer's URL branch must call resolveGradingPointer with all four raw " +
        "params (manualView, contentView, workflowsView, draftsView - GRAD-SUBTAB wave 3 added the last two) " +
        "and return its manualView when it matches, BEFORE falling back to normalizeManualView - otherwise a " +
        'bookmarked "?manualView=repo-grades" or "?manualView=content&contentView=grading" is normalized ' +
        "straight past the alias table (normalizeManualView/normalizeContentView know nothing about it) and " +
        "lands on Build Courses/LMS Modules instead of Grading, on the one path (initial mount) that " +
        "parseUrlState's own redirect never runs on."
    ).toMatch(
      /resolveGradingPointer\(\s*urlParams\.get\("manualView"\),\s*urlParams\.get\("contentView"\),\s*urlParams\.get\("workflowsView"\),\s*urlParams\.get\("draftsView"\)\s*\)/
    );

    // Must actually be used to redirect, not merely called and discarded.
    expect(urlBranch, "the resolved gradingPointer must be returned as manualView").toMatch(
      /if\s*\(gradingPointer\)\s*return\s+gradingPointer\.manualView/
    );
  });

  it("the gradingView initializer's URL branch also consults resolveGradingPointer, so the pointer's inner view survives (repo-grades -> repos, not the 'run' default)", () => {
    const start = source.indexOf("const [gradingView, setGradingView] = useState<GradingView>(");
    expect(start, "expected to find the gradingView useState initializer").toBeGreaterThan(-1);
    const end = source.indexOf("const [focusCourseId", start);
    expect(end, "expected to find the next useState block after gradingView's").toBeGreaterThan(start);
    const block = source.slice(start, end);

    expect(
      block,
      "BLOCKER 1 (inner view half): once the manualView fix above lands, the gradingView initializer's " +
        '"manualView === \\"grading\\"" branch will run for a bookmarked "?manualView=repo-grades" URL too - ' +
        'but that URL carries no "gradingView" param, so normalizeGradingView(null) alone returns the "run" ' +
        "default instead of the pointer's actual target (\"repos\"). The initializer must consult " +
        "resolveGradingPointer (with all four raw params) here as well and prefer its gradingView when it matches."
    ).toMatch(
      /resolveGradingPointer\(\s*urlParams\.get\("manualView"\),\s*urlParams\.get\("contentView"\),\s*urlParams\.get\("workflowsView"\),\s*urlParams\.get\("draftsView"\)\s*\)/
    );
    expect(block, "the resolved gradingPointer must be returned as gradingView").toMatch(
      /if\s*\(gradingPointer\)\s*return\s+gradingPointer\.gradingView/
    );
  });
});

// GRAD-SUBTAB wave 3 BLOCKER 1 (docs/tools-grading-subtab-wave3-architecture-
// check.md): the returning-user localStorage restore path landed on the WRONG
// FAMILY. The manualView/gradingView localStorage migrations above are dead
// unless toolsSection ITSELF - the discriminant page.tsx actually renders on
// ({toolsSection === "manual" ...} vs {toolsSection === "workflows" ...}) -
// is also forced to "manual" for the same stored combination. This is
// deliberately its own describe block, modelled on the BLOCKER-1 block above:
// that block pins the manualView/gradingView halves; this one pins the
// toolsSection half the derivation's own check found missing.
describe("GRAD-SUBTAB wave 3 BLOCKER 1 fix: the toolsSection localStorage initializer forces 'manual' for a stored Drafts > Grades pointer", () => {
  it("the toolsSection initializer's localStorage branch checks the exact stored drafts-grades combination and returns 'manual'", () => {
    const start = source.indexOf("const [toolsSection, setToolsSection] = useState<ToolsSection>(");
    expect(start, "expected to find the toolsSection useState initializer").toBeGreaterThan(-1);
    const end = source.indexOf("const [librarySection", start);
    expect(end, "expected to find the next useState block after toolsSection's").toBeGreaterThan(start);
    const block = source.slice(start, end);

    expect(
      block,
      'BLOCKER 1: the toolsSection localStorage branch must check localStorage.getItem(TOOLS_SECTION_KEY) === "workflows"'
    ).toMatch(/localStorage\.getItem\(TOOLS_SECTION_KEY\)\s*===\s*"workflows"/);
    expect(
      block,
      "BLOCKER 1: the same branch must also check localStorage.getItem(WORKFLOWS_VIEW_KEY) === \"drafts\""
    ).toMatch(/localStorage\.getItem\(WORKFLOWS_VIEW_KEY\)\s*===\s*"drafts"/);
    expect(
      block,
      'BLOCKER 1: and localStorage.getItem("ta-drafts-view") === "grades" - the raw string literal, not ' +
        "DRAFTS_VIEW_KEY (E-full deletes that constant along with draftsView itself)"
    ).toMatch(/localStorage\.getItem\("ta-drafts-view"\)\s*===\s*"grades"/);
    expect(
      block,
      "BLOCKER 1: without this, a returning user whose stored ta-tools-section is \"workflows\" never sees " +
        "toolsSection forced to \"manual\", so the manualView/gradingView localStorage migrations run dead - " +
        "page.tsx renders {toolsSection === \"workflows\" && <WorkflowsPanel/>} instead of the Grading branch"
    ).toMatch(/if\s*\(\s*[\s\S]{0,200}?return\s+"manual"/);
  });
});
