// RCA-1 regression coverage: "Calendar events actually reach the calendar",
// AC3 - "Every checklist mutation ... syncs, and only after a SUCCESSFUL
// local persist."
//
// The bug this covers: CoursesTable.tsx's runCopy (the "copy this cell to
// every other course" action) and runUndo (its Undo) both write
// weeklyChecklist through savePatch, but neither ever called ANY calendar
// sync - unlike WeeklyChecklistCell.tsx's own per-item edits, which call
// syncChecklistItemCalendarAction after every successful persist. Copying a
// checklist onto other courses created deadlined items whose events never
// reached Google Calendar, and overwriting a target's EXISTING checklist
// orphaned that checklist's already-pushed events.
//
// WHY THIS TEST TARGETS shouldSyncCalendarAfterChecklistWrite AND NOT
// runCopy/runUndo THEMSELVES:
//
// runCopy and runUndo are closures defined inside the CoursesTable function
// component - they close over useState setters and can only be invoked as
// part of a real React render (calling the exported default function
// directly throws "Invalid hook call": there is no dispatcher outside an
// actual render). Exercising them at all would need a DOM-capable test
// renderer (e.g. @testing-library/react + jsdom/happy-dom). This repo has
// none of that: package.json has no @testing-library/* dependency,
// vitest.config.ts sets `environment: "node"` (no window/document) and
// `include: ["src/**/*.test.ts"]` (a ".test.tsx" file - the only place JSX
// assertions could even be written - would never be collected by `npm
// test`), and none of vitest.config.ts / package.json is in this fix's
// allowed-files list. Writing a test that imports/renders CoursesTable.tsx
// outright would additionally drag in CourseRow.tsx and, through it, the
// full "@/app/actions" server-action barrel - the exact chain
// current-events-page-text.ts's own header comment documents as unsafe to
// import from client-reachable code.
//
// So instead of leaving the new behavior with NO automated coverage, the
// gating rule runCopy/runUndo both apply - sync a weeklyChecklist target's
// calendar only when its OWN save just succeeded, and only when Google is
// not confirmedly disconnected - was extracted out of the (untestable)
// closures into shouldSyncCalendarAfterChecklistWrite, a plain, exported,
// hook-free function with no dependencies of its own. CoursesTable.tsx
// literally calls this same function (not a copy of its logic) at both call
// sites - see runCopy/runUndo's own "RCA-1" comments - so this test does
// exercise the real gate, just not the surrounding await/loop/setState
// plumbing.
//
// What is verified by READING THE SOURCE instead (CoursesTable.tsx, both
// current as of this fix):
//   - runCopy computes `ok` fresh from THIS target's own savePatch result
//     every iteration (never reused from a previous target), and calls
//     shouldSyncCalendarAfterChecklistWrite(column, ok, googleCalendarConnected)
//     with it immediately after - so a save failure for target N can never
//     leak into target N+1's sync decision.
//   - The sync call (`await syncCourseCalendarAction(target.id)`) is placed
//     AFTER the ok-branch that records success/failure, never before, and
//     the loop is a plain sequential `for...of` (never Promise.all/settled),
//     so a target's own save always completes before its own sync is even
//     considered.
//   - A sync failure (`"error" in syncResult`) is pushed to a SEPARATE
//     `calendarNotices` array, never to `errors` and never subtracted from
//     `succeeded` - so it cannot turn a successful save into a reported
//     failure. See CoursesTable.tsx's CopyResult interface and its render
//     block for the separate, non-counted display.
//   - runUndo mirrors the same shape for the identical reason (an undo of a
//     weeklyChecklist copy is itself a weeklyChecklist write).
import { describe, it, expect } from "vitest";
import { shouldSyncCalendarAfterChecklistWrite } from "./CoursesTable";

describe("shouldSyncCalendarAfterChecklistWrite - RCA-1", () => {
  it("syncs a weeklyChecklist write that succeeded while Google is connected", () => {
    expect(shouldSyncCalendarAfterChecklistWrite("weeklyChecklist", true, true)).toBe(true);
  });

  it("fails OPEN while the one-time connection check is still in flight (null)", () => {
    expect(shouldSyncCalendarAfterChecklistWrite("weeklyChecklist", true, null)).toBe(true);
  });

  it("never syncs a target whose local save just FAILED, regardless of connection state", () => {
    expect(shouldSyncCalendarAfterChecklistWrite("weeklyChecklist", false, true)).toBe(false);
    expect(shouldSyncCalendarAfterChecklistWrite("weeklyChecklist", false, null)).toBe(false);
    expect(shouldSyncCalendarAfterChecklistWrite("weeklyChecklist", false, false)).toBe(false);
  });

  it("skips only on a CONFIRMED disconnect (googleCalendarConnected === false)", () => {
    expect(shouldSyncCalendarAfterChecklistWrite("weeklyChecklist", true, false)).toBe(false);
  });

  it("never syncs a column other than weeklyChecklist, even on a successful save", () => {
    expect(shouldSyncCalendarAfterChecklistWrite("startDate", true, true)).toBe(false);
    expect(shouldSyncCalendarAfterChecklistWrite("endDate", true, true)).toBe(false);
    expect(shouldSyncCalendarAfterChecklistWrite("tests", true, null)).toBe(false);
    expect(shouldSyncCalendarAfterChecklistWrite("dayTime", true, null)).toBe(false);
    expect(shouldSyncCalendarAfterChecklistWrite("assignmentDue", true, true)).toBe(false);
    // "name" is not itself copyable (cell-copy.ts refuses it), but the gate
    // must still reject it defensively rather than assume its caller always
    // filters column first.
    expect(shouldSyncCalendarAfterChecklistWrite("name", true, true)).toBe(false);
  });
});
