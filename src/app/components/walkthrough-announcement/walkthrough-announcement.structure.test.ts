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

  it("imports postWalkthroughAnnouncementAction", () => {
    expect(panelSource).toMatch(/postWalkthroughAnnouncementAction/);
  });

  it("never imports createAnnouncementAction (the plain-text poster every OTHER announcement surface uses)", () => {
    expect(panelSource).not.toMatch(/\bcreateAnnouncementAction\b/);
  });
});
