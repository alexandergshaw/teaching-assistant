import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * REGRESSION.md entry 408d, pinned at the source because nothing here
 * renders: vitest in this repo is node-env and collects only
 * `src/**\/*.test.ts`, so no component is ever mounted. Reading the files
 * that decide is the only check available - mirrors
 * src/app/components/grading-recording/markLate.wiring.test.ts's own idiom.
 *
 * THE DEFECT THIS PINS. All five Course Intel history actions in
 * src/app/actions/course-intel.ts - get, export, append, delete, clear -
 * were referenced by zero components. Persistence worked (the ask route
 * calls src/lib/course-intel/history.ts directly), so answers accumulated
 * correctly, and there was still no way for an instructor to ever see one
 * again. THE SAME FEATURE COULD SHIP THIS BROKEN A SECOND TIME the exact way
 * described in this project's own standing notes: a fully tested data layer
 * that nothing calls is a green suite that proves nothing about
 * reachability. So this file does not stop at "the functions exist and are
 * tested" (history.test.ts already covers that) - it traces the actual prop
 * path from the rendered tab down to the query.
 */

const COMPONENTS_DIR = join(process.cwd(), "src", "app", "components", "course-intel");
const ACTIONS_DIR = join(process.cwd(), "src", "app", "actions");

const read = (dir: string, name: string) => readFileSync(join(dir, name), "utf8");

const INDEX = read(COMPONENTS_DIR, "index.tsx");
const HOOK = read(COMPONENTS_DIR, "useCourseIntel.ts");
const HISTORY_COMPONENT = read(COMPONENTS_DIR, "CourseIntelHistory.tsx");
const ACTIONS = read(ACTIONS_DIR, "course-intel.ts");

describe("the Course Intel history reader is reachable end to end", () => {
  it("index.tsx imports CourseIntelHistory and renders it", () => {
    expect(INDEX).toMatch(/import CourseIntelHistory from ["']\.\/CourseIntelHistory["']/);
    expect(INDEX).toMatch(/<CourseIntelHistory\b/);
  });

  it("index.tsx wires every CourseIntelHistory prop to a value useCourseIntel returned - not a local default", () => {
    // Each of these traces a prop on the rendered element back to a name
    // destructured from useCourseIntel() above it, in the SAME file. A prop
    // hard-coded to a literal (entries={[]}, loading={false}, ...) would
    // satisfy "the component is rendered" while still showing nothing real.
    const requiredBindings: [prop: string, value: string][] = [
      ["entries", "historyEntries"],
      ["courseNames", "courseNames"],
      ["loading", "historyLoading"],
      ["open", "historyOpen"],
      ["onToggleOpen", "toggleHistoryOpen"],
      ["deletingId", "deletingHistoryId"],
      ["onDelete", "deleteHistoryEntry"],
      ["clearing", "clearingHistory"],
      ["onClearAll", "clearHistory"],
      ["error", "historyError"],
    ];
    for (const [prop, value] of requiredBindings) {
      expect(INDEX, `<CourseIntelHistory ${prop}={...}> should bind ${value}`).toMatch(
        new RegExp(`${prop}=\\{${value}\\}`)
      );
    }
  });

  it("index.tsx destructures every one of those values from useCourseIntel()", () => {
    const destructureBlock = INDEX.slice(INDEX.indexOf("useCourseIntel()") - 600, INDEX.indexOf("useCourseIntel()"));
    for (const name of [
      "historyEntries",
      "courseNames",
      "historyLoading",
      "historyError",
      "historyOpen",
      "toggleHistoryOpen",
      "deletingHistoryId",
      "deleteHistoryEntry",
      "clearingHistory",
      "clearHistory",
    ]) {
      expect(destructureBlock, `useCourseIntel() destructure should include ${name}`).toContain(name);
    }
  });

  it("useCourseIntel.ts actually CALLS getAllCourseIntelHistoryAction, not merely imports it", () => {
    expect(HOOK).toMatch(/import\s*\{[^}]*getAllCourseIntelHistoryAction[^}]*\}\s*from\s*["']\.\.\/\.\.\/actions\/course-intel["']/);
    expect(HOOK).toMatch(/await getAllCourseIntelHistoryAction\(\)/);
  });

  it("useCourseIntel.ts calls getAllCourseIntelHistoryAction from inside a useEffect, so it runs on mount without a click", () => {
    const effectStart = HOOK.indexOf("useEffect(() => {");
    const callIndex = HOOK.indexOf("await getAllCourseIntelHistoryAction()");
    expect(effectStart).toBeGreaterThan(-1);
    expect(callIndex).toBeGreaterThan(effectStart);
  });

  it("useCourseIntel.ts routes delete through deleteCourseIntelAnswerAction and clear through clearAllCourseIntelHistoryAction", () => {
    expect(HOOK).toMatch(/await deleteCourseIntelAnswerAction\(id\)/);
    expect(HOOK).toMatch(/await clearAllCourseIntelHistoryAction\(\)/);
  });

  it("useCourseIntel.ts refreshes history after ask() persists a new answer", () => {
    // The specific regression this guards: an answer is asked and saved, but
    // the on-screen history list is never told, so it looks unchanged until
    // a manual reload - which is a smaller version of the exact "nothing
    // reads it back" defect this whole file exists to prevent.
    const askIndex = HOOK.indexOf("const ask = () => {");
    expect(askIndex).toBeGreaterThan(-1);
    const askBody = HOOK.slice(askIndex);
    expect(askBody).toMatch(/if \(resolved\.id\) refreshHistory\(\);/);
  });

  it("CourseIntelHistory.tsx renders entry.answerMarkdown through markdownToHtml, never markdown-lite", () => {
    expect(HISTORY_COMPONENT).toMatch(/import \{ markdownToHtml \} from ["']@\/lib\/markdown["']/);
    expect(HISTORY_COMPONENT).toMatch(/markdownToHtml\(entry\.answerMarkdown\)/);
  });

  it("CourseIntelHistory.tsx renders a per-entry scope line via describeCourseIntelHistoryScope", () => {
    expect(HISTORY_COMPONENT).toMatch(/describeCourseIntelHistoryScope\(entry, courseNames\)/);
  });

  it("the all-scopes actions exist in src/app/actions/course-intel.ts and call the all-scopes lib functions, not the per-course ones", () => {
    expect(ACTIONS).toMatch(/export async function getAllCourseIntelHistoryAction/);
    expect(ACTIONS).toMatch(/export async function clearAllCourseIntelHistoryAction/);
    expect(ACTIONS).toMatch(/listAllCourseIntelAnswers\(supabase, user\.id\)/);
    expect(ACTIONS).toMatch(/await clearAllCourseIntelAnswers\(supabase, user\.id\)/);
  });

  it("getAllCourseIntelHistoryAction resolves course names from this user's OWN course list, not a client-supplied one", () => {
    const fnIndex = ACTIONS.indexOf("export async function getAllCourseIntelHistoryAction");
    const fnBody = ACTIONS.slice(fnIndex, ACTIONS.indexOf("\n}", fnIndex));
    expect(fnBody).toMatch(/listCourses\(user\.id\)/);
  });

  it("finds all four files at a real size, so a rename or an empty stub cannot make this pass vacuously", () => {
    for (const [name, source] of [
      ["index.tsx", INDEX],
      ["useCourseIntel.ts", HOOK],
      ["CourseIntelHistory.tsx", HISTORY_COMPONENT],
      ["course-intel.ts (actions)", ACTIONS],
    ] as const) {
      expect(source.length, `${name} read as unexpectedly small`).toBeGreaterThan(1000);
    }
  });
});
