"use client";

// Snapshot grading, WAVE 4 - the tray state hook. Owns the shot array, the
// armed role (A1a: persisted across reloads, on a ta-snap- key per X4 - this
// directory's own persisted-key prefix, deliberately NOT ta-rec-, which
// recording-split.structure.test.ts's exact-set canary does not reach and
// must not be asked to), and every mutation the tray UI needs. Delegates
// every actual state transition to the pure reducers in snapshot-shot.ts -
// this file's own job is wiring those into React state, minting shot ids,
// creating/revoking the thumbnail object URLs (A6b), and the wire-byte
// figure shown under the tray.
//
// U10: rubric/assignment TEXT is deliberately never persisted here (that
// input does not exist in this wave at all - it is a later wave's concern),
// and this hook does not persist shot bytes either, by construction: shots
// live only in `useState`, never in localStorage. "Reloading clears the
// shots" is the truth this hook enforces, not merely states.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  MAX_SHOTS,
  SNAPSHOT_ROLES,
  insertShot,
  removeShot,
  setShotRole as setShotRolePure,
  setShotNote as setShotNotePure,
  moveShotWithinRole,
  mintShotId,
  computeSnapshotWireBytes,
  partitionShotsForNextStudent,
  type SnapshotRole,
  type SnapshotShot,
  type SnapshotSource,
} from "./snapshot-shot";

const ARMED_ROLE_KEY = "ta-snap-armed-role";

function isSnapshotRole(v: unknown): v is SnapshotRole {
  return typeof v === "string" && (SNAPSHOT_ROLES as readonly string[]).includes(v);
}

function readArmedRole(): SnapshotRole {
  if (typeof window === "undefined") return "assignment";
  try {
    const v = window.localStorage.getItem(ARMED_ROLE_KEY);
    return isSnapshotRole(v) ? v : "assignment";
  } catch {
    return "assignment";
  }
}

/** Base64 (JPEG, no "data:" prefix) -> an object URL, for the tray
 *  thumbnail. A6b requires this be an object URL specifically (so it can be,
 *  and must be, revoked) - not a plain "data:" URL, which would never need
 *  revoking and would silently make that requirement unverifiable. */
function base64ToObjectUrl(base64: string): string {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: "image/jpeg" });
  return URL.createObjectURL(blob);
}

export interface UseSnapshotShotsReturn {
  shots: SnapshotShot[];
  armedRole: SnapshotRole;
  setArmedRole: (role: SnapshotRole) => void;
  /** A7f/section 1: the running wire-byte figure, computed with the SAME
   *  sumBase64WireBytes a future grade call will be checked against. */
  wireBytes: number;
  atCapacity: boolean;
  /** Returns the new shot, or null when the tray is already at MAX_SHOTS -
   *  the caller (the panel) is responsible for the snap-time wire-budget
   *  pre-flight (checkShotWireBudget) BEFORE calling this, per A7f.
   *  `role` defaults to the currently armed role; N5 passes "submission"
   *  explicitly for a shot extracted from a ZIP, since that must always
   *  land as a submission shot regardless of what role happens to be
   *  armed. */
  addShot: (base64: string, source: SnapshotSource, role?: SnapshotRole) => SnapshotShot | null;
  removeShotById: (id: string) => void;
  setRole: (id: string, role: SnapshotRole) => void;
  setNote: (id: string, note: string) => void;
  moveShot: (id: string, direction: -1 | 1) => void;
  /** F1 (A4b): clears every PER-STUDENT shot (post/replies/submission/other)
   *  and leaves the STABLE ones (assignment/rubric) in place, revoking the
   *  cleared shots' object URLs. Does not touch armedRole/ta-snap-armed-role
   *  - Next student does not re-arm anything. */
  clearPerStudentShots: () => void;
}

export function useSnapshotShots(): UseSnapshotShotsReturn {
  const [shots, setShots] = useState<SnapshotShot[]>([]);
  const [armedRole, setArmedRoleState] = useState<SnapshotRole>(() => readArmedRole());

  // Read inside callbacks without adding `shots` to their deps (addShot
  // needs the CURRENT count at call time, not a stale closed-over value).
  const shotsRef = useRef<SnapshotShot[]>([]);
  useEffect(() => {
    shotsRef.current = shots;
  }, [shots]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(ARMED_ROLE_KEY, armedRole);
    } catch {
      // Not fatal - the armed role simply reverts to the default on the
      // next load if storage is unavailable.
    }
  }, [armedRole]);

  const setArmedRole = useCallback((role: SnapshotRole) => {
    setArmedRoleState(role);
  }, []);

  // A6b: revoke every remaining thumbnail object URL on unmount. Per-shot
  // revocation on delete happens in removeShotById below.
  useEffect(() => {
    return () => {
      shotsRef.current.forEach((shot) => URL.revokeObjectURL(shot.previewUrl));
    };
  }, []);

  const addShot = useCallback(
    (base64: string, source: SnapshotSource, role?: SnapshotRole): SnapshotShot | null => {
      if (shotsRef.current.length >= MAX_SHOTS) return null;
      const shot: SnapshotShot = {
        id: mintShotId(Date.now()),
        role: role ?? armedRole,
        base64,
        previewUrl: base64ToObjectUrl(base64),
        source,
        capturedAt: Date.now(),
      };
      setShots((prev) => insertShot(prev, shot));
      return shot;
    },
    [armedRole]
  );

  const removeShotById = useCallback((id: string) => {
    setShots((prev) => {
      const target = prev.find((s) => s.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return removeShot(prev, id);
    });
  }, []);

  const setRole = useCallback((id: string, role: SnapshotRole) => {
    setShots((prev) => setShotRolePure(prev, id, role));
  }, []);

  const setNote = useCallback((id: string, note: string) => {
    setShots((prev) => setShotNotePure(prev, id, note));
  }, []);

  const moveShot = useCallback((id: string, direction: -1 | 1) => {
    setShots((prev) => moveShotWithinRole(prev, id, direction));
  }, []);

  const clearPerStudentShots = useCallback(() => {
    setShots((prev) => {
      const { kept, cleared } = partitionShotsForNextStudent(prev);
      cleared.forEach((shot) => URL.revokeObjectURL(shot.previewUrl));
      return kept;
    });
  }, []);

  return {
    shots,
    armedRole,
    setArmedRole,
    wireBytes: computeSnapshotWireBytes(shots),
    atCapacity: shots.length >= MAX_SHOTS,
    addShot,
    removeShotById,
    setRole,
    setNote,
    moveShot,
    clearPerStudentShots,
  };
}
