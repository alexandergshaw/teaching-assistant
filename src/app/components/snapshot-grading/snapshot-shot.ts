// Snapshot grading (docs/snapshot-grading-acceptance-criteria.md), WAVE 4:
// the pure leaf. No React, no hooks, no `document`, no `navigator`, no
// canvas - vitest here is node-env and renders nothing, so every behaviour
// that needs a unit test lives here, exactly the same split
// discussion-capture.ts documents at its own top.
//
// A0-1: this is a SECOND capture surface sharing engine-shaped ideas with
// grading-recording, not a mode of it - so this file does not import from
// grading-recording, and grading-recording is not touched by this wave.
//
// THE ENCODING DECISION (measured, section 10 of the AC): captured shots are
// JPEG at quality 0.92 via canvas.toDataURL("image/jpeg", 0.92). Width is
// capped HARD at 1920 - resolveSnapTargetWidth deliberately does NOT reuse
// discussion-capture.ts's resolveTargetWidth, whose
// Math.max(FRAME_TARGET_WIDTH, trackWidth * FRAME_MIN_SCALE) floor exists to
// keep a *stream* legible and permits up to trackWidth for a 4K source -
// exactly the shape that turned six 1080p shots (2.73MB) into six 4K shots
// (5.40MB, refused). A deliberate single shot has no such pressure; the cap
// here is a straight min(), never a floor.

import { sumBase64WireBytes, checkWireBudget, type UploadBudgetCheck } from "@/lib/upload-budget";

// ---------------------------------------------------------------------------
// A2b: the closed role set, with "other" as the escape hatch.
// ---------------------------------------------------------------------------

export type SnapshotRole = "assignment" | "rubric" | "post" | "replies" | "submission" | "other";

export const SNAPSHOT_ROLES: readonly SnapshotRole[] = ["assignment", "rubric", "post", "replies", "submission", "other"];

export const SNAPSHOT_ROLE_LABELS: Record<SnapshotRole, string> = {
  assignment: "Assignment",
  rubric: "Rubric",
  post: "Post",
  replies: "Replies",
  submission: "Submission",
  other: "Other",
};

/** A7f: this feature's OWN cap - never GRADING_EXTRACT_BATCH_SIZE or any
 *  other feature's constant (R4b: one owner per feature-scoped constant). A
 *  UI sanity limit; the real enforcement is the wire-byte check below. */
export const MAX_SHOTS = 12;

/** The encoding decision, section 10: full-fidelity JPEG. */
export const SNAP_JPEG_QUALITY = 0.92;

/** The encoding decision's hard cap - a straight min(), never a floor. */
export const SNAP_TARGET_WIDTH_CAP = 1920;

export function resolveSnapTargetWidth(trackWidth: number): number {
  return Math.min(trackWidth, SNAP_TARGET_WIDTH_CAP);
}

// ---------------------------------------------------------------------------
// The shot itself.
// ---------------------------------------------------------------------------

export type SnapshotSource = "capture" | "paste" | "drop";

export interface SnapshotShot {
  id: string;
  role: SnapshotRole;
  /** JPEG, base64, no "data:" prefix - every byte that will ever leave the
   *  client for this shot, once grading (a later wave) sends it. */
  base64: string;
  /** An object URL (URL.createObjectURL) for the tray thumbnail - NOT a data
   *  URL, so it must be revoked (A6b) when the shot is deleted and on
   *  unmount; that revocation lives in useSnapshotShots.ts, which owns
   *  creating it too. */
  previewUrl: string;
  source: SnapshotSource;
  /** Free-text note, meaningful only for role "other" (A2b) - reaches the
   *  grading prompt in a later wave. Present-but-empty and absent are the
   *  same thing to every consumer here. */
  note?: string;
  capturedAt: number;
}

// ---------------------------------------------------------------------------
// A7f: wire-byte budgeting. The SAME sumBase64WireBytes the (future) server
// enforces with, so the number ever shown on screen cannot drift from the
// number checked - section 1's explicit requirement.
// ---------------------------------------------------------------------------

export function computeSnapshotWireBytes(shots: readonly SnapshotShot[]): number {
  return sumBase64WireBytes(shots.map((s) => s.base64));
}

/** Snap-time pre-flight (A7f): refuses a single oversized shot before it
 *  ever enters the tray, rather than only discovering the problem after a
 *  twelfth shot is added. */
export function checkShotWireBudget(base64: string): UploadBudgetCheck {
  return checkWireBudget(base64.length, "This shot");
}

export function canAddShot(currentCount: number): boolean {
  return currentCount < MAX_SHOTS;
}

// ---------------------------------------------------------------------------
// Tray reducers - pure, taking and returning arrays, never mutating their
// inputs. useSnapshotShots.ts (the "use client" hook) is the only caller;
// these are unit-tested directly here AND from useSnapshotShots.test.ts (that
// file exercises the same functions from the tray-behaviour angle - see its
// own header for why the split is not a duplicate).
// ---------------------------------------------------------------------------

// Module-scope counter, matching discussion-capture.ts's mergeIdCounter
// idiom: two shots minted in the same millisecond (Date.now() resolution)
// must never collide, since `id` is a shot's whole identity for delete/
// re-role/reorder.
let shotIdCounter = 0;

export function mintShotId(now: number): string {
  return `snap-${now}-${shotIdCounter++}`;
}

export function insertShot(shots: readonly SnapshotShot[], shot: SnapshotShot): SnapshotShot[] {
  return [...shots, shot];
}

export function removeShot(shots: readonly SnapshotShot[], id: string): SnapshotShot[] {
  return shots.filter((s) => s.id !== id);
}

// U3: re-roling is select-then-set (two clicks), never the armed toggle
// retroactively re-labeling the last shot - this function is the "set" half
// of that pair; the UI selects a tile first, then calls this.
export function setShotRole(shots: readonly SnapshotShot[], id: string, role: SnapshotRole): SnapshotShot[] {
  return shots.map((s) => (s.id === id ? { ...s, role } : s));
}

export function setShotNote(shots: readonly SnapshotShot[], id: string, note: string): SnapshotShot[] {
  return shots.map((s) => (s.id === id ? { ...s, note } : s));
}

/** A2a: reorder WITHIN the shot's own role group. Swaps this shot's array
 *  position with its role-neighbour in the given direction, leaving every
 *  other shot's position untouched - which is enough to reorder the two
 *  role-instances relative to each other even when shots of other roles are
 *  interleaved between them in the underlying array, because grouping
 *  (groupShotsByRole below) reads roles out in array order.
 *
 *  A no-op (returns a shallow copy, unchanged) when the shot is not found or
 *  is already at the boundary of its own role group - the caller announces
 *  "Already first."/"Already last." for the boundary case, mirroring
 *  swapAdjacentRows' own atBoundary contract in discussion-capture.ts, kept
 *  as a plain boolean return here rather than a wrapper object since no
 *  caller in this wave needs to branch on it beyond that message. */
export function moveShotWithinRole(shots: readonly SnapshotShot[], id: string, direction: -1 | 1): SnapshotShot[] {
  const thisIndex = shots.findIndex((s) => s.id === id);
  if (thisIndex === -1) return shots.slice();
  const role = shots[thisIndex].role;
  const roleIndices = shots.reduce<number[]>((acc, s, i) => {
    if (s.role === role) acc.push(i);
    return acc;
  }, []);
  const posInRole = roleIndices.indexOf(thisIndex);
  const swapPos = posInRole + direction;
  if (swapPos < 0 || swapPos >= roleIndices.length) return shots.slice();
  const otherIndex = roleIndices[swapPos];
  const next = shots.slice();
  const tmp = next[thisIndex];
  next[thisIndex] = next[otherIndex];
  next[otherIndex] = tmp;
  return next;
}

/** U7: the tray is grouped by role, one tab stop, roving tabindex - this is
 *  the pure grouping the UI renders from. Preserves each role's own
 *  insertion order (array order), never re-sorting within a group. */
export function groupShotsByRole(shots: readonly SnapshotShot[]): Record<SnapshotRole, SnapshotShot[]> {
  const grouped: Record<SnapshotRole, SnapshotShot[]> = {
    assignment: [],
    rubric: [],
    post: [],
    replies: [],
    submission: [],
    other: [],
  };
  for (const shot of shots) grouped[shot.role].push(shot);
  return grouped;
}

function sourceDescription(source: SnapshotSource): string {
  if (source === "capture") return "captured from the shared screen";
  if (source === "paste") return "pasted from the clipboard";
  return "dropped from a file";
}

/** U7's exact tile label shape: "Shot 3 of 7, Replies, captured from the
 *  shared screen" (or "pasted from the clipboard" / "dropped from a file" -
 *  A1c makes captured and pasted/dropped shots indistinguishable downstream
 *  otherwise, and an instructor who cannot tell which is which cannot debug
 *  a bad grade). `indexInRole` is 1-based, `roleTotal` is that role's
 *  group size - both computed by the caller from groupShotsByRole above. */
export function shotTileLabel(shot: SnapshotShot, indexInRole: number, roleTotal: number): string {
  return `Shot ${indexInRole} of ${roleTotal}, ${SNAPSHOT_ROLE_LABELS[shot.role]}, ${sourceDescription(shot.source)}`;
}
