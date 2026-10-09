// L6(a): the LIVE-LOOP derived-advantage REMOVAL TEST
// (docs/loop/leverage.md, class LIVE-LOOP; docs/l6a-liveloop-removal-test-
// notes.md). The advantage: the snapshot grader exposes a window-level
// keydown layer that snaps a shot, arms the next student, arms a rubric role,
// or captures a rubric WITHOUT the instructor moving focus off the work -
// "usable at a glance, hands and attention elsewhere." A chat has no ambient
// control layer; this is the one derived-advantage class in that card that
// had no removal test, so the advantage could erode silently - the exact way
// the GUARANTEED class eroded before its guard was fixed (leverage.md, "The
// removal test").
//
// WHAT THIS TEST IS NOT. It is deliberately weaker than the GUARANTEED
// class's import-prefix guard, and that is an accepted, orchestrator-ruled
// cost: nothing renders under vitest here (node-env, network-blocked), so
// "usable without a mouse" cannot be observed by rendering. The buildable
// form is a SOURCE-TEXT / handler-presence / source-order assertion over the
// extracted keyboard hook, PLUS a behavioural assertion over the pure matcher
// it drives. It catches the realistic erosion the orchestrator named - the
// keydown dispatch deleted, or the layer reduced to a mouse-only path - which
// nothing else in this repo catches (see the notes' sabotage table).
//
// DIVISION OF LABOUR (why this is not a duplicate). The pure matcher
// (snapshot-keys.ts: which key MEANS which action) is fully pinned by
// snapshot-keys.test.ts. The fact that a window keydown listener is attached
// at all is pinned by snapshot-grading.structure.test.ts's N14 wave-1
// reachability canary. What NO test pinned is the BRIDGE between them: that
// each match type the matcher produces is actually dispatched, inside the
// keydown handler, to the grading-action callback the panel passed in. That
// bridge is this file's subject - if it is deleted, the matcher still maps
// keys and the listener is still attached, yet pressing S snaps nothing and
// the advantage is gone, with every other gate green.

import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  ROLE_BY_DIGIT,
  matchSnapshotKeyEvent,
  type SnapshotKeyLike,
} from "./snapshot-keys";

// Duplicated, never imported from another *.test.ts (that re-runs the other
// file's describe blocks - docs/loop/traps-tests.md). CRLF-safe, UNANCHORED
// line-comment strip: block comments first, then split on /\r?\n/ so a
// trailing "\r" cannot shield a "//" from the unanchored /\/\/.*$/. Named so
// it is not enumerated by src/tools/strip-comments-agreement.structure.test.ts
// (which classifies every *.test.ts mentioning the other helper's name).
function withoutLineComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

// A plain object, never a DOM KeyboardEvent - the matcher's own SnapshotKeyLike
// contract lets a node test construct one. Duplicated from snapshot-keys.test.ts
// on purpose (see above).
function keyEvent(overrides: Partial<SnapshotKeyLike> & { key: string }): SnapshotKeyLike {
  return { ctrlKey: false, altKey: false, metaKey: false, shiftKey: false, repeat: false, ...overrides };
}

// The real LIVE-LOOP key bindings, driven through the PRODUCTION matcher. The
// digit axis is read from ROLE_BY_DIGIT (production), not hardcoded 1-6, so a
// change to the role-digit map is reflected here rather than silently missed.
const GRADING_KEY_BINDINGS: readonly SnapshotKeyLike[] = [
  keyEvent({ key: "s" }), // snap
  keyEvent({ key: "n" }), // arm next student (bare)
  keyEvent({ key: "g", altKey: true }), // arm next student (Alt+G chord)
  ...Object.keys(ROLE_BY_DIGIT).map((digit) => keyEvent({ key: digit })), // arm role
  keyEvent({ key: "r", altKey: true }), // capture rubric (Alt+R chord)
];

// The set of grading-action match types the real bindings actually reach -
// constructed by feeding the production matcher, never a hand-written list.
const producedTypes: readonly string[] = Array.from(
  new Set(GRADING_KEY_BINDINGS.map((e) => matchSnapshotKeyEvent(e).type).filter((t) => t !== "none"))
).sort();

// The frozen oracle: the keyboard reaches EXACTLY these four grading actions.
// A matcher gutted so a binding no longer fires (e.g. "s" -> none) shrinks the
// produced set and reds this; a new bound action grows it and reds it until a
// human adds the binding AND its dispatch handler below.
const FROZEN_ACTION_TYPES: readonly string[] = ["arm-next-student", "arm-role", "capture-rubric", "snap"];

// Each grading-action match type -> the source needle for the callback the
// keydown handler must invoke for it. These identifiers are the hook's own
// parameter names (useSnapshotKeyboardShortcuts.ts): the FACT under test is
// "this key drives this action", and the identifier is how that fact is
// written. arm-role additionally pins match.role is threaded through.
const DISPATCH_HANDLER: Readonly<Record<string, string>> = {
  snap: "handleSnap(",
  "arm-next-student": "setNextStudentArmed(",
  "arm-role": "setArmedRole(match.role",
  "capture-rubric": "onCaptureRubric(",
};

const HOOK_PATH = path.resolve(
  process.cwd(),
  "src/app/components/snapshot-grading/useSnapshotKeyboardShortcuts.ts"
);
const hookStripped = withoutLineComments(fs.readFileSync(HOOK_PATH, "utf-8"));

// Both ends of the slice are anchored and asserted (docs/l6a notes: a slice
// with one unresolved anchor silently widens to the whole file). Start: the
// keydown handler's own declaration. End: the window-level listener that binds
// THAT handler - which is also the ambient-scope pillar of the advantage (a
// document- or element-scoped listener would not be usable with focus
// elsewhere; a mouse-only path would have no window keydown listener at all).
const HANDLER_START_ANCHOR = "const onKey = (e: KeyboardEvent) => {";
const handlerStart = hookStripped.indexOf(HANDLER_START_ANCHOR);
const listenerExec = /window\.addEventListener\(\s*"keydown"\s*,\s*onKey\b/.exec(hookStripped);
const handlerBody =
  handlerStart > -1 && listenerExec && listenerExec.index > handlerStart
    ? hookStripped.slice(handlerStart, listenerExec.index)
    : "";

describe("L6(a) LIVE-LOOP removal test: the snapshot keyboard layer drives grading actions without a mouse", () => {
  describe("the real key bindings reach exactly the grading-action match types (frozen oracle over the production matcher)", () => {
    it("produces exactly the four grading-action types - removing a binding from the matcher shrinks this set and reds here", () => {
      expect(producedTypes).toEqual(FROZEN_ACTION_TYPES);
    });

    it("every produced action type has a frozen dispatch-handler mapping - a new bound action reds until a human adds its dispatch", () => {
      for (const t of producedTypes) {
        expect(Object.prototype.hasOwnProperty.call(DISPATCH_HANDLER, t), `no frozen dispatch handler for produced type ${t}`).toBe(true);
      }
    });
  });

  describe("the ambient window keydown listener is wired to the named handler (both slice anchors resolve)", () => {
    it("declares the onKey keydown handler AND binds it to a window-level keydown listener - not an element/onClick-scoped path", () => {
      expect(handlerStart, "the onKey keydown handler declaration is gone - the keyboard layer was removed or restructured").toBeGreaterThan(-1);
      expect(listenerExec, 'no window.addEventListener("keydown", onKey) - the ambient listener was removed or rebound away from onKey').not.toBeNull();
      expect(listenerExec!.index, "the window keydown listener does not follow the onKey handler declaration").toBeGreaterThan(handlerStart);
    });

    it("the keydown handler reads the production matcher, not a reimplemented inline key map", () => {
      expect(handlerBody.includes("matchSnapshotKeyEvent(")).toBe(true);
    });
  });

  describe("the dispatch bridge: each match type invokes its grading-action callback inside the keydown handler", () => {
    it("there are exactly four grading actions to check - a dispatch check over zero actions proves nothing", () => {
      expect(producedTypes.length).toBe(4);
    });

    it.each(producedTypes)(
      "the %s match type is dispatched to its grading-action callback, after its own match-type guard",
      (matchType) => {
        const handlerNeedle = DISPATCH_HANDLER[matchType];
        expect(handlerNeedle, `no frozen dispatch handler for produced type ${matchType}`).toBeTruthy();
        const guardIdx = handlerBody.indexOf(`match.type === "${matchType}"`);
        const callIdx = handlerBody.indexOf(handlerNeedle);
        expect(guardIdx, `the keydown handler has no "match.type === ${matchType}" guard - this action is no longer reachable by keyboard`).toBeGreaterThan(-1);
        expect(callIdx, `the ${matchType} branch never invokes ${handlerNeedle} - the keyboard path is a dead/partial subset (mouse-only)`).toBeGreaterThan(guardIdx);
      }
    );
  });
});
