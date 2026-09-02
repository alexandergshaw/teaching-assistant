// A monotone dropped-frames accumulator across screen-capture Start/Stop
// cycles.
//
// REGRESSION 383's Limits: `useDiscussionCapture.start()` zeroes its own
// `droppedFrames` counter on every capture start
// (recording/useDiscussionCapture.ts: `droppedFramesRef.current = 0;
// setDroppedFrames(droppedFramesRef.current);`). That means a session made of
// two or more Start/Stop cycles cannot read a monotone session total straight
// off the hook's live value - each new cycle silently starts counting from
// zero again.
//
// Two features built their own screen-capture panel on top of the same hook
// and each independently wrote this exact fold to guard against it -
// module-deck-capture's deck-from-capture panel (AM-G) and the discussion
// reply capture panel (REGRESSION 383, discussion side). Both had already
// caught the SHIPPED defect this function exists to prevent:
// `grading-recording/GradingRecordingPanel.tsx` used to build its downloadable
// run log from the hook's live `droppedFrames` value at download time, so a
// session with two Start/Stop cycles under-reported every frame the FIRST
// cycle dropped - the log only ever reflected whichever cycle was most
// recent. All three panels now fold the hook's live value through this one
// function instead of reading it directly.
//
// This lives in `src/lib` - not in either feature's own directory - because
// it is genuinely shared: module-deck-capture and recording (discussion reply
// capture, and grading-recording) each call it against the SAME hook's SAME
// reset behaviour, and neither feature's directory should have to import from
// the other's to reach it. Dependency-free (no React, no DOM, no `window`, no
// clock reads - every time-based value is data the caller supplies), so it is
// safe to import from a client component's bundle same as `upload-budget.ts`
// and `frame-ticker.ts` above it in this directory.
//
// Call once per observation of the hook's live counter, threading the result
// back in as `runningTotal` on the next call:
//
//   sessionTotal = accumulateDroppedFrames(prevLive, nextLive, sessionTotal)
//
// A DECREASE (`nextLive < prevLive`) is the only signal that a new capture
// cycle started (the hook reset its own counter in `start()`); the new
// cycle's live count - whatever it already reads as, not necessarily zero, if
// the exact zero tick was never observed - is added on top of the running
// total as-is. Anything else - including no change at all - is a delta on
// the CURRENT cycle and is added on top of the running total, never used to
// replace it.
//
// A dropped frame is screen content the model never saw - under-counting it
// tells an instructor their capture was cleaner than it actually was, so this
// function is deliberately conservative: every observed drop, in every cycle,
// counts toward the total exactly once.

export function accumulateDroppedFrames(prevLive: number, nextLive: number, runningTotal: number): number {
  return nextLive < prevLive ? runningTotal + nextLive : runningTotal + (nextLive - prevLive);
}
