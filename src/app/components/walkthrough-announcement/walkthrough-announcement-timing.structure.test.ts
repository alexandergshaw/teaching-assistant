import { describe, it, expect, vi } from "vitest";

import * as fs from "fs";
import * as path from "path";

// This file is the second half of a split of
// walkthrough-announcement.structure.test.ts, which reached the repo's
// 1000-line ceiling with zero headroom. Split boundary: everything from the
// A19 timing groups onward (originally lines 681-1000 of the pre-split
// file) moved here unmodified; the mount-wiring, ta- key canary, P1/G2/B2/
// G3/G1/G6 and A18 groups stayed in the sibling file. This is a pure move -
// no assertion was reworded, reordered, or merged with another.
//
// vi.setConfig mirrors the sibling file's own reasoning (this file also
// reads real source files off disk under concurrent `npm test` load).
vi.setConfig({ testTimeout: 30_000 });

const WALKTHROUGH_ANNOUNCEMENT_DIR = path.resolve(process.cwd(), "src/app/components/walkthrough-announcement");

// ---------------------------------------------------------------------------
// A19 (docs/a19-scope.md): two tones over the same captured pages. AC-6,
// AC-7 and AC-11 each use the anchor-resolves construction copied verbatim
// from docs/a18-scope.md's Ruling W3 (this file's own A18 blocks above use
// the same shape): every indexOf-based slice asserts BOTH boundaries
// resolve (> -1) before trusting the slice, because an unresolved indexOf
// returns -1 and `.slice(-1, end)` or `.slice(start, -1)` silently widens
// to nearly the whole file instead of going red.
// ---------------------------------------------------------------------------

describe("A19 AC-6: draftOne forwards ctx.timing into WalkthroughAnnouncementDraftInput.timing, sliced structurally", () => {
  const panelSource = fs.readFileSync(
    path.join(WALKTHROUGH_ANNOUNCEMENT_DIR, "WalkthroughAnnouncementPanel.tsx"),
    "utf-8"
  );

  const startIdx = panelSource.indexOf("const draftOne = useCallback(");
  const endIdx = panelSource.indexOf("},\n    []\n  );", startIdx);

  it("finds draftOne's own useCallback opening (start anchor resolves)", () => {
    expect(startIdx, "expected to find draftOne's own useCallback opening").toBeGreaterThan(-1);
  });

  it("finds draftOne's closing dependency array (end anchor resolves)", () => {
    expect(endIdx, "expected to find draftOne's closing dependency array").toBeGreaterThan(-1);
  });

  it("the bounded slice forwards timing: ctx.timing", () => {
    const slice = panelSource.slice(startIdx, endIdx);
    expect(slice).toMatch(/timing:\s*ctx\.timing/);
  });
});

describe("A19 AC-7: draftWalkthroughAnnouncementAction forwards input.timing into the composer call, sliced structurally", () => {
  const ACTION_PATH = path.resolve(process.cwd(), "src/app/actions/walkthrough-announcement.ts");
  const actionSource = fs.readFileSync(ACTION_PATH, "utf-8");

  const startIdx = actionSource.indexOf("export async function draftWalkthroughAnnouncementAction(");

  // "Next top-level export" boundary (section 6's own alternative to a
  // bracket-depth scan): the function's return type itself contains object
  // literals with their own braces (`Promise<({...} | {...}) & {...}>`), so
  // a naive brace-depth count from the first `{` after startIdx closes on
  // the RETURN TYPE's own brace, not the function body's - the very
  // widening hazard Ruling V3 exists to close, just via a different
  // mechanism than an unresolved indexOf. The next top-level export
  // (draftWalkthroughVideoScriptAction, confirmed adjacent by direct
  // reading of the source file) is a reliable, simpler boundary here.
  const endIdx = actionSource.indexOf("export async function draftWalkthroughVideoScriptAction(", startIdx);

  it("finds draftWalkthroughAnnouncementAction's own opening (start anchor resolves)", () => {
    expect(startIdx, "expected to find draftWalkthroughAnnouncementAction's own opening").toBeGreaterThan(-1);
  });

  it("finds draftWalkthroughAnnouncementAction's closing brace (end anchor resolves)", () => {
    expect(endIdx, "expected to find draftWalkthroughAnnouncementAction's closing brace").toBeGreaterThan(-1);
  });

  it("the bounded slice forwards timing: input.timing", () => {
    const slice = actionSource.slice(startIdx, endIdx);
    expect(slice).toMatch(/timing:\s*input\.timing/);
  });
});

describe("A19 AC-11: the per-slot timing control is reachable from the rendered row, sliced structurally", () => {
  const source = fs.readFileSync(path.join(WALKTHROUGH_ANNOUNCEMENT_DIR, "AnnouncementDraftSlot.tsx"), "utf-8");

  // DECISION 5 / RULING 35 (docs/a24-a32-waves.md section 6.4.1): renamed
  // from "Timing" to "Written for" so the content-framing choice cannot be
  // mistaken for the new per-slot Canvas-visibility control that now sits
  // directly beside it ("Visible to students (optional)", below). Neither
  // control's label may contain the substring "Timing" after A32 - see
  // that section's own note on why indexOf's first-match behaviour makes a
  // "Timing"-prefixed new label a silent hazard, not merely a rename.
  const startIdx = source.indexOf('label="Written for"');
  const endIdx = source.indexOf("</TextField>", startIdx);

  it("finds the timing control's own label (start anchor resolves)", () => {
    expect(startIdx, "expected to find the new per-slot timing control's own label").toBeGreaterThan(-1);
  });

  it("finds the timing control's closing tag (end anchor resolves)", () => {
    expect(endIdx, "expected to find the timing control's closing tag").toBeGreaterThan(-1);
  });

  it("the bounded slice wires onChooseTiming (reading claim: no component is rendered by any test here)", () => {
    const slice = source.slice(startIdx, endIdx);
    expect(slice).toContain("onChooseTiming");
  });
});

describe('A32/RULING 35: neither per-slot control may be named "Timing" or contain it as a substring', () => {
  const source = fs.readFileSync(path.join(WALKTHROUGH_ANNOUNCEMENT_DIR, "AnnouncementDraftSlot.tsx"), "utf-8");

  it('no rendered label CONTAINS "Timing", in a quoted literal OR a braced string expression, and no label is a bare identifier (round-2 MAJOR R2-3: label={"Timing preset"} escaped the old literal-only regex)', () => {
    const labels = source.match(/label=\{?["'`][^"'`]*["'`]\}?/g) ?? [];
    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) expect(label).not.toMatch(/Timing/);
    expect(source).not.toMatch(/label=\{[A-Za-z_$][\w$]*\}/);
  });

  it('the new Canvas-visibility control is labelled "Visible to students (optional)" - verbatim, from announcements-panel.tsx:463', () => {
    expect(source).toContain('label="Visible to students (optional)"');
  });
});

describe("A32/RULING 66/M4: AnnouncementDraftSlot.tsx imports and CALLS resolveScheduledVisibility, not a hand-rolled substitute with the same field names", () => {
  const source = fs.readFileSync(path.join(WALKTHROUGH_ANNOUNCEMENT_DIR, "AnnouncementDraftSlot.tsx"), "utf-8");

  it("imports and calls resolveScheduledVisibility(...)", () => {
    expect(source).toMatch(/import\s*\{\s*resolveScheduledVisibility\s*\}\s*from\s*"\.\/scheduled-visibility"/);
    expect(source).toMatch(/const visibility = resolveScheduledVisibility\(/);
  });
});

describe("A32/REQ-A32-1: the consequence copy and all five ConfirmArmButtons labels read ONE resolved value, sliced structurally", () => {
  const source = fs.readFileSync(path.join(WALKTHROUGH_ANNOUNCEMENT_DIR, "AnnouncementDraftSlot.tsx"), "utf-8");

  // Anchored on "wta-post-consequence", never a bare "consequenceId=" - a
  // SECOND ConfirmArmButtons block for Regenerate follows immediately after
  // with its own "wta-regenerate-consequence" id (docs/a24-a32-waves.md 6.4.3).
  const consequenceStart = source.indexOf("wta-post-consequence");
  const consequenceEnd = source.indexOf("</p>", consequenceStart);

  it("both anchors resolve", () => {
    expect(consequenceStart, "expected the wta-post-consequence anchor").toBeGreaterThan(-1);
    expect(consequenceEnd, "expected the consequence paragraph's closing </p>").toBeGreaterThan(-1);
  });

  // round-2: also pins isScheduled's DEFINITION below (BLOCKER R2-2), and
  // M5 disposition: the branch split below RESTORES, stronger and
  // per-branch, the whole-slice length ban round 1's remediation withdrew.
  it("the outer branch condition is literally isScheduled, not a separate length-derived boolean (RULING 66/M1)", () => {
    const slice = source.slice(consequenceStart, consequenceEnd);
    expect(slice).toMatch(/aria-live="polite">\s*\{isScheduled\s*\?/);
    expect(slice).not.toMatch(/aria-live="polite">\s*\{slot\.scheduledAt/);
  });

  it('isScheduled is DEFINED as visibility.kind === "scheduled" (BLOCKER R2-2)', () => {
    expect(source).toMatch(/const isScheduled = visibility\.kind === "scheduled";/);
    expect(source).not.toMatch(/const isScheduled =[^\n]*scheduledAt/);
  });

  it("the two branches say different things, each bound to its own side of the ternary (round-2 MAJOR R2-1/R2-5)", () => {
    const slice = source.slice(consequenceStart, consequenceEnd);
    const qIdx = slice.indexOf("?");
    const cIdx = slice.indexOf(":", qIdx);
    const scheduledBranch = slice.slice(qIdx, cIdx);
    const immediateBranch = slice.slice(cIdx);
    expect(scheduledBranch).toMatch(/schedules this announcement to become visible/);
    expect(scheduledBranch).not.toMatch(/publishes this announcement to every student|scheduledAt\.(trim\(\)\.)?length/);
    expect(immediateBranch).toMatch(/publishes this announcement to every student[\s\S]*immediately/);
    expect(immediateBranch).not.toMatch(/schedules this announcement to become visible|scheduledAt\.(trim\(\)\.)?length/);
  });

  // RULING 66/M3: the OLD assertions only checked each prop STARTS WITH
  // isScheduled - satisfied even when both ternary branches are hard-coded
  // to the identical string. twoBranches() extracts BOTH literals and each
  // check below requires them to differ and each carry its own wording -
  // idleAriaLabel/confirmAriaLabel are the ACCESSIBLE names a screen reader
  // announces, not optional companions to the visible pair.
  const idlePostStart = source.indexOf('idleLabel={isScheduled');
  const confirmArmButtonsBlockEnd = source.indexOf("<ConfirmArmButtons", source.indexOf("<ConfirmArmButtons") + 1);

  it("both label-block anchors resolve", () => {
    expect(idlePostStart, "expected idleLabel driven by isScheduled").toBeGreaterThan(-1);
    expect(confirmArmButtonsBlockEnd, "expected a second <ConfirmArmButtons block").toBeGreaterThan(-1);
  });

  const slice = source.slice(idlePostStart, confirmArmButtonsBlockEnd);

  function twoBranches(pattern: RegExp): [string, string] {
    const m = slice.match(pattern);
    expect(m, `expected ${pattern} to match within the Post ConfirmArmButtons block`).toBeTruthy();
    return [m![1], m![2]];
  }

  it("idleLabel's two branches differ and each carries its own wording", () => {
    const [scheduled, immediate] = twoBranches(/idleLabel=\{isScheduled\s*\?\s*"([^"]+)"\s*:\s*"([^"]+)"\}/);
    expect(scheduled).not.toBe(immediate);
    expect(scheduled).toMatch(/Schedule/);
    expect(immediate).toMatch(/Post/);
    expect(immediate).not.toMatch(/Schedule/);
  });

  it("confirmLabel's two branches differ and each carries its own wording", () => {
    const [scheduled, immediate] = twoBranches(/confirmLabel=\{isScheduled\s*\?\s*"([^"]+)"\s*:\s*"([^"]+)"\}/);
    expect(scheduled).not.toBe(immediate);
    expect(scheduled).toMatch(/schedule/);
    expect(immediate).toMatch(/post/);
    expect(immediate).not.toMatch(/schedule/i);
  });

  it("loadingLabel's two branches differ and each carries its own wording", () => {
    const [scheduled, immediate] = twoBranches(/loadingLabel=\{isScheduled\s*\?\s*"([^"]+)"\s*:\s*"([^"]+)"\}/);
    expect(scheduled).not.toBe(immediate);
    expect(scheduled).toMatch(/Scheduling/);
    expect(immediate).toMatch(/Posting/);
    expect(immediate).not.toMatch(/Scheduling/);
  });

  it("idleAriaLabel's two branches differ and each carries its own wording (the accessible name)", () => {
    const [scheduled, immediate] = twoBranches(/idleAriaLabel=\{isScheduled\s*\?\s*`([^`]+)`\s*:\s*`([^`]+)`\}/);
    expect(scheduled).not.toBe(immediate);
    expect(scheduled).toMatch(/Schedule/);
    expect(immediate).toMatch(/Post/);
    expect(immediate).not.toMatch(/Schedule/);
  });

  it("confirmAriaLabel's two branches differ and each carries its own wording (the accessible name)", () => {
    const [scheduled, immediate] = twoBranches(
      /confirmAriaLabel=\{\s*isScheduled\s*\?\s*`([^`]+)`\s*:\s*`([^`]+)`\s*\}/
    );
    expect(scheduled).not.toBe(immediate);
    expect(scheduled).toMatch(/scheduling/);
    expect(immediate).toMatch(/posting/);
    expect(immediate).not.toMatch(/scheduling/i);
  });
});

describe("A32/RULING 66/M6: the datetime-local control forwards the REAL typed value, not a constant that leaves scheduledAt permanently empty", () => {
  const source = fs.readFileSync(path.join(WALKTHROUGH_ANNOUNCEMENT_DIR, "AnnouncementDraftSlot.tsx"), "utf-8");

  // Bounded on the control's own label, mirroring A19 AC-11 above. A
  // mutation that keeps the onSetScheduledAt identifier but always forwards
  // "" (permanently empty) would satisfy a bare toContain check on that
  // name alone - this asserts the CALL's real argument instead.
  const startIdx = source.indexOf('label="Visible to students (optional)"');
  const endIdx = source.indexOf("</p>", startIdx);

  it("both anchors resolve", () => {
    expect(startIdx, "expected the Canvas-visibility control's own label").toBeGreaterThan(-1);
    expect(endIdx, "expected the control's trailing hint paragraph").toBeGreaterThan(-1);
  });

  it("onChange forwards the real typed value - onSetScheduledAt(slot.id, e.target.value) - never a constant", () => {
    const slice = source.slice(startIdx, endIdx);
    expect(slice).toMatch(/onChange=\{\(e\) => onSetScheduledAt\(slot\.id, e\.target\.value\)\}/);
  });
});

// A32/RULING 64: the success sentence must not claim "can see it now" on the
// scheduled path - it must branch honestly on whether the post that
// actually succeeded was scheduled (mirroring the sibling's own branching
// success copy at announcements-panel.tsx:280-283). Asserts BOTH branches
// are present and distinct, not merely that scheduled wording exists
// somewhere in the file.
describe("A32/RULING 64: the postedTo success sentence branches honestly on postedScheduledLabel", () => {
  const source = fs.readFileSync(path.join(WALKTHROUGH_ANNOUNCEMENT_DIR, "AnnouncementDraftSlot.tsx"), "utf-8");

  const startIdx = source.indexOf("{slot.postedTo && (");
  const endIdx = source.indexOf(")}", startIdx);

  it("both anchors resolve", () => {
    expect(startIdx, "expected the {slot.postedTo && ( block").toBeGreaterThan(-1);
    expect(endIdx, "expected the block's closing )}").toBeGreaterThan(-1);
  });

  const slice = source.slice(startIdx, endIdx);

  it("the block's own condition is the WHOLE postedScheduledLabel value, not an optional-chain/derived boolean (round-2 MAJOR R2-2: postedScheduledLabel?.length === -1 satisfied the old regex)", () => {
    expect(slice).toMatch(/\{slot\.postedScheduledLabel\s*\n?\s*\?(?!\.)/);
  });

  it("the scheduled branch does not say students can see it now, and the immediate branch keeps the original honest sentence", () => {
    const qIdx = slice.indexOf("?");
    const cIdx = slice.indexOf(":", qIdx);
    expect(qIdx, "expected the ternary's ?").toBeGreaterThan(-1);
    expect(cIdx, "expected the ternary's :").toBeGreaterThan(qIdx);
    const scheduledBranch = slice.slice(qIdx, cIdx);
    const immediateBranch = slice.slice(cIdx);
    expect(scheduledBranch).not.toMatch(/can see it now/);
    expect(scheduledBranch).toMatch(/Students will see it/);
    expect(immediateBranch).toMatch(/can see it now/);
  });
});

describe("A19 AC-15: researchFingerprint does NOT include timing (a deliberate non-goal, section 4)", () => {
  const panelSource = fs.readFileSync(
    path.join(WALKTHROUGH_ANNOUNCEMENT_DIR, "WalkthroughAnnouncementPanel.tsx"),
    "utf-8"
  );

  const startIdx = panelSource.indexOf("const researchFingerprint = useCallback(");
  const endIdx = panelSource.indexOf("}, []);", startIdx);

  it("finds researchFingerprint's own definition (start anchor resolves)", () => {
    expect(startIdx, "expected to find researchFingerprint's own definition").toBeGreaterThan(-1);
  });

  it("finds researchFingerprint's own closing (end anchor resolves)", () => {
    expect(endIdx, "expected to find researchFingerprint's own closing").toBeGreaterThan(-1);
  });

  it("the fingerprint's own JSON.stringify array does not reference timing", () => {
    const slice = panelSource.slice(startIdx, endIdx);
    expect(slice).not.toMatch(/\btiming\b/i);
  });
});

describe("A19 AC-12: staleTiming mirrors staleChoice - static source-text token comparison, not a runtime read", () => {
  const source = fs.readFileSync(path.join(WALKTHROUGH_ANNOUNCEMENT_DIR, "AnnouncementDraftSlot.tsx"), "utf-8");

  const startIdx = source.indexOf("const staleTiming =");
  const endIdx = source.indexOf(";", startIdx);

  it("finds staleTiming's own expression (start anchor resolves)", () => {
    expect(startIdx, "expected to find staleTiming's own declaration").toBeGreaterThan(-1);
  });

  it("finds staleTiming's own statement terminator (end anchor resolves)", () => {
    expect(endIdx, "expected to find staleTiming's own statement terminator").toBeGreaterThan(-1);
  });

  it("staleTiming's own expression compares with !==, mirroring staleChoice's own guard-pair shape", () => {
    const slice = source.slice(startIdx, endIdx);
    expect(slice).toMatch(/phase === "drafted" && slot\.draft\.phase === "drafted"/);
    expect(slice).toContain("!==");
  });
});
