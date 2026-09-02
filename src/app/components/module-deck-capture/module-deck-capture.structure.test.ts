import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

// THE WIRING WAVE'S OWN REACHABILITY CANARY (docs/module-walkthrough-deck-
// acceptance-criteria.md AC1). ModuleDeckCapturePanel.tsx (and the rest of
// this directory) shipped fully built and completely UNREACHABLE: nothing
// imported the panel, and no production code dispatched its "moduledeck"
// launch. This file exists to prove the wiring wave actually closed that
// gap - not merely that the panel compiles, but that a real user path
// reaches it - and to catch the exact trap the brief called out:
//
//   Updating RecordingTab.tsx's `recView` union WITHOUT ALSO updating its
//   separate localStorage restore guard leaves the tab working perfectly
//   right up until the user reloads the page, at which point it silently
//   drops back to "record" with no error anywhere. No other gate in this
//   repo (tsc, eslint, a rendered-component test - this repo has none, see
//   this repo's own AGENTS.md) can see that failure, because the union and
//   the guard are two SEPARATE lists and nothing forces them to move
//   together.
//
// Every assertion below was sabotage-checked while this file was written:
// the guarded line was deleted/altered in the real source file, the
// specific `it` was confirmed red, the file was restored, and the suite was
// confirmed green again. The restore-guard-only deletion (leaving the union
// untouched) is the single most important one - it is the one a
// union-only fix would otherwise pass right through.

const RECORDING_TAB_PATH = path.resolve(process.cwd(), "src/app/components/RecordingTab.tsx");
const recordingTabSource = fs.readFileSync(RECORDING_TAB_PATH, "utf-8");

const MODULE_DECK_CAPTURE_DIR = path.resolve(process.cwd(), "src/app/components/module-deck-capture");
const MODULES_VIEW_PATH = path.resolve(process.cwd(), "src/app/components/content-tab/ModulesView.tsx");
const GENERATE_SECTION_PATH = path.resolve(
  process.cwd(),
  "src/app/components/content-tab/modules/GenerateFromSelectionSection.tsx"
);

describe("ModuleDeckCapturePanel is actually mounted by RecordingTab (AC1 reachability, entry point a)", () => {
  it("RecordingTab.tsx imports the default export from ./module-deck-capture/ModuleDeckCapturePanel", () => {
    expect(recordingTabSource).toMatch(
      /import ModuleDeckCapturePanel from "\.\/module-deck-capture\/ModuleDeckCapturePanel"/
    );
  });

  it("RecordingTab.tsx actually renders <ModuleDeckCapturePanel - an import alone proves nothing", () => {
    expect(recordingTabSource).toMatch(/<ModuleDeckCapturePanel\b/);
  });

  it("the rendered panel receives active={active && recView === \"moduledeck\"} - the same always-mounted, display:none-toggled idiom every sibling inner view uses, never unmounted on tab switch", () => {
    expect(recordingTabSource).toMatch(/<ModuleDeckCapturePanel active=\{active && recView === "moduledeck"\}/);
  });
});

describe('"moduledeck" is wired into BOTH the recView union AND the SEPARATE restore guard (the trap)', () => {
  it('"moduledeck" is a member of the recView useState union type', () => {
    // Anchor on the union literal's own line - it is unique text in this
    // file - deliberately NOT a bare `source.includes('"moduledeck"')`
    // check, which the restore guard's own occurrence would also satisfy
    // and could never fail independently of it.
    const unionLine = recordingTabSource
      .split("\n")
      .find((line) => line.includes('"record" | "discussions" | "speed"'));
    expect(unionLine, "expected to find the recView union type's own line in RecordingTab.tsx").toBeTruthy();
    expect(unionLine).toMatch(/"moduledeck"/);
  });

  it('"moduledeck" is a member of the SEPARATE localStorage restore guard\'s v === chain (the actual trap: this can be missing while the test above still passes)', () => {
    // The restore guard is `v === "discussions" || ... ? v : "record"`, a
    // second, independent list a few lines below the union. Isolate JUST
    // that block - from its own `localStorage.getItem` read to its own
    // closing `: "record";` fallback - so this assertion cannot be
    // satisfied by the union line above happening to contain the same
    // literal, and can genuinely fail on its own when only the guard is
    // broken.
    const guardStart = recordingTabSource.indexOf('localStorage.getItem("ta-rec-view")');
    expect(guardStart, "expected to find the restore guard's own localStorage read").toBeGreaterThan(-1);
    const guardEnd = recordingTabSource.indexOf(': "record";', guardStart);
    expect(guardEnd, "expected to find the restore guard's own closing fallback").toBeGreaterThan(-1);
    const guardBlock = recordingTabSource.slice(guardStart, guardEnd);
    expect(guardBlock).toMatch(/v === "moduledeck"/);
  });

  it("the inner-view tab strip includes a moduledeck entry, so the view is reachable by more than a reload or a launch event", () => {
    expect(recordingTabSource).toMatch(/\["moduledeck",\s*"[^"]+"\]/);
  });
});

describe('a production (non-test) file dispatches a "moduledeck" launch (AC1 entry point b - the Modules bulk-bar action)', () => {
  const modulesViewSource = fs.readFileSync(MODULES_VIEW_PATH, "utf-8");
  const generateSectionSource = fs.readFileSync(GENERATE_SECTION_PATH, "utf-8");
  const combined = modulesViewSource + "\n" + generateSectionSource;

  it('ModulesView.tsx or GenerateFromSelectionSection.tsx calls openRecordingTool with view: "moduledeck"', () => {
    expect(combined).toMatch(/openRecordingTool\(\{\s*view:\s*"moduledeck"/);
  });

  it("the dispatch carries a capturePrefill.moduleLabel - the whole point of routing through the bulk bar rather than the plain Recording-tab entry", () => {
    expect(combined).toMatch(/capturePrefill:\s*\{[\s\S]*?moduleLabel/);
  });

  it("the launcher is gated so it never fires for anything other than exactly one selected module (capturePrefill.moduleLabel would otherwise be ambiguous)", () => {
    expect(modulesViewSource).toMatch(/selection\.selectedModules\.size !== 1/);
  });
});

// ---------------------------------------------------------------------------
// DE17/G7: the directory-wide ORDINAL ta- key canary. ModuleDeckCapturePanel.
// wiring.test.ts (a sibling's file, this same directory) deliberately scoped
// its own key-set check to that ONE file and left a comment naming this file
// as the directory-wide canary's owner - see that file's own header comment.
// recording-split.structure.test.ts (src/app/components/recording/) scans
// only recording/* plus RecordingTab.tsx and explicitly does NOT see this
// directory (AM-E/DE17) - so without this block, a FUTURE file landing here
// with a new persisted key would be invisible to every existing gate in this
// repo.
//
// Ordinal, not set equality, per the spec's own explicit instruction: a
// future key's exact spelling is not guessable in advance, but the COUNT
// always changes when one is added or removed - only the count is asserted
// here. The per-file exact-set-equality check already lives in
// ModuleDeckCapturePanel.wiring.test.ts and stays there; this block does not
// duplicate it.
//
// The harvest deliberately excludes every *.test.ts file in this directory:
// a test file's own prose comments and regex literals (e.g. this file's own
// "ta-rec-view" and "ta-rec-mod-[a-z-]*" strings, and
// ModuleDeckCapturePanel.wiring.test.ts's own doc comments) are not
// persisted keys, and including them would make this canary count test
// authoring, not production wiring. The lookbehind additionally guards
// against a false hit inside an unrelated identifier (e.g. a future
// `data-testid="..."` attribute contains the substring "ta-" and must not be
// counted as a `ta-`-prefixed persisted key).
// ---------------------------------------------------------------------------

describe("directory-wide ta- key ordinal canary (DE17/G7 - this directory has no canary anywhere else)", () => {
  const files = fs.readdirSync(MODULE_DECK_CAPTURE_DIR);
  const nonTestFiles = files.filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith(".test.ts"));
  const combinedSource = nonTestFiles
    .map((f) => fs.readFileSync(path.join(MODULE_DECK_CAPTURE_DIR, f), "utf-8"))
    .join("\n");

  const keys = combinedSource.match(/(?<![a-zA-Z])ta-[a-z-]*[a-z]/g) ?? [];
  const distinctKeys = new Set(keys);

  it("finds at least one ta- key across every non-test file in this directory - a check over nothing proves nothing", () => {
    expect(keys.length).toBeGreaterThan(0);
  });

  it("finds exactly four distinct ta- keys across every non-test file in this directory today (ta-rec-mod-course, ta-rec-mod-module, ta-rec-mod-template, ta-rec-mod-context)", () => {
    expect(distinctKeys.size).toBe(4);
  });
});
