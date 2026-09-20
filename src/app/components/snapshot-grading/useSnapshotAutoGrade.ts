"use client";

// N15c (scratchpad/n15c-design-v3.md, Ruling D1/D3/D4/C4). Arm a checkbox;
// each landed submission shot (snap/drop/paste/ZIP) attempts an automatic
// Grade. This hook's ONLY job is to GATHER the five inputs decideAutoGrade
// needs and EXECUTE the dispatch planAutoGradeStep returns
// (snapshot-auto-grade-decision.ts) - it contains no independent copy of
// any of that pure function's conditions. Mirrors useSnapshotGrade.ts's own
// shape (a hook taking the panel's state/setters as constructor parameters).
//
// attemptFire/fire/drainQueue mutually reference each other (a fire settles
// by draining the queue, which may re-attempt, which may fire again) - a
// genuine three-way cycle a plain useCallback chain cannot express without
// one of the three closing over a stale sibling from an earlier render.
// Each is instead held in a ref, reassigned to a fresh closure on every
// render (the same "always-latest" pattern this file's own
// instructorInstructions-style read effects use for a DIFFERENT purpose) -
// so `triggerAutoGradeIfDue`, the one function actually handed to the
// panel, keeps a STABLE identity (empty dep array) while always dispatching
// through whichever closure was fresh at the moment it runs.

import { useCallback, useEffect, useRef, useState } from "react";
import type { SnapshotShot } from "./snapshot-shot";
import type { ConfirmedRubricArea } from "./snapshot-row";
import { decideAutoGrade, planAutoGradeStep } from "./snapshot-auto-grade-decision";

// X4/H1-D convention: this directory's own ta-snap- key prefix.
const AUTO_GRADE_ARMED_KEY = "ta-snap-auto-grade-armed";

export interface UseSnapshotAutoGradeParams {
  grading: boolean;
  transcriptText: string;
  rubricText: string;
  confirmedRubricAreas: ConfirmedRubricArea[] | null;
  shots: SnapshotShot[];
  /** useSnapshotGrade's own return value (Ruling D2: takes an optional
   *  explicit shot list, never reads a ref). */
  handleGrade: (explicitShots?: SnapshotShot[]) => Promise<void>;
  /** SHOULD-FIX 5: the panel's own live-region channel - a genuinely
   *  eligible-blocked arrival (reason "not-eligible") is announced through
   *  this, rather than dropped with no signal at all. */
  announce: (message: string) => void;
}

export interface UseSnapshotAutoGradeResult {
  autoGradeArmed: boolean;
  setAutoGradeArmed: (armed: boolean) => void;
  /** Called by the panel's three entry points (handleSnap/handleFiles/
   *  handleZipFile), each passing the RAW added-shot list it just built and
   *  the full including-arrivals tray (shotsIncludingArrivals). */
  triggerAutoGradeIfDue: (added: (SnapshotShot | null)[], shotsForGrade: SnapshotShot[]) => void;
  /** SHOULD-FIX 4: a boundary reset - clears any arrival(s) still queued from
   *  the student who just ended, so the drain that runs once the in-flight
   *  grade settles never unions a queued arrival from one student with the
   *  next student's own tray. Called by the panel's handleNextStudentConfirm
   *  only; this hook never calls it itself. */
  clearPendingAutoGrade: () => void;
}

interface PendingArrival {
  added: (SnapshotShot | null)[];
  shotsForGrade: SnapshotShot[];
}

export function useSnapshotAutoGrade(params: UseSnapshotAutoGradeParams): UseSnapshotAutoGradeResult {
  const { grading, transcriptText, rubricText, confirmedRubricAreas, shots, handleGrade, announce } = params;

  const [autoGradeArmed, setAutoGradeArmedState] = useState(false);

  // Ruling C4's boolean-serialization fix: `stored !== null` / `stored ===
  // "true"` - NEVER the bare-truthy `if (stored)`, which reads the string
  // "false" as armed. A localStorage-seeded useState initializer never
  // shows its restored value on an SSR'd surface, so this needs a mount
  // effect (this file's own copy of the panel's instructorInstructions
  // idiom) - the setState-in-effect idiom (async IIFE + cancelled flag,
  // setState only after an await) so eslint's react-hooks/set-state-in-
  // effect rule passes.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      try {
        const stored = window.localStorage.getItem(AUTO_GRADE_ARMED_KEY);
        if (stored !== null) setAutoGradeArmedState(stored === "true");
      } catch {
        // localStorage unavailable - stay unarmed, matching every other
        // storage read in this directory.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setAutoGradeArmed = useCallback((armed: boolean) => {
    setAutoGradeArmedState(armed);
    try {
      window.localStorage.setItem(AUTO_GRADE_ARMED_KEY, String(armed));
    } catch {
      // storage full/unavailable - keep working in memory for this session
    }
  }, []);

  // Ruling C4: persisted arming does not itself authorize spend - the FIRST
  // auto-fire after a fresh page load needs one confirmation, once.
  const confirmedThisLoadRef = useRef(false);
  // D3: plain, synchronous, flipped by this hook ALONE - never touched by a
  // render - so a second completion racing the first sees "in-flight"
  // deterministically, with no dependency on whether React has committed a
  // re-render yet.
  const inFlightRef = useRef(false);
  // Instruction 1 (overrides the design's own "a full grade round trip has
  // elapsed" paragraph, which was measured FALSE on two paths - a grade
  // that rejects immediately, and a fast server-validation return, both
  // grade the pre-drop tray only): holds PAIRS, never read as
  // gateRef.current.shots alone. At drain, `added` is the concatenation of
  // every queued `added`, and `shotsForGrade` is the union (by shot.id) of
  // every queued `shotsForGrade` array AND the fired call's own tray at
  // drain time.
  const pendingAddedShotsRef = useRef<PendingArrival[]>([]);

  // Mirrors the panel's own fresh-ref idiom (nextStudentCountsRef): the
  // queue drain runs from a .finally() callback registered at fire time,
  // not from a fresh render, so it needs a way to read CURRENT gather
  // inputs rather than whatever the closure that registered it saw.
  const gateRef = useRef({ grading, transcriptText, rubricText, confirmedRubricAreas, shots });

  // The three-way cycle (attemptFire -> fire -> drainQueue -> attemptFire),
  // each held in a ref and reassigned fresh on every render - see this
  // file's own header comment for why a plain useCallback chain cannot
  // express this without a stale sibling.
  const attemptFireRef = useRef<(added: (SnapshotShot | null)[], shotsForGrade: SnapshotShot[], isRetry?: boolean) => void>(
    () => {}
  );
  const fireRef = useRef<(shotsForGrade: SnapshotShot[]) => void>(() => {});
  const drainQueueRef = useRef<() => void>(() => {});

  // react-hooks/refs: a ref may not be written during render - every
  // assignment below (gateRef and the three dispatch refs) runs in an
  // effect instead, with NO dependency array so it stays fresh on every
  // commit. Event handlers (the panel's onClick/onDrop/keydown paths) only
  // ever run AFTER effects have committed, so this hook's own dispatch
  // (triggerAutoGradeIfDue, below) always reads a post-commit, up-to-date
  // closure - never one from an earlier render.
  useEffect(() => {
    gateRef.current = { grading, transcriptText, rubricText, confirmedRubricAreas, shots };

    drainQueueRef.current = () => {
      const queued = pendingAddedShotsRef.current;
      if (queued.length === 0) return;
      pendingAddedShotsRef.current = [];
      const added = queued.flatMap((entry) => entry.added);
      const byId = new Map<string, SnapshotShot>();
      for (const entry of queued) {
        for (const shot of entry.shotsForGrade) byId.set(shot.id, shot);
      }
      // Union with the CURRENT tray too - by drain time a full grade round
      // trip has elapsed, so gateRef.current.shots reliably includes every
      // handler's arrivals; this is a plain union, never a substitute for
      // the queued shotsForGrade arrays above.
      for (const shot of gateRef.current.shots) byId.set(shot.id, shot);
      const shotsForGrade = Array.from(byId.values());
      attemptFireRef.current(added, shotsForGrade, /* isRetry */ true);
    };

    fireRef.current = (shotsForGrade: SnapshotShot[]) => {
      inFlightRef.current = true;
      // Instruction 6: a rejection is caught with a named reason (never an
      // unhandled promise rejection - the void-.finally shape alone crashed
      // node with one), and .finally always clears inFlightRef and drains
      // the queue regardless of outcome. useSnapshotGrade.ts's own
      // try/finally makes sure a rejecting handleGrade still reaches
      // setGrading(false) - this hook does not need to duplicate that.
      void handleGrade(shotsForGrade)
        .catch(() => {
          // auto-grade-rejected: handleGrade's own setGradeError already
          // surfaces a message when the rejection came from inside its try
          // body; a rejection that never reached that point (a thrown
          // network error before the try, or an abort) is swallowed here so
          // it never becomes an unhandled promise rejection.
        })
        .finally(() => {
          inFlightRef.current = false;
          drainQueueRef.current();
        });
    };

    attemptFireRef.current = (added: (SnapshotShot | null)[], shotsForGrade: SnapshotShot[], isRetry = false) => {
      const gate = gateRef.current;
      // Instruction 3: the gather site, pinned textually - `armed:
      // autoGradeArmed`, `confirmedThisLoad: confirmedThisLoadRef.current`,
      // `inFlight: inFlightRef.current` must appear exactly as literals
      // here, or a sabotage that hardcodes one of them (e.g. `armed: true`)
      // reproduces the original defect with every test still green. STATED
      // PLAINLY: this textual pin is aliasing-defeatable (a sabotage that
      // renames its own fabricated value to the same identifier defeats it
      // identically) - it is not a behavioural guarantee, only a guard
      // against the specific, measured hardcoding sabotage.
      const decision = decideAutoGrade({
        armed: autoGradeArmed,
        addedShots: added,
        confirmedThisLoad: confirmedThisLoadRef.current,
        inFlight: inFlightRef.current,
        eligibility: {
          // D3's forceGradingFalse override: the retry drain's own
          // in-flight grade (tracked by inFlightRef, just confirmed false
          // by the caller) is not the shared `grading` flag - gateRef's
          // `grading` can still read stale-true for one tick after
          // setGrading(false) (it lags a render). Scoped to the retry path
          // only.
          grading: isRetry ? false : gate.grading,
          // BLOCKER 1 fix: this must read the SAME arrivals-inclusive list
          // the dispatch payload (shotsForGrade, this function's own
          // parameter) uses - reading gate.shots.length here instead reads
          // the tray as it stood BEFORE this call's own arrival (gateRef is
          // only synced by a later-committing effect, so a synchronous
          // trigger from inside an event handler always sees the
          // PRE-arrival tray there). The first arrival into an empty
          // committed tray must not be judged against a shotCount of 0 when
          // the real, about-to-be-graded list already has 1.
          shotCount: shotsForGrade.length,
          transcriptText: gate.transcriptText,
          rubricText: gate.rubricText,
          confirmedRubricAreas: gate.confirmedRubricAreas,
        },
      });

      const step = planAutoGradeStep(decision, { shotsForGrade });
      switch (step.kind) {
        case "fire":
          fireRef.current(step.shotsForGrade);
          return;
        case "queue":
          pendingAddedShotsRef.current.push({ added, shotsForGrade: step.shotsForGrade });
          return;
        case "confirm": {
          // Instruction 5: `const ok = window.confirm(` (the result is
          // BOUND, never discarded) and `if (!ok) return;` occurs textually
          // between this call and the single
          // `confirmedThisLoadRef.current = true;` write - a one-line
          // ordering slip here otherwise arms the session when the user
          // DECLINES.
          const ok = window.confirm(
            "Auto-grade is armed. Grade this arrival and every future one automatically for the rest of this page load?"
          );
          if (!ok) return;
          confirmedThisLoadRef.current = true;
          fireRef.current(step.shotsForGrade);
          return;
        }
        case "none":
        default:
          // SHOULD-FIX 5: a genuine arrival that was blocked ONLY by
          // eligibility (not "not-armed", not "no-arrivals" - both of those
          // are not a dropped arrival at all) must not vanish with no
          // signal. Does not change isGradeEligible's own rule - only
          // reports what it already decided.
          if (!decision.fire && decision.reason === "not-eligible") {
            announce(
              "A submission arrived while auto-grade is armed, but it could not be graded automatically right now (grading is not eligible - for example a grade is already running, or the rubric has not been confirmed). Grade it manually when ready."
            );
          }
          return;
      }
    };
  });

  const triggerAutoGradeIfDue = useCallback((added: (SnapshotShot | null)[], shotsForGrade: SnapshotShot[]) => {
    attemptFireRef.current(added, shotsForGrade, false);
  }, []);

  // SHOULD-FIX 4: the boundary reset. A stable identity (empty deps) exactly
  // like triggerAutoGradeIfDue - both are handed to the panel and must never
  // change identity across renders.
  const clearPendingAutoGrade = useCallback(() => {
    pendingAddedShotsRef.current = [];
  }, []);

  return { autoGradeArmed, setAutoGradeArmed, triggerAutoGradeIfDue, clearPendingAutoGrade };
}
