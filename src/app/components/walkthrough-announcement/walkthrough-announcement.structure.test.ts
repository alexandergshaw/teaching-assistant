import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

// THE WIRING WAVE'S OWN REACHABILITY CANARY, mirroring module-deck-capture.
// structure.test.ts's own precedent for exactly the same failure mode: wave
// 1 of docs/announcement-from-walkthrough-acceptance-criteria.md shipped
// 2,711 lines of pure, fully-tested leaves (the outline deriver, both prompt
// composers, the output-budget function, the exemplar store) that NOTHING
// CALLED - no server action, no UI. This file proves the wiring wave closed
// that gap: not merely that the panel compiles, but that a real user path
// (the Recording tab's own tab strip) reaches it.
//
// Every assertion below was sabotage-checked while this file was written:
// the guarded line was deleted/altered in the real source file, the specific
// `it` was confirmed red, the file was restored, and the suite was confirmed
// green again.

const RECORDING_TAB_PATH = path.resolve(process.cwd(), "src/app/components/RecordingTab.tsx");
const recordingTabSource = fs.readFileSync(RECORDING_TAB_PATH, "utf-8");

const WALKTHROUGH_ANNOUNCEMENT_DIR = path.resolve(process.cwd(), "src/app/components/walkthrough-announcement");

describe("WalkthroughAnnouncementPanel is actually mounted by RecordingTab", () => {
  it('RecordingTab.tsx imports the default export from "./walkthrough-announcement/WalkthroughAnnouncementPanel"', () => {
    expect(recordingTabSource).toMatch(
      /import WalkthroughAnnouncementPanel from "\.\/walkthrough-announcement\/WalkthroughAnnouncementPanel"/
    );
  });

  it("RecordingTab.tsx actually renders <WalkthroughAnnouncementPanel - an import alone proves nothing", () => {
    expect(recordingTabSource).toMatch(/<WalkthroughAnnouncementPanel\b/);
  });

  it('the rendered panel receives active={active && recView === "walkannounce"} - the same always-mounted, display:none-toggled idiom every sibling inner view uses, never unmounted on tab switch', () => {
    expect(recordingTabSource).toMatch(/<WalkthroughAnnouncementPanel active=\{active && recView === "walkannounce"\}/);
  });
});

describe('"walkannounce" is wired into BOTH the recView union AND the SEPARATE restore guard (the module-deck-capture trap, repeated here)', () => {
  it('"walkannounce" is a member of the recView useState union type', () => {
    // Anchor on the union literal's own line (unique text in this file) -
    // deliberately not a bare source.includes check, which the restore
    // guard's own occurrence would also satisfy and could never fail
    // independently of it.
    const unionLine = recordingTabSource
      .split("\n")
      .find((line) => line.includes('"record" | "discussions" | "speed"'));
    expect(unionLine, "expected to find the recView union type's own line in RecordingTab.tsx").toBeTruthy();
    expect(unionLine).toMatch(/"walkannounce"/);
  });

  it('"walkannounce" is a member of the SEPARATE localStorage restore guard\'s v === chain (the actual trap: this can be missing while the test above still passes)', () => {
    const guardStart = recordingTabSource.indexOf('localStorage.getItem("ta-rec-view")');
    expect(guardStart, "expected to find the restore guard's own localStorage read").toBeGreaterThan(-1);
    const guardEnd = recordingTabSource.indexOf(': "record";', guardStart);
    expect(guardEnd, "expected to find the restore guard's own closing fallback").toBeGreaterThan(-1);
    const guardBlock = recordingTabSource.slice(guardStart, guardEnd);
    expect(guardBlock).toMatch(/v === "walkannounce"/);
  });

  it("the inner-view tab strip includes a walkannounce entry, so the view is reachable by more than a reload or a launch event", () => {
    expect(recordingTabSource).toMatch(/\["walkannounce",\s*"[^"]+"\]/);
  });
});

describe("recording-launch.ts's own RecordingLaunchView union carries walkannounce (the launch-event entry point)", () => {
  const RECORDING_LAUNCH_PATH = path.resolve(process.cwd(), "src/lib/recording-launch.ts");
  const source = fs.readFileSync(RECORDING_LAUNCH_PATH, "utf-8");

  it('"walkannounce" is a member of the RecordingLaunchView type union', () => {
    const unionBlock = source.slice(source.indexOf("export type RecordingLaunchView"), source.indexOf("RECORDING_LAUNCH_VIEWS"));
    expect(unionBlock).toMatch(/"walkannounce"/);
  });

  it('"walkannounce" is a member of the RUNTIME RECORDING_LAUNCH_VIEWS array - the union alone does not validate an incoming launch at runtime (isValidView reads this array, not the type)', () => {
    const arrayBlock = source.slice(
      source.indexOf("const RECORDING_LAUNCH_VIEWS"),
      source.indexOf("];", source.indexOf("const RECORDING_LAUNCH_VIEWS"))
    );
    expect(arrayBlock).toMatch(/"walkannounce"/);
  });
});

// ---------------------------------------------------------------------------
// The directory-wide ORDINAL ta- key canary, mirroring module-deck-capture.
// structure.test.ts's own DE17/G7 block for exactly the same reason: no other
// gate in this repo (tsc, eslint, a rendered-component test - this repo has
// none) can see a persisted key added here without a canary of its own.
// ---------------------------------------------------------------------------

describe("directory-wide ta- key ordinal canary (this directory has no canary anywhere else)", () => {
  const files = fs.readdirSync(WALKTHROUGH_ANNOUNCEMENT_DIR);
  const nonTestFiles = files.filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith(".test.ts"));
  const combinedSource = nonTestFiles
    .map((f) => fs.readFileSync(path.join(WALKTHROUGH_ANNOUNCEMENT_DIR, f), "utf-8"))
    .join("\n");

  const keys = combinedSource.match(/(?<![a-zA-Z])ta-[a-z-]*[a-z]/g) ?? [];
  const distinctKeys = new Set(keys);

  it("finds at least one ta- key across every non-test file in this directory - a check over nothing proves nothing", () => {
    expect(keys.length).toBeGreaterThan(0);
  });

  it("finds exactly three distinct ta- keys across every non-test file in this directory today (ta-rec-wta-course, ta-rec-wta-module, ta-rec-wta-notes)", () => {
    expect(distinctKeys.size).toBe(3);
  });

  it("the exemplar's raw text is NOT among the persisted keys (decision P3: Supabase, not localStorage)", () => {
    expect(combinedSource).not.toMatch(/ta-rec-wta-exemplar\b/);
  });
});

// ---------------------------------------------------------------------------
// P1 pin: the panel posts through the MARKDOWN-safe action, never the
// plain-text one. A regression that swapped this import for
// createAnnouncementAction (canvas-inbox.ts) would compile, would pass every
// other gate, and would silently start publishing literal "##"/"-" markdown
// characters to students - exactly the failure P1 exists to catch.
// ---------------------------------------------------------------------------

describe("P1: the panel posts via the markdown-safe action, never the plain-text one", () => {
  const panelSource = fs.readFileSync(
    path.join(WALKTHROUGH_ANNOUNCEMENT_DIR, "WalkthroughAnnouncementPanel.tsx"),
    "utf-8"
  );

  it("calls postWalkthroughAnnouncementAction(...)", () => {
    // Tightened from a bare-import match (docs/announcement-from-walkthrough-acceptance-criteria.md): the call, not
    // merely the import, must survive - the drafting/posting logic moved
    // into useAnnouncementDraftSlots.ts, but every literal server-action
    // call was required to stay in this panel (blocker 5). A doc comment
    // alone (as this test's own name once implied) would satisfy the old
    // regex; this one requires the actual call expression.
    expect(panelSource).toMatch(/postWalkthroughAnnouncementAction\(/);
  });

  it("never imports createAnnouncementAction (the plain-text poster every OTHER announcement surface uses)", () => {
    expect(panelSource).not.toMatch(/\bcreateAnnouncementAction\b/);
  });
});

// ---------------------------------------------------------------------------
// G2 reachability canary, mirroring this file's own header precedent: an
// earlier wave shipped 2,711 lines of pure, fully-tested leaves that NOTHING
// CALLED. This wave adds three new files (announcement-draft-slots.ts,
// useAnnouncementDraftSlots.ts, AnnouncementDraftSlot.tsx) - nothing else in
// this repo proves the panel actually mounts the row or calls the hook, so a
// build where all three exist and slots.map was never wired would pass
// every other gate here.
// ---------------------------------------------------------------------------

describe("G2: the panel actually mounts the multi-draft-slot seam, not just imports it", () => {
  const panelSource = fs.readFileSync(
    path.join(WALKTHROUGH_ANNOUNCEMENT_DIR, "WalkthroughAnnouncementPanel.tsx"),
    "utf-8"
  );

  it("renders <AnnouncementDraftSlot - an import alone proves nothing", () => {
    expect(panelSource).toMatch(/<AnnouncementDraftSlot\b/);
  });

  it("calls useAnnouncementDraftSlots(...)", () => {
    expect(panelSource).toMatch(/useAnnouncementDraftSlots\(/);
  });
});

// ---------------------------------------------------------------------------
// Restored source-text instruments (docs/announcement-from-walkthrough-acceptance-criteria.md 8): AC-F6's amended
// notice wording, the Copy path's markdownToHtml reference, and the
// markdown-lite exclusion - each read off this directory's own non-test
// source, the only mechanism that can check these facts in a repo where no
// test renders a component.
// ---------------------------------------------------------------------------

describe("G2: restored source-text instruments (AC :92, :130, :138)", () => {
  const files = fs.readdirSync(WALKTHROUGH_ANNOUNCEMENT_DIR);
  const nonTestFiles = files.filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith(".test.ts"));
  const combinedSource = nonTestFiles
    .map((f) => fs.readFileSync(path.join(WALKTHROUGH_ANNOUNCEMENT_DIR, f), "utf-8"))
    .join("\n");

  it("AC-F6's amended Markdown-formatting notice is present somewhere in this directory's non-test source", () => {
    expect(combinedSource).toMatch(/Markdown formatting \(##, -, numbered lists, \*\*bold\*\*, \*italic\*\)/);
  });

  it("the Copy path's source references markdownToHtml", () => {
    expect(combinedSource).toMatch(/markdownToHtml/);
  });

  it("no file in this directory imports markdown-lite", () => {
    expect(combinedSource).not.toMatch(/markdown-lite/);
  });
});

// ---------------------------------------------------------------------------
// B2: the rendered draft preview is pinned in AnnouncementDraftSlot.tsx
// SPECIFICALLY, not the whole-directory concatenation above - the
// markdownToHtml assertion at :188-190 matches because
// useAnnouncementDraftSlots.ts's own Copy payload also calls markdownToHtml,
// so it stays green even if AnnouncementDraftSlot.tsx's preview div is
// deleted entirely. Sabotage-checked: deleting the
// `dangerouslySetInnerHTML={{ __html: previewHtml }}` line from
// AnnouncementDraftSlot.tsx turned the first assertion below red while the
// directory-wide one above stayed green; restoring the line turned it green
// again.
// ---------------------------------------------------------------------------

describe("B2: AnnouncementDraftSlot.tsx itself renders the markdownToHtml preview", () => {
  const slotSource = fs.readFileSync(path.join(WALKTHROUGH_ANNOUNCEMENT_DIR, "AnnouncementDraftSlot.tsx"), "utf-8");

  it("renders dangerouslySetInnerHTML with previewHtml", () => {
    expect(slotSource).toMatch(/dangerouslySetInnerHTML=\{\{\s*__html:\s*previewHtml/);
  });

  it("previewHtml is derived from markdownToHtml(...)", () => {
    expect(slotSource).toMatch(/markdownToHtml\(/);
  });
});
