// Tests the PURE tray reducers useSnapshotShots.ts (the "use client" hook)
// calls into - those reducers live in snapshot-shot.ts, per this repo's
// standing rule that logic needing a test goes in a plain .ts leaf, never
// inline in a hook or a component: vitest here is node-env and renders
// nothing, so a reducer written inside a hook body has no test surface at
// all. This file exercises them from the TRAY-BEHAVIOUR angle (add one shot
// at a time and assert what the tray looks like after each step, the way an
// instructor's session actually unfolds) - snapshot-shot.test.ts exercises
// the same functions individually and in isolation. Neither file imports
// from the other (this repo's "no cross-test-file imports" rule - importing
// a helper from a sibling *.test.ts re-runs its describe/it blocks a second
// time); both import directly from snapshot-shot.ts.

import { describe, it, expect } from "vitest";
import { insertShot, removeShot, setShotRole, setShotNote, moveShotWithinRole, type SnapshotShot } from "./snapshot-shot";

function shot(id: string, role: SnapshotShot["role"]): SnapshotShot {
  return { id, role, base64: "AAAA", previewUrl: `blob:${id}`, source: "capture", capturedAt: 0 };
}

describe("a capture session's tray, built up shot by shot", () => {
  it("insertShot appends to the end, never reordering existing shots", () => {
    let tray: SnapshotShot[] = [];
    tray = insertShot(tray, shot("s1", "assignment"));
    tray = insertShot(tray, shot("s2", "rubric"));
    tray = insertShot(tray, shot("s3", "post"));
    expect(tray.map((s) => s.id)).toEqual(["s1", "s2", "s3"]);
  });

  it("removeShot removes exactly the targeted shot and leaves the rest in order (A2a)", () => {
    let tray = [shot("s1", "assignment"), shot("s2", "rubric"), shot("s3", "post")];
    tray = removeShot(tray, "s2");
    expect(tray.map((s) => s.id)).toEqual(["s1", "s3"]);
  });

  it("removeShot on an id not present is a no-op", () => {
    const tray = [shot("s1", "assignment")];
    expect(removeShot(tray, "missing")).toEqual(tray);
  });

  it("setShotRole re-roles exactly one shot, wrong-role being a one-click fix (A2)", () => {
    let tray = [shot("s1", "post"), shot("s2", "rubric")];
    tray = setShotRole(tray, "s1", "replies");
    expect(tray.find((s) => s.id === "s1")?.role).toBe("replies");
    expect(tray.find((s) => s.id === "s2")?.role).toBe("rubric");
  });

  it("setShotNote attaches a free-text note to exactly one shot (A2b's 'other' escape hatch)", () => {
    let tray = [shot("s1", "other")];
    tray = setShotNote(tray, "s1", "late policy page");
    expect(tray[0].note).toBe("late policy page");
  });
});

describe("reordering within a role group (A2a) - order matters for replies read in sequence", () => {
  it("moves a shot later within its own role group, leaving other roles' positions untouched", () => {
    const tray = [shot("r1", "replies"), shot("a1", "assignment"), shot("r2", "replies")];
    const next = moveShotWithinRole(tray, "r1", 1);
    expect(next.map((s) => s.id)).toEqual(["r2", "a1", "r1"]);
  });

  it("moves a shot earlier within its own role group", () => {
    const tray = [shot("r1", "replies"), shot("r2", "replies"), shot("r3", "replies")];
    const next = moveShotWithinRole(tray, "r3", -1);
    expect(next.map((s) => s.id)).toEqual(["r1", "r3", "r2"]);
  });

  it("is a no-op at the boundary (already first in its role group)", () => {
    const tray = [shot("r1", "replies"), shot("r2", "replies")];
    const next = moveShotWithinRole(tray, "r1", -1);
    expect(next.map((s) => s.id)).toEqual(["r1", "r2"]);
  });

  it("is a no-op at the boundary (already last in its role group)", () => {
    const tray = [shot("r1", "replies"), shot("r2", "replies")];
    const next = moveShotWithinRole(tray, "r2", 1);
    expect(next.map((s) => s.id)).toEqual(["r1", "r2"]);
  });

  it("never disturbs a different role's relative order when reordering within one group", () => {
    const tray = [shot("a1", "assignment"), shot("r1", "replies"), shot("a2", "assignment"), shot("r2", "replies")];
    const next = moveShotWithinRole(tray, "r2", -1);
    expect(next.filter((s) => s.role === "assignment").map((s) => s.id)).toEqual(["a1", "a2"]);
    expect(next.filter((s) => s.role === "replies").map((s) => s.id)).toEqual(["r2", "r1"]);
  });

  it("is a no-op for an id that does not exist", () => {
    const tray = [shot("r1", "replies")];
    expect(moveShotWithinRole(tray, "missing", 1)).toEqual(tray);
  });
});
