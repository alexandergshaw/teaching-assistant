import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { accumulateDroppedFrames } from "./discussion-capture";

// useDiscussionReplies.ts is a hook (its own header: "a hook this repo's
// vitest never renders") - nothing here mounts it. The assertions below are
// therefore either (a) a source-text check against this hook's own file -
// the sanctioned fallback for wiring a hook can never otherwise prove - or
// (b) a direct re-exercise of the sibling pure function using the exact
// call shape this hook performs, so a real regression in either the hook's
// usage or the sibling's contract would show up here.
//
// docs/REGRESSION.md entry 383's Limits named only the shipped grading
// panel; verifying it here found a SECOND, previously unnoted instance of
// the same defect on the discussion reply capture side. Before this fix,
// this hook passed C1's live `capture.droppedFrames` straight through -
// both into useDiscussionRepliesRunLog's input (the downloadable run log)
// and into this hook's own returned `droppedFrames` field, which
// DiscussionRepliesPanel.tsx reads directly for its post-stop "scrolled
// past faster than it could be read" notice (that panel is at the 1000-line
// ceiling with 10 lines to spare and a concurrent sibling may be extracting
// from it, so it is deliberately left unedited here - fixing the value at
// its SOURCE in this hook is sufficient, since the panel only ever reads
// the hook's return). `capture.droppedFrames` resets to 0 on every
// start(), while `logStartedAt` (this file) spans the whole panel session,
// not just the latest cycle - a session made of two Start/Stop cycles with
// drops in the first therefore under-reported both the log and the notice.
// Fixed by folding the live value through accumulateDroppedFrames
// (./discussion-capture.ts) into a session-total `droppedFramesTotal`.
//
// Every assertion in this file was sabotage-checked while this file was
// written: the guarded line was reverted to read `capture.droppedFrames`
// directly in useDiscussionReplies.ts, the specific `it` was confirmed red,
// the file was restored, and the suite was confirmed green again. See this
// task's own report for the exact sabotages run.

const HOOK_PATH = path.resolve(process.cwd(), "src/app/components/recording/useDiscussionReplies.ts");
const source = fs.readFileSync(HOOK_PATH, "utf-8");

const PANEL_PATH = path.resolve(process.cwd(), "src/app/components/recording/DiscussionRepliesPanel.tsx");
const panelSource = fs.readFileSync(PANEL_PATH, "utf-8");

describe("dropped-frame accumulator (REGRESSION 383 fix, discussion side)", () => {
  it("calls accumulateDroppedFrames with the live capture.droppedFrames and a ref-tracked previous value, never the live value alone", () => {
    expect(source).toMatch(/accumulateDroppedFrames\(\s*prevLiveDroppedRef\.current\s*,\s*capture\.droppedFrames\s*,/);
  });

  it("never feeds capture.droppedFrames straight into the run log input or this hook's own returned droppedFrames field", () => {
    // The only acceptable appearance of the bare identifier `droppedFrames`
    // as a value (as opposed to a field NAME, e.g. `droppedFrames:`) is
    // `droppedFramesTotal` or `capture.droppedFrames` inside the accumulator
    // effect itself (checked in the previous test). Both the run log args
    // and this hook's return must read `droppedFramesTotal`.
    expect(source).not.toMatch(/droppedFrames:\s*capture\.droppedFrames/);
    const droppedFramesFieldAssignments = source.match(/droppedFrames:\s*\w+/g) ?? [];
    expect(droppedFramesFieldAssignments.length).toBeGreaterThanOrEqual(2); // run log input + hook return
    for (const assignment of droppedFramesFieldAssignments) {
      expect(assignment, `expected "${assignment}" to assign droppedFramesTotal, never the live capture value`).toBe(
        "droppedFrames: droppedFramesTotal"
      );
    }
  });

  it("DiscussionRepliesPanel.tsx reads droppedFrames off this hook's return (unedited - the fix lives upstream in the hook)", () => {
    // Confirms the panel's own post-stop notice (AC7b) is downstream of this
    // hook's accumulated total with no change needed in the panel itself -
    // it just destructures `droppedFrames` from useDiscussionReplies()'s
    // return, which is now droppedFramesTotal under the hood.
    expect(panelSource).toMatch(/droppedFrames,/);
    expect(panelSource).toMatch(/droppedFrames\s*>\s*0/);
  });

  it("a Start/Stop/Start session's live readings survive through the hook's own accumulator contract", () => {
    // Reproduces the exact three-call sequence the hook's effect performs
    // across a two-cycle session, using the sibling pure function directly -
    // this is the regression this fix exists to prevent (a run log/notice
    // built from only the live value at read time, losing cycle 1's drops).
    let total = 0;
    total = accumulateDroppedFrames(0, 6, total); // cycle 1 climbs to 6
    total = accumulateDroppedFrames(6, 0, total); // Stop, then Start resets live to 0
    total = accumulateDroppedFrames(0, 3, total); // cycle 2 climbs to 3
    expect(total).toBe(9); // NOT 3
  });
});

// A20 (docs/a20-scope.md AC4/AC6, RULING W2/M-F): the control-to-call chain's
// discussion-side call site. Without this, `autoDownload:` (or
// `downloadFileNameBase:`) could be dropped from the start({...}) call and
// every OTHER gate would stay green - the capture call still exists and
// fires, it is just never told to auto-download, or downloads under the
// wrong filename stem.
describe("useDiscussionReplies.ts wiring - A20's start({...}) call carries autoDownload and its own filename stem", () => {
  const startAnchor = "await captureRef.current.start({";
  const startIdx = source.indexOf(startAnchor);
  const startEnd = source.indexOf("});", startIdx);

  it("anchor resolves: finds the captureRef.current.start({ call", () => {
    expect(startIdx, "expected to find await captureRef.current.start({").toBeGreaterThan(-1);
  });

  it("anchor resolves: finds the call's closing });", () => {
    expect(startEnd, "expected to find the start({...}) call's closing });").toBeGreaterThan(startIdx);
  });

  const callSlice = startIdx > -1 && startEnd > startIdx ? source.slice(startIdx, startEnd) : "";

  it("the call passes autoDownload: autoDownloadRef.current", () => {
    expect(callSlice).toMatch(/autoDownload:\s*autoDownloadRef\.current/);
  });

  it('the call pins its own filename stem, "discussion-capture" - never the fallback "recording"', () => {
    expect(callSlice).toMatch(/downloadFileNameBase:\s*"discussion-capture"/);
  });
});

// A20 (docs/a20-scope.md AC6/AC7): the panel-half checks. No dedicated
// DiscussionRepliesPanel wiring test exists (this row's own owns table does
// not add one) - this file already reads panelSource (see the dropped-frame
// describe block above), so these live here rather than in a new file.
describe("DiscussionRepliesPanel.tsx - A20's manual-link extension and post-stop differing state (AC6/AC7)", () => {
  it("AC6/M-E: the manual review link's download= is a computed expression that itself calls videoExtensionFromMimeType, never a hardcoded literal", () => {
    const anchor = 'href={recordingUrl} download={';
    const idx = panelSource.indexOf(anchor);
    expect(idx, "expected the recording review link's download={...} attribute").toBeGreaterThan(-1);
    const closeIdx = panelSource.indexOf("}>", idx);
    const attr = panelSource.slice(idx, closeIdx);
    expect(attr).not.toMatch(/download="[^{]/); // never a bare string literal
    expect(attr).toMatch(/videoExtensionFromMimeType\(/);
  });

  it("AC7/RULING W4: a second, narrower conditional block - distinct from the unconditional recordingUrl link - gated on lastSessionAutoDownload AND recordingBytes > 0", () => {
    expect(panelSource).toMatch(/\{lastSessionAutoDownload && recordingBytes > 0 && \(/);
    // Distinct from (not folded into) the unconditional link block.
    const linkIdx = panelSource.indexOf("{recordingUrl && (");
    const secondIdx = panelSource.indexOf("{lastSessionAutoDownload && recordingBytes > 0 && (");
    expect(linkIdx).toBeGreaterThan(-1);
    expect(secondIdx).toBeGreaterThan(linkIdx);
  });

  it("AC7/RULING W4: the new block is NOT conditioned on the live autoDownload checkbox value", () => {
    const idx = panelSource.indexOf("{lastSessionAutoDownload && recordingBytes > 0 && (");
    const endIdx = panelSource.indexOf(")}", idx);
    const block = panelSource.slice(idx, endIdx);
    expect(block).not.toMatch(/\{autoDownload &&/);
  });
});

