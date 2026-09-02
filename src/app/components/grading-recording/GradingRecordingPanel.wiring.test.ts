import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { accumulateDroppedFrames } from "../recording/discussion-capture";

// GradingRecordingPanel.tsx is a React component and nothing renders under
// this repo's vitest (node-env, collects only src/**/*.test.ts - see this
// repo's own AGENTS.md note). The assertions below are therefore either (a)
// a source-text check against the panel's own file - the sanctioned
// fallback for wiring a component can never otherwise prove - or (b) a
// direct re-exercise of the sibling pure function using the exact call
// shape the panel performs, so a real regression in either the panel's
// usage or the sibling's contract would show up here.
//
// docs/REGRESSION.md entry 383's Limits, verified real in this file before
// this fix: `droppedFrames: droppedFrames,` at the old GradingRecordingPanel.
// tsx:479 (feeding buildGradingRecordingRunLog) and `{droppedFrames > 0 &&`
// at the old line 661 (the persistent notice) both read
// useDiscussionCapture's live counter directly - a value that resets to 0 on
// every start() while `logStartedAt` spans the whole panel session. A
// session made of two Start/Stop cycles with drops in the first therefore
// under-reported: the log and notice only ever reflected the most recent
// cycle. Fixed by folding the live value through accumulateDroppedFrames
// (recording/discussion-capture.ts) into a session-total `droppedFramesTotal`
// - the same pattern module-deck-capture/ModuleDeckCapturePanel.tsx already
// uses (see that file's own AM-G comment, which named this file as the
// pre-existing bug it was written not to repeat).
//
// Every assertion in this file was sabotage-checked while this file was
// written: the guarded line was reverted to read the live `droppedFrames`
// value directly in GradingRecordingPanel.tsx, the specific `it` was
// confirmed red, the file was restored, and the suite was confirmed green
// again. See this task's own report for the exact sabotages run.

const PANEL_PATH = path.resolve(process.cwd(), "src/app/components/grading-recording/GradingRecordingPanel.tsx");
const source = fs.readFileSync(PANEL_PATH, "utf-8");

describe("dropped-frame accumulator (REGRESSION 383 fix)", () => {
  it("calls accumulateDroppedFrames with the live value and a ref-tracked previous value, never the live value alone", () => {
    expect(source).toMatch(/accumulateDroppedFrames\(\s*prevLiveDroppedRef\.current\s*,\s*droppedFrames\s*,/);
  });

  it("never reads the hook's live droppedFrames directly into the run log's droppedFrames field", () => {
    // The only acceptable appearance of the bare identifier `droppedFrames`
    // immediately after `droppedFrames:` is as part of `droppedFramesTotal`
    // (this regex requires the character right after `droppedFrames` to be
    // a comma or whitespace, which `droppedFramesTotal` never satisfies) -
    // the run log's field must read droppedFramesTotal instead.
    expect(source).not.toMatch(/droppedFrames:\s*droppedFrames[,\s]/);
    expect(source).toMatch(/droppedFrames:\s*droppedFramesTotal[,\s]/);
  });

  it("never gates the persistent drop notice on the hook's live droppedFrames directly - only on droppedFramesTotal", () => {
    expect(source).not.toMatch(/\{droppedFrames\s*>\s*0\s*&&/);
    expect(source).toMatch(/\{droppedFramesTotal\s*>\s*0\s*&&/);
  });

  it("a Start/Stop/Start session's live readings survive through the panel's own accumulator contract", () => {
    // Reproduces the exact three-call sequence the panel's effect performs
    // across a two-cycle session, using the sibling pure function directly -
    // this is the regression this fix exists to prevent (the panel reading
    // only the live value at download/render time and losing cycle 1's
    // drops entirely).
    let total = 0;
    total = accumulateDroppedFrames(0, 6, total); // cycle 1 climbs to 6
    total = accumulateDroppedFrames(6, 0, total); // Stop, then Start resets live to 0
    total = accumulateDroppedFrames(0, 3, total); // cycle 2 climbs to 3
    expect(total).toBe(9); // NOT 3
  });
});
