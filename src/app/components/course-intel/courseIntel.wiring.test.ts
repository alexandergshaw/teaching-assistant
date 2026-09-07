import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The reachability canary, and it exists because everything else missed.
 *
 * Registering a Manual sub-view takes six edits. `tsc` catches two of them for
 * free: `MANUAL_VIEW_LABELS` is a `Record<ManualViewType, string>`, and
 * `useAppNavigation.ts` restates the union in a position that has to accept a
 * `ManualViewType`. The rail's own unit tests cover three more - order
 * membership, the destinations entry, and the two direction functions.
 *
 * THAT LEAVES EXACTLY ONE, AND IT IS THE WORST ONE. When this feature's own
 * implementer deleted the render branch from `src/app/page.tsx` as a sabotage
 * check, ALL 76 TESTS STILL PASSED. The rail highlights the right chip, the
 * URL restores the right view, every gate is green, and the pane is blank.
 *
 * This project has shipped that exact failure three times. A deck panel landed
 * complete at 850 lines with four persisted controls and 139 passing tests, and
 * nothing imported it. A bulk action rendered the correct affected-item count
 * and the correct disabled state and wrote nothing when clicked. Each time the
 * missing piece was a hand-maintained list or a hand-written prop in a file
 * that was left off the group's assignment.
 *
 * A source-text assertion is a blunt instrument and it is the only instrument
 * available here: vitest in this repo is node-env and collects only
 * `src/**\/*.test.ts`, so no component is ever rendered and no test can observe
 * that a pane painted something. Reading the file that is supposed to render it
 * is the closest available proxy, and it is exactly what the four repo-grades
 * wiring tests already do for the sibling feature this one was modelled on.
 *
 * WHAT THIS CANNOT PROVE, stated so nobody trusts it further than it goes: that
 * the component renders anything, that the branch is reachable at runtime, or
 * that the props are right. It proves the import and the render site exist and
 * are guarded by this view's own id. That is the difference between "ships
 * dead" and "ships wrong", and only the first one has bitten this project.
 */

const PAGE = join(process.cwd(), "src", "app", "page.tsx");
const RAIL = join(process.cwd(), "src", "app", "components", "manual", "manual-rail.ts");
const VIEW_ID = "course-intel";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("course-intel is reachable from the page, not merely registered", () => {
  it("page.tsx imports the component", () => {
    const source = read(PAGE);
    // The default export's local name is not pinned - only that SOMETHING is
    // imported from this directory. Pinning the identifier would make an
    // ordinary rename a red test for no safety gain.
    expect(source).toMatch(/import\s+\w+\s+from\s+["']\.\/components\/course-intel["']/);
  });

  it("page.tsx renders it behind this view's own id", () => {
    const source = read(PAGE);

    const guardIndex = source.indexOf(`manualView === "${VIEW_ID}"`);
    expect(
      guardIndex,
      `src/app/page.tsx has no 'manualView === "${VIEW_ID}"' branch. The rail can ` +
        "highlight the chip and the URL can restore the view while the pane " +
        "stays blank, and every other test in this repo will still pass."
    ).toBeGreaterThan(-1);

    // The render site must follow the guard, not merely coexist with it
    // somewhere in a 500-line file.
    const renderIndex = source.indexOf("CourseIntelTab", guardIndex);
    expect(
      renderIndex,
      "the component is not rendered inside its own guard branch"
    ).toBeGreaterThan(guardIndex);
  });

  it("the rail knows the id the page branches on, so the two cannot drift apart", () => {
    // The failure this catches is subtler than a missing branch: renaming the
    // view in the rail while page.tsx keeps branching on the old string leaves
    // both files individually valid and the feature unreachable.
    const rail = read(RAIL);
    expect(rail).toContain(`"${VIEW_ID}"`);
    expect(read(PAGE)).toContain(`"${VIEW_ID}"`);
  });

  it("finds the page at all, so a moved file cannot make this vacuously pass", () => {
    // Every assertion above reads one file. If that read ever returns an empty
    // string - a moved page, a renamed directory - `indexOf` returns -1 and the
    // failures read as missing wiring rather than as a broken test. This asserts
    // the file is really there and really substantial, so the others fail for
    // the right reason.
    const source = read(PAGE);
    expect(source.length).toBeGreaterThan(1000);
    expect(source).toContain("manualView");
  });
});
