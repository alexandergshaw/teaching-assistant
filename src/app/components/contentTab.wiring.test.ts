import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { LMS_VIEWS } from "./manual/manual-rail";

// Source-text guard for ContentTab.tsx's two silently-failing registration
// points named in docs/assignments-quizzes-tabs-acceptance-criteria.md
// section D:
//
//   D4r - the `courseTab` boolean (ContentTab.tsx, `const courseTab = ...`):
//         a HARDCODED view list with no compile-time or test-time guard. A
//         view left out of it silently loses the shared course picker, the
//         reload control and the loading/empty states - no error, no
//         warning, and (verified) the full suite still passes.
//   D5r - the main `view === "..." ? (...)` render ternary chain that
//         actually mounts each view's content: a view left out of it renders
//         nothing at all once `loaded` is true.
//
// vitest here is node-env and renders nothing - this is a pure source-text
// test. It pins FACTS (does the literal substring appear) and DERIVES its
// expectations from `LMS_VIEWS` (manual-rail.ts's own single source of truth
// for the view id set) rather than restating a hand-written list, so a tenth
// view added to LMS_VIEWS later is automatically covered here with no new
// test case required - the same property useAppNavigation.test.ts's D6r
// guard already has, and the two-line hand-written case that fixed
// manual-rail.ts's resolveStateFromDestinationId ladder does NOT have.
const CONTENT_TAB_PATH = path.join(__dirname, "ContentTab.tsx");
const source = readFileSync(CONTENT_TAB_PATH, "utf8");

// Three views are self-hosting (their own course picker / institution scope
// - see ContentTab.tsx's comment directly above `courseTab`): they are
// DELIBERATELY absent from `courseTab` and must stay that way. Handled
// explicitly here, by name, with the reason stated - rather than weakening
// the loop below to silently skip whichever views happen not to match, which
// would blunt the exact guard this test exists to add.
const SELF_HOSTING_VIEWS: ReadonlySet<string> = new Set(["grading", "announcements", "inbox"]);

function extractCourseTabExpression(src: string): string {
  const match = src.match(/const courseTab =([\s\S]*?);/);
  if (!match) {
    throw new Error(
      "contentTab.wiring.test.ts: could not find `const courseTab = ...;` in ContentTab.tsx - " +
        "has D4r's registration point been renamed or restructured? Update this test's extraction to match."
    );
  }
  return match[1];
}

function extractRenderChain(src: string): string {
  const start = src.indexOf('view === "grading" ? (');
  const end = src.indexOf('view === "version-control" && versionControl');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(
      "contentTab.wiring.test.ts: could not find the `view === \"...\" ? (...)` render ternary chain " +
        "(D5r) in ContentTab.tsx between its first branch and the version-control branch - has it been " +
        "restructured? Update this test's extraction to match."
    );
  }
  return src.slice(start, end);
}

describe("ContentTab registration points (D4r courseTab, D5r render branch)", () => {
  const courseTabExpr = extractCourseTabExpression(source);
  const renderChain = extractRenderChain(source);

  it("LMS_VIEWS splits into exactly 5 courseTab-eligible views and the 3 named self-hosting ones", () => {
    // Pins the partition itself: if a future view is added to LMS_VIEWS
    // without a matching decision recorded in SELF_HOSTING_VIEWS above, the
    // count here moves and flags that a decision is needed, rather than the
    // new view silently falling into whichever bucket the loop below assumes.
    const courseTabEligible = LMS_VIEWS.filter((v) => !SELF_HOSTING_VIEWS.has(v));
    expect(LMS_VIEWS.length).toBe(8);
    expect(courseTabEligible.length).toBe(5);
    expect(courseTabEligible.sort()).toEqual(["assignments", "files", "modules", "pages", "quizzes"]);
  });

  for (const view of LMS_VIEWS) {
    const selfHosting = SELF_HOSTING_VIEWS.has(view);

    if (selfHosting) {
      it(`"${view}" is a self-hosting view and is deliberately absent from courseTab (D4r)`, () => {
        expect(courseTabExpr.includes(`view === "${view}"`)).toBe(false);
      });
    } else {
      it(`"${view}" is registered in the courseTab boolean (D4r)`, () => {
        // This is the assertion that catches a view silently dropped from
        // the shared course picker / reload control / loading state gate.
        // Verified able to fail: temporarily removing `view === "assignments"`
        // from ContentTab.tsx's courseTab expression turns this red for
        // view === "assignments" while every other repo test stays green.
        expect(courseTabExpr.includes(`view === "${view}"`)).toBe(true);
      });
    }

    it(`"${view}" has a view === "${view}" render branch in the main ternary chain (D5r)`, () => {
      // This is the assertion that catches a view silently missing its own
      // mount point - the user would click the tab and get an empty shell
      // (or, for a courseTab view, a picker with no content underneath it).
      // Verified able to fail: temporarily removing `view === "assignments"`
      // from ContentTab.tsx's render ternary chain turns this red for
      // view === "assignments" while every other repo test stays green.
      expect(renderChain.includes(`view === "${view}"`)).toBe(true);
    });
  }
});
