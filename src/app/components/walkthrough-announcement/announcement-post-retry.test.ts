/**
 * WA-POST-RETRY W1: a failed announcement post must clear the confirm arm so a
 * retry needs a fresh arm-then-confirm, without locking the slot or swallowing
 * the error. Reducer, predicate, direct-import and source-text instruments only;
 * nothing here renders a component.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  FIRST_SLOT_ID,
  makeSlot,
  slotsReducer,
  mayCommitPost,
  type DraftSlot,
  type Drafted,
} from "./announcement-draft-slots";
import { postSignatureFor, POST_TRANSPORT_FAILURE_MESSAGE } from "./useAnnouncementDraftSlots";

const DRAFTED: Drafted = {
  title: "Week 3",
  message: "Hello",
  builtFrom: { kind: "pasted" },
  researchNotice: { kind: "off" },
  timing: "beginning-of-week",
};

function drafted(id: string, overrides: Partial<DraftSlot> = {}): DraftSlot {
  return {
    ...makeSlot(id, { kind: "default" }, "beginning-of-week"),
    draft: { phase: "drafted", draft: DRAFTED, error: null },
    ...overrides,
  };
}

const ERRORS: readonly string[] = [
  "Canvas refused the announcement - bad token.",
  POST_TRANSPORT_FAILURE_MESSAGE,
  "Canvas did not respond.",
];

function failAfterArm(): { armed: DraftSlot; afterError: DraftSlot; sig: string } {
  const base = drafted(FIRST_SLOT_ID);
  const sig = postSignatureFor(base);
  if (sig === null) throw new Error("fixture must be drafted");
  let state: readonly DraftSlot[] = [base];
  state = slotsReducer(state, { type: "arm-post", id: FIRST_SLOT_ID, signature: sig });
  const armed = state[0];
  state = slotsReducer(state, { type: "posting", id: FIRST_SLOT_ID });
  state = slotsReducer(state, { type: "post-result", id: FIRST_SLOT_ID, result: { error: "refused" } });
  return { armed, afterError: state[0], sig };
}

describe("AC-1 the error arm clears the arm for any error text", () => {
  for (const err of ERRORS) {
    it(`clears the arm and keeps the error: ${err.slice(0, 30)}`, () => {
      const armed = drafted(FIRST_SLOT_ID, { posting: true, postArmedFor: "sig" });
      const next = slotsReducer([armed], {
        type: "post-result",
        id: FIRST_SLOT_ID,
        result: { error: err },
      });
      expect(next[0].postArmedFor).toBeNull();
      expect(next[0].posting).toBe(false);
      expect(next[0].postError).toBe(err);
      expect(next[0].postLocked).toBe(false);
    });
  }
});

describe("AC-2 the one-click re-post path is closed", () => {
  it("was genuinely armed, then is not after the error", () => {
    const { armed, afterError, sig } = failAfterArm();
    expect(armed.postArmedFor).toBe(sig);
    expect(armed.postArmedFor).toBe(postSignatureFor(armed));
    expect(afterError.postArmedFor).toBeNull();
    expect(afterError.postArmedFor).not.toBe(postSignatureFor(afterError));
  });
});

describe("AC-3 a retry is not trapped", () => {
  it("can still commit and re-arm after a failure", () => {
    const { afterError } = failAfterArm();
    expect(afterError.postError).not.toBeNull();
    expect(mayCommitPost(afterError)).toBe(true);
    const sig2 = postSignatureFor(afterError);
    if (sig2 === null) throw new Error("must be drafted");
    const rearmed = slotsReducer([afterError], {
      type: "arm-post",
      id: FIRST_SLOT_ID,
      signature: sig2,
    });
    expect(rearmed[0].postArmedFor).toBe(sig2);
    expect(rearmed[0].postArmedFor).toBe(postSignatureFor(rearmed[0]));
  });
});

describe("AC-4 a locked slot stays locked and loses its arm", () => {
  it("is independent of the lock", () => {
    const locked = drafted(FIRST_SLOT_ID, {
      postLocked: true,
      posting: true,
      postArmedFor: "sig",
      postedTo: "CS 101",
    });
    const next = slotsReducer([locked], {
      type: "post-result",
      id: FIRST_SLOT_ID,
      result: { error: "refused" },
    });
    expect(next[0].postLocked).toBe(true);
    expect(next[0].postArmedFor).toBeNull();
  });
});

describe("AC-7 the failure copy is honest", () => {
  it("adapter copy no longer claims nothing was posted", () => {
    const src = fs.readFileSync(path.join(__dirname, "useWalkthroughGenerationAdapters.ts"), "utf-8");
    const start = src.indexOf('if ("error" in result) {');
    const end = src.indexOf("return { course:", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const slice = src.slice(start, end);
    expect(/nothing was posted/i.test(slice)).toBe(false);
    expect(/check/i.test(slice)).toBe(true);
    expect(/Canvas/.test(slice)).toBe(true);
  });

  it("transport failure constant says may-or-may-not and to check", () => {
    expect(POST_TRANSPORT_FAILURE_MESSAGE).toMatch(/may or may not/i);
    expect(POST_TRANSPORT_FAILURE_MESSAGE).toMatch(/check/i);
  });
});
