// "Visualizer coverage" bulk bar row - placement/wiring guard.
//
// docs/visualizer-coverage-from-selection-acceptance-criteria.md (Contract 4
// and its A/B/C acceptance criteria): the row must render directly after the
// Ask AI row and before the module/item bulk-action sections, its hook must
// be threaded with the same export-aware identifiers the sibling hooks
// already receive, it must render no modal/dialog/popover/fixed-position
// overlay (D4), the create control must name the external GitHub repo
// BEFORE it is clicked, and a gap reasoned "topic-not-creatable" must never
// be offered for creation.
//
// vitest here is node-env and collects only `src/**/*.test.ts`, so nothing
// here is ever rendered - this file reads ModulesView.tsx,
// VisualizerCoverageSection.tsx and useVisualizerCoverage.ts as TEXT, the
// same idiom askAiSelection.wiring.test.ts already uses (read in full before
// this was written). This is ALSO the only option available today: the hook
// imports from `@/lib/visualizer/selection-coverage` (set A) and
// `@/app/actions/visualizer-selection` (set B), both still being built
// concurrently - an `import` of useVisualizerCoverage.ts here would fail to
// resolve until those land, so every assertion below reads SOURCE TEXT only
// and never imports the hook module.
//
// What is pinned below is FACTS and ORDERING (the row renders in the bulk
// bar, after the Ask AI row; the hook is threaded with the export-aware
// identifiers; the row renders no previewBackdrop; create is unreachable for
// a not-creatable gap; the create control names the external repo) - never
// exact prose spelling, per this repo's own "over-specified string
// assertions have forced contorted implementations before" note
// (source-text-tests-overspecify).
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const MODULES_VIEW_PATH = join(process.cwd(), "src/app/components/content-tab/ModulesView.tsx");
const ROW_PATH = join(process.cwd(), "src/app/components/content-tab/modules/VisualizerCoverageSection.tsx");
const HOOK_PATH = join(process.cwd(), "src/app/components/content-tab/modules/useVisualizerCoverage.ts");

const modulesViewSource = readFileSync(MODULES_VIEW_PATH, "utf8");
const rowSource = readFileSync(ROW_PATH, "utf8");
const hookSource = readFileSync(HOOK_PATH, "utf8");

/** Source with line/block comments stripped, so a name mentioned only in
 * prose (e.g. this very file's own header, or the hook's/row's own header
 * comments discussing "modal"/"GitHub"/etc. as concepts) is never mistaken
 * for a real render site, import, or disclosure. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

describe("VisualizerCoverageSection is wired into ModulesView's bulk bar", () => {
  it("imports both the hook and the row component", () => {
    expect(modulesViewSource).toMatch(/import\s*\{\s*useVisualizerCoverage\s*\}\s*from\s*["']\.\/modules\/useVisualizerCoverage["']/);
    expect(modulesViewSource).toMatch(/import\s*\{\s*VisualizerCoverageSection\s*\}\s*from\s*["']\.\/modules\/VisualizerCoverageSection["']/);
  });

  it("renders <VisualizerCoverageSection> after <AskAiSelectionSection> and before the module/item bulk sections", () => {
    const stripped = stripComments(modulesViewSource);
    const askAiIdx = stripped.indexOf("<AskAiSelectionSection");
    const rowIdx = stripped.indexOf("<VisualizerCoverageSection");
    const modulesSectionIdx = stripped.indexOf("<BulkModulesSection");
    const itemsSectionIdx = stripped.indexOf("<BulkItemsSection");

    expect(askAiIdx, "AskAiSelectionSection is never rendered").toBeGreaterThan(-1);
    expect(rowIdx, "VisualizerCoverageSection is never rendered").toBeGreaterThan(-1);
    expect(modulesSectionIdx, "BulkModulesSection is never rendered").toBeGreaterThan(-1);
    expect(itemsSectionIdx, "BulkItemsSection is never rendered").toBeGreaterThan(-1);

    // A1: directly after Ask AI, and strictly before either conditional
    // bulk-action section that follows it in the same bar.
    expect(rowIdx).toBeGreaterThan(askAiIdx);
    expect(rowIdx).toBeLessThan(modulesSectionIdx);
    expect(rowIdx).toBeLessThan(itemsSectionIdx);
  });

  it("renders the row inside the same bulk bar the other selection rows render in", () => {
    // Structural anchor: the bulk bar only exists inside the
    // `(selection.selected.size > 0 || selection.selectedModules.size > 0)`
    // gate. The render site must fall inside that same block, or the row
    // would be misplaced outside the bar entirely.
    const stripped = stripComments(modulesViewSource);
    const barGateIdx = stripped.indexOf("styles.bulkBar}");
    expect(barGateIdx, "bulk bar not found").toBeGreaterThan(-1);
    const barCloseIdx = stripped.indexOf("<BulkModulesSection", barGateIdx);
    const rowIdx = stripped.indexOf("<VisualizerCoverageSection", barGateIdx);
    expect(rowIdx).toBeGreaterThan(barGateIdx);
    expect(rowIdx).toBeLessThan(barCloseIdx);
  });

  it("threads the hook with the same export-aware identifiers the sibling hooks already receive", () => {
    // A2/C7: the hook needs the export selection's course_hub row id
    // (exportCourseId), the institution acronym, the live module tree AND
    // the export tree (for the live/export expansion split - A2), the LLM
    // provider, the tab-wide setBusy/reload (C7/C8 - link is a real Canvas
    // write), and the active source context (C7's gateOperation gate) - not
    // a fresh set of names that could silently drift from what
    // selectionDownload/selectionChatContext/lmsGeneration already thread.
    const stripped = stripComments(modulesViewSource);
    const callIdx = stripped.indexOf("useVisualizerCoverage(");
    expect(callIdx, "useVisualizerCoverage is never called").toBeGreaterThan(-1);
    const callEnd = stripped.indexOf(");", callIdx);
    const callArgs = stripped.slice(callIdx, callEnd);
    expect(callArgs).toMatch(/\bcourseUrl\b/);
    expect(callArgs).toMatch(/\bexportCourseId\b/);
    expect(callArgs).toMatch(/\bacronym\b/);
    expect(callArgs).toMatch(/\bprovider\b/);
    expect(callArgs).toMatch(/selection\.selectedMaterialItems/);
    expect(callArgs).toMatch(/selection\.selectedModules/);
    expect(callArgs).toMatch(/\bmodules,\s*exportModules,/);
    expect(callArgs).toMatch(/\bsetNote\b/);
    expect(callArgs).toMatch(/\bsetBusy\b/);
    expect(callArgs).toMatch(/\breload\b/);
    // C7: the active ContentSourceContext (ModulesView's own `ctx`), so an
    // export-sourced selection's `link` refuses with the established
    // gateOperation wording instead of failing at the Canvas API.
    expect(callArgs).toMatch(/\bctx\b/);
  });

  it("binds the row's props to the hook's own return value", () => {
    const stripped = stripComments(modulesViewSource);
    const start = stripped.indexOf("<VisualizerCoverageSection");
    expect(start).toBeGreaterThan(-1);
    const end = stripped.indexOf("/>", start);
    const tag = stripped.slice(start, end + 2);
    expect(tag).toMatch(/busy=\{visualizerCoverage\.busy\}/);
    expect(tag).toMatch(/coverage=\{visualizerCoverage\.coverage\}/);
    expect(tag).toMatch(/onScan=\{visualizerCoverage\.scan\}/);
    expect(tag).toMatch(/onLink=\{visualizerCoverage\.link\}/);
    expect(tag).toMatch(/onCreate=\{visualizerCoverage\.create\}/);
    expect(tag).toMatch(/moduleChoice=\{visualizerCoverage\.moduleChoice\}/);
    expect(tag).toMatch(/onModuleChoiceChange=\{visualizerCoverage\.setModuleChoice\}/);
    expect(tag).toMatch(/moduleOptions=\{visualizerCoverage\.moduleOptions\}/);
    expect(tag).toMatch(/linkUnavailableReason=\{visualizerCoverage\.linkUnavailableReason\}/);
    expect(tag).toMatch(/createUnavailableReason=\{visualizerCoverage\.createUnavailableReason\}/);
    // Blocker 1(a): the row's button-label swap and its own aria-live
    // confirmation banner both key off these two booleans - if ModulesView
    // stopped threading them through, the row would fall back to its
    // (required, no-default) props failing to compile, but pinning the
    // actual binding here catches a silent prop-name typo too.
    expect(tag).toMatch(/linkArmed=\{visualizerCoverage\.linkArmed\}/);
    expect(tag).toMatch(/createArmed=\{visualizerCoverage\.createArmed\}/);
  });
});

describe("VisualizerCoverageSection renders no modal/overlay (D4)", () => {
  it("contains no previewBackdrop, no createPortal, and no fixed-position styling", () => {
    // Stripped first: this file's own header comment discusses the very
    // stacking-context hazard it avoids (quoting `styles.previewBackdrop` as
    // the thing generatedPreviewModal.wiring.test.ts polices), which would
    // otherwise make this assertion fail for a reason that is not a real
    // violation.
    const stripped = stripComments(rowSource);
    expect(stripped).not.toContain("styles.previewBackdrop");
    expect(stripped).not.toContain("createPortal");
    expect(stripped).not.toMatch(/position:\s*["']fixed["']/);
  });

  it("imports/renders no Dialog, Modal or Popover shell", () => {
    const stripped = stripComments(rowSource);
    expect(stripped).not.toMatch(/<(Dialog|Modal|Popover)\b/);
    expect(stripped).not.toMatch(/import\s*\{[^}]*\b(Dialog|Modal|Popover)\b[^}]*\}\s*from/);
  });
});

describe("activation always calls the hook's handler - never guarded by the button itself (A7-style rule)", () => {
  it("each control's onClick is a direct, unconditional call", () => {
    // A guarded onClick (e.g. `onClick={() => !busy && onScan()}`) would
    // defeat the "activation always calls the handler" rule the same way an
    // earlier draft of DownloadSelectionSection was found to - the decision
    // to proceed or refuse belongs entirely in the hook.
    const stripped = stripComments(rowSource);
    expect(stripped).toMatch(/onClick=\{onScan\}/);
    expect(stripped).toMatch(/onClick=\{onLink\}/);
    expect(stripped).toMatch(/onClick=\{onCreate\}/);
  });
});

describe("the create control discloses the external GitHub repo write before it is clicked", () => {
  it("the row's own always-visible text (label, title, or hint) names GitHub/the repo, not only a comment", () => {
    // Stripped first so this couldn't pass merely because the header
    // comment (which also discusses the repo at length) mentions it -
    // the disclosure must be in actual rendered output.
    const stripped = stripComments(rowSource);
    expect(stripped).toMatch(/github/i);
    expect(stripped).toMatch(/repo/i);
  });

  it("the disclosure sits on the Create button's own render, not merely somewhere else in the row", () => {
    const stripped = stripComments(rowSource);
    const createBtnStart = stripped.indexOf("onClick={onCreate}");
    expect(createBtnStart, "no button wired to onCreate").toBeGreaterThan(-1);
    // The button's own JSX element (from its opening tag to its closing
    // </Button>) is where the label/title live for the control a user
    // actually clicks - bounded search rather than "somewhere in the file"
    // so an unrelated GitHub mention elsewhere could not satisfy this.
    const tagStart = stripped.lastIndexOf("<Button", createBtnStart);
    const tagCloseIdx = stripped.indexOf("</Button>", createBtnStart);
    const block = stripped.slice(tagStart, tagCloseIdx);
    expect(block).toMatch(/github/i);
  });

  it("the hook's own arming confirmation for create also names the external repo (defense in depth)", () => {
    const stripped = stripComments(hookSource);
    const createFnStart = stripped.indexOf("const create = () => {");
    expect(createFnStart, "create() not found in the hook").toBeGreaterThan(-1);
    const body = stripped.slice(createFnStart);
    expect(body).toMatch(/github/i);
  });
});

describe("create is unreachable for a not-creatable gap (A4/B1)", () => {
  it("both the availability check and the confirm-time filter exclude a topic-not-creatable gap by the SAME condition", () => {
    // The defect this pins: a scan that classifies covered/gap correctly but
    // then offers a "topic-not-creatable" gap to `create` anyway. Both the
    // reason-computing helper (what the row's aria-disabled state reads) and
    // `create()` itself (what actually runs) must filter on the identical
    // "reason === 'no-match'" condition - a divergence between the two would
    // let the button light up green while still creating an excluded gap, or
    // vice versa.
    const stripped = stripComments(hookSource);
    const filterExpr = /g\.reason\s*===\s*["']no-match["']/;
    const matches = [...stripped.matchAll(new RegExp(filterExpr.source, "g"))];
    expect(matches.length, "expected the no-match filter in both computeCreateUnavailableReason and create()").toBeGreaterThanOrEqual(2);
  });

  it("the row explains why excluded gaps are not offered, in visible text", () => {
    const stripped = stripComments(rowSource);
    expect(stripped).toMatch(/not-?[Cc]reatable|cannot receive a new page/);
  });
});

describe("useVisualizerCoverage exposes the documented Contract 4 return shape", () => {
  it("exports a function of that name", () => {
    expect(hookSource).toMatch(/export function useVisualizerCoverage\(/);
  });

  it("exports the VisualizerCoverageBusy union exactly as the AC doc specifies", () => {
    expect(hookSource).toMatch(/export type VisualizerCoverageBusy\s*=\s*"" \| "scan" \| "link" \| "create"/);
  });

  it("returns every field Contract 4 names, under the documented names", () => {
    const stripped = stripComments(hookSource);
    const returnIdx = stripped.lastIndexOf("return {");
    expect(returnIdx, "no return object found").toBeGreaterThan(-1);
    const returnEnd = stripped.indexOf("};", returnIdx);
    const body = stripped.slice(returnIdx, returnEnd);
    for (const key of [
      "busy",
      "coverage",
      "scan",
      "link",
      "create",
      "moduleChoice",
      "setModuleChoice",
      "moduleOptions",
      "linkUnavailableReason",
      "createUnavailableReason",
      // Blocker 1(a): floor, not ceiling - added on top of the original
      // Contract 4 list (docs/visualizer-coverage-from-selection-
      // acceptance-criteria.md's own updated Contract 4 block).
      "linkArmed",
      "createArmed",
    ]) {
      expect(body, `missing "${key}" on the hook's return object`).toMatch(new RegExp(`\\b${key}\\b`));
    }
  });

  it("imports the fixed contracts from the leaves owned by sets A and B, not local reimplementations", () => {
    // This hook must code AGAINST Contract 1/3, not declare its own copies of
    // the scan/link actions or the SelectionCoverage shape - the same drift
    // risk useSelectionChatContext.ts's own equivalent test guards against
    // for its own two contracts. `create` no longer calls a Server Action
    // here at all (see the next describe block below) - it calls the
    // visualizer-create Route Handler instead, exactly the way
    // src/app/api/lms-generation/deck/route.ts's own client caller
    // (generateDeckApi) does for deck generation.
    expect(hookSource).toMatch(/from ["']@\/lib\/visualizer\/selection-coverage["']/);
    expect(hookSource).toMatch(/from ["']@\/app\/actions\/visualizer-selection["']/);
    expect(hookSource).toMatch(/scanSelectionForVisualizerCoverageAction/);
    expect(hookSource).toMatch(/linkVisualizerPagesIntoModuleAction/);
  });

  // A7: the create Server Action was REMOVED, not merely bypassed - this
  // hook must not import it at all, so there is no second, dead path back to
  // the same external-repo write standing alongside the route. Checked with
  // comments stripped: the hook's own doc comments legitimately NAME the old
  // action in prose (explaining why/where it moved), which is not the same
  // thing as importing or calling it.
  it("A7: does not import or call createVisualizerPagesForGapsAction (the removed Server Action) anywhere outside a comment", () => {
    const stripped = stripComments(hookSource);
    expect(stripped).not.toMatch(/createVisualizerPagesForGapsAction/);
  });

  // A3: create() calls the Route Handler directly via fetch, not a Server
  // Action - mirrors generateDeckApi's own call site for the deck route.
  it("create() calls the visualizer-create Route Handler via createVisualizerPagesApi, which itself fetches /api/visualizer/create", () => {
    expect(hookSource).toMatch(/export async function createVisualizerPagesApi\(/);
    const stripped = stripComments(hookSource);
    const apiFnStart = stripped.indexOf("export async function createVisualizerPagesApi(");
    expect(apiFnStart).toBeGreaterThan(-1);
    const apiFnEnd = stripped.indexOf("\n}\n", apiFnStart);
    const apiFnBody = stripped.slice(apiFnStart, apiFnEnd);
    expect(apiFnBody).toMatch(/fetch\(\s*["']\/api\/visualizer\/create["']/);
    // A3: a non-JSON response (an auth redirect, a platform timeout page)
    // must be treated as a clean error rather than letting JSON.parse throw -
    // the same guard useSelectionDownload.ts's own readErrorMessage documents.
    expect(apiFnBody).toMatch(/content-type/);
  });
});

describe("the two-click arm/disarm idiom (B1/C1) reuses confirmArming.ts, not a second scheme", () => {
  it("imports isConfirmArmed/selectionSignature rather than hand-rolling", () => {
    expect(hookSource).toMatch(/import\s*\{\s*isConfirmArmed,\s*selectionSignature\s*\}\s*from\s*["']\.\/confirmArming["']/);
  });

  it("link() checks isConfirmArmed before performing the write", () => {
    const stripped = stripComments(hookSource);
    const linkStart = stripped.indexOf("const link = () => {");
    const createStart = stripped.indexOf("const create = () => {");
    expect(linkStart).toBeGreaterThan(-1);
    expect(createStart).toBeGreaterThan(linkStart);
    const body = stripped.slice(linkStart, createStart);
    expect(body).toMatch(/isConfirmArmed\(linkArmedFor, currentSig\)/);
    // The network call (the action import) must appear only AFTER the arm
    // check - the same "guards return before the write" structural pattern
    // askAiSelection.wiring.test.ts already pins for openChat.
    const armIdx = body.indexOf("isConfirmArmed(linkArmedFor, currentSig)");
    const writeIdx = body.indexOf("linkVisualizerPagesIntoModuleAction(");
    expect(writeIdx).toBeGreaterThan(armIdx);
  });

  it("create() checks isConfirmArmed before performing the write", () => {
    const stripped = stripComments(hookSource);
    const createStart = stripped.indexOf("const create = () => {");
    expect(createStart).toBeGreaterThan(-1);
    const body = stripped.slice(createStart);
    const armIdx = body.indexOf("isConfirmArmed(createArmedFor, currentSig)");
    const writeIdx = body.indexOf("createVisualizerPagesApi(");
    expect(armIdx).toBeGreaterThan(-1);
    expect(writeIdx).toBeGreaterThan(armIdx);
  });

  // THE ARM GATE IS UNIT-TESTED; ITS WIRING WAS NOT.
  // useVisualizerCoverage.test.ts proves createArmGate itself refuses to
  // commit inside ARM_COMMIT_MIN_MS. But a regression pass found that
  // deleting the `!linkGate.current.canCommit()` guard from link() (and its
  // twin in create()) left the ENTIRE suite green - the gate was a correct
  // mechanism wired to nothing, which is exactly the shape of a fix that
  // ships inert. These two assertions pin the wiring itself: the guard is
  // present in each action's own body, and the write happens only after it.
  it("link() consults the arm gate before performing the write", () => {
    const stripped = stripComments(hookSource);
    const linkStart = stripped.indexOf("const link = () => {");
    const createStart = stripped.indexOf("const create = () => {");
    expect(linkStart).toBeGreaterThan(-1);
    expect(createStart).toBeGreaterThan(linkStart);
    const body = stripped.slice(linkStart, createStart);
    const gateIdx = body.indexOf("linkGate.current.canCommit()");
    const writeIdx = body.indexOf("linkVisualizerPagesIntoModuleAction(");
    expect(gateIdx, "link() no longer consults its arm gate - a double click can commit").toBeGreaterThan(-1);
    expect(writeIdx).toBeGreaterThan(gateIdx);
  });

  it("create() consults the arm gate before performing the write", () => {
    const stripped = stripComments(hookSource);
    const createStart = stripped.indexOf("const create = () => {");
    expect(createStart).toBeGreaterThan(-1);
    const body = stripped.slice(createStart);
    const gateIdx = body.indexOf("createGate.current.canCommit()");
    const writeIdx = body.indexOf("createVisualizerPagesApi(");
    expect(gateIdx, "create() no longer consults its arm gate - a double click can commit to the external repo").toBeGreaterThan(-1);
    expect(writeIdx).toBeGreaterThan(gateIdx);
  });

  it("a fresh scan disarms BOTH link and create unconditionally (B1/C1's own 're-scanning disarms it' clause)", () => {
    const stripped = stripComments(hookSource);
    const scanStart = stripped.indexOf("const scan = () => {");
    const linkStart = stripped.indexOf("const link = () => {");
    expect(scanStart).toBeGreaterThan(-1);
    expect(linkStart).toBeGreaterThan(scanStart);
    const body = stripped.slice(scanStart, linkStart);
    expect(body).toMatch(/setLinkArmedFor\(null\)/);
    expect(body).toMatch(/setCreateArmedFor\(null\)/);
  });

  it("blocker 1(c): arming link ALSO disarms any pending create confirmation, inside the arm branch itself", () => {
    // Verified finding: click Link (arms link) -> click Create (arms
    // create, note overwritten) -> click Create again (commits) -> click
    // Link ONCE -> writes to Canvas immediately, because nothing had ever
    // cleared linkArmedFor when create was armed. link()'s own ARMING
    // branch specifically (not merely its later commit branch, which never
    // runs if link is armed but never committed - exactly the exploited
    // case) must clear createArmedFor.
    const stripped = stripComments(hookSource);
    const linkStart = stripped.indexOf("const link = () => {");
    const createStart = stripped.indexOf("const create = () => {");
    expect(linkStart).toBeGreaterThan(-1);
    const body = stripped.slice(linkStart, createStart);
    const armCheckIdx = body.indexOf("isConfirmArmed(linkArmedFor, currentSig)");
    // Bounded to the ARM branch only: from the arm-check to the FIRST
    // `return;` that follows it (the branch's own early return), so a
    // cross-clear that only exists later, in the commit branch, does not
    // satisfy this - that branch never runs for an arm that is left
    // standing and never committed, which is precisely blocker 1(c)'s bug.
    const armBranchEnd = body.indexOf("return;", armCheckIdx);
    const armBranch = body.slice(armCheckIdx, armBranchEnd);
    expect(armBranch, "link()'s ARM branch never clears createArmedFor").toMatch(/setCreateArmedFor\(null\)/);
  });

  it("blocker 1(c): arming create ALSO disarms any pending link confirmation, inside the arm branch itself", () => {
    const stripped = stripComments(hookSource);
    const createStart = stripped.indexOf("const create = () => {");
    expect(createStart).toBeGreaterThan(-1);
    const body = stripped.slice(createStart);
    const armCheckIdx = body.indexOf("isConfirmArmed(createArmedFor, currentSig)");
    const armBranchEnd = body.indexOf("return;", armCheckIdx);
    const armBranch = body.slice(armCheckIdx, armBranchEnd);
    expect(armBranch, "create()'s ARM branch never clears linkArmedFor").toMatch(/setLinkArmedFor\(null\)/);
  });

  it("changing the module target invalidates a pending link confirmation", () => {
    // A confirmation note names a SPECIFIC module by name (see the hook's own
    // arming text); picking a different module by hand after arming must not
    // let the next click silently redirect that promise.
    const stripped = stripComments(hookSource);
    const setterStart = stripped.indexOf("const setModuleChoice = (v: string) => {");
    expect(setterStart).toBeGreaterThan(-1);
    const setterEnd = stripped.indexOf("};", setterStart);
    const body = stripped.slice(setterStart, setterEnd);
    expect(body).toMatch(/setLinkArmedFor\(null\)/);
  });
});

describe("no persisted control state for the module-target select (repo D5-style decision, justified in-file)", () => {
  it("declares no ta- localStorage key for moduleChoice", () => {
    expect(hookSource).not.toMatch(/localStorage\.(setItem|getItem)\(\s*["']ta-/);
  });

  it("documents WHY it is not persisted, not merely omitting it silently", () => {
    const stripped = hookSource; // keep comments - the justification lives in one
    expect(stripped).toMatch(/NO `ta-` LOCALSTORAGE KEY/);
  });
});

describe("D2: link() routes covered concepts and create() routes gap concepts - never swapped", () => {
  // The defect this pins: a hook that classifies covered/gap correctly but
  // wires the two halves BACKWARDS into the two actions - fed to
  // conceptsForLink here, `link()` must call it, never `conceptsForCreate`;
  // see conceptsForLink/conceptsForCreate's own doc comments and
  // useVisualizerCoverage.test.ts for the behavioural test of those two
  // functions in isolation.
  it("link() calls conceptsForLink (not conceptsForCreate) before its write", () => {
    const stripped = stripComments(hookSource);
    const linkStart = stripped.indexOf("const link = () => {");
    const createStart = stripped.indexOf("const create = () => {");
    const body = stripped.slice(linkStart, createStart);
    expect(body).toMatch(/conceptsForLink\(coverage\)/);
    expect(body).not.toMatch(/conceptsForCreate\(/);
    const routeIdx = body.indexOf("conceptsForLink(coverage)");
    const writeIdx = body.indexOf("linkVisualizerPagesIntoModuleAction(");
    expect(writeIdx).toBeGreaterThan(routeIdx);
  });

  it("create() calls conceptsForCreate (not conceptsForLink) before its write", () => {
    const stripped = stripComments(hookSource);
    const createStart = stripped.indexOf("const create = () => {");
    const returnIdx = stripped.lastIndexOf("return {");
    const body = stripped.slice(createStart, returnIdx);
    expect(body).toMatch(/conceptsForCreate\(coverage\)/);
    expect(body).not.toMatch(/conceptsForLink\(/);
    const routeIdx = body.indexOf("conceptsForCreate(coverage)");
    const writeIdx = body.indexOf("createVisualizerPagesApi(");
    expect(writeIdx).toBeGreaterThan(routeIdx);
  });
});

describe("scan never touches the tab-wide busy flag or reload; link does; create does neither (C1/C7/C8/B5)", () => {
  it("scan()'s body never calls setBusy( or reload(", () => {
    const stripped = stripComments(hookSource);
    const scanStart = stripped.indexOf("const scan = () => {");
    const linkStart = stripped.indexOf("const link = () => {");
    const body = stripped.slice(scanStart, linkStart);
    expect(body).not.toMatch(/\bsetBusy\(/);
    expect(body).not.toMatch(/\breload\(\)/);
  });

  it("link()'s body calls both setBusy( and reload(", () => {
    const stripped = stripComments(hookSource);
    const linkStart = stripped.indexOf("const link = () => {");
    const createStart = stripped.indexOf("const create = () => {");
    const body = stripped.slice(linkStart, createStart);
    expect(body).toMatch(/setBusy\(true\)/);
    expect(body).toMatch(/setBusy\(false\)/);
    expect(body).toMatch(/reload\(\)/);
  });

  it("create()'s body never calls setBusy( or reload(", () => {
    const stripped = stripComments(hookSource);
    const createStart = stripped.indexOf("const create = () => {");
    const returnIdx = stripped.lastIndexOf("return {");
    const body = stripped.slice(createStart, returnIdx);
    expect(body).not.toMatch(/\bsetBusy\(/);
    expect(body).not.toMatch(/\breload\(\)/);
  });
});

describe("SHOULD-FIX 15: the Create button never renders a zero count", () => {
  it("showCreate is gated on the actually-creatable gap count, not on gaps.length alone", () => {
    // The defect this pins: `gaps.length > 0` is true even when EVERY gap is
    // "topic-not-creatable", which used to render "Create 0 pages…". The fix
    // must gate on the same creatable-gaps value the button's own count is
    // built from.
    const stripped = stripComments(rowSource);
    expect(stripped).toMatch(/const showCreate = creatableGaps\.length > 0/);
  });

  it("the not-creatable explanation is a SEPARATE condition, so it still renders even when the button itself is hidden", () => {
    const stripped = stripComments(rowSource);
    expect(stripped).toMatch(/showNotCreatableHint/);
    expect(stripped).not.toMatch(/showCreate && notCreatableCount > 0/);
  });
});

describe("SHOULD-FIX 9: hints only reference controls actually on screen", () => {
  it("reasonIds is built from reasons gated on showLink/showCreate, not unconditionally", () => {
    // The defect this pins: before any scan, showLink/showCreate are both
    // false, but the OLD code passed linkUnavailableReason/
    // createUnavailableReason straight through regardless, rendering two
    // hint sentences (plus dangling aria-describedby ids) for two buttons
    // that do not exist yet.
    const stripped = stripComments(rowSource);
    expect(stripped).toMatch(/reasonIds\(\[showLink \? linkUnavailableReason : null, showCreate \? createUnavailableReason : null\]\)/);
  });
});

describe("SHOULD-FIX 3 / A5: the scan names covered concepts (with URLs) and gap concepts by name", () => {
  it("renders each covered concept as a link to its own url", () => {
    const stripped = stripComments(rowSource);
    expect(stripped).toMatch(/coverage\.covered\.map/);
    expect(stripped).toMatch(/<a href=\{c\.url\}/);
  });

  it("renders gap concepts by name as plain text", () => {
    const stripped = stripComments(rowSource);
    expect(stripped).toMatch(/coverage\.gaps\.map\(\(g\) => g\.concept\)/);
  });
});

describe("blocker 1(a)/(b): the row's own aria-live confirmation banners and label swap", () => {
  it("renders a role=status aria-live banner keyed off linkArmed and off createArmed", () => {
    const stripped = stripComments(rowSource);
    const liveBanners = [...stripped.matchAll(/role="status" aria-live="polite"/g)];
    expect(liveBanners.length).toBeGreaterThanOrEqual(2);
    expect(stripped).toMatch(/\{linkArmed &&/);
    expect(stripped).toMatch(/\{createArmed &&/);
  });

  it("the Link and Create button labels both key off their own armed flag", () => {
    const stripped = stripComments(rowSource);
    const linkBtnStart = stripped.indexOf("onClick={onLink}");
    const linkBtnEnd = stripped.indexOf("</Button>", linkBtnStart);
    expect(stripped.slice(linkBtnStart, linkBtnEnd)).toMatch(/linkArmed/);
    const createBtnStart = stripped.indexOf("onClick={onCreate}");
    const createBtnEnd = stripped.indexOf("</Button>", createBtnStart);
    expect(stripped.slice(createBtnStart, createBtnEnd)).toMatch(/createArmed/);
  });
});
