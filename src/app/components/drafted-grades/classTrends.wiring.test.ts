// Backlog N12 - reachability guard for the class trends feature.
//
// src/lib/grade/class-trends.ts (layer A) and
// src/app/api/class-trends-insight/route.ts (layer B) shipped fully tested
// with NO caller anywhere in the app - class-trends.ts had no import site at
// all, and the route was a live endpoint nothing ever posted to. This suite
// is deliberately a REACHABILITY assertion, not merely a rendering one: it
// checks that DraftedGradesTab.tsx actually imports and mounts
// ClassTrendsPanel, and that ClassTrendsPanel itself imports layer A's pure
// compute function and posts to layer B's exact route path. A test that only
// exercised ClassTrendsPanel's own internals would pass even if nothing in
// the app ever mounted it - exactly how this feature shipped unreachable the
// first time.
//
// vitest here is node-env and collects only src/**/*.test.ts - no component
// is ever rendered by this suite (or any suite in this repo). Every check
// below reads the two files as TEXT, the same idiom askAiSelection.wiring.test.ts
// and generatedPreviewModal.wiring.test.ts already use, and pins FACTS and
// ORDERING rather than exact prose spelling.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const TAB_PATH = join(process.cwd(), "src/app/components/DraftedGradesTab.tsx");
const PANEL_PATH = join(process.cwd(), "src/app/components/drafted-grades/ClassTrendsPanel.tsx");
const CLASS_TRENDS_PATH = join(process.cwd(), "src/lib/grade/class-trends.ts");
const ROUTE_PATH = join(process.cwd(), "src/app/api/class-trends-insight/route.ts");
const STUDENT_LIST_PATH = join(process.cwd(), "src/app/components/drafted-grades/ClassTrendsStudentListPanel.tsx");

const tabSource = readFileSync(TAB_PATH, "utf8");
const panelSource = readFileSync(PANEL_PATH, "utf8");
const classTrendsSource = readFileSync(CLASS_TRENDS_PATH, "utf8");
const routeSource = readFileSync(ROUTE_PATH, "utf8");
const studentListSource = readFileSync(STUDENT_LIST_PATH, "utf8");

/** Source with line/block comments stripped, so a name mentioned only in
 * prose (e.g. this very file's own header, or a doc comment) is never
 * mistaken for a real import or render site. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").split(/\r?\n/).map((line) => line.replace(/\/\/.*$/, "")).join("\n");
}

const strippedTab = stripComments(tabSource);
const strippedPanel = stripComments(panelSource);
const strippedStudentList = stripComments(studentListSource);

describe("DraftedGradesTab mounts ClassTrendsPanel (reachability, not merely rendering)", () => {
  it("imports ClassTrendsPanel from the drafted-grades folder", () => {
    expect(strippedTab).toMatch(
      /import\s+ClassTrendsPanel\s+from\s*["']\.\/drafted-grades\/ClassTrendsPanel["']/
    );
  });

  it("renders <ClassTrendsPanel> somewhere in the tab", () => {
    expect(strippedTab).toMatch(/<ClassTrendsPanel\b/);
  });

  it("mounts it inside the per-assignment group header, alongside the checklist panel, passing the same run entry", () => {
    // Structural anchor: both panels belong to the same group header block
    // (the <div className={local.groupHeader}> that also holds
    // AssignmentChecklistPanel), not merely somewhere loose in the file.
    const groupHeaderIdx = strippedTab.indexOf("local.groupHeader");
    expect(groupHeaderIdx, "group header block not found").toBeGreaterThan(-1);
    const checklistIdx = strippedTab.indexOf("<AssignmentChecklistPanel", groupHeaderIdx);
    expect(checklistIdx, "AssignmentChecklistPanel not rendered in the group header").toBeGreaterThan(-1);
    const trendsIdx = strippedTab.indexOf("<ClassTrendsPanel", groupHeaderIdx);
    expect(trendsIdx, "ClassTrendsPanel not rendered in the group header").toBeGreaterThan(-1);

    const tagEnd = strippedTab.indexOf(">", trendsIdx);
    const tag = strippedTab.slice(trendsIdx, tagEnd + 1);
    expect(tag).toMatch(/entry=\{entry\}/);
  });

  // Consistency with the other five grading-subtab surfaces (run, chat,
  // repos, recording, snapshots): each gates the ClassTrendsPanel mount on
  // hasTrendableResults so an all-ungraded run never renders a clickable
  // "Trends (0)" button (classTrendsEntry.ts's own docstring names exactly
  // this failure). Drafts shipped WITHOUT the gate; this pins that it now
  // has it. Direction of failure: removing the gate drops the guarded form
  // and this test goes RED.
  it("gates the mount on hasTrendableResults(entry), like the other five surfaces", () => {
    expect(
      strippedTab,
      "hasTrendableResults not imported into DraftedGradesTab"
    ).toMatch(
      /import\s*\{[^}]*hasTrendableResults[^}]*\}\s*from\s*["']\.\/grading-results\/classTrendsEntry["']/
    );
    // The nearest hasTrendableResults(entry) call must precede the mount,
    // with no other <ClassTrendsPanel opening tag between the gate and it.
    const mountIdx = strippedTab.indexOf("<ClassTrendsPanel");
    expect(mountIdx, "<ClassTrendsPanel mount not found").toBeGreaterThan(-1);
    const gateIdx = strippedTab.lastIndexOf("hasTrendableResults(entry)", mountIdx);
    expect(gateIdx, "no hasTrendableResults(entry) gate before the mount").toBeGreaterThan(-1);
    const between = strippedTab.slice(gateIdx, mountIdx);
    expect(between).not.toMatch(/<ClassTrendsPanel/);
  });
});

describe("ClassTrendsPanel reaches both layers of the class trends feature", () => {
  it("imports layer A's pure compute function from src/lib/grade/class-trends", () => {
    expect(strippedPanel).toMatch(
      /import\s*\{[^}]*\bcomputeClassTrends\b[^}]*\}\s*from\s*["']@\/lib\/grade\/class-trends["']/
    );
  });

  it("calls computeClassTrends unconditionally on render, not inside the layer B fetch path", () => {
    // Requirement 1: layer A must never be gated behind layer B's network
    // call. computeClassTrends must be invoked outside of (before) any
    // fetch()/async function body in this file.
    const computeIdx = strippedPanel.indexOf("computeClassTrends(");
    const fetchIdx = strippedPanel.indexOf("fetch(");
    expect(computeIdx, "computeClassTrends is never called").toBeGreaterThan(-1);
    expect(fetchIdx, "no fetch call found").toBeGreaterThan(-1);
    expect(computeIdx).toBeLessThan(fetchIdx);
  });

  it("posts to the class-trends-insight route's exact path", () => {
    expect(strippedPanel).toContain('fetch(CLASS_TRENDS_INSIGHT_ROUTE');
    expect(strippedPanel).toMatch(
      /const\s+CLASS_TRENDS_INSIGHT_ROUTE\s*=\s*["']\/api\/class-trends-insight["']/
    );
  });

  it("reuses containsForbiddenCompletenessPhrase rather than re-deriving the forbidden-phrase list", () => {
    expect(strippedPanel).toMatch(
      /import\s*\{[^}]*\bcontainsForbiddenCompletenessPhrase\b[^}]*\}\s*from\s*["']@\/lib\/grade\/class-trends["']/
    );
    expect(strippedPanel).toContain("containsForbiddenCompletenessPhrase(");
  });

  it("never renders a student name (no result.student / entry.run.results[...].student read)", () => {
    expect(strippedPanel).not.toMatch(/\.student\b/);
  });

  it("A16-1 (V7): the expanded initializer is seeded from the new defaultExpanded prop, not a hardcoded literal", () => {
    // S7's mutation ("useState(false)", ignoring the prop entirely) must
    // trip this - a hardcoded false would still compile and would still let
    // Drafted Grades' own mount (which passes no defaultExpanded) behave
    // identically, so nothing else here would catch it.
    expect(strippedPanel).toMatch(/useState\(\s*defaultExpanded\s*\)/);
  });

  it("wraps every fetch response path so a network failure never throws", () => {
    // Requirement 7: this app has no error boundary, so ClassTrendsPanel must
    // never let the layer B fetch throw uncaught. The fetch call itself, and
    // the .json() parse of its response, must each sit inside a try block.
    const tryCount = [...strippedPanel.matchAll(/\btry\s*\{/g)].length;
    expect(tryCount).toBeGreaterThanOrEqual(2);
  });
});

describe("the surface actually reaches layer A and layer B's real exports (the seam prior gates missed)", () => {
  // THIS IS THE SEAM THAT CAN SHIP THE WHOLE FEATURE DEAD WITH EVERY OTHER
  // TEST GREEN: nothing executes ClassTrendsPanel's fetch against the real
  // route in this suite (vitest here is node-env and renders nothing, and
  // there is no route-handler harness), so the only thing making the wire
  // real is that computeClassTrends/containsForbiddenCompletenessPhrase are
  // genuinely exported where the panel imports them from, and that the route
  // this panel posts to is the route that actually exists on disk.
  it("class-trends.ts exports computeClassTrends and containsForbiddenCompletenessPhrase", () => {
    expect(classTrendsSource).toMatch(/export function computeClassTrends\(/);
    expect(classTrendsSource).toMatch(/export function containsForbiddenCompletenessPhrase\(/);
  });

  it("the class-trends-insight route file exists and declares a POST handler", () => {
    expect(routeSource).toMatch(/export async function POST\(/);
  });
});

// N13b Wave 2 (docs/n13b-wave2-test-notes.md section 4, Group C - argued, not
// executed by the test-author; run for real here).

describe("W2-14: ClassTrendsPanel mounts ClassTrendsStudentListPanel and passes instructorAttribution; the .student ban STAYS", () => {
  it("imports ClassTrendsStudentListPanel from the drafted-grades folder", () => {
    expect(strippedPanel).toMatch(/import\s+ClassTrendsStudentListPanel\s+from/);
  });

  it("renders <ClassTrendsStudentListPanel>", () => {
    expect(strippedPanel).toMatch(/<ClassTrendsStudentListPanel\b/);
  });

  it("the mount's opening tag carries instructorAttribution=", () => {
    const idx = strippedPanel.indexOf("<ClassTrendsStudentListPanel");
    expect(idx, "mount not found").toBeGreaterThan(-1);
    const tagEnd = strippedPanel.indexOf(">", idx);
    expect(tagEnd).toBeGreaterThan(idx);
    const tag = strippedPanel.slice(idx, tagEnd + 1);
    expect(tag).toMatch(/instructorAttribution=/);
  });

  it("the .student ban still holds - names enter the leaf via instructorAttribution, never the panel via .student", () => {
    expect(strippedPanel).not.toMatch(/\.student\b/);
  });
});

describe("W2-15: the new leaf is reachable and reads the attribution CONTENT", () => {
  it("references its instructorAttribution prop", () => {
    expect(strippedStudentList).toMatch(/instructorAttribution\b/);
  });

  it("references displayName - the field it must show", () => {
    expect(strippedStudentList).toMatch(/displayName\b/);
  });

  it("iterates with .map(", () => {
    expect(strippedStudentList).toMatch(/\.map\(/);
  });
});

describe("W2-18(b): the new leaf's Copy control is labeled distinctly from the class draft's own", () => {
  it('contains the exact label "Copy student list"', () => {
    expect(strippedStudentList).toContain("Copy student list");
  });
});

describe("W2-19: the three-way empty-state branch", () => {
  it("(i) PRIMARY: the leaf's stripped source contains an emptiness test on its attribution prop", () => {
    expect(strippedStudentList).toMatch(
      /instructorAttribution\b[\s\S]{0,60}\.length|\.length\s*===\s*0|\.length\s*>\s*0/
    );
  });

  it("(iii) the leaf DOES contain 'Copy student list' and a .map( somewhere (state 3 renders them)", () => {
    expect(strippedStudentList).toContain("Copy student list");
    expect(strippedStudentList).toMatch(/\.map\(/);
  });

  it("STATE 1: the panel's areas-empty consequent does not contain the leaf mount (only ONE empty message shows)", () => {
    const emptyTestIdx = strippedPanel.indexOf("report.areas.length === 0");
    expect(emptyTestIdx, "areas-empty test not found").toBeGreaterThan(-1);
    const questionIdx = strippedPanel.indexOf("?", emptyTestIdx);
    expect(questionIdx).toBeGreaterThan(-1);
    const colonIdx = strippedPanel.indexOf(":", questionIdx);
    expect(colonIdx).toBeGreaterThan(-1);
    const emptyConsequent = strippedPanel.slice(questionIdx, colonIdx);
    expect(emptyConsequent).not.toContain("ClassTrendsStudentListPanel");
  });

  it("sabotage control (state 2/3): if the leaf rendered its heading + button unconditionally (no emptiness branch at all), the (i) anchor above would no longer match", () => {
    // Documents the discriminating mutation without actually mutating
    // source: an unconditional-render leaf source (no length test at all)
    // would fail the (i) regex above. Sanity-checked against a literal
    // fixture string standing in for that mutant.
    const mutantSource = `
      export default function ClassTrendsStudentListPanel({ instructorAttribution }) {
        return (<div><button>Copy student list</button>{instructorAttribution.map((a) => <li key={a.area}>{a.displayArea}</li>)}</div>);
      }
    `;
    expect(mutantSource).not.toMatch(/instructorAttribution\b[\s\S]{0,60}\.length|\.length\s*===\s*0|\.length\s*>\s*0/);
  });

  it("sabotage control (state 1): if the leaf mount moved into the panel's areas-empty arm, the empty-consequent slice above would contain it", () => {
    const mutantPanelSlice = "report.areas.length === 0 ? (<ClassTrendsStudentListPanel instructorAttribution={report.instructorAttribution} />) : (<ul />)";
    const questionIdx = mutantPanelSlice.indexOf("?");
    const colonIdx = mutantPanelSlice.indexOf(":", questionIdx);
    const emptyConsequent = mutantPanelSlice.slice(questionIdx, colonIdx);
    expect(emptyConsequent).toContain("ClassTrendsStudentListPanel");
  });
});

// Verify fix: under identity {kind:"unavailable"}, the repo surface must not
// fall into the leaf's genuine-emptiness State 2 message ("nothing to contact
// anyone about yet") - that would be a false reassurance, since the subset
// was never computed. A fourth state must surface identity.reason instead.
describe("blocker fix: the unavailable identity surfaces its reason instead of State 2's false-empty message", () => {
  it("ClassTrendsPanel passes identity.reason to the leaf as unavailableReason under identity.kind === \"unavailable\"", () => {
    const idx = strippedPanel.indexOf("<ClassTrendsStudentListPanel");
    expect(idx, "mount not found").toBeGreaterThan(-1);
    const tagEnd = strippedPanel.indexOf("/>", idx);
    expect(tagEnd).toBeGreaterThan(idx);
    const tag = strippedPanel.slice(idx, tagEnd + 2);
    expect(tag).toMatch(/unavailableReason=\{[^}]*identity\.kind\s*===\s*["']unavailable["'][^}]*identity\.reason[^}]*\}/);
  });

  it("the leaf has a branch keyed on unavailableReason that renders it, appearing before the State-2 length check", () => {
    const reasonIdx = strippedStudentList.indexOf("unavailableReason");
    // First occurrence is the destructured prop; find the first conditional
    // branch that reads it as a truthiness/emptiness test.
    const branchIdx = strippedStudentList.search(/if\s*\(\s*unavailableReason\s*\)/);
    expect(reasonIdx, "unavailableReason prop not referenced").toBeGreaterThan(-1);
    expect(branchIdx, "no `if (unavailableReason)` guard branch found").toBeGreaterThan(-1);

    const state2Idx = strippedStudentList.indexOf("instructorAttribution.length === 0");
    expect(state2Idx, "State-2 emptiness check not found").toBeGreaterThan(-1);
    expect(branchIdx, "unavailableReason branch must be checked before the State-2 emptiness branch").toBeLessThan(state2Idx);

    // The unavailableReason branch itself must actually render the value,
    // not just test it: {unavailableReason} must appear between the guard
    // and the State-2 check (i.e. inside the guarded return, not state 2/3).
    const renderIdx = strippedStudentList.indexOf("{unavailableReason}", branchIdx);
    expect(renderIdx, "{unavailableReason} is never rendered").toBeGreaterThan(-1);
    expect(renderIdx).toBeLessThan(state2Idx);
  });

  it("the unavailableReason branch's message does not assert a count occurred or nothing was found (never contains the State-2 sentence)", () => {
    const branchIdx = strippedStudentList.search(/if\s*\(\s*unavailableReason\s*\)/);
    expect(branchIdx).toBeGreaterThan(-1);
    const state2Idx = strippedStudentList.indexOf("instructorAttribution.length === 0");
    const branchBlock = strippedStudentList.slice(branchIdx, state2Idx);
    expect(branchBlock).not.toContain("nothing to contact anyone about yet");
  });

  it("sabotage control: removing the unavailableReason guard (leaving only the State-2 check) makes the guard-order assertion fail", () => {
    const mutantSource = `
      export default function ClassTrendsStudentListPanel({ instructorAttribution, unavailableReason }) {
        if (instructorAttribution.length === 0) {
          return (<span>No area yet has three or more students who missed points - nothing to contact anyone about yet.</span>);
        }
        return (<div>{unavailableReason}</div>);
      }
    `;
    const branchIdx = mutantSource.search(/if\s*\(\s*unavailableReason\s*\)/);
    expect(branchIdx, "mutant has no unavailableReason guard, as expected").toBe(-1);
  });
});
