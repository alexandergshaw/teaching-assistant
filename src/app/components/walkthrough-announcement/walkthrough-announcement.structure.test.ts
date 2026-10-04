import { describe, it, expect, vi } from "vitest";

import * as fs from "fs";
import * as path from "path";
import { stripComments } from "@/app/components/ui/modalAdoptionScan";

// L15: this file walks a real directory tree / reads many real files.
// vitest's 5000ms default testTimeout treats that as slow-but-fine when
// run alone, and as a false timeout under concurrent `npm test` load from
// sibling agents (measured: the slowest single top-level it() here runs
// well under 1s alone). Raised to the repo's existing slow-test
// convention of 30_000, already used by canvas-client-boundary.
// transitive.test.ts and runtime-import-graph.test.ts - this changes
// nothing about what any test asserts.
vi.setConfig({ testTimeout: 30_000 });

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

  it("finds exactly six distinct ta- keys across every non-test file in this directory today (ta-rec-wta-course, ta-rec-wta-module, ta-rec-wta-notes, ta-rec-wta-emoji, ta-rec-wta-resources, ta-rec-wta-autodraft)", () => {
    // G3 Ruling 4/G: bumped from 3 to 5 in the same change that added the
    // emoji and resource-research toggles - the canary this comment sits
    // next to is the only gate in this repo that can see a persisted key
    // added anywhere in this directory. SMOOTH-WALKTHROUGH W3 (R-F1-TOGGLE):
    // bumped from 5 to 6 in the same commit that added the persisted
    // auto-draft toggle.
    expect(distinctKeys.size).toBe(6);
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
  // SMOOTH-WALKTHROUGH W3 (R-AC16): the post call moved verbatim from the panel
  // into useWalkthroughGenerationAdapters.ts (the panel injects it into
  // useAnnouncementDraftSlots). The call pin reads that file; the "never the
  // plain-text poster" pin reads BOTH files so neither can import it.
  const adaptersSource = fs.readFileSync(
    path.join(WALKTHROUGH_ANNOUNCEMENT_DIR, "useWalkthroughGenerationAdapters.ts"),
    "utf-8"
  );
  const panelOnlySource = fs.readFileSync(
    path.join(WALKTHROUGH_ANNOUNCEMENT_DIR, "WalkthroughAnnouncementPanel.tsx"),
    "utf-8"
  );
  const panelSource = adaptersSource + "\n" + panelOnlySource;

  it("calls postWalkthroughAnnouncementAction(...)", () => {
    // Tightened from a bare-import match (docs/announcement-from-walkthrough-acceptance-criteria.md): the call, not
    // merely the import, must survive - the drafting/posting logic moved
    // into useAnnouncementDraftSlots.ts, but every literal server-action
    // call was required to stay in this panel (blocker 5). A doc comment
    // alone (as this test's own name once implied) would satisfy the old
    // regex; this one requires the actual call expression.
    expect(adaptersSource).toMatch(/postWalkthroughAnnouncementAction\(/);
  });

  it("the panel wires the adapters hook's postDraft into useAnnouncementDraftSlots (the call is reachable, not orphaned in the new file)", () => {
    expect(panelOnlySource).toMatch(/useWalkthroughGenerationAdapters\(/);
    expect(panelOnlySource).toMatch(/useAnnouncementDraftSlots\(\{[^}]*\bpostDraft\b/);
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

// ---------------------------------------------------------------------------
// G3 Ruling 14/30: the research notice ("off"/"found"/"empty"/"failed") must
// reach the user, not just compile through Drafted's required field. Three
// assertions, files named, exactly as Ruling 30 requires - the wiring table
// an earlier round shipped had eight control-hop assertions and NOT ONE
// named researchNotice, announcement-draft-slots.ts, or
// AnnouncementDraftSlot.tsx, which is precisely how this requirement shipped
// dead once already. Hop 6 (the actual RENDER) cannot be reached by any gate
// in this repo - vitest here is node-env and renders nothing - so a source-
// text match is a proxy for "the hop was attempted," not a data-flow proof.
// The render itself was verified by reading the diff, not by this test.
// ---------------------------------------------------------------------------

describe("G3 Ruling 14/30: researchNotice reaches the draft-slot seam by name, not just by type", () => {
  const draftSlotsSource = fs.readFileSync(
    path.join(WALKTHROUGH_ANNOUNCEMENT_DIR, "announcement-draft-slots.ts"),
    "utf-8"
  );
  const slotComponentSource = fs.readFileSync(
    path.join(WALKTHROUGH_ANNOUNCEMENT_DIR, "AnnouncementDraftSlot.tsx"),
    "utf-8"
  );

  it("announcement-draft-slots.ts's Drafted shape carries researchNotice", () => {
    expect(draftSlotsSource).toMatch(/researchNotice/);
  });

  it("AnnouncementDraftSlot.tsx reads researchNotice off the drafted slot", () => {
    expect(slotComponentSource).toMatch(/researchNotice/);
  });

  it("AnnouncementDraftSlot.tsx renders the notice's own text, not just the field name (sabotage-checked: renaming the rendered field back to .text alone still requires this exact access path)", () => {
    expect(slotComponentSource).toMatch(/researchNotice\.text/);
  });
});

// ---------------------------------------------------------------------------
// G3 Correction M5 (tightened hop-3 assertions): a bare token match on
// `emojiOn`/`researchOutcome` anywhere in the panel (for example inside
// fetchResources's own definition) would stay green even if draftOne
// silently dropped the field before calling the action - this is the exact
// failure mode M5 was opened to close. Pinning the READ, not just the name.
// ---------------------------------------------------------------------------

describe("G3 Correction M5: draftOne actually forwards emojiOn/researchOutcome into the action call", () => {
  // Retargeted with draftOne (W3 R-AC16): it now lives in
  // useWalkthroughGenerationAdapters.ts.
  const panelSource = fs.readFileSync(
    path.join(WALKTHROUGH_ANNOUNCEMENT_DIR, "useWalkthroughGenerationAdapters.ts"),
    "utf-8"
  );

  it("emojiPolicy is computed FROM ctx.emojiOn (not merely present as a field name elsewhere in the file)", () => {
    expect(panelSource).toMatch(/emojiPolicy:\s*ctx\.emojiOn/);
  });

  it("researchOutcome is forwarded from ctx.researchOutcome (not merely present as a field name elsewhere in the file)", () => {
    expect(panelSource).toMatch(/researchOutcome:\s*ctx\.researchOutcome/);
  });
});

// ---------------------------------------------------------------------------
// backlog 4.1's extraction: the same G2-shaped reachability canary this file
// already applies to AnnouncementDraftSlot.tsx, applied to the NEW
// AnnouncementCourseFieldset.tsx - an import alone proves nothing.
// ---------------------------------------------------------------------------

describe("backlog 4.1: the panel actually mounts AnnouncementCourseFieldset, not just imports it", () => {
  const panelSource = fs.readFileSync(
    path.join(WALKTHROUGH_ANNOUNCEMENT_DIR, "WalkthroughAnnouncementPanel.tsx"),
    "utf-8"
  );

  it("renders <AnnouncementCourseFieldset - an import alone proves nothing", () => {
    expect(panelSource).toMatch(/<AnnouncementCourseFieldset\b/);
  });

  it("passes emojiOn/researchOn through to the fieldset, not just the pre-existing course/module/notes props", () => {
    expect(panelSource).toMatch(/emojiOn=\{emojiOn\}/);
    expect(panelSource).toMatch(/researchOn=\{researchOn\}/);
  });
});

// ---------------------------------------------------------------------------
// G1: the saved-exemplar fetch is bounded (raceWithTimeout) at both call
// sites, and the resulting SavedFormatsState reaches every render site
// through the one shared savedFormatsStatusText function rather than each
// caller deriving its own prose. Facts and wiring only, per this file's own
// house rule (source-text assertions on exact prose have twice forced
// contorted implementations in this repo) - never the sentences themselves.
// ---------------------------------------------------------------------------

describe("G1: both saved-exemplar fetch sites are bounded with raceWithTimeout", () => {
  const panelSource = fs.readFileSync(
    path.join(WALKTHROUGH_ANNOUNCEMENT_DIR, "WalkthroughAnnouncementPanel.tsx"),
    "utf-8"
  );

  it("imports raceWithTimeout from the shared bounded-race leaf", () => {
    expect(panelSource).toMatch(/import\s*\{\s*raceWithTimeout\s*\}\s*from\s*"@\/lib\/bounded-race"/);
  });

  it("the mount effect's Promise.all(...) is passed to raceWithTimeout, not awaited directly", () => {
    expect(panelSource).toMatch(/raceWithTimeout\(\s*Promise\.all\(/);
  });

  it("loadSavedExemplars's own single fetch is also passed to raceWithTimeout", () => {
    const start = panelSource.indexOf("const loadSavedExemplars = useCallback");
    expect(start, "expected to find loadSavedExemplars's own definition").toBeGreaterThan(-1);
    const end = panelSource.indexOf("}, [courseId]);", start);
    const body = panelSource.slice(start, end);
    expect(body).toMatch(/raceWithTimeout\(\s*listAnnouncementExemplarsAction\(courseId\)/);
  });

  it("raceWithTimeout is bounded by the shared EXEMPLAR_FETCH_TIMEOUT_MS constant at both call sites, not a locally re-declared number", () => {
    const occurrences = panelSource.match(/raceWithTimeout\([^;]*?EXEMPLAR_FETCH_TIMEOUT_MS/g) ?? [];
    expect(occurrences.length).toBe(2);
  });
});

describe("G1: every saved-formats render site derives its prose from savedFormatsStatusText, not its own string", () => {
  const draftSlotSource = fs.readFileSync(path.join(WALKTHROUGH_ANNOUNCEMENT_DIR, "AnnouncementDraftSlot.tsx"), "utf-8");
  const fieldsetSource = fs.readFileSync(
    path.join(WALKTHROUGH_ANNOUNCEMENT_DIR, "AnnouncementCourseFieldset.tsx"),
    "utf-8"
  );

  it("AnnouncementDraftSlot.tsx imports savedFormatsStatusText and calls it", () => {
    expect(draftSlotSource).toMatch(/import\s*\{[^}]*savedFormatsStatusText[^}]*\}\s*from\s*"\.\/announcement-draft-slots"/);
    expect(draftSlotSource).toMatch(/savedFormatsStatusText\(/);
  });

  it("AnnouncementDraftSlot.tsx's saved-formats hint carries role=\"status\" aria-live=\"polite\", matching its siblings in this file", () => {
    const callSite = draftSlotSource.indexOf("savedFormatsStatusText(");
    expect(callSite, "expected to find the savedFormatsStatusText call").toBeGreaterThan(-1);
    const nearby = draftSlotSource.slice(callSite, callSite + 600);
    expect(nearby).toMatch(/role="status"/);
    expect(nearby).toMatch(/aria-live="polite"/);
  });

  it("AnnouncementDraftSlot.tsx's Retry gate checks BOTH the failed and timedout states, not failed alone", () => {
    const callSite = draftSlotSource.indexOf("savedFormatsStatusText(");
    const nearby = draftSlotSource.slice(callSite, callSite + 600);
    expect(nearby).toMatch(/"failed"/);
    expect(nearby).toMatch(/"timedout"/);
  });

  it("AnnouncementCourseFieldset.tsx imports savedFormatsStatusText and calls it", () => {
    expect(fieldsetSource).toMatch(/import\s*\{[^}]*savedFormatsStatusText[^}]*\}\s*from\s*"\.\/announcement-draft-slots"/);
    expect(fieldsetSource).toMatch(/savedFormatsStatusText\(/);
  });

  it("AnnouncementCourseFieldset.tsx no longer reads a savedExemplarsLoading boolean prop - it takes the full SavedFormatsState", () => {
    expect(fieldsetSource).not.toMatch(/savedExemplarsLoading/);
    expect(fieldsetSource).toMatch(/savedFormatsState/);
  });
});

describe("G1 task 8 canary: :830's Retry wiring is keyed to failed OR timedout, never failed alone", () => {
  const panelSource = fs.readFileSync(
    path.join(WALKTHROUGH_ANNOUNCEMENT_DIR, "WalkthroughAnnouncementPanel.tsx"),
    "utf-8"
  );

  it("onRetryOptions on <AnnouncementDraftSlot checks both savedFormatsState states, not just \"failed\"", () => {
    const callSite = panelSource.indexOf("onRetryOptions=");
    expect(callSite, "expected to find the onRetryOptions prop passed to AnnouncementDraftSlot").toBeGreaterThan(-1);
    const nearby = panelSource.slice(callSite, callSite + 300);
    expect(nearby).toMatch(/savedFormatsState === "failed"/);
    expect(nearby).toMatch(/savedFormatsState === "timedout"/);
  });
});

describe("G1: Generate's disable gate is keyed only to the loading state, so a timed-out fetch re-enables it", () => {
  const panelSource = fs.readFileSync(
    path.join(WALKTHROUGH_ANNOUNCEMENT_DIR, "WalkthroughAnnouncementPanel.tsx"),
    "utf-8"
  );

  it("Generate's disabled expression checks savedFormatsState === \"loading\", not \"failed\" or \"timedout\"", () => {
    const start = panelSource.indexOf("disabled={");
    const idx = panelSource.indexOf('savedFormatsState === "loading"');
    expect(idx, "expected to find Generate's own loading check").toBeGreaterThan(start);
    const nearby = panelSource.slice(idx - 200, idx + 50);
    expect(nearby).not.toMatch(/savedFormatsState === "failed"/);
    expect(nearby).not.toMatch(/savedFormatsState === "timedout"/);
  });
});

describe("G1: the old savedExemplarsLoading/savedExemplarsFailed booleans are gone from the panel, not merely unused", () => {
  const panelSource = fs.readFileSync(
    path.join(WALKTHROUGH_ANNOUNCEMENT_DIR, "WalkthroughAnnouncementPanel.tsx"),
    "utf-8"
  );

  it("no useState binding named savedExemplarsLoading or savedExemplarsFailed remains", () => {
    expect(panelSource).not.toMatch(/\[savedExemplarsLoading,/);
    expect(panelSource).not.toMatch(/\[savedExemplarsFailed,/);
  });

  it("savedFormatsState is declared via useState<SavedFormatsState>", () => {
    expect(panelSource).toMatch(/useState<SavedFormatsState>\("loaded"\)/);
  });
});

describe("G6: the courseId seed from localStorage is TRIMMED", () => {
  // The seed lives in the extracted setup hook (W0), not the panel.
  const setupSource = fs.readFileSync(
    path.join(WALKTHROUGH_ANNOUNCEMENT_DIR, "useWalkthroughSetup.ts"),
    "utf-8"
  );
  const panelSource = fs.readFileSync(
    path.join(WALKTHROUGH_ANNOUNCEMENT_DIR, "WalkthroughAnnouncementPanel.tsx"),
    "utf-8"
  );

  // Why this is pinned rather than left to review: the course control is a
  // Select over real course ids, so this seed is the ONLY path that can put a
  // non-course string into courseId. A whitespace-only stored value is truthy,
  // so it would pass the `if (!courseId)` guards and reach both exemplar
  // actions, whose own `!courseId.trim()` arms return an empty SUCCESS BEFORE
  // querying - making "I did not query" indistinguishable from "this course has
  // none". Trimming at the seed makes that unrepresentable.
  it("reads the stored course id through .trim(), so a blank-but-truthy value cannot reach the actions", () => {
    const seed = /localStorage\.getItem\(STORAGE_KEY_COURSE\)\s*\?\?\s*""\)\.trim\(\)/;
    expect(
      setupSource,
      "the courseId useState initializer must trim the localStorage value - see this describe block's comment"
    ).toMatch(seed);
  });

  // Canary: proves the assertion above is reading the seed and not some other
  // getItem call. If this ever fails, the key or the initializer moved and the
  // test above may be matching the wrong line.
  it("canary: there is exactly one STORAGE_KEY_COURSE read, in the hook, and none in the panel", () => {
    const reads = setupSource.match(/localStorage\.getItem\(STORAGE_KEY_COURSE\)/g) ?? [];
    expect(reads.length).toBe(1);
    expect((panelSource.match(/localStorage\.getItem\(STORAGE_KEY_COURSE\)/g) ?? []).length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// A18 AC-4: the protected video-script wording (a recording the instructor
// makes ELSEWHERE, to read a script aloud while re-recording) must survive
// untouched. The two-line source comment is pinned as two independent
// single-line fragments rather than one whole-string literal, so a pure
// reflow of the comment (moving the wrap point, identical words) does not
// trip this criterion.
// ---------------------------------------------------------------------------

describe("A18 AC-4: the protected video-script wording is untouched", () => {
  // L9 (docs/l9-wave1-classification.md 3.4): this describe block is a
  // proven SPLIT SUBJECT - the two comment-fragment assertions below target
  // text that lives inside a JSX {/* ... */} comment in
  // WalkthroughAnnouncementPanel.tsx:945-946 (the video-script wording), so
  // they are FILE-CONTENT under RULING 72 and must read the file RAW. The
  // three legend/label/filename assertions above them are CODE-BEHAVIOUR
  // (they pin rendered/executed text, not commentary) and must strip
  // comments in both directions, or a commented-out legend/button/filename
  // could satisfy them. rawPanelSource is deliberately unstripped for the
  // two comment-target assertions named above.
  const rawPanelSource = fs.readFileSync(
    path.join(WALKTHROUGH_ANNOUNCEMENT_DIR, "WalkthroughAnnouncementPanel.tsx"),
    "utf-8"
  );
  const strippedPanelSource = stripComments(rawPanelSource);

  it('keeps the "Video script draft" legend', () => {
    expect(strippedPanelSource).toContain("Video script draft");
  });

  it('keeps the "Generate video script" button label', () => {
    expect(strippedPanelSource).toContain("Generate video script");
  });

  it("keeps the downloaded filename walkthrough-video-script.txt", () => {
    expect(strippedPanelSource).toContain('"walkthrough-video-script.txt"');
  });

  it('keeps the comment fragment "read aloud while"', () => {
    expect(rawPanelSource).toContain("read aloud while");
  });

  it('keeps the comment fragment "re-recording"', () => {
    expect(rawPanelSource).toContain("re-recording");
  });
});

// ---------------------------------------------------------------------------
// A18 AC-6: the two stale "record button" comments are corrected - there is
// no "record button" in this panel; the actual controls are labelled "Start
// capture" / "Stop capture".
// ---------------------------------------------------------------------------

describe("A18 AC-6: no stale \"record button\" phrase remains in the panel", () => {
  const panelSource = fs.readFileSync(
    path.join(WALKTHROUGH_ANNOUNCEMENT_DIR, "WalkthroughAnnouncementPanel.tsx"),
    "utf-8"
  );

  it("finds zero occurrences of the stale phrase", () => {
    expect(
      (panelSource.match(/\brecord button\b/gi) ?? []).length,
      'expected zero occurrences of the stale phrase "record button" - the actual controls are ' +
        '"Start capture" / "Stop capture"'
    ).toBe(0);
  });
});


// ---------------------------------------------------------------------------
// AC-10 (R-AC10-WIRING, docs/walkthrough-ac10-wiring-test-notes.md): the W2
// WIRING facts. The pure decision functions are covered by
// walkthrough-run-decisions.test.ts; what nothing else guards is the panel's
// call sites that feed and act on them. Source-text pins over COMMENT-STRIPPED
// source, each slice-bound to its own effect/callback with both anchors
// resolved, so neither a comment nor an identifier elsewhere in the file (for
// example the Generate button's own generate() call) can satisfy a pin.
// ---------------------------------------------------------------------------

describe("AC-10 W2 wiring: the panel's auto-draft / extraction-window / fresh-run call sites", () => {
  const strippedPanel = stripComments(
    fs.readFileSync(path.join(WALKTHROUGH_ANNOUNCEMENT_DIR, "WalkthroughAnnouncementPanel.tsx"), "utf-8")
  );
  // SMOOTH-WALKTHROUGH W3 (R-AC16): the auto-draft machinery (blocks A and B,
  // and the W3 toggle-consumption pin below, which slices the SAME call and
  // shares its end anchor) moved into useWalkthroughAutoDraft.ts. Blocks C and
  // D still read the panel.
  const strippedAutoDraft = stripComments(
    fs.readFileSync(path.join(WALKTHROUGH_ANNOUNCEMENT_DIR, "useWalkthroughAutoDraft.ts"), "utf-8")
  );

  function sliceFrom(source: string, startNeedle: string, endNeedle: string): string {
    const start = source.indexOf(startNeedle);
    expect(start, `expected to find start anchor ${startNeedle}`).toBeGreaterThan(-1);
    const end = source.indexOf(endNeedle, start);
    expect(end, `expected to find end anchor ${endNeedle}`).toBeGreaterThan(-1);
    return source.slice(start, end);
  }
  function sliceBetween(startNeedle: string, endNeedle: string): string {
    return sliceFrom(strippedPanel, startNeedle, endNeedle);
  }
  function sliceAutoDraft(startNeedle: string, endNeedle: string): string {
    return sliceFrom(strippedAutoDraft, startNeedle, endNeedle);
  }

  describe("A: the firing effect's shouldAutoDraft call site", () => {
    const fireBlock = sliceAutoDraft("shouldAutoDraft({", "}, [capturing, extracting,");

    it("A1: extracting ORs in batchInFlightRef.current", () => {
      expect(fireBlock).toMatch(/extracting:\s*extracting\s*\|\|\s*batchInFlightRef\.current/);
    });
    it("A2: alreadyDraftedThisStop is the NEGATION of autoDraftPendingRef.current", () => {
      expect(fireBlock).toMatch(/alreadyDraftedThisStop:\s*!autoDraftPendingRef\.current/);
    });
    it("A3: hasEmptySlot is readyToDraftCount > 0", () => {
      expect(fireBlock).toMatch(/hasEmptySlot:\s*readyToDraftCount\s*>\s*0/);
    });
    it("A4: the result is consumed as a guard (if (!fire) return;)", () => {
      expect(strippedAutoDraft.slice(strippedAutoDraft.indexOf("const fire = shouldAutoDraft"))).toMatch(/if\s*\(!fire\)\s*return;/);
    });
    it("A5: the effect itself calls generate() (slice-bound, not the Generate button's call)", () => {
      const effect = sliceAutoDraft("const fire = shouldAutoDraft", "}, [capturing, extracting,");
      expect(effect).toMatch(/\bgenerate\(\)/);
    });
  });

  describe("B: once-per-stop arming effect", () => {
    const armBlock = sliceAutoDraft("const prevCapturingRef = useRef(false);", "const fire = shouldAutoDraft");

    it("B1: armed on the capturing true -> false edge", () => {
      expect(armBlock).toMatch(/prevCapturingRef\.current\s*&&\s*!capturing\)\s*autoDraftPendingRef\.current\s*=\s*true/);
    });
    it("B2: forced false while capturing", () => {
      expect(armBlock).toMatch(/if\s*\(capturing\)\s*autoDraftPendingRef\.current\s*=\s*false/);
    });
    it("B3: prevCapturingRef tracks capturing", () => {
      expect(armBlock).toMatch(/prevCapturingRef\.current\s*=\s*capturing/);
    });
  });

  describe("C: extraction-window guard in runExtraction", () => {
    const rxBlock = sliceBetween("const runExtraction = useCallback", "}, [takeFrameBatch,");

    it("C1: batchInFlightRef.current = true is set BEFORE the first await", () => {
      const setIdx = rxBlock.indexOf("batchInFlightRef.current = true");
      const awaitIdx = rxBlock.indexOf("await ");
      expect(setIdx).toBeGreaterThan(-1);
      expect(awaitIdx).toBeGreaterThan(-1);
      expect(setIdx).toBeLessThan(awaitIdx);
    });
    it("C2: batchInFlightRef.current is cleared in the finally block", () => {
      const finallyIdx = rxBlock.indexOf("} finally {");
      expect(finallyIdx).toBeGreaterThan(-1);
      expect(rxBlock.slice(finallyIdx)).toMatch(/batchInFlightRef\.current\s*=\s*false/);
    });
  });

  describe("D: fresh-run reset is gated by isRunComplete in handleStartStop", () => {
    const hssBlock = sliceBetween(
      "const handleStartStop = useCallback",
      "}, [capturing, start, stop, slots, reset]);"
    );

    it("D1: reset(), batchBlocksRef clear and setLegibleBlockCount(0) all live INSIDE if (isRunComplete(slots))", () => {
      const guardStart = hssBlock.indexOf("if (isRunComplete(slots)) {");
      expect(guardStart).toBeGreaterThan(-1);
      const guardEnd = hssBlock.indexOf("(async () =>", guardStart);
      expect(guardEnd).toBeGreaterThan(-1);
      const guardBlock = hssBlock.slice(guardStart, guardEnd);
      expect(guardBlock).toContain("reset()");
      expect(guardBlock).toContain("batchBlocksRef.current = []");
      expect(guardBlock).toContain("setLegibleBlockCount(0)");
    });
  });
});

describe("AC-10 W2 wiring: useWalkthroughSetup consumes courseToAutoSelect", () => {
  const strippedSetup = stripComments(
    fs.readFileSync(path.join(WALKTHROUGH_ANNOUNCEMENT_DIR, "useWalkthroughSetup.ts"), "utf-8")
  );

  // Documentary: tsc already backstops this (the call below would not compile
  // without the import). E2 is the discriminating pin.
  it("E1: imports courseToAutoSelect from ./walkthrough-run-decisions", () => {
    expect(strippedSetup).toMatch(
      /import\s*\{[^}]*\bcourseToAutoSelect\b[^}]*\}\s*from\s*"\.\/walkthrough-run-decisions"/
    );
  });

  // The `?? prev` tail is a frozen literal on purpose: null from
  // courseToAutoSelect means "change nothing", and the fallback is what keeps
  // the persisted choice. Arguments are deliberately not pinned.
  it("E2: setCourseId's updater calls courseToAutoSelect and consumes it with ?? prev", () => {
    expect(strippedSetup).toMatch(
      /setCourseId\(\s*\(prev\)\s*=>[\s\S]*?courseToAutoSelect\([\s\S]*?\)\s*\?\?\s*prev\s*\)/
    );
  });
});

// ---------------------------------------------------------------------------
// SMOOTH-WALKTHROUGH W3 SURFACE (docs/walkthrough-w3-surface-test-notes.md).
// Source-text pins over COMMENT-STRIPPED source - nothing renders under vitest,
// so every pin proves the MECHANISM is in the source, never that a pixel moved
// or a bar stuck (the numeric ACs are owner residuals RW3-1..8).
// ---------------------------------------------------------------------------

describe("W3 SURFACE: run bar, field order, draft-slot layout, auto-draft toggle", () => {
  const read = (name: string): string => fs.readFileSync(path.join(WALKTHROUGH_ANNOUNCEMENT_DIR, name), "utf-8");
  const panel = stripComments(read("WalkthroughAnnouncementPanel.tsx"));
  const fieldset = stripComments(read("AnnouncementCourseFieldset.tsx"));
  const slot = stripComments(read("AnnouncementDraftSlot.tsx"));
  const setup = stripComments(read("useWalkthroughSetup.ts"));

  describe("W3-R1: capture controls and Start precede the format/options controls", () => {
    it("fieldset: Course and the disclosure come before the paste box, Save for reuse and the three toggles", () => {
      const anchors = [
        'label="Course"',
        "Frames from your screen",
        'label="Paste a previous announcement to match its format (optional)"',
        "Save for reuse",
        "Use emojis in the draft",
        "Research and cite relevant resource links",
        "Draft automatically when capture stops",
      ];
      const idx = anchors.map((a) => fieldset.indexOf(a));
      idx.forEach((i, n) => expect(i, `expected anchor ${anchors[n]}`).toBeGreaterThan(-1));
      for (let n = 1; n < idx.length; n++) {
        expect(idx[n], `${anchors[n]} must come after ${anchors[n - 1]}`).toBeGreaterThan(idx[n - 1]);
      }
    });

    it("fieldset: two fieldsets, with {children} (the run bar) between the first close and the second open", () => {
      const firstClose = fieldset.indexOf("</fieldset>");
      const childrenIdx = fieldset.indexOf("{children}");
      const secondOpen = fieldset.indexOf("<fieldset", firstClose);
      expect(firstClose).toBeGreaterThan(-1);
      expect(childrenIdx).toBeGreaterThan(-1);
      expect(secondOpen).toBeGreaterThan(-1);
      expect(childrenIdx).toBeGreaterThan(firstClose);
      expect(secondOpen).toBeGreaterThan(childrenIdx);
      expect((fieldset.match(/<fieldset\b/g) ?? []).length).toBe(2);
    });

    it("panel: Start is rendered as a child of the fieldset mount, after its opening tag", () => {
      const mount = panel.indexOf("<AnnouncementCourseFieldset");
      const startIdx = panel.indexOf("Start capture");
      const mountClose = panel.indexOf("</AnnouncementCourseFieldset>");
      expect(mount).toBeGreaterThan(-1);
      expect(startIdx).toBeGreaterThan(-1);
      expect(mountClose).toBeGreaterThan(-1);
      expect(startIdx).toBeGreaterThan(mount);
      expect(startIdx).toBeLessThan(mountClose);
    });
  });

  // The run bar's wrapper: the nearest <div before the Start text. The Buttons
  // hold no nested <div>, so the first </div> after Start closes the wrapper.
  const startTextIdx = panel.indexOf("Start capture");
  const barOpen = panel.lastIndexOf("<div", startTextIdx);
  const barClose = panel.indexOf("</div>", startTextIdx);
  const barSlice = panel.slice(barOpen, barClose);

  describe("W3-R2: Start and both Generate buttons are siblings in ONE run bar", () => {
    it("both slice anchors resolve", () => {
      expect(startTextIdx).toBeGreaterThan(-1);
      expect(barOpen).toBeGreaterThan(-1);
      expect(barClose).toBeGreaterThan(startTextIdx);
    });
    it("Generate announcement and Generate video script both sit inside the wrapper that holds Start", () => {
      expect(barSlice).toContain("Generate announcement");
      expect(barSlice).toContain("Generate video script");
    });
    it("the bar holds no Post control (the sticky bar must stay non-destructive)", () => {
      expect(barSlice).not.toMatch(/Post to Canvas|Confirm post|postWalkthroughAnnouncementAction|ConfirmArmButtons/);
    });
  });

  describe("W3-F-STICKY: the run bar carries a specific class whose OWN rule is sticky with a top offset", () => {
    // MECHANISM PROXY, argued: position:sticky only works when no ancestor clips
    // overflow, which nothing here can check. The real test is owner AC-1.
    const openTag = panel.slice(barOpen, panel.indexOf(">", barOpen) + 1);
    const classRef = openTag.match(/\$\{([A-Za-z_$][\w$]*)\.runBarSticky\}/);
    const css = fs
      .readFileSync(path.join(WALKTHROUGH_ANNOUNCEMENT_DIR, "WalkthroughRunBar.module.css"), "utf-8")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    const ruleStart = css.indexOf(".runBarSticky {");
    const ruleEnd = css.indexOf("}", ruleStart);
    const rule = css.slice(ruleStart, ruleEnd);

    it("the bar wrapper's className references <alias>.runBarSticky", () => {
      expect(classRef, `expected runBarSticky in ${openTag}`).toBeTruthy();
    });
    it("that alias is the panel's import of WalkthroughRunBar.module.css", () => {
      const imp = panel.match(/import\s+([A-Za-z_$][\w$]*)\s+from\s+"\.\/WalkthroughRunBar\.module\.css"/);
      expect(imp).toBeTruthy();
      expect(imp![1]).toBe(classRef![1]);
    });
    it("the .runBarSticky rule block resolves and itself holds position: sticky and a top offset", () => {
      expect(ruleStart).toBeGreaterThan(-1);
      expect(ruleEnd).toBeGreaterThan(ruleStart);
      expect(rule).toMatch(/position:\s*sticky/);
      expect(rule).toMatch(/\btop:\s*-?\d/);
    });
  });

  describe("W3-R3: the post-arm consequence FOLLOWS the Post/Regenerate/Copy row (Confirm does not shift)", () => {
    const rowOpen = slot.indexOf("`${styles.ghActions} ${controls.runRow}`");
    const consequence = slot.indexOf("id={`wta-post-consequence-${slot.id}`}");
    const copyIdx = slot.indexOf("onCopy(slot.id)");
    it("all three anchors resolve", () => {
      expect(rowOpen).toBeGreaterThan(-1);
      expect(consequence).toBeGreaterThan(-1);
      expect(copyIdx).toBeGreaterThan(-1);
    });
    it("the consequence paragraph comes after the row open and after the row's last control", () => {
      expect(consequence).toBeGreaterThan(rowOpen);
      expect(consequence).toBeGreaterThan(copyIdx);
    });
    it("the Post button still links to it by consequenceId", () => {
      expect(slot).toContain("consequenceId={`wta-post-consequence-${slot.id}`}");
    });
  });

  describe("W3-R4: Message and Preview share one adaptFieldGrid2; preview before the Post row; no clip", () => {
    const gridOpen = slot.indexOf("<div className={styles.adaptFieldGrid2}>");
    const messageIdx = slot.indexOf('label="Message (Markdown)"');
    const previewIdx = slot.indexOf("dangerouslySetInnerHTML");
    const gridEnd = slot.indexOf("Markdown formatting (##");
    const rowOpen = slot.indexOf("`${styles.ghActions} ${controls.runRow}`");
    it("all anchors resolve", () => {
      for (const i of [gridOpen, messageIdx, previewIdx, gridEnd, rowOpen]) expect(i).toBeGreaterThan(-1);
    });
    it("Message and the preview both sit inside the grid", () => {
      expect(messageIdx).toBeGreaterThan(gridOpen);
      expect(previewIdx).toBeGreaterThan(messageIdx);
      expect(previewIdx).toBeLessThan(gridEnd);
    });
    it("the preview precedes the Post row", () => {
      expect(previewIdx).toBeLessThan(rowOpen);
    });
    it("the preview div's own tag carries no max-height, overflow or inline style", () => {
      const open = slot.lastIndexOf("<div", previewIdx);
      const tag = slot.slice(open, slot.indexOf("/>", previewIdx) + 2);
      expect(tag).toContain("controls.draftPreview");
      expect(tag).not.toMatch(/max-?height|overflow|style=/i);
    });
  });

  describe("W3-R5: Visible-to moves INTO the Post row, label verbatim", () => {
    const rowOpen = slot.indexOf("`${styles.ghActions} ${controls.runRow}`");
    const visible = slot.indexOf('label="Visible to students (optional)"');
    const hint = slot.indexOf("Leave blank to post immediately");
    const armedBlock = slot.indexOf("{postArmed && (");
    it("anchors resolve", () => {
      for (const i of [rowOpen, visible, hint, armedBlock]) expect(i).toBeGreaterThan(-1);
    });
    it("the field and its trailing hint sit between the row open and the armed consequence", () => {
      expect(visible).toBeGreaterThan(rowOpen);
      expect(hint).toBeGreaterThan(visible);
      expect(hint).toBeLessThan(armedBlock);
    });
  });

  describe("W3-R8: persisted auto-draft toggle (R-F1-TOGGLE), default ON, restored by a mount effect", () => {
    it("the key constant equals the all-lowercase-hyphen literal", () => {
      expect(setup).toMatch(/const STORAGE_KEY_AUTODRAFT = "ta-rec-wta-autodraft";/);
    });
    it("default is ON: useState(true)", () => {
      expect(setup).toMatch(/const \[autoDraftOn, setAutoDraftOn\] = useState\(true\);/);
    });
    it("restore is NOT a lazy useState initializer", () => {
      expect(setup).not.toMatch(/useState[^;]*getItem\(STORAGE_KEY_AUTODRAFT\)/);
    });
    it("a mount effect (empty dependency array) reads the key and calls the setter, reading BEFORE its await", () => {
      const read = setup.indexOf("getItem(STORAGE_KEY_AUTODRAFT)");
      expect(read).toBeGreaterThan(-1);
      const effectOpen = setup.lastIndexOf("useEffect(", read);
      const effectEnd = setup.indexOf("}, [", read);
      expect(effectOpen).toBeGreaterThan(-1);
      expect(effectEnd).toBeGreaterThan(read);
      const effect = setup.slice(effectOpen, effectEnd);
      expect(setup.slice(effectEnd, effectEnd + 7)).toBe("}, []);");
      expect(effect).toMatch(/setAutoDraftOn\(/);
      const awaitIdx = effect.indexOf("await Promise.resolve()");
      expect(awaitIdx).toBeGreaterThan(-1);
      expect(effect.indexOf("getItem(STORAGE_KEY_AUTODRAFT)")).toBeLessThan(awaitIdx);
    });
    it("a persist effect writes the value back", () => {
      expect(setup).toMatch(/setItem\(STORAGE_KEY_AUTODRAFT,\s*String\(autoDraftOn\)\)/);
    });
    it("the fieldset renders the checkbox from autoDraftOn and reports changes upward; the panel wires both", () => {
      expect(fieldset).toMatch(/checked=\{autoDraftOn\}/);
      expect(fieldset).toMatch(/onAutoDraftOnChange\(e\.target\.checked\)/);
      expect(panel).toMatch(/autoDraftOn=\{autoDraftOn\}/);
      expect(panel).toMatch(/onAutoDraftOnChange=\{setAutoDraftOn\}/);
    });
  });

  describe("W3-R8 consumption pin: the auto-draft predicate reads the THREADED toggle, wherever the call lives", () => {
    // Scans the PRODUCTION write set (every non-test source file in this
    // directory), never one fixed path, so a constant relocated into a new
    // file is caught wherever it lands. Retargets together with AC-10 block A:
    // same call, same end anchor.
    const productionFiles = fs
      .readdirSync(WALKTHROUGH_ANNOUNCEMENT_DIR)
      .filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith(".test.ts"));
    const strippedByFile = new Map(productionFiles.map((f) => [f, stripComments(read(f))] as const));

    it("the scan covers the panel and the extracted auto-draft hook (a check over nothing proves nothing)", () => {
      expect(productionFiles).toContain("WalkthroughAnnouncementPanel.tsx");
      expect(productionFiles).toContain("useWalkthroughAutoDraft.ts");
    });

    it("(a) no hard-coded-on AUTO_DRAFT_ON constant survives in any production file", () => {
      for (const [file, src] of strippedByFile) {
        expect(src, `${file} must not declare AUTO_DRAFT_ON = true`).not.toMatch(/const\s+AUTO_DRAFT_ON\s*=\s*true/);
      }
    });

    const callFiles = [...strippedByFile].filter(([, src]) => src.includes("shouldAutoDraft({"));

    it("(b) exactly one file contains the shouldAutoDraft({ call", () => {
      expect(callFiles.map(([f]) => f)).toHaveLength(1);
    });

    const callSource = callFiles.length === 1 ? callFiles[0][1] : "";
    const callStart = callSource.indexOf("shouldAutoDraft({");
    const callEnd = callSource.indexOf("}, [capturing, extracting,", callStart);
    const argSlice = callSource.slice(callStart, callEnd);
    const captured = argSlice.match(/autoDraftOn:\s*([A-Za-z_$][\w$]*)/);

    it("(b) both slice anchors resolve and the autoDraftOn argument was captured", () => {
      expect(callStart).toBeGreaterThan(-1);
      expect(callEnd).toBeGreaterThan(callStart);
      expect(captured, "expected an autoDraftOn: <identifier> argument in the call").toBeTruthy();
    });

    it("(b) the captured identifier is neither true nor AUTO_DRAFT_ON", () => {
      expect(captured![1]).not.toBe("true");
      expect(captured![1]).not.toBe("AUTO_DRAFT_ON");
    });

    it("(c) that identifier is the persisted toggle: it appears in the panel's useWalkthroughSetup destructure", () => {
      const setupCall = panel.indexOf("= useWalkthroughSetup(");
      expect(setupCall).toBeGreaterThan(-1);
      const destructureOpen = panel.lastIndexOf("const {", setupCall);
      expect(destructureOpen).toBeGreaterThan(-1);
      const destructure = panel.slice(destructureOpen, setupCall);
      expect(destructure).toMatch(new RegExp(`\\b${captured![1]}\\b`));
    });

    it("(d) the panel threads that same identifier into the hook that owns the call", () => {
      const hookCall = panel.indexOf("useWalkthroughAutoDraft({");
      expect(hookCall).toBeGreaterThan(-1);
      const hookCallEnd = panel.indexOf("});", hookCall);
      expect(hookCallEnd).toBeGreaterThan(hookCall);
      expect(panel.slice(hookCall, hookCallEnd)).toMatch(new RegExp(`\\b${captured![1]}\\b`));
    });
  });

  describe("W3-R10: guard counts unchanged", () => {
    it("AnnouncementDraftSlot.tsx renders exactly two ConfirmArmButtons (Post, Regenerate); the fieldset exactly one", () => {
      expect((slot.match(/<ConfirmArmButtons\b/g) ?? []).length).toBe(2);
      expect((fieldset.match(/<ConfirmArmButtons\b/g) ?? []).length).toBe(1);
    });
    it("Start carries no disabled attribute", () => {
      const startOpen = panel.lastIndexOf("<Button", panel.indexOf("Start capture"));
      const tag = panel.slice(startOpen, panel.indexOf(">", startOpen));
      expect(tag).toContain("handleStartStop");
      expect(tag).not.toMatch(/\bdisabled\b/);
    });
  });
});
