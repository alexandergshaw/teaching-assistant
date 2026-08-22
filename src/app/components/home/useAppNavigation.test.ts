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
import { LMS_VIEWS } from "../manual/manual-rail";
import { normalizeContentView, isContentView } from "../../url-state";

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
